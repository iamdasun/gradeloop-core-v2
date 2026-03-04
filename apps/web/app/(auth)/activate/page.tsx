"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Clock,
  ArrowLeft,
  MailSearch
} from "lucide-react";

import { authApi } from "@/lib/api/auth";
import { handleApiError } from "@/lib/api/axios";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PageState =
  | { status: "no-token" }
  | { status: "ready"; token: string }
  | { status: "activating" }
  | { status: "success"; email: string }
  | { status: "error"; message: string; type: "expired" | "used" | "generic" };

function ActivateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawToken = searchParams.get("token");

  const [state, setState] = useState<PageState>(
    rawToken ? { status: "ready", token: rawToken } : { status: "no-token" },
  );

  useEffect(() => {
    if (!rawToken && state.status === "ready") {
      setState({ status: "no-token" });
    }
  }, [rawToken, state.status]);

  const handleActivate = async () => {
    if (state.status !== "ready") return;
    const token = state.token;
    setState({ status: "activating" });

    try {
      const res = await authApi.activateAccount({ token });
      setState({
        status: "success",
        email: res.email,
      });
    } catch (err) {
      const msg = handleApiError(err);
      const lower = msg.toLowerCase();
      const type = lower.includes("expired")
        ? "expired"
        : lower.includes("already")
          ? "used"
          : "generic";
      setState({ status: "error", message: msg, type });
    }
  };

  return (
    <div className="w-full max-w-md animate-in fade-in zoom-in duration-500 px-4">
      <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl transition-all duration-500">

        {/* State: No Token */}
        {state.status === "no-token" && (
          <>
            <CardHeader className="space-y-4 pb-6 pt-8 text-center ring-offset-background">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 text-warning">
                <AlertCircle className="h-10 w-10" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-3xl font-bold tracking-tight">Invalid Link</CardTitle>
                <CardDescription className="text-base text-muted-foreground">
                  This activation link is missing a required token.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="rounded-xl border border-muted/50 bg-muted/30 p-5">
                <p className="text-sm text-center text-muted-foreground leading-relaxed">
                  Please use the exact link provided in your activation email. If you believe this is an error, contact support.
                </p>
              </div>
            </CardContent>
            <CardFooter className="pb-10 pt-4">
              <Link href="/login" className="w-full">
                <Button variant="outline" className="w-full h-12 rounded-xl font-bold border-2 border-muted-foreground/10 hover:bg-muted/50 transition-colors">
                  Back to Login
                </Button>
              </Link>
            </CardFooter>
          </>
        )}

        {/* State: Ready */}
        {state.status === "ready" && (
          <>
            <CardHeader className="space-y-2 pb-6 pt-8 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 transition-transform scale-95 hover:scale-100">
                <ShieldCheck className="h-10 w-10" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-3xl font-bold tracking-tight">Activate Account</CardTitle>
                <CardDescription className="text-base text-muted-foreground">
                  Your GradeLoop account is ready.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pb-2">
              <p className="text-sm text-center text-muted-foreground px-2">
                Once confirmed, you will receive your temporary login credentials via email.
              </p>
              <div className="space-y-3 rounded-2xl border border-primary/10 bg-primary/5 p-5">
                {[
                  "Verify your email & activate",
                  "Receive temporary password",
                  "Login and set your secure password"
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">{i + 1}</div>
                    <p className="text-sm text-foreground/80 font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pb-10 pt-4">
              <Button
                onClick={handleActivate}
                className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all"
              >
                Activate My Account <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Link href="/login" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
                Already activated? Sign In
              </Link>
            </CardFooter>
          </>
        )}

        {/* State: Activating */}
        {state.status === "activating" && (
          <CardContent className="py-24 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <Loader2 className="h-20 w-20 animate-spin text-primary opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="h-10 w-10 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <CardTitle className="text-2xl">Activating Account</CardTitle>
              <CardDescription>Setting up your workspace...</CardDescription>
            </div>
          </CardContent>
        )}

        {/* State: Success */}
        {state.status === "success" && (
          <>
            <CardHeader className="space-y-4 pb-6 pt-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success animate-bounce">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-3xl font-bold tracking-tight">Activated!</CardTitle>
                <CardDescription className="text-base text-muted-foreground px-4 text-balance">
                  Welcome to GradeLoop. Your account is now active.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 text-center pb-2">
              <div className="rounded-2xl border border-success/20 bg-success/5 p-6 space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <MailSearch className="h-8 w-8 text-success opacity-80" />
                  <p className="text-sm font-semibold text-success uppercase tracking-wider">Check your inbox</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl bg-white/50 dark:bg-black/20 p-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email</span>
                  <span className="text-sm font-mono font-bold text-foreground truncate">{state.email}</span>
                </div>
                <p className="text-xs text-success/80 font-medium">We&apos;ve sent your temporary password there.</p>
              </div>
              <div className="rounded-xl bg-warning/5 border border-warning/10 p-3 text-[11px] text-warning-foreground font-medium">
                <strong>Important:</strong> You&apos;ll be asked to change your password on your first login for security.
              </div>
            </CardContent>
            <CardFooter className="pb-10 pt-4">
              <Button
                onClick={() => router.push("/login")}
                className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25"
              >
                Go to Login
              </Button>
            </CardFooter>
          </>
        )}

        {/* State: Error */}
        {state.status === "error" && (
          <>
            <CardHeader className="space-y-4 pb-6 pt-8 text-center">
              <div className={cn(
                "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
                state.type === "expired" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
              )}>
                {state.type === "expired" ? <Clock className="h-10 w-10" /> : <AlertCircle className="h-10 w-10" />}
              </div>
              <div className="space-y-1">
                <CardTitle className="text-3xl font-bold tracking-tight">
                  {state.type === "expired" ? "Link Expired" : state.type === "used" ? "Already Active" : "Activation Failed"}
                </CardTitle>
                <CardDescription className="text-base px-6 text-muted-foreground">
                  {state.type === "expired"
                    ? "Your activation link has expired. Please contact your admin for a new link."
                    : state.type === "used"
                      ? "This account has already been activated. You can sign in directly."
                      : state.message}
                </CardDescription>
              </div>
            </CardHeader>
            <CardFooter className="flex flex-col gap-4 pb-10 pt-4 px-6">
              {state.type === "used" ? (
                <Button
                  onClick={() => router.push("/login")}
                  className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25"
                >
                  Sign In Now
                </Button>
              ) : (
                <Link href="/login" className="w-full">
                  <Button variant="ghost" className="w-full h-11 rounded-xl font-semibold gap-2 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Back to Login
                  </Button>
                </Link>
              )}
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Initializing activation...</p>
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
