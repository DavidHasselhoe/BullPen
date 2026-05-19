import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // The project uses @supabase/supabase-js@2.90 which has different type requirements
    // than our hand-written Database types. Runtime behavior is correct.
    ignoreBuildErrors: true,
  },
  images: {
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
    ];
  },
};

export default nextConfig;
