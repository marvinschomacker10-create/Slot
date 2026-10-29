import { hexColor, paylineColor } from '../render/theme';

/** Small diagram of one payline: reels left to right, rows top to bottom. */
export function PaylineGrid({ index, rows, reels }: { index: number; rows: readonly number[]; reels: number }) {
  const h = 3;
  const cw = 14;
  const color = hexColor(paylineColor(index));
  const pts = rows.map((r, i) => `${i * cw + cw / 2},${r * cw + cw / 2}`).join(' ');
  return (
    <figure className="payline">
      <svg viewBox={`0 0 ${reels * cw} ${h * cw}`} width={reels * cw * 1.6} height={h * cw * 1.6} role="img" aria-label={`Payline ${index + 1}: rows ${rows.map((r) => r + 1).join(', ')}`}>
        {Array.from({ length: reels * h }, (_, k) => {
          const reel = Math.floor(k / h);
          const row = k % h;
          const on = rows[reel] === row;
          return <rect key={k} x={reel * cw + 1} y={row * cw + 1} width={cw - 2} height={cw - 2} rx={2} className={on ? 'payline__cell payline__cell--on' : 'payline__cell'} />;
        })}
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <figcaption>{index + 1}</figcaption>
    </figure>
  );
}
