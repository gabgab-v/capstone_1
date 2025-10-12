import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ADMIN_JWT_SECRET = process.env.JWT_SECRET || SUPABASE_JWT_SECRET;

export async function getUserFromToken(request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.split(' ')[1];
  if (!token) return null;

  if (!SUPABASE_JWT_SECRET) {
    console.error('Token verification failed: SUPABASE_JWT_SECRET is not configured.');
    return null;
  }

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET);

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

    const { password, ...safeUser } = user;
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
      const { password, ...safeAdmin } = user;
      return safeAdmin;
    }

    return null;
  } catch (error) {
    console.error('Admin token verification failed:', error.message);
    return null;
  }
}
