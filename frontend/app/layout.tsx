import "./globals.css";
import BottomNav from "../src/components/layout/BottomNav";
import  AppHeader from "../src/components/layout/AppHeader";
import { NotificationProvider } from "../src/components/ui/NotificationProvider";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "Plataforma",
  description: "MVP Gestión Comercial",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white">
        <NotificationProvider>{children}</NotificationProvider>
        <Toaster position="top-center" toastOptions={{ duration: 6000 }} />
      </body>
    </html>
  );
}