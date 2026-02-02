import { ReactNode } from "react";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-200 flex justify-center px-4">
      <div className="w-full max-w-sm flex flex-col justify-center">
        {children}
      </div>
    </div>
  );
}
