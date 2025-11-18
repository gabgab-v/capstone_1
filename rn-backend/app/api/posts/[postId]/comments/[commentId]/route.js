import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

export async function DELETE(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const postId = params?.postId;
    const commentId = params?.commentId;

    if (!postId || !commentId) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const comment = await prisma.postComment.findFirst({
      where: { id: commentId, postId },
      select: {
        id: true,
        userId: true,
        post: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found.' }, { status: 404 });
    }

    const isOwner = comment.userId === authUser.id;
    const isPostOwner = comment.post?.userId === authUser.id;

    if (!isOwner && !isPostOwner) {
      return NextResponse.json({ error: 'You cannot delete this comment.' }, { status: 403 });
    }

    await prisma.postComment.delete({
      where: { id: commentId },
    });

    const commentCount = await prisma.postComment.count({ where: { postId } });

    return NextResponse.json({
      success: true,
      commentCount,
    });
  } catch (error) {
    console.error(
      `DELETE /api/posts/${params?.postId}/comments/${params?.commentId} error:`,
      error,
    );
    return NextResponse.json({ error: 'Failed to delete comment.' }, { status: 500 });
  }
}
