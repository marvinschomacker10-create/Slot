import { SymbolIcon } from './SymbolIcon';

/** Compact rendering of a settled window (window[reel][row]) for history and diagnostics. */
export function WindowGrid({ window, highlight, size = 26 }: { window: readonly (readonly string[])[]; highlight?: ReadonlySet<string>; size?: number }) {
  const rows = window[0]?.length ?? 0;
  return (
    <table className="window-grid">
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row}>
            {window.map((col, reel) => (
              <td key={reel} className={highlight?.has(`${reel}:${row}`) ? 'is-win' : undefined}>
                <SymbolIcon id={col[row]!} size={size} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
