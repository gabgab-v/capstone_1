import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// This secret should be the same one used in your login route and stored in .env.local
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-key');

export async function middleware(req) {
    // --- FIX APPLIED HERE ---
    // If the incoming request is for the login API route,
    // allow it to proceed without any token checks.
    if (req.nextUrl.pathname.startsWith('/api/admin/login')) {
        return NextResponse.next();
    }
    // --- END OF FIX ---

    // For all other /api/admin routes, perform the token check.
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return NextResponse.json({ message: 'Authentication token is required.' }, { status: 401 });
    }

    try {
        // Verify the token
        const { payload } = await jwtVerify(token, JWT_SECRET);
        
        // Check if the user has the ADMIN role
        if (payload.role !== 'ADMIN') {
            return NextResponse.json({ message: 'Forbidden: Insufficient permissions.' }, { status: 403 });
        }
        
        // If the token is valid and the user is an admin, proceed to the requested route.
        return NextResponse.next();

    } catch (error) {
        console.error("JWT Verification Error:", error.code);
        return NextResponse.json({ message: 'Forbidden: Invalid token.' }, { status: 403 });
    }
}

// The matcher specifies that this middleware should run on all /api/admin routes.
// The logic inside the function now correctly bypasses the check for the login route.
export const config = {
    matcher: '/api/admin/:path*',
};

