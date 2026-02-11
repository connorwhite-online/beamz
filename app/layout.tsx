import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const chalet = localFont({
  src: "../public/fonts/chalet.otf",
  variable: "--font-chalet",
});

export const metadata: Metadata = {
  title: "Beamz",
  description: "Arriving Summer 2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={chalet.variable}>{children}</body>
    </html>
  );
}
