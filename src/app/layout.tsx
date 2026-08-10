import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistPixelSquare } from "geist/font/pixel";
import "./globals.css";

const satoshi = localFont({
  src: "./fonts/Satoshi-Variable.ttf",
  variable: "--font-body",
  weight: "300 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Best Inbox Agent",
  description:
    "Connect Gmail. An agent decides what matters, drafts replies in your voice, and surfaces everything else worth knowing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistPixelSquare.variable} ${satoshi.variable} h-full`}
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
