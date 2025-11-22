import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import {
  buildPostInclude,
  buildPostVisibilityWhereClause,
  mapPost,
  normalizePostVisibility,
  sanitizePostContent,
  sanitizePostImageUrls,
  sanitizePostTrailId,
} from '@/lib/posts';

export async function GET(request) {
  try {
    const authUser = await getUserFromToken(request);
    const url = request.nextUrl;
    const userId = url.searchParams.get('userId');

    const where = {
      ...(userId ? { userId } : {}),
      ...buildPostVisibilityWhereClause(authUser?.id ?? null),
    };

    const include = buildPostInclude(authUser?.id);

    const posts = await prisma.post.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(posts.map(mapPost));
  } catch (error) {
    console.error('GET /api/posts error:', error);
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const content = sanitizePostContent(payload?.content);
    const imageUrls = sanitizePostImageUrls(payload?.imageUrls);
    const trailId = sanitizePostTrailId(payload?.trailId);
    const visibility = normalizePostVisibility(payload?.visibility);

    if (!content && imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Please add some text or include at least one image.' },
        { status: 400 },
      );
    }

    let selectedTrailId = null;
    if (trailId) {
      const trail = await prisma.trail.findFirst({
        where: { id: trailId, userId: authUser.id },
        select: { id: true },
      });
      if (!trail) {
        return NextResponse.json(
          { error: 'Trail not found or not owned by this user.' },
          { status: 404 },
        );
      }
      selectedTrailId = trail.id;
    }

    const post = await prisma.post.create({
      data: {
        content,
        imageUrls,
        userId: authUser.id,
        trailId: selectedTrailId,
        visibility,
      },
    });

    const postWithRelations = await prisma.post.findUnique({
      where: { id: post.id },
      include: buildPostInclude(authUser.id),
    });

    return NextResponse.json(mapPost(postWithRelations), { status: 201 });
  } catch (error) {
    console.error('POST /api/posts error:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
