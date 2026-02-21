import Link from "next/link";
import { Terminal } from "lucide-react";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col lg:flex-row">
            {/* ── Left branding panel (hidden on mobile) ── */}
            <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden bg-primary p-12">
                {/* Subtle dot pattern */}
                <div
                    className="absolute inset-0 opacity-[0.07] pointer-events-none"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 2px 2px, white 1.5px, transparent 0)",
                        backgroundSize: "28px 28px",
                    }}
                />

                {/* Decorative code glyphs */}
                <span className="absolute bottom-24 right-10 select-none font-mono text-8xl font-black text-white/[0.06]">
                    {"{ }"}
                </span>
                <span className="absolute top-20 left-8 select-none font-mono text-8xl font-black text-white/[0.06]">
                    {"</>"}
                </span>

                {/* Logo */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 shadow-lg backdrop-blur-sm">
                        <Terminal className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-2xl font-extrabold tracking-tight text-white">
                        Gradeloop
                    </span>
                </div>

                {/* Tagline */}
                <div className="relative z-10">
                    <h2 className="mb-5 text-5xl font-extrabold leading-tight tracking-tight text-white">
                        Mastering code,{" "}
                        <span className="text-blue-200">simplified.</span>
                    </h2>
                    <p className="max-w-sm text-lg leading-relaxed text-blue-100/80">
                        The professional autograder and LMS for modern computer
                        science education. Trusted by leading universities
                        worldwide.
                    </p>
                </div>

                {/* Feature cards */}
                <div className="relative z-10 grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                        <div className="mb-2 text-blue-200 text-2xl">⚡</div>
                        <h3 className="mb-1 font-bold text-white">
                            Instant Feedback
                        </h3>
                        <p className="text-sm text-blue-100/75">
                            Real-time autograding for student assignments.
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                        <div className="mb-2 text-blue-200 text-2xl">🔗</div>
                        <h3 className="mb-1 font-bold text-white">
                            LMS Integration
                        </h3>
                        <p className="text-sm text-blue-100/75">
                            Syncs seamlessly with Canvas, Moodle, and more.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-12 sm:px-10 lg:w-1/2 lg:px-20">
                {/* Mobile logo */}
                <div className="mb-10 flex w-full max-w-md items-center gap-3 lg:hidden">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-lg">
                        <Terminal className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-extrabold tracking-tight">
                        Gradeloop
                    </span>
                </div>

                {/* Page content */}
                <div className="w-full max-w-md">{children}</div>

                {/* Footer links */}
                <div className="mt-10 flex gap-6">
                    <Link
                        href="/privacy"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Privacy Policy
                    </Link>
                    <Link
                        href="/terms"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Terms of Service
                    </Link>
                    <Link
                        href="/support"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Contact Support
                    </Link>
                </div>
            </div>
        </div>
    );
}
