"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api/auth";
import { handleApiError } from "@/lib/api/axios";

/* ─────────────────────────────────────────────
   Tiny icon components (no extra deps needed)
───────────────────────────────────────────── */
function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function MailOpenIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   State types
───────────────────────────────────────────── */
type PageState =
  | { status: "no-token" }
  | { status: "ready"; token: string }
  | { status: "activating" }
  | { status: "success"; email: string }
  | { status: "error"; message: string; type: "expired" | "used" | "generic" };

/* ─────────────────────────────────────────────
   Background decorative grid
───────────────────────────────────────────── */
function GridBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Dot grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="dot-grid"
            x="0"
            y="0"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="#027368" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Top-right teal blob */}
      <div
        className="absolute -top-32 -right-32 h-96 w-96 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(2,115,104,0.12) 0%, transparent 70%)",
        }}
      />
      {/* Bottom-left blob */}
      <div
        className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(2,115,104,0.08) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Animated ring around icon
───────────────────────────────────────────── */
function IconRing({
  children,
  color = "teal",
  pulse = false,
}: {
  children: React.ReactNode;
  color?: "teal" | "green" | "red" | "amber";
  pulse?: boolean;
}) {
  const colorMap = {
    teal: {
      ring: "rgba(2,115,104,0.18)",
      icon: "#027368",
      bg: "rgba(2,115,104,0.08)",
    },
    green: {
      ring: "rgba(12,122,84,0.18)",
      icon: "#0C7A54",
      bg: "rgba(12,122,84,0.08)",
    },
    red: {
      ring: "rgba(166,66,54,0.18)",
      icon: "#A64236",
      bg: "rgba(166,66,54,0.08)",
    },
    amber: {
      ring: "rgba(156,106,14,0.18)",
      icon: "#9C6A0E",
      bg: "rgba(156,106,14,0.08)",
    },
  };
  const c = colorMap[color];

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 96, height: 96 }}
    >
      {/* Outer pulse ring */}
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: c.ring, animationDuration: "2s" }}
        />
      )}
      {/* Mid ring */}
      <span
        className="absolute inset-2 rounded-full"
        style={{ background: c.ring }}
      />
      {/* Icon circle */}
      <span
        className="relative flex items-center justify-center rounded-full"
        style={{ width: 64, height: 64, background: c.bg, color: c.icon }}
      >
        {children}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Progress dots (activating state)
───────────────────────────────────────────── */
function ProgressDots() {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full animate-bounce"
          style={{
            backgroundColor: "#027368",
            animationDelay: `${i * 150}ms`,
            animationDuration: "0.9s",
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Credential chip (success state)
───────────────────────────────────────────── */
function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#B4BEBF]/40 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <span className="text-xs font-medium uppercase tracking-wider text-[#5D7173] dark:text-[#B4BEBF]">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold text-[#191726] dark:text-[#F2F2F2]">
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step indicator (ready state)
───────────────────────────────────────────── */
function StepBadge({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: "#027368" }}
      >
        {num}
      </span>
      <span className="text-sm text-[#5D7173] dark:text-[#B4BEBF]">{text}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main content (reads searchParams)
───────────────────────────────────────────── */
function ActivateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawToken = searchParams.get("token");

  const [state, setState] = useState<PageState>(
    rawToken ? { status: "ready", token: rawToken } : { status: "no-token" },
  );

  // Keep token in state in case searchParams change
  useEffect(() => {
    if (!rawToken && state.status === "ready") {
      setState({ status: "no-token" });
    }
  }, [rawToken]);

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

  /* ── Layout shell ── */
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12"
      style={{ background: "hsl(0 0% 95%)" }}
    >
      <GridBackground />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-[#B4BEBF]/50 bg-white/90 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-[#191726]/90"
        style={{
          boxShadow:
            "0 8px 40px rgba(2,115,104,0.08), 0 2px 8px rgba(25,23,38,0.06)",
        }}
      >
        {/* Top accent bar */}
        <div
          className="h-1 w-full rounded-t-2xl"
          style={{
            background:
              "linear-gradient(90deg, #027368 0%, #03a898 50%, #027368 100%)",
          }}
        />

        <div className="px-8 py-10">
          {/* ── Brand header ── */}
          <div className="mb-8 flex flex-col items-center gap-1 text-center">
            <span
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "#027368" }}
            >
              GradeLoop
            </span>
            <div
              className="mt-0.5 h-px w-8 rounded"
              style={{ background: "#027368", opacity: 0.3 }}
            />
          </div>

          {/* ── State: No Token ── */}
          {state.status === "no-token" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <IconRing color="amber">
                <ExclamationIcon className="h-7 w-7" />
              </IconRing>
              <div>
                <h1 className="text-xl font-bold text-[#191726] dark:text-[#F2F2F2]">
                  Invalid Activation Link
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[#5D7173] dark:text-[#B4BEBF]">
                  This link is missing a required token. Please use the exact
                  link from your activation email.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Link href="/login">
                  <button className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-[#5D7173] transition-colors hover:bg-[#E5EAEB] dark:text-[#B4BEBF] dark:hover:bg-white/5">
                    Back to Login
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* ── State: Ready ── */}
          {state.status === "ready" && (
            <div className="flex flex-col items-center gap-7 text-center">
              <IconRing color="teal" pulse>
                <ShieldCheckIcon className="h-8 w-8" />
              </IconRing>

              <div>
                <h1 className="text-2xl font-bold text-[#191726] dark:text-[#F2F2F2]">
                  Activate Your Account
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[#5D7173] dark:text-[#B4BEBF]">
                  Your GradeLoop account is ready to be activated. Once
                  confirmed, your temporary login credentials will be sent to
                  your email.
                </p>
              </div>

              {/* What happens next */}
              <div className="w-full rounded-xl border border-[#B4BEBF]/30 bg-[#E5EAEB]/50 px-5 py-4 text-left dark:border-white/10 dark:bg-white/5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#5D7173] dark:text-[#B4BEBF]">
                  What happens next
                </p>
                <div className="flex flex-col gap-2.5">
                  <StepBadge num={1} text="Your account is activated" />
                  <StepBadge
                    num={2}
                    text="A temporary password is emailed to you"
                  />
                  <StepBadge num={3} text="Log in and set a new password" />
                </div>
              </div>

              <button
                onClick={handleActivate}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, #027368 0%, #035e56 100%)",
                  boxShadow: "0 4px 16px rgba(2,115,104,0.3)",
                }}
              >
                Activate My Account
              </button>

              <Link
                href="/login"
                className="text-xs text-[#5D7173] hover:underline dark:text-[#B4BEBF]"
              >
                Already activated? Sign in
              </Link>
            </div>
          )}

          {/* ── State: Activating ── */}
          {state.status === "activating" && (
            <div className="flex flex-col items-center gap-7 text-center">
              <IconRing color="teal" pulse>
                <ShieldCheckIcon className="h-8 w-8" />
              </IconRing>

              <div>
                <h1 className="text-xl font-bold text-[#191726] dark:text-[#F2F2F2]">
                  Activating your account…
                </h1>
                <p className="mt-2 text-sm text-[#5D7173] dark:text-[#B4BEBF]">
                  Please wait while we set everything up for you.
                </p>
              </div>

              <ProgressDots />

              {/* Skeleton steps */}
              <div className="w-full rounded-xl border border-[#B4BEBF]/30 bg-[#E5EAEB]/50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-col gap-3">
                  {[
                    "Verifying activation token",
                    "Creating credentials",
                    "Sending welcome email",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "rgba(2,115,104,0.15)" }}
                      >
                        <span
                          className="h-2 w-2 rounded-full animate-pulse"
                          style={{
                            background: "#027368",
                            animationDelay: `${i * 200}ms`,
                          }}
                        />
                      </span>
                      <span className="text-sm text-[#5D7173] dark:text-[#B4BEBF]">
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── State: Success ── */}
          {state.status === "success" && (
            <div className="flex flex-col items-center gap-7 text-center">
              <IconRing color="green">
                <CheckCircleIcon className="h-8 w-8" />
              </IconRing>

              <div>
                <h1 className="text-2xl font-bold text-[#191726] dark:text-[#F2F2F2]">
                  Account Activated!
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[#5D7173] dark:text-[#B4BEBF]">
                  Your GradeLoop account is live. We&apos;ve sent your temporary
                  login credentials to your email — check your inbox.
                </p>
              </div>

              {/* Credentials summary */}
              <div className="w-full rounded-xl border border-[#7DCAB3]/40 bg-[#D4EDE6]/30 px-5 py-4 text-left dark:border-[#7DCAB3]/20 dark:bg-[#0C7A54]/10">
                <div className="mb-3 flex items-center gap-2">
                  <MailOpenIcon
                    className="h-4 w-4 shrink-0"
                    style={{ color: "#0C7A54" }}
                  />
                  <p
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "#0C7A54" }}
                  >
                    Credentials sent to
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <CredentialRow label="Email" value={state.email} />
                </div>
              </div>

              {/* First login notice */}
              <div className="w-full rounded-lg border border-[#D4A856]/40 bg-[#FBF0D6]/50 px-4 py-3 dark:border-[#D4A856]/20 dark:bg-[#9C6A0E]/10">
                <p className="text-xs leading-relaxed text-[#7A5410] dark:text-[#D4A856]">
                  <strong>Note:</strong> You will be asked to change your
                  password immediately after your first login.
                </p>
              </div>

              <button
                onClick={() => router.push("/login")}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, #027368 0%, #035e56 100%)",
                  boxShadow: "0 4px 16px rgba(2,115,104,0.3)",
                }}
              >
                Go to Login
              </button>
            </div>
          )}

          {/* ── State: Error ── */}
          {state.status === "error" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <IconRing color={state.type === "expired" ? "amber" : "red"}>
                {state.type === "expired" ? (
                  <ClockIcon className="h-7 w-7" />
                ) : (
                  <ExclamationIcon className="h-7 w-7" />
                )}
              </IconRing>

              <div>
                <h1 className="text-xl font-bold text-[#191726] dark:text-[#F2F2F2]">
                  {state.type === "expired"
                    ? "Link Expired"
                    : state.type === "used"
                      ? "Already Activated"
                      : "Activation Failed"}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[#5D7173] dark:text-[#B4BEBF]">
                  {state.type === "expired"
                    ? "Your activation link has expired. Please contact your administrator to have a new link issued."
                    : state.type === "used"
                      ? "This account is already active. You can log in directly."
                      : state.message}
                </p>
              </div>

              {/* Error detail box */}
              {state.type === "generic" && (
                <div className="w-full rounded-lg border border-[#D4907F]/40 bg-[#FADFD8]/50 px-4 py-3 dark:border-[#D4907F]/20 dark:bg-[#A64236]/10">
                  <p className="text-xs text-[#8A3830] dark:text-[#D4907F]">
                    {state.message}
                  </p>
                </div>
              )}

              <div className="flex w-full flex-col gap-2">
                {state.type === "used" ? (
                  <button
                    onClick={() => router.push("/login")}
                    className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                    style={{
                      background:
                        "linear-gradient(135deg, #027368 0%, #035e56 100%)",
                      boxShadow: "0 4px 16px rgba(2,115,104,0.3)",
                    }}
                  >
                    Go to Login
                  </button>
                ) : (
                  <Link href="/login">
                    <button className="w-full rounded-xl border border-[#B4BEBF]/60 py-3 text-sm font-medium text-[#191726] transition-colors hover:bg-[#E5EAEB] dark:border-white/10 dark:text-[#F2F2F2] dark:hover:bg-white/5">
                      Back to Login
                    </button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#B4BEBF]/30 px-8 py-4 text-center dark:border-white/10">
          <p className="text-xs text-[#5D7173] dark:text-[#B4BEBF]">
            Need help?{" "}
            <a
              href="mailto:support@gradeloop.com"
              className="font-medium hover:underline"
              style={{ color: "#027368" }}
            >
              Contact support
            </a>
          </p>
        </div>
      </div>

      {/* Bottom wordmark */}
      <p className="relative z-10 mt-8 text-xs text-[#B4BEBF]">
        © {new Date().getFullYear()} GradeLoop. All rights reserved.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page export – wrapped in Suspense for
   useSearchParams (required by Next.js App Router)
───────────────────────────────────────────── */
export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: "hsl(0 0% 95%)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-9 w-9 animate-spin rounded-full border-2 border-transparent"
              style={{
                borderTopColor: "#027368",
                borderRightColor: "rgba(2,115,104,0.2)",
              }}
            />
            <p className="text-sm text-[#5D7173]">Loading…</p>
          </div>
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
