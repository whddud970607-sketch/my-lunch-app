import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delivery Shield — Company",
  description: "Company operations console (skeleton)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "Segoe UI, sans-serif", margin: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
