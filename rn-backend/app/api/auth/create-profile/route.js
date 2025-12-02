import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { ensureUserColumns } from '@/lib/auth';

function normalizeFullName(firstName, lastName, fallbackName) {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.replace(/\s+/g, ' ').trim();
  const fallback = (fallbackName ?? '').replace(/\s+/g, ' ').trim();
  return combined || fallback;
}

function parseBirthdate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// This endpoint is called AFTER a user is created in Supabase Auth
export async function POST(req) {
  try {
    const { id, email, name, firstName, lastName, visitedTrail, birthday } = await req.json();

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedVisited = typeof visitedTrail === 'string' ? visitedTrail.trim() : '';
    const resolvedName = normalizeFullName(trimmedFirstName, trimmedLastName, trimmedName);
    const parsedBirthdate = parseBirthdate(birthday);

    if (!id || !trimmedEmail || !resolvedName) {
      return NextResponse.json(
        { message: 'User id, email, and full name (first and last) are required.' },
        { status: 400 },
      );
    }

    const existingEmail = await prisma.user.findFirst({
      where: { email: trimmedEmail },
      select: { id: true },
    });

    if (existingEmail) {
      return NextResponse.json({ message: 'Email already in use' }, { status: 409 });
    }

    const existingName = await prisma.user.findFirst({
      where: { name: resolvedName },
      select: { id: true },
    });

    if (existingName) {
      return NextResponse.json({ message: 'Name already in use' }, { status: 409 });
    }

    // Create a new user profile in your Prisma DB,
    // linking it with the Supabase Auth ID.
    const createUser = async () =>
      prisma.user.create({
        data: {
          id: id, // Use the ID from Supabase Auth
          supabaseUserId: id, // Also store it in the dedicated sync column
          email: trimmedEmail,
          name: resolvedName,
          birthdate: parsedBirthdate,
          preferredMountains: trimmedVisited ? [trimmedVisited] : [],
          mountainSuggestionsEnabled: true,
          // You don't store the password here anymore
        },
      });

    let newUser = null;
    try {
      newUser = await createUser();
    } catch (createError) {
      if (createError?.code === 'P2022') {
        // DB is missing new columns (legacy deploy). Patch columns then retry once.
        await ensureUserColumns();
        newUser = await createUser();
      } else {
        throw createError;
      }
    }

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
