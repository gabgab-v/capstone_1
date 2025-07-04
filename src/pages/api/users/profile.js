// PUT /api/users/me/profile
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';  

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).end();

  try {
    const auth = req.headers.authorization || '';
    const token = auth.split(' ')[1] || '';
    const payload = verifyToken(token);

    const { name, birthdate } = req.body;
    if (!name || !birthdate) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data:  { name, birthdate },
      select:{ id: true, email: true, name: true, birthdate: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
