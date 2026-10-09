import type { Metadata } from "next";
import { DM_Sans, Newsreader, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Brand type (§13.5): a serif for headings and a humanist sans for the UI, as on the
 * public site. Both are variable fonts with an optical-size axis, so headings get the
 * finer display cut and small labels the sturdier text cut from the same family.
 */
const sans = DM_Sans({ variable: "--font-sans-brand", subsets: ["latin"], axes: ["opsz"], display: "swap" });
const serif = Newsreader({ variable: "--font-serif-brand", subsets: ["latin"], axes: ["opsz"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono-brand", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Live Luxe Partner Portal", template: "%s · Live Luxe" },
  description: "Invite-only booking portal for Live Luxe insurance and corporate partners.",
  robots: { index: false, follow: false }, // no public inventory exposure (§13.1)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${sans.variable} ${serif.variable} ${mono.variable} h-full`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  );
}
