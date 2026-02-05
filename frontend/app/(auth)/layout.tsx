export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex justify-center items-start sm:items-center px-4 py-8 overflow-y-auto">
      {children}
    </div>
  );
}
