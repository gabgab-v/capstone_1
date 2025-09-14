import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Your existing CORS Headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Or a specific domain for production
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET);

export async function middleware(req) {
  // 1. Handle pre-flight requests for CORS
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  let response;

  // 2. Protect routes under /api/admin
  if (req.nextUrl.pathname.startsWith('/api/admin')) {
    
    // --- FIX APPLIED HERE ---
    // If the request is for the login route, bypass all token checks
    if (req.nextUrl.pathname.startsWith('/api/admin/login')) {
        return NextResponse.next(); // Allow the request to proceed
    }
    // --- END OF FIX ---

    // For all OTHER admin routes, perform the security check
    const token = req.headers.get('authorization')?.split(' ')[1];

    if (!token) {
      response = new NextResponse(
        JSON.stringify({ message: 'Authentication token is required.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      try {
        const { payload } = await jwtVerify(token, SECRET_KEY);
        
        if (payload.role !== 'ADMIN') {
          throw new Error('Admin role required.');
        }

        // If token is valid and role is ADMIN, proceed to the API route
        response = NextResponse.next();

      } catch (error) {
        response = new NextResponse(
          JSON.stringify({ message: 'Forbidden: Invalid token or insufficient permissions.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  } else {
    // For any other route, just prepare to continue
    response = NextResponse.next();
  }

  // 3. Apply CORS headers to ALL outgoing responses (including errors and successes)
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// Apply the middleware to all /api routes
export const config = {
  matcher: '/api/:path*',
};
