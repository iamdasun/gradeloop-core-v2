"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuthDemoPage() {
  const [activeTab, setActiveTab] = useState<"login" | "forgot" | "reset">("login");
  const [forgotPasswordSubmitted, setForgotPasswordSubmitted] = useState(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleForgotPasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get("email") as string;
    setEmail(emailValue);
    setForgotPasswordSubmitted(true);
  };

  const handleResetPasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetPasswordSuccess(true);
  };

  const renderLoginForm = () => (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
        <CardAction>
          <Button variant="link" className="px-0">
            Sign Up
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="login-password">Password</Label>
                <button
                  type="button"
                  onClick={() => setActiveTab("forgot")}
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
              <Input id="login-password" type="password" required />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button type="submit" className="w-full">
          Login
        </Button>
        <Button variant="outline" className="w-full">
          Login with Google
        </Button>
      </CardFooter>
    </Card>
  );

  const renderForgotPasswordForm = () => {
    if (forgotPasswordSubmitted) {
      return (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We&apos;ve sent password reset instructions to{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                {email}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Click the link in the email to reset your password. If you
                don&apos;t see it, check your spam folder.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setForgotPasswordSubmitted(false)}
            >
              Resend Email
            </Button>
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => {
                setActiveTab("login");
                setForgotPasswordSubmitted(false);
              }}
            >
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      );
    }

    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email address and we&apos;ll send you a link to reset
            your password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleForgotPasswordSubmit} id="forgot-password-form">
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  You will receive an email with instructions on how to reset
                  your password in a few minutes.
                </p>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button type="submit" form="forgot-password-form" className="w-full">
            Send Reset Link
          </Button>
          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={() => setActiveTab("login")}
          >
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const renderResetPasswordForm = () => {
    if (resetPasswordSuccess) {
      return (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">
              Password Reset Successful
            </CardTitle>
            <CardDescription>
              Your password has been successfully reset. You can now login with
              your new password.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              className="w-full"
              onClick={() => {
                setActiveTab("login");
                setResetPasswordSuccess(false);
              }}
            >
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      );
    }

    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPasswordSubmit} id="reset-password-form">
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 text-sm"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  Password must be at least 8 characters
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 text-sm"
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button type="submit" form="reset-password-form" className="w-full">
            Reset Password
          </Button>
          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={() => setActiveTab("login")}
          >
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Authentication Forms Demo</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Built with shadcn/ui components
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="container mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => {
                setActiveTab("login");
                setForgotPasswordSubmitted(false);
                setResetPasswordSuccess(false);
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "login"
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setActiveTab("forgot");
                setForgotPasswordSubmitted(false);
                setResetPasswordSuccess(false);
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "forgot"
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              Forgot Password
            </button>
            <button
              onClick={() => {
                setActiveTab("reset");
                setForgotPasswordSubmitted(false);
                setResetPasswordSuccess(false);
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "reset"
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              Reset Password
            </button>
          </div>
        </div>
      </div>

      {/* Form Display */}
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center">
          {activeTab === "login" && renderLoginForm()}
          {activeTab === "forgot" && renderForgotPasswordForm()}
          {activeTab === "reset" && renderResetPasswordForm()}
        </div>
      </div>

      {/* Routes Info */}
      <div className="container mx-auto px-4 pb-12">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Available Routes</CardTitle>
            <CardDescription>
              These forms are also available as individual pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div>
                  <p className="font-medium">Login Page</p>
                  <p className="text-sm text-zinc-500">/login</p>
                </div>
                <Link href="/login">
                  <Button variant="outline" size="sm">
                    Visit
                  </Button>
                </Link>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div>
                  <p className="font-medium">Forgot Password Page</p>
                  <p className="text-sm text-zinc-500">/forgot-password</p>
                </div>
                <Link href="/forgot-password">
                  <Button variant="outline" size="sm">
                    Visit
                  </Button>
                </Link>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div>
                  <p className="font-medium">Reset Password Page</p>
                  <p className="text-sm text-zinc-500">
                    /reset-password?token=example
                  </p>
                </div>
                <Link href="/reset-password?token=example">
                  <Button variant="outline" size="sm">
                    Visit
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
