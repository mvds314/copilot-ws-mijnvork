import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Admin route protection
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Check for admin access via environment variable or feature flag
    // In production, this would check authentication/authorization
    const adminEnabled = process.env.NEXT_PUBLIC_ADMIN_ENABLED === 'true';
    
    if (!adminEnabled) {
      // Redirect to home if admin is not enabled
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
  ],
};
