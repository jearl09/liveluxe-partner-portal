import type { Metadata } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";

// Brand type (§13.5): serif display for headings, humanist sans for UI — mirrors liveluxe's public site.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Live Luxe Partner Portal", template: "%s · Live Luxe" },
  description: "Invite-only booking portal for Live Luxe insurance and corporate partners.",
  robots: { index: false, follow: false }, // no public inventory exposure (§13.1)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${inter.variable} ${playfair.variable} ${geistMono.variable} h-full`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  );
}
