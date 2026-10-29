import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../helpers';

const root = resolve(import.meta.dirname, '../..');
const tsx = resolve(root, 'node_modules/.bin/tsx');
const run = (script: string, args: string[]) =>
  spawnSync(tsx, [resolve(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8', timeout: 120_000 });

describe('command-line tools', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-pauker-cli-'));

  it('validate-config accepts the bundled configuration', () => {
    const r = run('validate-config.ts', []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/valid/);
    expect(r.stdout).toMatch(/exact RTP/);
  });

  it('validate-config reports every error with its location and exits non-zero', () => {
    const bad = cloneConfig();
    bad.paylines[2] = [0, 1, 7, 1, 0];
    bad.paytable.line.TEACHER = { '3': 50, '4': 10, '5': 1000 };
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify(bad));
    const r = run('validate-config.ts', ['--config', file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/paylines\[2\]\[2\]: row index/);
    expect(r.stdout).toMatch(/paytable\.line\.TEACHER\.4/);
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    const broken = run('validate-config.ts', ['--config', join(dir, 'broken.json')]);
    expect(broken.status).not.toBe(0);
    expect(broken.stderr).toMatch(/not valid JSON/);
  });

  it('simulate writes JSON and CSV results with a theory comparison', () => {
    const out = join(dir, 'sim-cli');
    const r = run('simulate.ts', [
      '--spins',
      '20000',
      '--seed',
      'cli',
      '--workers',
      '2',
      '--chunk-size',
      '5000',
      '--out',
      out,
    ]);
    expect(r.status, r.stderr).toBe(0);
    const json = JSON.parse(readFileSync(`${out}.json`, 'utf8'));
    expect(json.totals.rounds).toBe(20_000);
    expect(json.meta.seed).toBe('cli');
    expect(Array.isArray(json.comparison)).toBe(true);
    expect(readFileSync(`${out}.csv`, 'utf8').split('\n')[0]).toBe('metric,value,ci95_low,ci95_high');
    expect(existsSync(`${out}-comparison.csv`)).toBe(true);
    // Same seed, different worker count: identical results.
    const out1 = join(dir, 'sim-cli-1');
    expect(
      run('simulate.ts', ['--spins', '20000', '--seed', 'cli', '--workers', '1', '--chunk-size', '5000', '--out', out1])
        .status,
    ).toBe(0);
    expect(JSON.parse(readFileSync(`${out1}.json`, 'utf8')).totals).toEqual(json.totals);
  });

  it('simulate rejects bad arguments with a clear message', () => {
    const r = run('simulate.ts', ['--spins', 'lots']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--spins must be a positive integer/);
    expect(run('simulate.ts', ['--preset', 'huge']).stderr).toMatch(/unknown preset/);
  });

  it('export-report renders the Markdown report from analysis and simulation files', () => {
    const reports = join(dir, 'reports');
    spawnSync('mkdir', ['-p', reports]);
    writeFileSync(join(reports, 'simulation-20000.json'), readFileSync(join(dir, 'sim-cli.json')));
    const md = join(dir, 'RTP_REPORT.md');
    const r = run('export-report.ts', ['--reports', reports, '--out', md]);
    expect(r.status, r.stderr).toBe(0);
    const text = readFileSync(md, 'utf8');
    expect(text).toMatch(/# RTP and Mathematical Report/);
    expect(text).toMatch(/20,000 paid spins/);
    expect(existsSync(join(reports, 'simulation-20000-comparison.csv'))).toBe(true);
  });
});
