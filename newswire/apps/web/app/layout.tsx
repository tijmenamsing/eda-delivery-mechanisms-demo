import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

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
      <head>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: var(--font-syne), system-ui, sans-serif;
            background: #0f1115;
            color: #e4e4e7;
            min-height: 100vh;
          }
          code, pre, .mono {
            font-family: var(--font-mono), monospace;
          }
          a { color: #60a5fa; text-decoration: none; }
          a:hover { text-decoration: underline; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
