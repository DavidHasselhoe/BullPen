import type { MetadataRoute } from 'next';

// DESIGN.md bg-dark, oklch(0.145 0.008 162). Standalone launches land signed in, and signed-in accounts default to dark.
const BG = '#070b09';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BullPen',
    short_name: 'BullPen',
    description: 'Stocks, explained. Track your portfolio and learn as you go.',
    start_url: '/dashboard?src=pwa',
    scope: '/',
    display: 'standalone',
    background_color: BG,
    theme_color: BG,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
