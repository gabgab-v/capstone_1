import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma'; // ✅ Prisma client

// GET /api/users/me → fetch user profile
export async function GET(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        birthdate: true,
        experienceLevel: true,
        preferredDifficulty: true,
        preferredTrailType: true,
        preferredDurationHrs: true,
        budgetRange: true,
        // --- ADD THESE TWO LINES ---
        role: true,
        organizerRequestPending: true,
      },
    });

    if (!fullUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ✅ check if preferences are all filled in
    const profileComplete = !!(fullUser.name && fullUser.birthdate);
    const preferencesComplete = !!(
      fullUser.experienceLevel &&
      fullUser.preferredDifficulty &&
      fullUser.preferredTrailType &&
      fullUser.preferredDurationHrs &&
      fullUser.budgetRange
    );

    // The `...fullUser` spread will now automatically include `role` and `organizerRequestPending`
    return NextResponse.json({
      ...fullUser,
      profileComplete,
      preferencesComplete,
    }); // 200
  } catch (err) {
    console.error('❌ GET /users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT /api/users/me → update profile (NO CHANGES NEEDED HERE)
export async function PUT(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, birthdate } = await request.json();

    if (!name || !birthdate) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        birthdate: new Date(birthdate), // if stored as Date
      },
    });

    return NextResponse.json(updatedUser); // 200
  } catch (err) {
    console.error('❌ PUT /users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

