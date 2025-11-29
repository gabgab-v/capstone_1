import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ADMIN_JWT_SECRET = process.env.JWT_SECRET || SUPABASE_JWT_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseService =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

export async function ensureUserColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredMountains" TEXT[] DEFAULT \'{}\'::text[];',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ALTER COLUMN "preferredMountains" SET DEFAULT \'{}\'::text[];',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mountainSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT TRUE;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP DEFAULT NOW();',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivationReason" TEXT;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reactivationChecklist" JSONB;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersionAccepted" TEXT;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizerTrustScore" INTEGER;',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizerTrustTier" "OrganizerTrustTier";',
    );

    await prisma.$executeRawUnsafe(
      'UPDATE "User" SET "preferredMountains" = COALESCE("preferredMountains", \'{}\'::text[]);',
    );
    await prisma.$executeRawUnsafe(
      'UPDATE "User" SET "mountainSuggestionsEnabled" = COALESCE("mountainSuggestionsEnabled", TRUE);',
    );
    await prisma.$executeRawUnsafe(
      'UPDATE "User" SET "lastActiveAt" = COALESCE("lastActiveAt", NOW());',
    );
  } catch (error) {
    console.error('ensureUserColumns error:', error);
  }
}

export async function getUserFromToken(request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.split(' ')[1];
  if (!token) return null;

  try {
    await ensureUserColumns();
    let payload = null;

    if (SUPABASE_JWT_SECRET) {
      try {
        payload = jwt.verify(token, SUPABASE_JWT_SECRET);
      } catch (error) {
        console.error('Token verification failed with configured secret:', error.message);
      }
    } else {
      console.warn('SUPABASE_JWT_SECRET is not configured; attempting Supabase service verification instead.');
    }

    if (!payload && supabaseService) {
      try {
        const { data, error } = await supabaseService.auth.getUser(token);
        if (error) {
          console.error('Supabase service user lookup failed:', error.message);
        } else if (data?.user) {
          payload = {
            sub: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata ?? data.user.app_metadata ?? {},
          };
        }
      } catch (serviceError) {
        console.error('Supabase service user lookup threw:', serviceError.message);
      }
    }

    if (!payload) {
      console.error('Token verification failed: no valid payload after all strategies.');
      return null;
    }

    const emailFromToken =
      payload.email ??
      payload?.user_metadata?.email ??
      payload?.user_metadata?.email_address ??
      null;

    let user =
      (await prisma.user.findUnique({
        where: { supabaseUserId: payload.sub },
      })) ?? null;

    if (!user && emailFromToken) {
      // Handle legacy records that were created before Supabase integration.
      user = await prisma.user.findUnique({
        where: { email: emailFromToken },
      });
      if (user && !user.supabaseUserId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            supabaseUserId: payload.sub,
          },
        });
      }
    }

    if (!user) {
      if (!emailFromToken) {
        console.error(
          'Token verification failed: Supabase payload did not include an email for user',
          payload.sub,
        );
        return null;
      }

      const inferredName =
        payload?.user_metadata?.full_name ??
        payload?.user_metadata?.name ??
        payload?.user_metadata?.user_name ??
        null;

      user = await prisma.user.create({
        data: {
          id: payload.sub,
          supabaseUserId: payload.sub,
          email: emailFromToken,
          name: inferredName,
        },
      });
    } else if (!user.email && emailFromToken) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: emailFromToken,
        },
      });
    }

    if (!user) return null;

    const safeUser = { ...user };
    delete safeUser.password;
    return safeUser;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

export async function getAdminFromToken(request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.split(' ')[1];
  if (!token) return null;

  if (!ADMIN_JWT_SECRET) {
    console.error('Admin token verification failed: JWT secret not configured.');
    return null;
  }

  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { supabaseUserId: payload.sub },
    });

    if (user && user.role === 'ADMIN') {
      const safeAdmin = { ...user };
      delete safeAdmin.password;
      return safeAdmin;
    }

    return null;
  } catch (error) {
    console.error('Admin token verification failed:', error.message);
    return null;
  }
}
