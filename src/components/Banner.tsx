import { useEffect, useState } from 'react';
import { credits } from '../app/format';
import type { Banner as BannerState } from '../app/useSlotGame';

/** Win tiers as school grades (cosmetic only). */
const TIER_TEXT = { big: 'Gut gemacht!', mega: 'Sehr gut!', epic: 'Eins mit Sternchen!', small: '', none: '' } as const;

/** Overlay for feature start/end and large wins. The counted-up number ends exactly on the settled amount. */
export function Banner({
  banner,
  onDismiss,
  reducedMotion,
  winMultiplier,
  wildMultiplier,
  wildName,
}: {
  banner: BannerState;
  onDismiss: () => void;
  reducedMotion: boolean;
  winMultiplier: number;
  wildMultiplier: number;
  wildName: string;
}) {
  const target = banner.kind === 'big-win' ? banner.amount : banner.kind === 'feature-end' ? banner.total : 0;
  const [shown, setShown] = useState(reducedMotion ? target : 0);
  useEffect(() => {
    if (reducedMotion || target === 0) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const u = Math.min(1, (t - start) / duration);
      setShown(u >= 1 ? target : Math.floor(target * (1 - (1 - u) ** 3)));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reducedMotion]);

  useEffect(() => {
    if (banner.kind === 'big-win') {
      const t = setTimeout(onDismiss, 3200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [banner, onDismiss]);

  return (
    <button
      type="button"
      className={`banner banner--${banner.kind}`}
      onClick={onDismiss}
      data-testid="banner"
      aria-label="Hinweis schließen"
    >
      {banner.kind === 'feature-start' && (
        <>
          <span className="banner__eyebrow">Die Glocke läutet: Hitzefrei!</span>
          <span className="banner__title">{banner.spins} Freispiele</span>
          <span className="banner__hint">
            Gewinne ×{winMultiplier} · {wildName}-Gewinne zusätzlich ×{wildMultiplier} · zum Starten drücken
          </span>
        </>
      )}
      {banner.kind === 'feature-end' && (
        <>
          <span className="banner__eyebrow">Hitzefrei ist vorbei</span>
          <span className="banner__title">{credits(shown)}</span>
          <span className="banner__hint">in {banner.spins} Freispielen gewonnen</span>
        </>
      )}
      {banner.kind === 'big-win' && (
        <>
          <span className="banner__eyebrow">{TIER_TEXT[banner.tier]}</span>
          <span className="banner__title">{credits(shown)}</span>
        </>
      )}
    </button>
  );
}
