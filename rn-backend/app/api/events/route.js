import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

export async function POST(req) {
  try {
    const user = await getUserFromToken(req); // validates & fetches user
    const body = await req.json();

    const event = await prisma.event.create({
      data: {
        ...body,
        organizerId: user.id,
      },
    });

    return new Response(JSON.stringify(event), { status: 201 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Unauthorized or invalid data' }), { status: 401 });
  }
}

export async function GET() {
  const events = await prisma.event.findMany({
    include: { organizer: { select: { id: true, email: true,name: true } } },
  });
  return new Response(JSON.stringify(events));
}
