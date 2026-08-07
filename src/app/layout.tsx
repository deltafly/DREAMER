import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OneBrainer — AI Knowledge Management",
    template: "%s | OneBrainer",
  },
  description:
    "OneBrainer is a multi-tenant AI knowledge management dashboard. Organize facts, decisions, and insights with curated memory, neural spreading activation, and automated dreaming.",
  keywords: [
    "knowledge management",
    "AI",
    "brain",
    "dashboard",
    "decision tracking",
    "fact management",
  ],
  authors: [{ name: "OneBrainer Team" }],
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    title: "OneBrainer — AI Knowledge Management",
    description:
      "Multi-tenant AI knowledge management dashboard with curated memory and neural spreading activation.",
    type: "website",
    siteName: "OneBrainer",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Accessibility: skip-to-content link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Ugrás a tartalomhoz
        </a>
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}