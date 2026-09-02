import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import "./glean.css";

// Stand-in for Roobert PRO: the same slightly-rounded geometric character,
// with the 400/500/600 weights the type scale depends on.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Glean — Powered by Folde",
  description: "Turn user interviews into findings and stakeholder-ready research reports."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
