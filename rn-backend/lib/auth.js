import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ADMIN_JWT_SECRET = process.env.JWT_SECRET || SUPABASE_JWT_SECRET;

export async function getUserFromToken(request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.split(' ')[1];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { supabaseUserId: payload.sub },
    });

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
