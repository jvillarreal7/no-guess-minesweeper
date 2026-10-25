// Generator benchmark.
// Usage: npm run bench -- [--difficulty beginner|intermediate|expert|all] [--n 1000]
//          (or a custom size such as --difficulty 30x16x130)
//          [--seed bench] [--click random|center] [--max-attempts 500]
//          [--max-component 40] [--max-nodes 200000]
//
// Timings are measured in Node on the main thread; the browser runs the same code in a
// Web Worker, so expect similar numbers on a comparable machine.

import { DIFFICULTIES, type Difficulty, type DifficultyName } from '../src/core/difficulty';
import { createRng } from '../src/core/rng';
import { DEFAULT_MAX_ATTEMPTS, generate } from '../src/generator/generate';
import type { SolverOptions } from '../src/solver/types';

const TARGET_P95_MS = 200;

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument '${key}'`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args.set(key.slice(2), value);
    i++;
  }
  return args;
}

function positiveInt(args: Map<string, string>, key: string, fallback: number): number {
  const raw = args.get(key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${key} must be a positive integer`);
  return value;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const BUCKETS: [string, number, number][] = [
  ['1', 1, 1],
  ['2', 2, 2],
  ['3-5', 3, 5],
  ['6-10', 6, 10],
  ['11-20', 11, 20],
  ['21-50', 21, 50],
  ['51-100', 51, 100],
  ['101+', 101, Infinity],
];

interface Report {
  name: string;
  passed: boolean;
}

/** A standard difficulty name, or a custom size written WxHxM (e.g. 30x16x130). */
function resolveDifficulty(name: string): Difficulty {
  if (name in DIFFICULTIES) return DIFFICULTIES[name as DifficultyName];
  const custom = /^(\d+)x(\d+)x(\d+)$/.exec(name);
  if (!custom) throw new Error(`unknown difficulty '${name}' (use a name or WxHxM)`);
  return { width: Number(custom[1]), height: Number(custom[2]), mineCount: Number(custom[3]) };
}

function bench(
  name: string,
  n: number,
  seed: string,
  click: string,
  maxAttempts: number,
  solver: SolverOptions,
): Report {
  const { width, height, mineCount } = resolveDifficulty(name);
  const size = width * height;
  const center = Math.floor(height / 2) * width + Math.floor(width / 2);
  const clicks = createRng(`${seed}-clicks-${name}`);

  const times: number[] = [];
  const attempts: number[] = [];
  const tiers = [0, 0, 0, 0];
  let failures = 0;
  let totalAttempts = 0;

  for (let k = 0; k < n; k++) {
    const firstClick = click === 'center' ? center : clicks.nextInt(size);
    const start = performance.now();
    const result = generate(
      { width, height, mineCount, seed: `${seed}-${name}-${k}`, firstClick },
      { maxAttempts, solver },
    );
    times.push(performance.now() - start);
    totalAttempts += result.attempts;
    if (!result.ok) {
      failures++;
      continue;
    }
    attempts.push(result.attempts);
    tiers[result.maxTier]++;
  }

  times.sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / n;
  const p95 = percentile(times, 95);
  const accepted = n - failures;
  const fmt = (ms: number) => `${ms.toFixed(2)} ms`;

  console.log(
    `\n${name} (${width}x${height}, ${mineCount} mines), ${n} boards, ${click} first click`,
  );
  console.log(
    `  accepted        ${accepted}/${n}  (${failures} hit the ${maxAttempts}-attempt budget)`,
  );
  console.log(
    `  acceptance rate ${((100 * accepted) / totalAttempts).toFixed(1)}% of attempts` +
      `  (mean ${(totalAttempts / n).toFixed(1)} attempts per board)`,
  );
  console.log(
    `  time per board  mean ${fmt(mean)}  p50 ${fmt(percentile(times, 50))}  p95 ${fmt(p95)}` +
      `  p99 ${fmt(percentile(times, 99))}  max ${fmt(times[n - 1])}`,
  );
  console.log('  attempts        histogram (accepted boards)');
  const most = Math.max(
    1,
    ...BUCKETS.map(([, lo, hi]) => attempts.filter((a) => a >= lo && a <= hi).length),
  );
  for (const [label, lo, hi] of BUCKETS) {
    const count = attempts.filter((a) => a >= lo && a <= hi).length;
    const bar = '#'.repeat(Math.round((40 * count) / most));
    console.log(`    ${label.padStart(6)}  ${String(count).padStart(6)}  ${bar}`);
  }
  console.log(
    `  highest tier    0: ${tiers[0]}  1: ${tiers[1]}  2: ${tiers[2]}  3: ${tiers[3]}  (accepted boards)`,
  );
  const passed = failures === 0 && p95 < TARGET_P95_MS;
  console.log(
    `  target          p95 < ${TARGET_P95_MS} ms, no failures: ${passed ? 'PASS' : 'FAIL'}`,
  );
  return { name, passed };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const difficulty = args.get('difficulty') ?? 'all';
  const names = difficulty === 'all' ? Object.keys(DIFFICULTIES) : [difficulty];
  names.forEach(resolveDifficulty); // Fail fast on a bad name.
  const click = args.get('click') ?? 'random';
  if (click !== 'random' && click !== 'center') throw new Error('--click must be random or center');

  const n = positiveInt(args, 'n', 1000);
  const maxAttempts = positiveInt(args, 'max-attempts', DEFAULT_MAX_ATTEMPTS);
  const solver: SolverOptions = {};
  if (args.has('max-component')) solver.maxComponentSize = positiveInt(args, 'max-component', 0);
  if (args.has('max-nodes')) solver.maxNodes = positiveInt(args, 'max-nodes', 0);

  const reports = names.map((name) =>
    bench(name, n, args.get('seed') ?? 'bench', click, maxAttempts, solver),
  );
  const failed = reports.filter((r) => !r.passed).map((r) => r.name);
  console.log(
    failed.length ? `\nFAIL: ${failed.join(', ')}` : '\nAll difficulties meet the target.',
  );
  process.exitCode = failed.length ? 1 : 0;
}

main();
