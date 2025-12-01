import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserColumns } from '@/lib/auth';

function normalizeFullName(firstName, lastName, fallbackName) {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.replace(/\s+/g, ' ').trim();
  const fallback = (fallbackName ?? '').replace(/\s+/g, ' ').trim();
  return combined || fallback;
}

export async function POST(request) {
  try {
    const { email, firstName, lastName, name } = await request.json();

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const resolvedName = normalizeFullName(trimmedFirstName, trimmedLastName, trimmedName);

    if (!trimmedEmail && !resolvedName) {
      return NextResponse.json({ message: 'Email or name is required to check availability.' }, { status: 400 });
    }

    await ensureUserColumns();

    const [existingEmail, existingName] = await Promise.all([
      trimmedEmail
        ? prisma.user.findFirst({
            where: { email: trimmedEmail },
            select: { id: true },
          })
        : null,
      resolvedName
        ? prisma.user.findFirst({
            where: { name: resolvedName },
            select: { id: true },
          })
        : null,
    ]);

    const emailAvailable = !existingEmail;
    const nameAvailable = !existingName;

    return NextResponse.json({
      emailAvailable,
      nameAvailable,
      normalizedName: resolvedName || null,
    });
  } catch (error) {
    console.error('Availability check failed:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
