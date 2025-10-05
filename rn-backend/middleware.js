import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const rawSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
const SECRET_KEY = rawSecret ? new TextEncoder().encode(rawSecret) : null;

export async function middleware(req) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  let response;

  if (req.nextUrl.pathname.startsWith('/api/admin')) {
    if (req.nextUrl.pathname.startsWith('/api/admin/login')) {
      response = NextResponse.next();
    } else if (!SECRET_KEY) {
      response = new NextResponse(
        JSON.stringify({ message: 'Server configuration error: missing JWT secret.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
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

          response = NextResponse.next();
        } catch (error) {
          response = new NextResponse(
            JSON.stringify({ message: 'Forbidden: Invalid token or insufficient permissions.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }
  } else {
    response = NextResponse.next();
  }

  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
