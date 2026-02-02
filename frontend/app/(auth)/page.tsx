import { ReactNode } from "react";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex justify-center px-4 pt-16">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}

