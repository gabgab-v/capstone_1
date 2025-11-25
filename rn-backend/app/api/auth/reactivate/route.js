import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';
import {
  buildReactivationChecklist,
  getRequiredTermsVersion,
  isReactivationComplete,
  publicRecoveryRequirements,
} from '@/lib/reactivation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emailRedirectTo = process.env.SUPABASE_EMAIL_CONFIRM_REDIRECT_TO;
const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      email,
      step = 'status',
      termsVersion,
      newPassword,
    } = body || {};

    if (!email) {
      return NextResponse.json(
        { message: 'Email is required.' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found.' },
        { status: 404 },
      );
    }

    let checklist = buildReactivationChecklist(user.reactivationChecklist);
    const requiredTermsVersion = getRequiredTermsVersion();

    if (!user.deactivatedAt) {
      return NextResponse.json({
        message: 'Account is active. No reactivation is required.',
        reactivated: true,
        recoveryRequirements: publicRecoveryRequirements(checklist, user),
      });
    }

    let supabaseUser = null;

    if (supabaseAdmin && user.supabaseUserId) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        user.supabaseUserId,
      );

      if (error) {
        console.error('Failed to fetch Supabase user:', error);
      } else {
        supabaseUser = data?.user || null;
      }
    }

    const normalizedStep = String(step || 'status').toLowerCase();
    const updates = {};

    if (normalizedStep === 'verify_email') {
      if (!supabaseAdmin || !user.supabaseUserId) {
        return NextResponse.json(
          {
            message:
              'Email verification requires Supabase admin credentials to be configured.',
          },
          { status: 503 },
        );
      }

      if (supabaseUser?.email_confirmed_at) {
        checklist.verifyEmail = false;
        updates.emailVerifiedAt = new Date(supabaseUser.email_confirmed_at);
      } else {
        const { error: resendError } = await supabaseAdmin.auth.resend({
          type: 'signup',
          email: user.email,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });

        if (resendError) {
          console.error('Failed to resend email verification:', resendError);
        }
      }
    } else if (normalizedStep === 'verify_phone') {
      if (!supabaseAdmin || !user.supabaseUserId) {
        return NextResponse.json(
          {
            message:
              'Phone verification requires Supabase admin credentials to be configured.',
          },
          { status: 503 },
        );
      }

      if (supabaseUser?.phone_confirmed_at) {
        checklist.verifyPhone = false;
        updates.phoneVerifiedAt = new Date(supabaseUser.phone_confirmed_at);
      }
    } else if (normalizedStep === 'accept_terms') {
      if (!termsVersion || termsVersion !== requiredTermsVersion) {
        return NextResponse.json(
          {
            message: `You must accept the current terms version (${requiredTermsVersion}) to proceed.`,
          },
          { status: 400 },
        );
      }

      checklist.acceptTermsVersion = null;
      updates.termsVersionAccepted = termsVersion;
    } else if (normalizedStep === 'reset_password') {
      if (!newPassword || newPassword.length < 8) {
        return NextResponse.json(
          { message: 'A new password of at least 8 characters is required.' },
          { status: 400 },
        );
      }

      if (!supabaseAdmin || !user.supabaseUserId) {
        return NextResponse.json(
          {
            message:
              'Password resets require Supabase admin credentials to be configured.',
          },
          { status: 503 },
        );
      }

      const { error: resetError } =
        await supabaseAdmin.auth.admin.updateUserById(user.supabaseUserId, {
          password: newPassword,
        });

      if (resetError) {
        console.error('Failed to reset password:', resetError);
        return NextResponse.json(
          { message: 'Unable to reset password at this time.' },
          { status: 502 },
        );
      }

      checklist.resetPassword = false;
    } else if (normalizedStep !== 'status') {
      return NextResponse.json(
        { message: 'Unknown recovery step.' },
        { status: 400 },
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...updates,
        reactivationChecklist: checklist,
      },
    });

    const readyToReactivate = isReactivationComplete(checklist, updatedUser);

    if (readyToReactivate) {
      const reactivatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          deactivatedAt: null,
          deactivationReason: null,
          reactivationChecklist: null,
          lastActiveAt: new Date(),
        },
      });

      return NextResponse.json({
        message: 'Account reactivated. You can now log in.',
        reactivated: true,
        recoveryRequirements: null,
        user: {
          id: reactivatedUser.id,
          email: reactivatedUser.email,
          name: reactivatedUser.name,
        },
      });
    }

    return NextResponse.json({
      message: 'Recovery step recorded. Additional actions are still required.',
      reactivated: false,
      recoveryRequirements: publicRecoveryRequirements(checklist, updatedUser),
    });
  } catch (error) {
    console.error('Reactivate API error:', error);
    return NextResponse.json(
      { message: 'An internal server error occurred.' },
      { status: 500 },
    );
  }
}
