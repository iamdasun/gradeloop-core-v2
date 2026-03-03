"use client";

import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  XCircle
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
import { cn } from "@/lib/utils";

function getPasswordStrength(password: string) {
  let score = 0;
  if (!password) return { score: 0, label: "WEAK", color: "bg-muted" };

  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score: 1, label: "WEAK", color: "bg-destructive" };
  if (score <= 4) return { score: 2, label: "MEDIUM", color: "bg-warning" };
  return { score: 3, label: "STRONG", color: "bg-success" };
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }

    if (strength.score < 2) {
      setValidationError("Please choose a stronger password");
      return;
    }

    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword({
        token,
        new_password: password,
      });
      setIsSuccess(true);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <CardHeader className="space-y-4 pb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight">Invalid Link</CardTitle>
              <CardDescription className="text-base">
                This password reset link is invalid or has expired.
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="flex flex-col gap-4">
            <Link href="/forgot-password" className="w-full">
              <Button className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25">
                Request New Link
              </Button>
            </Link>
            <Link href="/login" className="w-full">
              <Button variant="ghost" className="w-full h-12 rounded-xl font-semibold">
                Back to Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <CardHeader className="space-y-4 pb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Password Reset Successful</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Your password has been successfully reset. You can now login with your new credentials.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 flex items-center gap-3 text-success">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-sm font-medium">Security settings updated successfully.</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/login")} className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25">
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
      <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
        <CardHeader className="space-y-2 pb-8 text-center text-balance">
          <CardTitle className="text-3xl font-bold tracking-tight">Reset Password</CardTitle>
          <CardDescription className="text-base">
            Please enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} id="reset-password-form">
            <div className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {validationError && (
                <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 p-4 text-warning-foreground animate-in slide-in-from-top-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <p className="text-sm font-medium">{validationError}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 bg-muted/50 border-muted-foreground/10 focus:bg-background transition-all rounded-xl"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors outline-none"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {password && (
                  <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex items-center justify-between text-xs font-bold tracking-wider">
                      <span className="text-muted-foreground">PASSWORD STRENGTH</span>
                      <span className={cn(
                        strength.label === "STRONG" ? "text-success" :
                          strength.label === "MEDIUM" ? "text-warning" : "text-destructive"
                      )}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="flex gap-1.5 h-1.5 w-full">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={cn(
                            "h-full flex-1 rounded-full transition-all duration-500",
                            step <= strength.score ? strength.color : "bg-muted/50"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  Password must be at least 8 characters long and contain a mix of uppercase, lowercase, numbers, and symbols.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                    disabled={isLoading}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-12 bg-muted/50 border-muted-foreground/10 focus:bg-background transition-all rounded-xl"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors outline-none"
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-3 mt-2">
          <Button
            type="submit"
            form="reset-password-form"
            className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all active:scale-[0.98]"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Resetting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Reset Password <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full h-12 rounded-xl font-semibold text-muted-foreground"
            onClick={() => router.push("/login")}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm font-medium text-muted-foreground">Loading reset session...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
