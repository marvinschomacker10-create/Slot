/** Formats configuration JSON with short objects and primitive arrays on one line (readable diffs for reel strips). */
export function formatConfigJson(value: unknown): string {
  const fmt = (o: unknown, indent: number): string => {
    const pad = '  '.repeat(indent);
    if (Array.isArray(o)) {
      if (o.every((v) => v === null || typeof v !== 'object')) return `[${o.map((v) => JSON.stringify(v)).join(', ')}]`;
      return `[\n${o.map((v) => `${pad}  ${fmt(v, indent + 1)}`).join(',\n')}\n${pad}]`;
    }
    if (o !== null && typeof o === 'object') {
      const entries = Object.entries(o as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      const flat = entries.every(([, v]) => v === null || typeof v !== 'object');
      const oneLine = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
      if (flat && oneLine.length < 110) return oneLine;
      return `{\n${entries.map(([k, v]) => `${pad}  ${JSON.stringify(k)}: ${fmt(v, indent + 1)}`).join(',\n')}\n${pad}}`;
    }
    return JSON.stringify(o);
  };
  return `${fmt(value, 0)}\n`;
}
