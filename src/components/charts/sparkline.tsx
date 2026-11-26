"use client";

/** Minimal SVG sparkline; nulls break the line. Purely decorative trend cue (values are shown as text). */
export function Sparkline({ points, color = "var(--accent)", height = 32, className }: { points: [number, number | null][]; color?: string; height?: number; className?: string }) {
  const valid = points.filter((p): p is [number, number] => p[1] !== null);
  if (valid.length < 2) return <div style={{ height }} className={className} aria-hidden />;
  const w = 120;
  const xs = valid.map((p) => p[0]);
  const ys = valid.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * w;
  const sy = (y: number) => height - 3 - ((y - y0) / (y1 - y0 || 1)) * (height - 6);
  let d = "";
  let pen = false;
  for (const [x, y] of points) {
    if (y === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  const last = valid.at(-1)!;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={className} style={{ height, width: "100%" }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last[0])} cy={sy(last[1])} r={2.5} fill={color} />
    </svg>
  );
}
