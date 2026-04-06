"use client";

/**
 * Minimal piecewise-linear kernel preview (NoFeeSwap compact kernel semantics).
 * Horizontal axis: q (X59-style, normalized); vertical: intensity c (X15, normalized).
 */
export function KernelChart({
  points,
  label = "Kernel k(h)",
}: {
  points: { bx: number; cy: number }[];
  label?: string;
}) {
  if (points.length < 2) return null;
  const maxX = Math.max(...points.map((p) => p.bx), 1);
  const maxY = Math.max(...points.map((p) => p.cy), 1);
  const w = 280;
  const h = 120;
  const pad = 8;
  const sx = (x: number) => pad + (x / maxX) * (w - 2 * pad);
  const sy = (y: number) => h - pad - (y / maxY) * (h - 2 * pad);

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.bx).toFixed(1)} ${sy(p.cy).toFixed(1)}`)
    .join(" ");

  return (
    <div className="kernel-chart" role="img" aria-label={label}>
      <div className="kernel-chart__label">{label}</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="kernel-chart__svg">
        <defs>
          <linearGradient id="kernelStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.9)" />
            <stop offset="100%" stopColor="rgba(168,85,247,0.85)" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={w} height={h} rx={10} fill="rgba(3,7,18,0.65)" stroke="rgba(148,163,184,0.2)" />
        <path d={d} fill="none" stroke="url(#kernelStroke)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.bx)} cy={sy(p.cy)} r={3.5} fill="var(--accent)" />
        ))}
      </svg>
      <div className="kernel-chart__axis">0 → qSpacing (normalized)</div>
    </div>
  );
}
