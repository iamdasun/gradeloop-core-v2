"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, KeyRound } from "lucide-react";

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
import apiClient from "@/lib/api/client";

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Please enter a valid email address" }),
});

type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotValues) {
    setStatus("submitting");
    setErrorMessage(null);

    try {
      await apiClient.post("/auth/forgot-password", {
        email: values.email,
      });

      setStatus("success");

      // Redirect back to login after a short delay so the user sees the confirmation
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      const status = (
        err as { response?: { status?: number; data?: { message?: string } } }
      )?.response?.status;
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;

      if (status === 429) {
        setErrorMessage(
          "Too many requests. Please wait a few minutes and try again.",
        );
      } else if (message) {
        setErrorMessage(message);
      } else {
        setErrorMessage("Something went wrong. Please try again later.");
      }

      setStatus("error");
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
          <Mail className="h-7 w-7 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Check your inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for{" "}
            <span className="font-semibold text-foreground">
              {form.getValues("email")}
            </span>
            , you will receive a password reset link shortly.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Redirecting you back to login…
        </p>
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
      {/* Icon + heading */}
      <div className="space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
          <KeyRound className="h-7 w-7 text-primary" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            Forgot Password?
          </h1>
          <p className="text-sm text-muted-foreground">
            No worries! Enter your email address and we&apos;ll send you a link
            to reset your password.
          </p>
        </div>
      </div>

      {/* Error banner */}
      {status === "error" && errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold">
                  Email Address
                </FormLabel>
                <FormControl>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      type="email"
                      placeholder="name@university.edu"
                      className="pl-10 h-11"
                      autoComplete="email"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className="w-full font-bold shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform group"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? (
              "Sending reset link…"
            ) : (
              <>
                Send Reset Link
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>
        </form>
      </Form>

      {/* Back to login */}
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
