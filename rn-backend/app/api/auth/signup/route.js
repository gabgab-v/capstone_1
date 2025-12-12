import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';
import { isEmailServiceConfigured, sendTransactionalEmail } from '@/lib/email';
import { buildConfirmEmailTemplate } from '@/lib/emailTemplates';

function normalizeFullName(firstName, lastName, fallbackName) {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.replace(/\s+/g, ' ').trim();
  const fallback = (fallbackName ?? '').replace(/\s+/g, ' ').trim();
  return combined || fallback;
}

function parseBirthdate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// Initialize the Supabase admin client for server-side actions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const emailRedirectTo = process.env.SUPABASE_EMAIL_CONFIRM_REDIRECT_TO || null;

async function dispatchConfirmationEmail({ email, name, actionLink }) {
  if (!supabaseAdmin) {
    return { ok: false, code: 'NO_SUPABASE', message: 'Auth service not configured.' };
  }

  if (isEmailServiceConfigured()) {
    const template = buildConfirmEmailTemplate({ name, actionLink });
    const sendResult = await sendTransactionalEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (sendResult.ok) {
      return { ok: true, channel: 'custom' };
    }

    console.error('Custom confirmation email failed; falling back to Supabase template.', sendResult);
  }

  const { error: resendError } = await supabaseAdmin.auth.resend({
    type: 'signup',
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (resendError) {
    console.error('Fallback Supabase confirmation email failed:', resendError);
    return { ok: false, code: 'FALLBACK_FAILED', message: 'Unable to send confirmation email.' };
  }

  return { ok: true, channel: 'supabase' };
}

async function cleanupFailedSignup(supabaseUserId) {
  try {
    await prisma.user.delete({ where: { id: supabaseUserId } });
  } catch (err) {
    console.error('Failed to roll back user in Prisma after signup failure:', err);
  }

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
    } catch (err) {
      console.error('Failed to roll back user in Supabase after signup failure:', err);
    }
  }
}

export async function POST(request) {
  try {
    const { email, password, name, firstName, lastName, birthday, visitedTrail } = await request.json();

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedVisited = typeof visitedTrail === 'string' ? visitedTrail.trim() : '';
    const resolvedName = normalizeFullName(trimmedFirstName, trimmedLastName, trimmedName);
    const parsedBirthdate = parseBirthdate(birthday);

    if (!trimmedEmail || !password || !resolvedName) {
      return NextResponse.json(
        { error: 'Email, password, and full name (first and last) are required' },
        { status: 400 },
      );
    }

    const existingEmail = await prisma.user.findFirst({
      where: { email: trimmedEmail },
      select: { id: true },
    });

    if (existingEmail) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const existingName = await prisma.user.findFirst({
      where: { name: resolvedName },
      select: { id: true },
    });

    if (existingName) {
      return NextResponse.json({ error: 'Name already in use' }, { status: 409 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 503 });
    }

    // Step 1: Create a Supabase user and generate a confirmation link (no default template is sent)
    const signUpOptions = {
      data: { name: resolvedName, firstName: trimmedFirstName, lastName: trimmedLastName },
      ...(emailRedirectTo ? { redirectTo: emailRedirectTo } : {}),
    };

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: trimmedEmail,
      password,
      options: signUpOptions,
    });

    if (linkError) {
      if (
        linkError.message?.toLowerCase().includes('user already registered') ||
        linkError.message?.toLowerCase().includes('instance violates unique constraint')
      ) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const supabaseUser = linkData?.user;
    const confirmationLink = linkData?.properties?.action_link;

    if (!supabaseUser || !confirmationLink) {
      console.error('Supabase did not return the expected signup link payload:', linkData);
      return NextResponse.json(
        { error: 'Failed to prepare your confirmation email. Please try again.' },
        { status: 500 },
      );
    }

    // Step 2: Create the corresponding user profile in your Prisma database
    const userProfile = await prisma.user.create({
      data: {
        id: supabaseUser.id, // Use the ID from Supabase as the primary key
        supabaseUserId: supabaseUser.id, // Also store it in the dedicated sync column
        email: trimmedEmail,
        name: resolvedName,
        birthdate: parsedBirthdate,
        preferredMountains: trimmedVisited ? [trimmedVisited] : [],
        mountainSuggestionsEnabled: true,
      },
      select: { id: true, email: true, name: true },
    });

    // Step 3: Send a branded confirmation email (falls back to Supabase template if the provider is missing)
    const emailResult = await dispatchConfirmationEmail({
      email: trimmedEmail,
      name: resolvedName,
      actionLink: confirmationLink,
    });

    if (!emailResult.ok) {
      await cleanupFailedSignup(supabaseUser.id);
      return NextResponse.json(
        { error: 'We could not send your confirmation email. Please try again shortly.' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        user: userProfile,
        message: 'Signup successful. Check your inbox for the confirmation email to activate your account.',
      },
      { status: 201 },
    );

  } catch (err) {
    console.error('Signup error:', err);
    // Check for Prisma unique constraint violation as a fallback
    if (err.code === 'P2002') {
      const rawTargets = err.meta?.target;
      const targets = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];
      const targetString = targets.join(',').toLowerCase();

      if (targetString.includes('email')) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }

      if (targetString.includes('name')) {
        return NextResponse.json({ error: 'Name already in use' }, { status: 409 });
      }

      return NextResponse.json({ error: 'Unique constraint violation' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
