import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rawJwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
const jwtSecret = rawJwtSecret ? new TextEncoder().encode(rawJwtSecret) : null;

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    console.log(`\n--- ADMIN LOGIN ATTEMPT: ${email} ---`);

    if (!email || !password) {
      console.warn('Login failed: Email or password missing.');
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    if (!jwtSecret) {
      console.error('Admin login error: JWT secret is not configured.');
      return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    console.log('1. Authenticating with Supabase...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error('Supabase authentication failed:', authError.message);
      return NextResponse.json({ message: authError.message }, { status: 401 });
    }
    console.log(`2. Supabase authentication successful for user ID: ${authData.user.id}`);

    console.log('3. Verifying ADMIN role in Prisma DB...');
    let userProfile = await prisma.user.findUnique({
      where: { supabaseUserId: authData.user.id },
    });

    if (!userProfile) {
      userProfile = await prisma.user.findUnique({
        where: { id: authData.user.id },
      });
    }

    if (!userProfile) {
      console.error(`CRITICAL: User ${authData.user.id} authenticated with Supabase but not found in Prisma DB.`);
      return NextResponse.json({ message: 'User profile not found.' }, { status: 404 });
    }

    if (userProfile.role !== 'ADMIN') {
      console.warn(`Login failed: User ${email} is not an ADMIN. Role is ${userProfile.role}.`);
      return NextResponse.json({ message: 'Access denied. Not an admin user.' }, { status: 403 });
    }
    console.log('4. User confirmed as ADMIN.');

    const issuedAt = Math.floor(Date.now() / 1000);
    const adminToken = await new SignJWT({
      sub: authData.user.id,
      email: authData.user.email ?? email,
      role: 'ADMIN',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(issuedAt)
      .setExpirationTime('24h')
      .sign(jwtSecret);

    console.log('5. Login successful. Returning admin token.');
    console.log('--- ADMIN LOGIN SUCCESS ---\n');
    return NextResponse.json({ token: adminToken });
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
