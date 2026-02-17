import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// Route configuration
const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

const PROTECTED_ROUTES = [
  "/dashboard",
  "/profile",
  "/courses",
  "/assignments",
  "/grades",
  "/settings",
];

const ADMIN_ROUTES = ["/admin", "/analytics", "/reports", "/users"];

const FACULTY_ROUTES = [
  "/courses/manage",
  "/assignments/create",
  "/assignments/grade",
  "/students",
];

// Rate limiting disabled in proxy (use service-level protection)

class MiddlewareError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public redirectTo?: string,
  ) {
    super(message);
    this.name = "MiddlewareError";
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  try {
    // Skip middleware for static assets and API routes that don't need auth
    if (shouldSkipMiddleware(pathname)) {
      return response;
    }

    // Rate limiting disabled in proxy middleware

    // Handle CSRF protection for state-changing requests
    if (isStateMutatingRequest(request)) {
      await validateCSRFToken(request);
    }

    // Get authentication status
    const authResult = await getAuthenticationStatus(request);

    // Handle public routes
    if (isPublicRoute(pathname)) {
      // No redirection needed since auth is handled externally
      return addSecurityHeaders(response);
    }

    // Handle protected routes
    if (isProtectedRoute(pathname)) {
      if (!authResult.isAuthenticated) {
        // Do not perform a server-side redirect to `/login`.
        // Allow the request to continue so the client can render
        // the appropriate unauthorized UI. Attach a header so
        // client code can detect unauthenticated responses if needed.
        response.headers.set("x-user-authenticated", "false");
        return addSecurityHeaders(response);
      }

      // Check role-based access for admin routes
      if (isAdminRoute(pathname) && !hasAdminAccess(authResult.user)) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }

      // Check role-based access for faculty routes
      if (isFacultyRoute(pathname) && !hasFacultyAccess(authResult.user)) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }

      // No token refresh needed as auth is handled externally
      // Update last activity and indicate authenticated
      response.headers.set("x-user-authenticated", "true");
      updateLastActivity(response, authResult.sessionId);
    }

    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Middleware error:", error);

    if (error instanceof MiddlewareError) {
      if (error.redirectTo) {
        return NextResponse.redirect(new URL(error.redirectTo, request.url));
      }
      return new NextResponse("Access denied", { status: error.statusCode });
    }

    // Fallback for unexpected errors
    return new NextResponse("Internal server error", { status: 500 });
  }
}

// Helper functions

function shouldSkipMiddleware(pathname: string): boolean {
  const skipPatterns = [
    /^\/api\//, // All API routes handle their own auth (including /api/v1/auth/...)
    /^\/_next\//, // Next.js internal files
    /^\/favicon\.ico$/,
    /^\/robots\.txt$/,
    /^\/sitemap\.xml$/,
    /\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$/,
  ];

  return skipPatterns.some((pattern) => pattern.test(pathname));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  });
}

function isAuthRoute(pathname: string): boolean {
  const authRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];
  return authRoutes.some((route) => pathname.startsWith(route));
}

function isProtectedRoute(pathname: string): boolean {
  // If not public, it's protected
  return !isPublicRoute(pathname);
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

function isFacultyRoute(pathname: string): boolean {
  return FACULTY_ROUTES.some((route) => pathname.startsWith(route));
}

function isStateMutatingRequest(request: NextRequest): boolean {
  const method = request.method;
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

// Rate limiting removed from proxy middleware. Use service-level protections instead.

async function validateCSRFToken(request: NextRequest): Promise<void> {
  // Skip CSRF validation for auth endpoints (they handle it internally)
  if (request.nextUrl.pathname.startsWith("/api/auth/")) {
    return;
  }

  // CSRF validation temporarily disabled as auth endpoints have been removed
  // This function is kept for potential future implementation
  return;
}

async function getAuthenticationStatus(request: NextRequest): Promise<{
  isAuthenticated: boolean;
  user: any;
  sessionId: string | null;
  shouldRefresh: boolean;
}> {
  try {
    // Call IAM service to validate authentication
    // Forward the cookies from the original request to the IAM service
    const cookie = request.headers.get("cookie");
    
    const response = await fetch("http://localhost:8080/api/v1/auth/validate", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { "Cookie": cookie } : {}),
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        isAuthenticated: true,
        user: data,
        sessionId: data.id || null,
        shouldRefresh: false,
      };
    }
    
    return {
      isAuthenticated: false,
      user: null,
      sessionId: null,
      shouldRefresh: false,
    };
  } catch (error) {
    console.error("Authentication validation failed:", error);
    return {
      isAuthenticated: false,
      user: null,
      sessionId: null,
      shouldRefresh: false,
    };
  }
}

function hasAdminAccess(user: any): boolean {
  if (!user) return false;

  const adminRoles = ["admin", "super_admin"];
  const adminPermissions = ["admin", "users:manage", "institution:manage"];

  return (
    user.roles?.some((role: string) => adminRoles.includes(role)) ||
    user.permissions?.some((permission: string) =>
      adminPermissions.includes(permission),
    )
  );
}

function hasFacultyAccess(user: any): boolean {
  if (!user) return false;

  const facultyRoles = [
    "faculty",
    "instructor",
    "teacher",
    "admin",
    "super_admin",
  ];
  const facultyPermissions = [
    "courses:manage",
    "assignments:create",
    "assignments:grade",
    "students:view",
  ];

  return (
    user.roles?.some((role: string) => facultyRoles.includes(role)) ||
    user.permissions?.some((permission: string) =>
      facultyPermissions.includes(permission),
    )
  );
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);

  // Add return URL for post-login redirect
  if (request.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set("returnTo", request.nextUrl.pathname);
  }

  return NextResponse.redirect(loginUrl);
}

async function handleTokenRefresh(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  // Token refresh is now handled by external auth service
  // This function is kept for potential future implementation
  return response;
}

function updateLastActivity(
  response: NextResponse,
  sessionId: string | null,
): void {
  if (sessionId) {
    // Add header to trigger activity update in API
    response.headers.set("X-Update-Activity", "true");
  }
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: Adjust for production
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  // Permissions Policy
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );

  return response;
}

function getClientIP(request: NextRequest): string {
  // Try different headers for client IP
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (realIp) {
    return realIp.trim();
  }

  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  return "unknown";
}

// cleanupRateLimitStore removed along with proxy rate limiting

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next (static files)
     * - favicon.ico, robots.txt, sitemap.xml
     * - common static files
     */
    "/((?!_next|favicon.ico|robots.txt|sitemap.xml|.*\\..*$).*)",
  ],
};
