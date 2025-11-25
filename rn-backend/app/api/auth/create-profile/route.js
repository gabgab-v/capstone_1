import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// This endpoint is called AFTER a user is created in Supabase Auth
export async function POST(req) {
  try {
    const { id, email, name, visitedTrail } = await req.json();

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedVisited = typeof visitedTrail === 'string' ? visitedTrail.trim() : '';

    if (!id || !trimmedEmail || !trimmedName) {
      return NextResponse.json({ message: 'User id, email, and name are required.' }, { status: 400 });
    }

    const existingEmail = await prisma.user.findFirst({
      where: { email: trimmedEmail },
      select: { id: true },
    });

    if (existingEmail) {
      return NextResponse.json({ message: 'Email already in use' }, { status: 409 });
    }

    const existingName = await prisma.user.findFirst({
      where: { name: trimmedName },
      select: { id: true },
    });

    if (existingName) {
      return NextResponse.json({ message: 'Name already in use' }, { status: 409 });
    }

    // Create a new user profile in your Prisma DB,
    // linking it with the Supabase Auth ID.
    const newUser = await prisma.user.create({
      data: {
        id: id, // Use the ID from Supabase Auth
        supabaseUserId: id, // Also store it in the dedicated sync column
        email: trimmedEmail,
        name: trimmedName,
        preferredMountains: trimmedVisited ? [trimmedVisited] : [],
        mountainSuggestionsEnabled: true,
        // You don't store the password here anymore
      },
    });

    return NextResponse.json({ success: true, user: newUser });
  } catch (error) {
    console.error("Create Profile API error:", error);

    if (error.code === 'P2002') {
      const rawTargets = error.meta?.target;
      const targets = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];
      const targetString = targets.join(',').toLowerCase();

      if (targetString.includes('email')) {
        return NextResponse.json({ message: 'Email already in use' }, { status: 409 });
      }

      if (targetString.includes('name')) {
        return NextResponse.json({ message: 'Name already in use' }, { status: 409 });
      }

      return NextResponse.json({ message: 'Unique constraint violation' }, { status: 409 });
    }

    return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
  }
}
