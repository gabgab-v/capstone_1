// GET /api/users/me
import { verifyToken } from '@/lib/auth';   // you supply this
import { prisma } from '@/lib/prisma';       // your Prisma client

export default async function handler(req, res) {
  console.log('💬 AUTH HEADER:', req.headers.authorization); 
  if (req.method !== 'GET') return res.status(405).end(); // Method Not Allowed

  try {
    // Grab the token from:  Authorization: Bearer <jwt>
    const auth = req.headers.authorization || '';
    const token = auth.split(' ')[1] || '';

    const payload = verifyToken(token);            // throws if invalid/expired

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        birthdate: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const profileComplete = Boolean(user.name && user.birthdate);
    return res.json({ ...user, profileComplete });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
