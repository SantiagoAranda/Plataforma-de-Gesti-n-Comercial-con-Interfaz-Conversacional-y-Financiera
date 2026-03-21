export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-neutral-100 flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
