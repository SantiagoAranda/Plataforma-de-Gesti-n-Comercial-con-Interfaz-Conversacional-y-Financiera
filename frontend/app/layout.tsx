import "./globals.css";
import BottomNav from "@/src/components/layout/BottomNav";
import  AppHeader from "@/src/components/layout/AppHeader";

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
        {children}
      </body>
    </html>
  );
}