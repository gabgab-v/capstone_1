import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

// 1. Use the Supabase JWT Secret for verification
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

export async function getUserFromToken(request) {
  const header = request.headers.get('authorization');

  if (!header?.startsWith('Bearer ')) {
    return null; // Return null instead of throwing an error for cleaner handling
  }

  const token = header.split(' ')[1];
  if (!token) {
    return null;
  }

  try {
    // 2. Verify the token with the Supabase secret
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET);

    // 3. Look up the user in your Prisma DB using the 'sub' claim (Supabase User ID)
    const user = await prisma.user.findUnique({
      where: { supabaseUserId: payload.sub },
    });

    if (!user) {
      return null;
    }
    
    // Omit password from the returned user object
    const { password, ...safeUser } = user;
    return safeUser;
    
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null; // Return null if token is invalid, expired, or user not found
  }
}