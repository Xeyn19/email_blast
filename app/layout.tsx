
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EmailBlast | Campaign Management",
  description: "Manage and automate your email campaigns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
