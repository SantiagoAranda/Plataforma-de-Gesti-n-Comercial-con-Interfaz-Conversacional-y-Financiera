import "./globals.css";
import BottomNav from "../src/components/layout/BottomNav";
import  AppHeader from "../src/components/layout/AppHeader";
import { NotificationProvider } from "../src/components/ui/NotificationProvider";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: {
    default: "Sactec",
    template: "%s | Sactec",
  },
  description: "MVP Gestión Comercial",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white">
        <NotificationProvider>{children}</NotificationProvider>
        <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      </body>
    </html>
  );
}
