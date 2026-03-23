import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NewsWire — Live News Platform",
  description:
    "A demo platform showing event-driven delivery mechanisms for digital news",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="nl" className={`${syne.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
