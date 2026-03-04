"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ArrowRight
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api/auth";
import { handleApiError } from "@/lib/api/axios";

export default function ForgotPasswordPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get("email") as string;
    setEmail(emailValue);

    try {
      await authApi.forgotPassword({ email: emailValue });
      setIsSubmitted(true);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setError(null);
    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500 px-4">
        <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <CardHeader className="space-y-4 pb-6 pt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight">Check your email</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                We&apos;ve sent instructions to <span className="font-bold text-foreground">{email}</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pb-2">
            <div className="rounded-xl border border-muted/50 bg-muted/30 p-5">
              <p className="text-sm text-center text-muted-foreground leading-relaxed">
                Click the link in the email to reset your password. If you
                don&apos;t see it, check your spam folder.
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive animate-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pb-10 pt-4">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl font-bold border-2 border-muted-foreground/10 hover:bg-muted/50 transition-colors"
              onClick={handleResend}
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Resend Email"}
            </Button>
            <Link href="/login" className="w-full">
              <Button variant="ghost" className="w-full h-11 rounded-xl font-semibold gap-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-in fade-in zoom-in duration-500 px-4">
      <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
        <CardHeader className="space-y-1 pb-6 pt-8 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">Forgot Password?</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Don&apos;t worry! It happens. Enter your email to receive a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-2">
          <form onSubmit={handleSubmit} id="forgot-password-form">
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-semibold ml-1">
                  Email Address
                </Label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    disabled={isLoading}
                    className="pl-10 h-11 bg-muted/40 border-muted-foreground/10 focus:bg-background transition-all rounded-xl"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-[11px] text-center text-primary/80 font-medium leading-relaxed uppercase tracking-wider">
                  You will receive instructions in a few minutes.
                </p>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pb-10 pt-4">
          <Button
            type="submit"
            form="forgot-password-form"
            className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all active:scale-[0.98]"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Sending...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Send Reset Link <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
          <Link href="/login" className="w-full">
            <Button variant="ghost" className="w-full h-11 rounded-xl font-semibold gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to Login
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
