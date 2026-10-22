import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/html-bots';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Googlebot gets <title>, description and canonical in <head>. Next's
  // default list covers Google-InspectionTool (Search Console's live test)
  // but not Googlebot itself, so pages with an async generateMetadata (every
  // /stock/[ticker] and /picks/[date]) streamed their metadata into <body>.
  // Search Console then recorded "user-declared canonical: none" for
  // /stock/TXN (crawled 2026-09-11) while the live test looked fine.
  // Extends the default list rather than replacing it.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|Googlebot`, 'i'),
  // Pins the workspace root explicitly. Without this, Turbopack's root
  // inference has a known Windows bug (vercel/next.js#92978) where it
  // misdetects the root as the drive letter itself (e.g. "C:\"), causing
  // every CSS/postcss resolution to fail and Turbopack to spin up a fresh
  // worker process on every retry — runaway RAM/CPU within seconds of the
  // first page request.
  turbopack: {
    root: process.cwd(),
  },
  typescript: {
    // The project uses @supabase/supabase-js@2.90 which has different type requirements
    // than our hand-written Database types. Runtime behavior is correct.
    ignoreBuildErrors: true,
  },
  images: {
    // Serve AVIF first (typically 20-40% smaller than WebP), fall back to WebP.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        // TwelveData logo CDN (replaces logo.dev)
        protocol: 'https',
        hostname: 'api.twelvedata.com',
        pathname: '/logo/**',
      },
      {
        protocol: 'https',
        hostname: 'logo.twelvedata.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        // logo.dev — ETF issuer logos on /discover
        protocol: 'https',
        hostname: 'img.logo.dev',
      },
      {
        // Coingecko CDN — crypto logos on /discover
        protocol: 'https',
        hostname: 'assets.coingecko.com',
      },
    ],
  },
  // Security: Hide Next.js version in production
  poweredByHeader: false,
  // Performance: Enable compression
  compress: true,
  // Security: Limit request body size to prevent DoS
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
    // The stylesheet (Tailwind, one file for the whole app, ~32KB brotli) came
    // in <head> as a <link>, and a phone fetched it alongside ~30 async script
    // chunks (~520KB) sharing the same slow connection: on Discover the HTML
    // was done at 0.8s, the CSS at 4.3s, first paint at 4.5s (Lighthouse,
    // devtools throttling, 2026-10-22). Inlined, styles arrive with the HTML.
    // Cost: no cross-page caching of the CSS, ~32KB more per full page load.
    inlineCss: true,
  },
  // The marketing landing moved from /welcome to / (Nov 2026). Keep old inbound
  // links (Show HN posts, tweets, etc.) working.
  async redirects() {
    return [
      { source: '/welcome', destination: '/', permanent: true },
      { source: '/leaderboard', destination: '/academy/leaderboard', permanent: true },
    ];
  },
  // Security headers (OWASP recommended). Here rather than in middleware:
  // they never vary per request, and Vercel applies config headers in its
  // routing layer at no compute cost. Setting them in middleware ran an edge
  // invocation on every API call just for this, 27% of the project's Fluid
  // Active CPU (Sep 21 - Oct 21, 2026).
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

// 'unsafe-eval' is dev-only (Turbopack/webpack HMR relies on eval() for
// fast refresh) — production builds don't need it, and it fully defeats
// CSP's main XSS mitigation, so it must never ship to real users.
// PostHog's array.js loader lazy-loads its config plus recorder/surveys/
// web-vitals sub-bundles from this asset host at init time regardless of
// which features are actually enabled — same-origin script-src alone
// blocks that fetch outright (not just the unused extras), so it needs an
// explicit allowance rather than a client-side config flag.
const scriptSrc = process.env.NODE_ENV === 'production'
  ? "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com https://accounts.google.com/gsi/client"
  : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://us-assets.i.posthog.com https://accounts.google.com/gsi/client";

const csp = [
  "default-src 'self'",
  scriptSrc,
  // app.termly.io: legal policy pages (/privacy, /terms, /accessibility —
  // see components/legal/TermlyEmbed.tsx) render Termly's hosted policy
  // viewer directly in an iframe, not their JS embed script — deliberately,
  // since that script calls eval() internally and 'unsafe-eval' can't be
  // scoped to one script's origin in CSP, so allowing it here would open
  // eval-based XSS for every script on the page, not just Termly's. Only
  // frame-src is needed for this approach; nothing loads from Termly via
  // script-src. frame-src falls back to default-src ('self') when unset,
  // which would otherwise block the iframe.
  // accounts.google.com/gsi: Google One Tap (components/auth/GoogleOneTap.tsx)
  // falls back to an iframe prompt and its own stylesheet where the browser
  // has no FedCM (Safari, Firefox).
  "frame-src https://app.termly.io https://accounts.google.com/gsi/",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style", // Tailwind requires unsafe-inline
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()' },
  // Isolates the browsing context from cross-origin popups/openers — required
  // for window.crossOriginIsolated and blocks a class of cross-window attacks.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: csp },
  // Browsers ignore HSTS over plain http, so local dev is unaffected.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
];

export default nextConfig;
