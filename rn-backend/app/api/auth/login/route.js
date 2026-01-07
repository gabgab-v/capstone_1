import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  INACTIVITY_REASON,
  buildReactivationChecklist,
  shouldDeactivateForInactivity,
  publicRecoveryRequirements,
} from '@/lib/reactivation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emailRedirectTo = process.env.SUPABASE_EMAIL_CONFIRM_REDIRECT_TO || null;
const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export async function POST(req) {
  try {
    console.log("\n--- LOGIN ATTEMPT ---");

    // 1. Check if the JWT secret is loaded from .env
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret || secret.length < 32) {
      console.error("🔴 FATAL: SUPABASE_JWT_SECRET is not loaded or is too short!");
      // Do not give specific errors to the client for security
      return NextResponse.json({ message: "Server configuration error." }, { status: 500 });
    }
    console.log("✅ SUPABASE_JWT_SECRET loaded successfully.");

    const { email, password } = await req.json();
    console.log(`1. Finding user for email: ${email}`);
    let user = await prisma.user.findUnique({ where: { email } });

    // 2. Check if the user exists and has a synced Supabase ID
    if (!user) {
      console.warn(`⚠️ Login failed: User not found for email ${email}.`);
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }
    if (!user.supabaseUserId) {
      console.warn(`⚠️ Login failed: User ${email} exists but has no supabaseUserId.`);
      return NextResponse.json({ message: 'User not synced with authentication provider.' }, { status: 401 });
    }
    console.log(`2. User found. Supabase User ID: ${user.supabaseUserId}`);

    // 2c. Enforce email confirmation: fetch Supabase user and block if unconfirmed
    if (!supabaseAdmin) {
      console.error('🔴 Supabase admin client is not configured.');
      return NextResponse.json({ message: 'Auth service unavailable.' }, { status: 503 });
    }

    const { data: supaUserResult, error: supaUserError } = await supabaseAdmin.auth.admin.getUserById(
      user.supabaseUserId,
    );

    if (supaUserError) {
      console.error('Failed to fetch Supabase user:', supaUserError);
      return NextResponse.json({ message: 'Auth lookup failed. Please try again shortly.' }, { status: 503 });
    }

    const supabaseUser = supaUserResult?.user || null;
    const emailConfirmedAt = supabaseUser?.email_confirmed_at
      ? new Date(supabaseUser.email_confirmed_at)
      : null;

    if (!emailConfirmedAt) {
      // Trigger a resend so the user immediately gets a fresh link.
      const { error: resendError } = await supabaseAdmin.auth.resend({
        type: 'signup',
        email: user.email,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });

      if (resendError) {
        console.error('Failed to resend confirmation email:', resendError);
      }

      return NextResponse.json(
        {
          message: 'Please confirm your email before logging in. We just sent you a new confirmation link.',
          code: 'EMAIL_NOT_CONFIRMED',
        },
        { status: 403 },
      );
    }

    // Backfill local verification timestamp if missing
    if (!user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: emailConfirmedAt },
      });
    }

    // 2b. Automatically deactivate accounts that have been inactive for 12 months
    if (!user.deactivatedAt && shouldDeactivateForInactivity(user)) {
      const checklist = buildReactivationChecklist(user.reactivationChecklist);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          deactivatedAt: new Date(),
          deactivationReason: INACTIVITY_REASON,
          reactivationChecklist: checklist,
        },
      });
      console.log(`ℹ️ Auto-deactivated ${email} due to inactivity.`);
    }

    if (user.deactivatedAt) {
      const checklist = buildReactivationChecklist(user.reactivationChecklist);
      console.warn(`⚠️ Login blocked: ${email} is deactivated (${user.deactivationReason}).`);
      return NextResponse.json(
        {
          message: 'Account temporarily deactivated after 12 months of inactivity. Complete recovery steps to regain access.',
          reason: user.deactivationReason,
          recoveryRequirements: publicRecoveryRequirements(checklist, user),
        },
        { status: 423 },
      );
    }

    // 3. Verify the password
    const match = await compare(password, user.password);
    if (!match) {
      console.warn(`⚠️ Login failed: Password mismatch for user ${email}.`);
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }
    console.log("3. Password verified successfully.");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastActiveAt: new Date(),
        deactivatedAt: null,
        deactivationReason: null,
        reactivationChecklist: null,
      },
    });

    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'authenticated',
      exp: issuedAt + (60 * 60 * 24 * 7),
      iat: issuedAt,
      sub: user.supabaseUserId,
      email: user.email,
      role: 'authenticated',
    };

    // 4. Sign the token
    const token = sign(payload, secret);
    console.log("4. Token signed successfully.");
    // console.log("   -> Token:", token); // Uncomment for deep debugging if needed

    const userToReturn = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      profileComplete: !!user.name,
      preferencesComplete: !!user.experienceLevel,
    };

    console.log("5. Sending token and user data to client.");
    console.log("--- LOGIN SUCCESS ---\n");
    return NextResponse.json({ token, user: userToReturn });

  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
  }
}
