import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

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

    // Step 1: Create the user in Supabase Authentication with email verification
    const inferredRedirect =
      emailRedirectTo ||
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    const signUpOptions = {
      data: { name: resolvedName, firstName: trimmedFirstName, lastName: trimmedLastName },
      ...(inferredRedirect ? { emailRedirectTo: inferredRedirect } : {}),
    };

    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: trimmedEmail,
      password,
      options: signUpOptions,
    });

    if (authError) {
      // If the user already exists in Supabase, return a clear error
      if (authError.message?.toLowerCase().includes('user already registered') || authError.message?.toLowerCase().includes('instance violates unique constraint')) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user in authentication service.' }, { status: 500 });
    }

    // Step 2: Create the corresponding user profile in your Prisma database
    // We no longer store the password ourselves. Supabase handles that.
    const userProfile = await prisma.user.create({
      data: {
        id: authData.user.id,        // Use the ID from Supabase as the primary key
        supabaseUserId: authData.user.id, // Also store it in the dedicated sync column
        email: trimmedEmail,
        name: resolvedName,
        birthdate: parsedBirthdate,
        preferredMountains: trimmedVisited ? [trimmedVisited] : [],
        mountainSuggestionsEnabled: true,
        // Password is NOT saved in this database
      },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json(
      {
        user: userProfile,
        message: 'Signup successful. Please check your email to verify your account before logging in.',
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
