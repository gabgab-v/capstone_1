import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

function sanitizeContent(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeImageUrls(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function mapPost(post) {
  if (!post) {
    return null;
  }

  const { user, ...rest } = post;
  return {
    ...rest,
    content: post.content ?? '',
    imageUrls: post.imageUrls ?? [],
    author: user
      ? {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
        }
      : null,
  };
}

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
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
    const content = sanitizeContent(payload?.content);
    const imageUrls = sanitizeImageUrls(payload?.imageUrls);

    if (!content && imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Please add some text or include at least one image.' },
        { status: 400 },
      );
    }

    const post = await prisma.post.create({
      data: {
        content,
        imageUrls,
        userId: authUser.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(mapPost(post), { status: 201 });
  } catch (error) {
    console.error('POST /api/posts error:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
