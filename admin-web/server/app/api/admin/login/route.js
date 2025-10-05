import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

// Initialize the Supabase admin client for server-side actions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    // Step 1: Authenticate the credentials against Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // This will now correctly report "Invalid login credentials" from Supabase
      return NextResponse.json({ message: authError.message }, { status: 401 });
    }

    // Step 2: Verify the user has the ADMIN role in your Prisma database
    const userProfile = await prisma.user.findUnique({
      where: { id: authData.user.id },
    });

    if (!userProfile || userProfile.role !== 'ADMIN') {
      // Even if login is valid, deny access if not an admin
      return NextResponse.json({ message: 'Access denied. Not an admin user.' }, { status: 403 });
    }

    // Step 3: If both checks pass, return the valid Supabase token
    return NextResponse.json({ token: authData.session.access_token });

  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}