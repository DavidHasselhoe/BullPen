import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// Analytics: ERR_BLOCKED_BY_CLIENT = ad blocker (uBlock, etc.). Harmless - analytics won't run for those users.
// Enable Web Analytics in Vercel Dashboard: Project → Analytics → Enable, then redeploy.
import "./globals.css";
import { Providers } from "./providers";
import { AuthNavigation } from "@/components/navigation/AuthNavigation";
import { BackgroundProvider } from "@/components/backgrounds/BackgroundProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AIPanelProvider } from "@/components/ai/AIPanelProvider";
import { AIPanelToggle } from "@/components/ai/AIPanelToggle";
import { CommandPaletteProvider } from "@/components/command-palette/CommandPaletteProvider";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";

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
    <html lang="en" className="dark h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full min-h-screen overflow-x-hidden scrollbar-hide`}
      >
        <Providers>
          <ThemeProvider>
            <AIPanelProvider>
              <CommandPaletteProvider>
                <BackgroundProvider />
                <AuthNavigation />
                <OnboardingModal />
                {children}
                <AIPanelToggle />
                {process.env.VERCEL === '1' && (
                  <>
                    <Analytics />
                    <SpeedInsights />
                  </>
                )}
              </CommandPaletteProvider>
            </AIPanelProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
