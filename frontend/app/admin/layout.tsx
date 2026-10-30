import SessionBoundary from "@/src/components/auth/SessionBoundary";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionBoundary>{children}</SessionBoundary>;
}
