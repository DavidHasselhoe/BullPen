/**
 * Categorical palette for "part of a whole" charts (sector mix, fund
 * allocation). Lives in lib/ rather than next to one chart so any surface can
 * use it without importing a client component.
 *
 * This is categorical color -- identity, not meaning -- so it sits outside
 * DESIGN.md's One Signal Rule, which governs emerald/red as gain-loss signal.
 * Nothing here may be used to encode direction.
 *
 * Colors are assigned by position in the sorted holdings list (see
 * buildAllocation), so slot order IS the adjacency order: slot 1 sits next to
 * slot 2 in the donut and in the bar list below it. That makes neighbouring
 * slots the pairs that have to stay tellable apart, and this order was chosen
 * against exactly that constraint rather than by eye.
 *
 * Measured on both surfaces this app renders these on -- the dark card
 * (#141816) and the light card (#ffffff):
 *
 *   worst adjacent pair, normal vision   19.3 (floor 15)
 *   worst adjacent pair, protanopia       8.4 (target 8)
 *   contrast vs surface                  all 8 >= 3:1, both modes
 *
 * The previous palette failed that first check at 14.1 (indigo #6366f1 beside
 * violet #a78bfa), which is what put CVX and OXY on near-identical wedges, and
 * paired amber #f59e0b with yellow #fbbf24 four slots later. It also dropped
 * below 3:1 on the light card. Re-order or re-step at your peril: run the
 * numbers again if you touch this, don't eyeball it.
 *
 * One set serves both themes on purpose. These steps clear the lightness band
 * and the 3:1 contrast floor against the near-black card and against white, so
 * the donut does not need theme-aware fills -- which matters because Recharts
 * writes `fill` as an SVG presentation attribute, where a CSS var() would not
 * resolve.
 */
export const ALLOCATION_COLORS = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
];

/** Aggregated "everything else" bucket -- deliberately neutral, since it isn't
 *  one real entity competing for identity with the named slices. */
export const ALLOCATION_OTHER_COLOR = 'var(--muted-foreground)';
