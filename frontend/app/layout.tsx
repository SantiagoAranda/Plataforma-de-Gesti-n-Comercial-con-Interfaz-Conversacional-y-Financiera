import "./globals.css";

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
