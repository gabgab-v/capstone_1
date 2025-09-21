import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

export async function POST(req) {
  try {
    const user = await getUserFromToken(req);

    const formData = await req.formData();
    const eventId = formData.get("eventId");
    const totalAmount = formData.get("amount");
    const receipt = formData.get("receipt"); // This is a File object

    // Optional: save receipt to disk, cloud storage, or just store URL
    // For now, just pretend we store the filename
    const paymentUrl = receipt?.name || "no-receipt";

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        eventId,
        totalAmount: Number(totalAmount),
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
