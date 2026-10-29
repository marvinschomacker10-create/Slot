import { symbolArt } from '../render/theme';

export function SymbolIcon({ id, size = 40, label }: { id: string; size?: number; label?: string }) {
  const src = symbolArt(id);
  if (!src) {
    return (
      <span className="symbol-fallback" style={{ width: size, height: size }} aria-label={label ?? id}>
        {id.slice(0, 2)}
      </span>
    );
  }
  return <img src={src} width={size} height={size} alt={label ?? id} className="symbol-icon" draggable={false} />;
}
