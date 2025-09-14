import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// This is your secret key for signing the JWT.
// It should be stored in your .env.local file for security.
const JWT_SECRET = process.env.JWT_SECRET || 'password123';

export async function POST(req) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
        }

        // 1. Find the user by email
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
        }

        // 2. Check if the user is an ADMIN
        if (user.role !== UserRole.ADMIN) {
            return NextResponse.json({ message: 'Access denied. Not an admin.' }, { status: 403 });
        }

        // 3. Compare the provided password with the hashed password in the database
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
        }

        // 4. Generate a JWT if credentials and role are valid
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
            },
            JWT_SECRET,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        return NextResponse.json({ message: 'Login successful.', token });

    } catch (error) {
        console.error("Admin login error:", error);
        return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
    }
}
