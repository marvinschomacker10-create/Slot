import { useState } from 'react';

export interface BandDatum {
  readonly label: string;
  readonly value: number;
  readonly probability: number;
}

/**
 * Horizontal bar chart: RTP contribution by round-payout band. One series, one
 * validated colour (#b8892f on the dark surface), bars <= 18px with a 4px rounded
 * data end, hairline grid, direct labels on the largest bars only, and a
 * hover/focus tooltip on every bar. The table next to it is the non-visual view.
 */
export function BandChart({ data, title }: { data: readonly BandDatum[]; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1e-9);
  const rowH = 26;
  const labelW = 104;
  const plotW = 300;
  const height = data.length * rowH + 24;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const top3 = new Set(
    [...data.map((d, i) => [d.value, i] as const)]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 3)
      .map(([, i]) => i),
  );
  const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <div className="chart__wrap">
        <svg viewBox={`0 0 ${labelW + plotW + 56} ${height}`} className="chart__svg" role="group" aria-label={title}>
          {ticks.map((t, i) => {
            const x = labelW + (t / max) * plotW;
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={0} y2={data.length * rowH} className="chart__grid" />
                <text x={x} y={data.length * rowH + 16} className="chart__tick" textAnchor="middle">
                  {fmt(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const y = i * rowH + 5;
            const h = 16;
            const w = Math.max(0, (d.value / max) * plotW);
            const r = Math.min(4, w);
            const path =
              w > 0
                ? `M${labelW},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`
                : '';
            return (
              <g
                key={d.label}
                tabIndex={0}
                role="img"
                aria-label={`${d.label} x bet: ${fmt(d.value)} of stake, probability ${d.probability.toExponential(2)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="chart__row"
              >
                <rect x={0} y={i * rowH} width={labelW + plotW + 56} height={rowH} fill="transparent" />
                <text x={labelW - 8} y={y + 12} className="chart__label" textAnchor="end">
                  {d.label}
                </text>
                {path && <path d={path} className={`chart__bar${active === i ? ' is-active' : ''}`} />}
                {top3.has(i) && (
                  <text x={labelW + w + 6} y={y + 12} className="chart__value">
                    {fmt(d.value)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active !== null && (
          <div className="chart__tooltip" style={{ top: active * rowH }} role="status">
            <strong>{data[active]!.label} x bet</strong>
            <span>RTP share {fmt(data[active]!.value)}</span>
            <span>Probability {data[active]!.probability.toExponential(2)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
