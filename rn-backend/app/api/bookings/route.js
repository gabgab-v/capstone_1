import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const RECEIPT_DIR_SEGMENTS = ["uploads", "receipts"];
const RECEIPT_URL_PREFIX = "/uploads/receipts";
const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/jpg",
]);
const FALLBACK_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

async function persistReceipt(file) {
  if (!file) {
    return null;
  }

  const mimeType = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (mimeType && !ALLOWED_RECEIPT_TYPES.has(mimeType)) {
    throw new Error("Unsupported receipt file type. Please upload an image.");
  }

  const arrayBuffer = await file.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("Uploaded receipt is empty.");
  }

  const originalName = typeof file.name === "string" ? file.name : "receipt";
  const extensionFromName = path.extname(originalName) || "";
  const extension =
    extensionFromName.toLowerCase() || FALLBACK_EXTENSIONS[mimeType] || ".jpg";
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${Date.now()}-${randomUUID()}${safeExtension}`;

  const uploadDir = path.join(process.cwd(), "public", ...RECEIPT_DIR_SEGMENTS);
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));

  return `${RECEIPT_URL_PREFIX}/${fileName}`.replace(/\\+/g, "/");
}

export async function POST(req) {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const formData = await req.formData();
    const eventId = formData.get("eventId");
    const amountRaw = formData.get("amount");
    const receipt = formData.get("receipt");

    if (!eventId || typeof eventId !== "string") {
      return new Response(JSON.stringify({ error: "Missing event identifier." }), { status: 400 });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found." }), { status: 404 });
    }

    const existingBooking = await prisma.booking.findFirst({
      where: {
        eventId,
        userId: user.id,
      },
    });

    if (
      existingBooking &&
      !["DECLINED", "CANCELLED"].includes((existingBooking.status || "").toUpperCase())
    ) {
      return new Response(
        JSON.stringify({ error: "You have already submitted a booking for this event." }),
        { status: 409 }
      );
    }

    const expectedAmount = Number(event.price ?? 0);
    const submittedAmount = Number(amountRaw ?? expectedAmount);
    const totalAmount = Number.isFinite(expectedAmount) ? expectedAmount : submittedAmount || 0;

    if (expectedAmount > 0 && Math.abs(submittedAmount - expectedAmount) > 0.01) {
      return new Response(
        JSON.stringify({ error: "Submitted amount does not match the event price." }),
        { status: 400 }
      );
    }

    let paymentUrl = null;

    if (expectedAmount > 0) {
      if (!receipt || typeof receipt.arrayBuffer !== "function") {
        return new Response(
          JSON.stringify({ error: "Receipt is required for paid events." }),
          { status: 400 }
        );
      }

      paymentUrl = await persistReceipt(receipt);
    } else if (receipt && typeof receipt.arrayBuffer === "function") {
      // Persist optional receipts for free events as well.
      paymentUrl = await persistReceipt(receipt);
    }

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        eventId,
        totalAmount,
        paymentUrl,
      },
      include: {
        event: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return new Response(JSON.stringify(booking), { status: 201 });
  } catch (err) {
    console.error("POST /api/bookings error:", err);
    const message = err?.message || "Unauthorized or failed";
    return new Response(JSON.stringify({ error: message }), { status: 400 });
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
