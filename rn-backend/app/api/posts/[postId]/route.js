import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import {
  buildPostInclude,
  mapPost,
  normalizePostVisibility,
  sanitizePostContent,
  sanitizePostImageUrls,
} from '@/lib/posts';

function ensurePostId(params) {
  const postId = params?.postId;
  if (typeof postId !== 'string' || postId.trim().length === 0) {
    return null;
  }
  return postId;
}

async function loadOwnedPost(postId, userId) {
  if (!postId || !userId) {
    return null;
  }
  return prisma.post.findFirst({
    where: { id: postId, userId },
    select: {
      id: true,
      userId: true,
      content: true,
      imageUrls: true,
      visibility: true,
    },
  });
}

export async function PATCH(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const postId = ensurePostId(params);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post.' }, { status: 400 });
    }

    const ownedPost = await loadOwnedPost(postId, authUser.id);
    if (!ownedPost) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    const payload = await request.json();
    const contentProvided =
      payload && Object.prototype.hasOwnProperty.call(payload, 'content');
    const imagesProvided =
      payload && Object.prototype.hasOwnProperty.call(payload, 'imageUrls');
    const visibilityProvided =
      payload && Object.prototype.hasOwnProperty.call(payload, 'visibility');

    const nextContent = contentProvided
      ? sanitizePostContent(payload?.content)
      : sanitizePostContent(ownedPost.content);
    const nextImageUrls = imagesProvided
      ? sanitizePostImageUrls(payload?.imageUrls)
      : Array.isArray(ownedPost.imageUrls)
        ? ownedPost.imageUrls
        : [];
    const nextVisibility = visibilityProvided
      ? normalizePostVisibility(payload?.visibility)
      : ownedPost.visibility;

    if (!nextContent && nextImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Please add text or keep at least one photo in your post.' },
        { status: 400 },
      );
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        content: nextContent,
        imageUrls: nextImageUrls,
        visibility: nextVisibility,
      },
      include: buildPostInclude(authUser.id),
    });

    return NextResponse.json(mapPost(updatedPost));
  } catch (error) {
    console.error(`PATCH /api/posts/${params?.postId} error:`, error);
    return NextResponse.json({ error: 'Failed to update post.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const postId = ensurePostId(params);
    if (!postId) {
      return NextResponse.json({ error: 'Invalid post.' }, { status: 400 });
    }

    const ownedPost = await loadOwnedPost(postId, authUser.id);
    if (!ownedPost) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.postLike.deleteMany({ where: { postId } }),
      prisma.postComment.deleteMany({ where: { postId } }),
      prisma.post.delete({ where: { id: postId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/posts/${params?.postId} error:`, error);
    return NextResponse.json({ error: 'Failed to delete post.' }, { status: 500 });
  }
}
