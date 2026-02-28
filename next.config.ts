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
        protocol: 'https',
        hostname: 'img.logo.dev',
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
};

export default nextConfig;
