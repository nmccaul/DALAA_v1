import type { Metadata, Viewport } from "next";
import { Geist, Outfit } from "next/font/google";
import "./globals.css";

// Geist for reading and UI; Outfit for headings, echoing the rounded wordmark.
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "DALAA", template: "%s | DALAA" },
  description: "AI-assisted learning activities that sit beside Canvas.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d1e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${outfit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
