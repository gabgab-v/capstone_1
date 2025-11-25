import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import {
  INACTIVITY_REASON,
  buildReactivationChecklist,
  shouldDeactivateForInactivity,
  publicRecoveryRequirements,
} from '@/lib/reactivation';

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
