import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request, context) {
  const trailId = context?.params?.trailId ?? null;
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!trailId) {
      return NextResponse.json({ error: 'Trail ID is required' }, { status: 400 });
    }

    const trail = await prisma.trail.findUnique({
      where: { id: trailId },
    });

    if (!trail) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 });
    }

    if (trail.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(trail);
  } catch (error) {
    console.error('GET /api/trails/' + trailId + ' error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
