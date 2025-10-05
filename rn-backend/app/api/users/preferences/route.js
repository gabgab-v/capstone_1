// root/rn-backend/app/api/users/preferences/route.js
import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';  // ✅ Prisma client

// POST /api/users/preferences → save or update preferences
export async function POST(request) {
  try {
    // 🔒 Authenticate user
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 📥 Extract fields from body
    const body = await request.json();
    const {
      experience_level,
      preferred_difficulty,
      preferred_trail_type,
      preferred_duration_hours,
      budget_range,
    } = body;

    // ✅ Validate required fields
    if (
      !experience_level ||
      !preferred_difficulty ||
      !preferred_trail_type ||
      !preferred_duration_hours ||
      !budget_range
    ) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // 📝 Save to DB (update current user)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        experienceLevel: experience_level,
        preferredDifficulty: preferred_difficulty,
        preferredTrailType: preferred_trail_type,
        preferredDurationHrs: parseFloat(preferred_duration_hours),
        budgetRange: budget_range,
      },
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
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Preferences saved successfully',
      user: updatedUser,
    });
  } catch (err) {
    console.error('❌ POST /users/preferences error:', err);
    console.log('Token being verified:', token);
    console.log('JWT_SECRET:', process.env.JWT_SECRET);

    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
