/**
 * Cardinal-ish smooth path builder used by every chart on the landing.
 * Returns the line + filled-area path + the coordinates of the last point.
 */
export interface BuiltPath {
  line: string;
  area: string;
  lastX: number;
  lastY: number;
}

export function buildPath(
  points: number[],
  w: number,
  h: number,
  padX = 8,
  padY = 16,
): BuiltPath {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (points.length - 1);
  const xs = points.map((_, i) => padX + i * stepX);
  const ys = points.map((p) => h - padY - ((p - min) / range) * (h - padY * 2));

  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const y0 = ys[i];
    const x1 = xs[i + 1];
    const y1 = ys[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` Q ${cx} ${y0} ${cx} ${(y0 + y1) / 2} T ${x1} ${y1}`;
  }
  const area = `${d} L ${xs[xs.length - 1]} ${h} L ${xs[0]} ${h} Z`;
  return { line: d, area, lastX: xs[xs.length - 1], lastY: ys[ys.length - 1] };
}
