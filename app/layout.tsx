import type { Metadata } from "next";
import "./globals.css";
import "./glean.css";

export const metadata: Metadata = {
  title: "Glean — Powered by Folde",
  description: "Turn user interviews into findings and stakeholder-ready research reports.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
