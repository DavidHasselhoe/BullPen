import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "@/components/navigation/Navigation";
import { AuthNavigation } from "@/components/navigation/AuthNavigation";
import { BackgroundProvider } from "@/components/backgrounds/BackgroundProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ChatWidget } from "@/components/ai/ChatWidget";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BullPen - Financial Analytics",
  description: "Professional fintech analytics platform for SEC filings analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ThemeProvider>
            <BackgroundProvider />
            <AuthNavigation />
            {children}
            <ChatWidget />
          </ThemeProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
