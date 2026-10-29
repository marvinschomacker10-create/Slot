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
      {toggle('turbo', 'Fast spin', 'Shorter reel animation. Results are calculated exactly the same way.')}
      {toggle('reducedMotion', 'Reduced motion', 'No spinning reels, particles or pulsing highlights.')}
      {toggle('autoFreeSpins', 'Play free spins automatically', 'Otherwise press SPIN for each free spin.')}
    </div>
  );
}
