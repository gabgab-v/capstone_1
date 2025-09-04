import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma'; // Assuming you have this lib setup
import { sign } from 'jsonwebtoken';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const match = await compare(password, user.password);
    if (!match) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    // --- MODIFICATION 1 ---
    // Include the user's role in the token. This is good practice for the middleware.
    const token = sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
      }
    );
    
    // --- MODIFICATION 2 ---
    // Create a safe user object to return to the frontend.
    // Crucially, this omits the password.
    const userToReturn = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
    };

    // --- MODIFICATION 3 ---
    // Return both the token AND the user object.
    return NextResponse.json({ token, user: userToReturn });

  } catch (error) {
      console.error("Login API error:", error);
      return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
  }
}

