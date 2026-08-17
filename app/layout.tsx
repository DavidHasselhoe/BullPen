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
import { PendingOnboardingFlush } from "@/components/onboarding/PendingOnboardingFlush";
import { NotificationToastListener } from "@/components/notifications/NotificationToastListener";
import { CookieConsentBanner } from "@/components/cookie-consent/CookieConsentBanner";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";

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
  metadataBase: new URL("https://bullpen.no"),
  title: {
    template: "%s | BullPen",
    default: "BullPen — Invest smarter",
  },
  description: "Track your portfolio, screen stocks, set price alerts, and get AI-powered market insights, all in one place.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "BullPen",
    type: "website",
  },
  icons: {
    // Search engines (Google, Bing) don't evaluate the `media` condition on
    // favicon links, so they need one unconditional default — icon-light.png
    // reads correctly on the plain white/light background most crawlers and
    // browser chrome default to. Browsers that DO support prefers-color-scheme
    // favicons still get the light/dark pair below for their own tab chrome.
    icon: [
      { url: "/icon-light.png" },
      { url: "/icon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BullPen",
  legalName: "Hasselø BullPen",
  url: "https://bullpen.no",
  logo: "https://bullpen.no/icon-light.png",
  description:
    "Investment research and portfolio-tracking platform for everyday investors — real-time market data, AI-powered analysis, and educational tools.",
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "BullPen",
  url: "https://bullpen.no",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark h-full ${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased h-full min-h-screen overflow-x-hidden scrollbar-hide">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
        <Providers>
          <ThemeProvider>
            <AIPanelProvider>
              <CommandPaletteProvider>
                <BackgroundProvider />
                <AuthNavigation />
                <PendingOnboardingFlush />
                <NotificationToastListener />
                <CookieConsentBanner />
                <PostHogProvider />
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
