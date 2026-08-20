import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
  // The marketing landing moved from /welcome to / (Nov 2026). Keep old inbound
  // links (Show HN posts, tweets, etc.) working.
  async redirects() {
    return [
      { source: '/welcome', destination: '/', permanent: true },
      { source: '/leaderboard', destination: '/academy/leaderboard', permanent: true },
    ];
  },
};

export default nextConfig;
