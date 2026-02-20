import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// --- Minimal JWT Decoder (for edge runtime compatibility) ---
function decodeJwt(token: string) {
    try {
        const payload = token.split(".")[1];
        const decoded = JSON.parse(atob(payload));
        return decoded;
    } catch (e) {
        return null;
    }
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Protect /dashboard/* routes
    if (pathname.startsWith("/dashboard")) {
        const refreshToken = request.cookies.get("refreshToken")?.value;

        if (!refreshToken) {
            return NextResponse.redirect(new URL("/login", request.url));
        }

        // Optional: Check expiration without signature verification
        const decoded = decodeJwt(refreshToken);
        if (!decoded || !decoded.exp || decoded.exp * 1000 < Date.now()) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    }

    return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: ["/dashboard/:path*"],
};
