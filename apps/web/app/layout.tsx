import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";
import ConditionalAppShell from "@/components/layout/ConditionalAppShell";
import { Providers } from "@/components/providers";

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GradeLoop | Intelligent LMS",
  description:
    "Experience the next generation of academic management with intelligent insights and seamless collaboration.",
  other: {
    "csrf-token": "placeholder", // Will be replaced by middleware with actual CSRF token
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="csrf-token" content="placeholder" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={`${lexend.variable} antialiased font-sans`}>
        <Providers>
          <ConditionalAppShell>{children}</ConditionalAppShell>
        </Providers>
      </body>
    </html>
  );
}
