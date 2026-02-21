"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ArrowLeft, ShieldCheck } from "lucide-react";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordIndicator } from "@/components/password-indicator";
import apiClient from "@/lib/api/client";

// ── Validation ──────────────────────────────────────────────────────────────

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .refine((v) => /[A-Z]/.test(v), {
        message: "Must contain at least one uppercase letter",
      })
      .refine((v) => /[a-z]/.test(v), {
        message: "Must contain at least one lowercase letter",
      })
      .refine((v) => /[0-9]/.test(v), {
        message: "Must contain at least one digit",
      })
      .refine((v) => /[^A-Za-z0-9]/.test(v), {
        message: "Must contain at least one special character",
      }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type ResetValues = z.infer<typeof resetSchema>;

// ── Inner component (uses useSearchParams – needs Suspense wrapper) ──────────

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const watchedPassword = form.watch("password");

  useEffect(() => {
    if (!token) {
      setErrorMessage(
        "Reset token is missing. Please use the link from your email.",
      );
    }
  }, [token]);

  async function onSubmit(values: ResetValues) {
    setErrorMessage(null);

    if (!token) {
      setErrorMessage(
        "Reset token is missing. Please use the link from your email.",
      );
      return;
    }

    try {
      // Backend expects: POST /auth/reset-password { token, new_password }
      await apiClient.post("/auth/reset-password", {
        token,
        new_password: values.password,
      });

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      const status = (
        err as { response?: { status?: number; data?: { message?: string } } }
      )?.response?.status;
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;

      if (status === 400 && message) {
        setErrorMessage(message);
      } else if (status === 401) {
        setErrorMessage(
          "Invalid or expired reset token. Please request a new reset link.",
        );
      } else if (status === 429) {
        setErrorMessage(
          "Too many requests. Please wait a few minutes and try again.",
        );
      } else {
        setErrorMessage(
          message ?? "Unable to reset password. Please try again.",
        );
      }
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
          <ShieldCheck className="h-7 w-7 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Password updated!
          </h1>
          <p className="text-sm text-muted-foreground">
            Your password has been reset successfully. Redirecting you to
            login&hellip;
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Login
        </Link>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">
          Reset Your Password
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a new secure password. This link expires after one hour.
        </p>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* New password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold">
                  New Password
                </FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a new password"
                      className="pr-11 h-11"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Confirm password */}
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold">
                  Confirm New Password
                </FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Re-enter your password"
                      className="pr-11 h-11"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Live strength checklist */}
          <PasswordIndicator password={watchedPassword} />

          <Button
            type="submit"
            size="lg"
            className="w-full font-bold shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform"
            disabled={form.formState.isSubmitting || !token}
          >
            {form.formState.isSubmitting ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </Form>

      {/* Back link */}
      <div className="border-t pt-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Login
        </Link>
      </div>
    </div>
  );
}

// ── Page export (Suspense boundary required by Next.js for useSearchParams) ──

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded-md bg-muted" />
          <div className="h-4 w-64 rounded-md bg-muted" />
          <div className="h-11 w-full rounded-md bg-muted" />
          <div className="h-11 w-full rounded-md bg-muted" />
          <div className="h-11 w-full rounded-md bg-muted" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
