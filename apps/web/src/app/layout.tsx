import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delivery Shield",
  description: "Universal delivery scan, route optimization, and fleet management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
