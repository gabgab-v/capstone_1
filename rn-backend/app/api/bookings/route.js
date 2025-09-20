import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

export async function POST(req) {
  try {
    const user = await getUserFromToken(req);
    const body = await req.json();
    const { eventId, totalAmount, paymentUrl } = body;

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        eventId,
        totalAmount,
        paymentUrl,
      },
      include: {
        event: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return new Response(JSON.stringify(booking), { status: 201 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unauthorized or failed" }), { status: 401 });
  }
}

export async function GET(req) {
  try {
    const user = await getUserFromToken(req);

    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      include: { event: true },
    });

    return new Response(JSON.stringify(bookings), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
}
