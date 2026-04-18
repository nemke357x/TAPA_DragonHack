import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EstiMate AI",
  description: "AI-era software estimation and planning intelligence for teams."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
