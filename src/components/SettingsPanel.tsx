import type { Settings } from '../app/settings';

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const toggle = (key: keyof Settings, label: string, hint: string) => (
    <label className="toggle">
      <input type="checkbox" checked={settings[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );
  return (
    <div className="settings">
      {toggle('turbo', 'Schnelldrehen', 'Kürzere Walzenanimation. Die Ergebnisse werden genau gleich berechnet.')}
      {toggle('reducedMotion', 'Weniger Bewegung', 'Keine drehenden Walzen, Partikel oder pulsierenden Markierungen.')}
      {toggle('autoFreeSpins', 'Freispiele automatisch spielen', 'Sonst für jedes Freispiel FREI drücken.')}
    </div>
  );
}
