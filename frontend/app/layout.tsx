import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import SessionBoundary from '../src/components/auth/SessionBoundary';
import PushForegroundListener from "../src/components/notifications/PushForegroundListener";
import ToastLimitListener from "../src/components/notifications/ToastLimitListener";

import { SACTEC_DESCRIPTION as DESCRIPTION, SACTEC_SHARE_IMAGE as SHARE_IMAGE } from "../src/lib/publicMetadata";

export const metadata: Metadata = {
  metadataBase: new URL("https://sactec.dev"),
  title: {
    default: "SACTEC",
    template: "%s | SACTEC",
  },
  applicationName: "SACTEC",
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SACTEC",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "SACTEC",
    title: "SACTEC",
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "SACTEC",
    description: DESCRIPTION,
    images: [SHARE_IMAGE.url],
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
        <SessionBoundary>
          <PushForegroundListener />
        </SessionBoundary>
        {/* Must mount and unmount together with <Toaster>: react-hot-toast 2.6 removes the first
            "default" store listener on unmount, so a subscriber remounting alone (SessionBoundary
            mounts late and remounts per session) detached the Toaster and no toast was painted. */}
        <ToastLimitListener />
        <Toaster
          position="top-right"
          reverseOrder={false}
          containerStyle={{
            top: "calc(68px + env(safe-area-inset-top, 0px))",
            right: 12,
          }}
          toastOptions={{
            duration: 3000,
            style: {
              maxWidth: "450px",
              fontSize: "13px",
              fontWeight: "500",
              cursor: "pointer",
            },
            error: {
              duration: 3000,
            },
            success: {
              duration: 3000,
            },
            loading: {
              duration: 3000,
            },
            blank: {
              duration: 3000,
            },
            custom: {
              duration: 3000,
            },
          }}
        />
      </body>
    </html>
  );
}
