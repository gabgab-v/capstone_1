import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

async function ensureParticipant(conversationId, userId) {
  if (!conversationId || !userId) {
    return null;
  }
  return prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });
}

export async function DELETE(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = params?.conversationId;
    const messageId = params?.messageId;

    if (!conversationId || !messageId) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const participant = await ensureParticipant(conversationId, authUser.id);
    if (!participant) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
      },
    });

    if (!message || message.conversationId !== conversationId) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    }

    if (message.senderId !== authUser.id) {
      return NextResponse.json({ error: 'You can only delete your own messages.' }, { status: 403 });
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      `DELETE /api/chats/${params?.conversationId}/messages/${params?.messageId} failed:`,
      error,
    );
    return NextResponse.json({ error: 'Failed to delete message.' }, { status: 500 });
  }
}
