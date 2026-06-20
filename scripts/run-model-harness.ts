#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harnessRoot = path.resolve(
  process.env.COORDINATION_MODEL_HARNESS_DIR ??
    path.join(gameRepoRoot, '..', 'coordination-games-model-harness'),
);
const harnessPackage = path.join(harnessRoot, 'package.json');

if (!existsSync(harnessPackage)) {
  console.error(
    [
      'The model harness now lives in the standalone coordination-games-model-harness repo.',
      `Expected package.json at: ${harnessPackage}`,
      'Set COORDINATION_MODEL_HARNESS_DIR to the standalone harness path, or run npm run gui / npm run harness:model from that repo directly.',
    ].join('\n'),
  );
  process.exit(1);
}

const result = spawnSync('npm', ['run', 'harness:model', '--', ...process.argv.slice(2)], {
  cwd: harnessRoot,
  env: {
    ...process.env,
    HARNESS_GAME_RUNTIME_DIR: process.env.HARNESS_GAME_RUNTIME_DIR ?? gameRepoRoot,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Failed to launch standalone model harness: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
