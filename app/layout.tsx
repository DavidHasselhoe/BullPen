import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// Analytics: ERR_BLOCKED_BY_CLIENT = ad blocker (uBlock, etc.). Harmless - analytics won't run for those users.
// Enable Web Analytics in Vercel Dashboard: Project → Analytics → Enable, then redeploy.
import "./globals.css";
import { Providers } from "./providers";
import { getRequestLocale, getRequestPathname, loadResources } from "@/lib/i18n/server";
import { AuthNavigation } from "@/components/navigation/AuthNavigation";
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
  // Ties the bullpen.no entity to its real public profiles — one of the few
  // legitimate levers for a bare, one-word brand query ("bullpen") to
  // resolve to us rather than an unrelated same-name result.
  sameAs: [
    "https://www.instagram.com/bullpen.no/",
    "https://discord.gg/RkTFXyjZSY",
  ],
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "BullPen",
  url: "https://bullpen.no",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers() here (via getRequestLocale/getRequestPathname) makes
  // every route dynamically rendered, including the currently-static
  // marketing/legal pages — an accepted trade-off for Phase 1 of the i18n
  // effort: marketing translation is out of scope, most in-app pages are
  // already force-dynamic, and these are cheap text renders. Splitting into
  // two root layouts (marketing vs. app) via route groups would avoid this
  // and is deferred; see the i18n plan's Phase 0.2 for the full reasoning.
  const [locale, pathname] = await Promise.all([getRequestLocale(), getRequestPathname()]);
  const resources = await loadResources(locale, pathname);

  return (
    <html
      lang={locale}
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
        <Providers locale={locale} resources={resources}>
          <ThemeProvider>
            <AIPanelProvider>
              <CommandPaletteProvider>
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
