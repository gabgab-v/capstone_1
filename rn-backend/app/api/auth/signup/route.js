import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase admin client for server-side actions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    // Step 1: Create the user in Supabase Authentication
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Mark the email as confirmed automatically
    });

    if (authError) {
      // If the user already exists in Supabase, return a clear error
      if (authError.message.includes('unique constraint')) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user in authentication service.' }, { status: 500 });
    }

    // Step 2: Create the corresponding user profile in your Prisma database
    // We no longer store the password ourselves. Supabase handles that.
    const userProfile = await prisma.user.create({
      data: {
        id: authData.user.id,        // Use the ID from Supabase as the primary key
        supabaseUserId: authData.user.id, // Also store it in the dedicated sync column
        email: email,
        name: name,
        // Password is NOT saved in this database
      },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user: userProfile }, { status: 201 });

  } catch (err) {
    console.error('Signup error:', err);
    // Check for Prisma unique constraint violation as a fallback
    if (err.code === 'P2002') {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}