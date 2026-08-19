import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Matches the login page's font (hardcoded 'Inter' in auth.css) so the
// dashboard reads as the same application after authentication, rather
// than switching to a second, unrelated typeface.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TDMS — TVET Diploma Management System",
  description: "Asian College TVET Diploma Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
