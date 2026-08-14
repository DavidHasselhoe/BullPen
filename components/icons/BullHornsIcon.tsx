import { createLucideIcon } from 'lucide-react';

/**
 * Custom icon in Lucide's own authoring format (see createLucideIcon —
 * Lucide's public API for adding icons that behave identically to every
 * built-in one: same props, ref forwarding, className merging). Lucide has
 * no bull/cow/horns/Taurus icon at all — verified against the installed
 * package's icon list before building this.
 */
export const BullHornsIcon = createLucideIcon('bull-horns', [
  ['circle', { cx: '12', cy: '16.5', r: '3.6', key: 'bull-head' }],
  [
    'path',
    {
      d: 'M9.3 14.5C6 14.5 2.5 11.5 2 7C1.8 5 3 4 5 5.3C6.8 7 8.3 10 9.7 13',
      key: 'bull-horn-left',
    },
  ],
  [
    'path',
    {
      d: 'M14.7 14.5C18 14.5 21.5 11.5 22 7C22.2 5 21 4 19 5.3C17.2 7 15.7 10 14.3 13',
      key: 'bull-horn-right',
    },
  ],
  ['line', { x1: '10.5', y1: '16.5', x2: '10.5', y2: '16.5', key: 'bull-eye-left' }],
  ['line', { x1: '13.5', y1: '16.5', x2: '13.5', y2: '16.5', key: 'bull-eye-right' }],
]);
