import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = clampNumber(searchParams.get("limit"), 50, 1, 200);
    const now = new Date();

    const pending = await prisma.notification.findMany({
      where: {
        userId: user.id,
        deliveredAt: null,
        deliverAt: { lte: now },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    if (pending.length) {
      await prisma.notification.updateMany({
        where: { id: { in: pending.map((entry) => entry.id) } },
        data: { deliveredAt: now },
      });
    }

    const payload = pending.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      data: entry.data ?? null,
      eventId: entry.eventId ?? null,
      deliverAt: entry.deliverAt,
      createdAt: entry.createdAt,
    }));

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch pending notifications:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
