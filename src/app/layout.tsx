import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

// Lato, Canvas's typeface (D-032).
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["400", "700", "900"] });

export const metadata: Metadata = {
  title: { default: "DALAA", template: "%s | DALAA" },
  description: "AI-assisted learning activities that sit beside Canvas.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lato.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
