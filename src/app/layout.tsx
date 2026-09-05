import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AeroCut // Localhost Video Engine",
  description: "Autonomous media composition and hardware-accelerated rendering console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA] antialiased flex flex-col selection:bg-[#4F8CFF]/30 selection:text-[#FAFAFA]">
        {children}
      </body>
    </html>
  );
}
