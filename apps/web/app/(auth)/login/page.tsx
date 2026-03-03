"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  Chrome,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

import { authApi } from "@/lib/api/auth";
import { handleApiError } from "@/lib/api/axios";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const response = await authApi.login({
        email,
        password,
      });

      setSession(response.access_token);
      const path = useAuthStore.getState().getRedirectPath();
      router.push(path);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
      <Card className="border-none shadow-2xl shadow-indigo-200/50 dark:shadow-none bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
        <CardHeader className="space-y-2 pb-8 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Welcome back
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Please enter your details to sign in.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} id="login-form">
            <div className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive animate-in slide-in-from-top-2">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email or Username
                </Label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="student@gradeloop.edu"
                    required
                    disabled={isLoading}
                    className="pl-10 h-12 bg-muted/50 border-muted-foreground/10 focus:bg-background transition-all rounded-xl"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold">
                    Password
                  </Label>
                </div>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                    className="pl-10 pr-10 h-12 bg-muted/50 border-muted-foreground/10 focus:bg-background transition-all rounded-xl"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors outline-none"
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" className="rounded-md border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                  <label
                    htmlFor="remember"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground cursor-pointer"
                  >
                    Remember me
                  </label>
                </div>
                <Link
                  href="/forgot-password"
                  className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col gap-6">
          <Button
            type="submit"
            form="login-form"
            className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all active:scale-[0.98]"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Sign in <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>

          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-zinc-950 px-3 text-muted-foreground font-medium">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full">
            <Button
              variant="outline"
              className="h-12 rounded-xl font-semibold border-muted-foreground/10 hover:bg-muted/50 transition-colors"
              disabled={isLoading}
            >
              <Chrome className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl font-semibold border-muted-foreground/10 hover:bg-muted/50 transition-colors"
              disabled={isLoading}
            >
              {/* Using a placeholder for Microsoft as Lucide doesn't have a direct one, 
                  but we can use a custom SVG or similar icon */}
              <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23" fill="currentColor">
                <path d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
              </svg>
              Microsoft
            </Button>
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground font-medium">
            Don't have an account yet?{" "}
            <Link
              href="/signup"
              className="text-primary hover:text-primary/80 font-bold transition-colors"
            >
              Sign up for free
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
