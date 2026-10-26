// Runs the rules engine tests (test/engine/*.test.ts) with Node's test runner.
// They need the real ocgcore WebAssembly module, which Jest cannot load, so
// esbuild bundles each test file (resolving the @/ paths) and Node runs it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { build } from 'esbuild';

const dir = path.resolve('test/engine');
const out = path.join(dir, '.dist');
fs.rmSync(out, { recursive: true, force: true });
const filter = process.argv[2];
const entries = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.ts') && (!filter || f.includes(filter)))
  .map((f) => path.join(dir, f));

await build({
  entryPoints: entries,
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  external: ['ocgcore-wasm'],
  logLevel: 'warning',
});

const files = fs.readdirSync(out).map((f) => path.join(out, f));
const result = spawnSync(process.execPath, ['--enable-source-maps', '--no-warnings', '--test', '--test-reporter=spec', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
