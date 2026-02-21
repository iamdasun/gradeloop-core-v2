import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if refresh_token cookie exists (set by backend)
  const hasRefreshToken = request.cookies.has("refresh_token");

  // Public paths that don't require authentication
  const publicPaths = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/reset-required",
    "/unauthorized",
  ];

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // Protected paths that require authentication
  const protectedPaths = ["/admin", "/instructor", "/student"];
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );

  // Redirect to login if accessing protected path without refresh token
  if (isProtectedPath && !hasRefreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow all other requests
  // Role-based access control is handled by client-side guards
  return NextResponse.next();
}

// Run middleware for protected paths
export const config = {
  matcher: [
    "/admin/:path*",
    "/instructor/:path*",
    "/student/:path*",
    "/auth/:path*",
  ],
};
