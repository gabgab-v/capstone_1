import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';        // adjust if your Prisma client lives elsewhere

const JWT_SECRET = process.env.JWT_SECRET;  // put this in .env.local

// Works with both NextRequest (App Router) and Node req (Pages Router)
export async function getUserFromToken(reqLike) {
  const header =
    typeof reqLike.headers?.get === 'function'
      ? reqLike.headers.get('authorization')        // App Router
      : reqLike.headers?.authorization;             // Node / Pages

  console.log('🔎 Full Authorization header:', header);

  if (!header?.startsWith('Bearer '))
    throw new Error('No / invalid Authorization header');

  const token   = header.split(' ')[1];
  console.log('🧪 Raw token extracted:', token);
  const payload = jwt.verify(token, JWT_SECRET);     // throws if bad/expired

  const user = await prisma.user.findUnique({
    where:  { id: payload.userId },
    select: { id: true, email: true, createdAt: true }
  });

  if (!user) throw new Error('User not found');
  return user;
}
