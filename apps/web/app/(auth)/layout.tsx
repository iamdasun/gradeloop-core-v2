'use client';

/**
 * Auth layout – wraps /login, /forgot-password, /reset-password.
 * 
 * Provides a common structure for authentication pages with:
 * - A vibrant, brand-aligned animated background
 * - Top navigation (Home link, Help Center, Sign Up toggles)
 * - Focused authentication card container
 * - Footer with legal and support links
 */

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/authStore';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const getRedirectPath = useAuthStore((s) => s.getRedirectPath);

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace(getRedirectPath());
    }
  }, [isHydrated, isAuthenticated, getRedirectPath, router]);

  // Prevent flash of login content while we're waiting for the session to hydrate
  if (!isHydrated || isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 dark:border-indigo-950 dark:border-t-indigo-500" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            Securely initializing...
          </p>
        </div>
      </div>
    );
  }

  const isLoginPage = pathname === '/login';

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Dynamic Brand Background Animation */}
      <div className="fixed inset-0 -z-10 h-full w-full">
        <BackgroundGradientAnimation
          containerClassName="!h-full !w-full"
          className="opacity-40"
          firstColor="99, 102, 241"   /* --primary: 248 89% 63% */
          secondColor="139, 92, 246"  /* Vibrant Violet */
          thirdColor="245, 243, 255"  /* --secondary: 252 100% 96% */
          fourthColor="255, 255, 255" /* Pure White */
          fifthColor="224, 231, 255"  /* Indigo-100 */
          pointerColor="99, 102, 241"
          gradientBackgroundStart="rgba(255, 255, 255, 1)"
          gradientBackgroundEnd="rgba(245, 243, 255, 0.5)"
        />
      </div>

      {/* Subtle Grid Overlay per Design Pattern */}
      <div className="fixed inset-0 -z-10 pointer-events-none bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />

      {/* Navigation Header */}
      <header className="z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-8 lg:px-24">
        <Link
          href="/"
          className="flex items-center gap-2 group transition-all duration-300"
        >
          <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
            <GraduationCap className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <span className="text-xl md:text-2xl font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors">
            Gradeloop
          </span>
        </Link>

        <div className="flex items-center gap-4 md:gap-8">
          <Link href="/help" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            Help Center
          </Link>
          {isLoginPage ? (
            <Link href="/signup">
              <Button variant="outline" className="rounded-xl font-semibold px-6 border-2 hover:bg-secondary">
                Sign Up
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button className="rounded-xl font-semibold px-6 shadow-md hover:shadow-lg transition-all">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 py-12 md:p-8 z-10 w-full max-w-7xl mx-auto">
        {children}
      </main>

      {/* Footer */}
      <footer className="z-20 w-full px-6 py-12 md:px-12 lg:px-24">
        <div className="flex flex-col items-center justify-center gap-6">
          <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            <Link href="/privacy" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Contact Support
            </Link>
          </nav>

          <div className="flex flex-col items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground/60 tracking-wider uppercase">
              &copy; {new Date().getFullYear()} Gradeloop LMS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

