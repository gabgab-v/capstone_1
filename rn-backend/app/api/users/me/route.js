import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const userSelect = {
  id: true,
  email: true,
  name: true,
  birthdate: true,
  experienceLevel: true,
  preferredDifficulty: true,
  preferredTrailType: true,
  preferredDurationHrs: true,
  budgetRange: true,
  role: true,
  organizerRequestPending: true,
};

export async function GET(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser =
      (await prisma.user.findUnique({
        where: { id: authUser.id },
        select: userSelect,
      })) ?? {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        birthdate: authUser.birthdate,
        experienceLevel: authUser.experienceLevel,
        preferredDifficulty: authUser.preferredDifficulty,
        preferredTrailType: authUser.preferredTrailType,
        preferredDurationHrs: authUser.preferredDurationHrs,
        budgetRange: authUser.budgetRange,
        role: authUser.role,
        organizerRequestPending: authUser.organizerRequestPending ?? false,
      };

    if (!dbUser?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profileComplete = Boolean(dbUser.name && dbUser.birthdate);
    const preferencesComplete = Boolean(
      dbUser.experienceLevel &&
        dbUser.preferredDifficulty &&
        dbUser.preferredTrailType &&
        dbUser.preferredDurationHrs &&
        dbUser.budgetRange,
    );

    return NextResponse.json({
      ...dbUser,
      profileComplete,
      preferencesComplete,
    });
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, birthdate } = await request.json();

    if (!name || !birthdate) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        name,
        birthdate: new Date(birthdate),
      },
      select: userSelect,
    });

    const profileComplete = Boolean(updatedUser.name && updatedUser.birthdate);
    const preferencesComplete = Boolean(
      updatedUser.experienceLevel &&
        updatedUser.preferredDifficulty &&
        updatedUser.preferredTrailType &&
        updatedUser.preferredDurationHrs &&
        updatedUser.budgetRange,
    );

    return NextResponse.json({
      ...updatedUser,
      profileComplete,
      preferencesComplete,
    });
  } catch (err) {
    console.error('PUT /api/users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
