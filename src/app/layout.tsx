import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false, // Used in admin/data views; don't compete with marketing headline fonts.
});

// Display serif for headlines: warm and print-like, used sparingly.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Westchester Postcard Advertising | Inside914", template: "%s | Inside914" },
  description: "Shared postcard advertising for Westchester County businesses. Explore local mailing areas, see how the campaigns work and view available ad positions.",
  applicationName: SITE_NAME,
  twitter: { card: "summary_large_image" },
  robots: process.env.VERCEL_ENV === "preview" ? { index: false, follow: false } : { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
