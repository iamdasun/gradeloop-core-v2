/**
 * Public layout — no authentication required.
 * Used for standalone tools such as the Clone Detector.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
