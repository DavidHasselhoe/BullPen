import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
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

// Display serif used on the marketing landing page (/welcome) for the accented words.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | BullPen",
    default: "BullPen — Invest smarter",
  },
  description: "Track your portfolio, screen stocks, set price alerts, and get AI-powered market insights — all in one place.",
  openGraph: {
    siteName: "BullPen",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased h-full min-h-screen overflow-x-hidden scrollbar-hide`}
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
