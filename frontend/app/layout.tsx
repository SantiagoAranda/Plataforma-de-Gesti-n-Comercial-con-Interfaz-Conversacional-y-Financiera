import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import PushForegroundListener from "../src/components/notifications/PushForegroundListener";

export const metadata: Metadata = {
  title: {
    default: "Sactec",
    template: "%s | Sactec",
  },
  description: "MVP Gestión Comercial",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gestión Comercial",
  },
  icons: {
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#121A28",
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
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white">
        {children}
        <PushForegroundListener />
        <Toaster
          position="top-right"
          reverseOrder={false}
          toastOptions={{
            duration: 4000,
            style: {
              maxWidth: "450px",
              fontSize: "13px",
              fontWeight: "500",
              cursor: "pointer",
            },
            error: {
              duration: 5000,
            },
            success: {
              duration: 3000,
            },
          }}
        />
      </body>
    </html>
  );
}
