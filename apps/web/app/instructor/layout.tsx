import { AppLayout } from "@/components/app-layout";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
