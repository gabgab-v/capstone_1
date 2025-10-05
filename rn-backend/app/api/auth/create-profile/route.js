import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// This endpoint is called AFTER a user is created in Supabase Auth
export async function POST(req) {
  try {
    const { id, email, name } = await req.json();

    // Create a new user profile in your Prisma DB,
    // linking it with the Supabase Auth ID.
    const newUser = await prisma.user.create({
      data: {
        id: id, // Use the ID from Supabase Auth
        supabaseUserId: id, // Also store it in the dedicated sync column
        email: email,
        name: name,
        // You don't store the password here anymore
      },
    });

    return NextResponse.json({ success: true, user: newUser });
  } catch (error) {
    console.error("Create Profile API error:", error);
    return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
  }
}