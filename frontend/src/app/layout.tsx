import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TANDUR - Platform Monitoring Pertanian & Analisis Satelit",
  description: "Platform SaaS pemantauan lahan pertanian presisi berbasis satelit NDVI, cuaca, dan prediksi panen.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

