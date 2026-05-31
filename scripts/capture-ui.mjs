#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const artifactDir = path.join(repoRoot, 'artifacts', 'ui');
const templatePath = path.join(scriptDir, 'capture-ui.tape');

// Keep the default capture path deterministic so docs and local usage land in
// a predictable place, while allowing env overrides for custom scenarios.
const pngPath = path.resolve(
  process.env.CAPTURE_PNG_PATH ?? path.join(artifactDir, 'dashboard-capture.png')
);
const gifPath = path.resolve(
  process.env.CAPTURE_GIF_PATH ?? path.join(artifactDir, 'dashboard-capture.gif')
);
const startCommand = process.env.CAPTURE_COMMAND ?? 'pnpm scenario:mixed';
const waitTimeout = process.env.CAPTURE_WAIT_TIMEOUT ?? '30s';
const settleSleep = process.env.CAPTURE_SETTLE_SLEEP ?? '2s';
const width = process.env.CAPTURE_WIDTH ?? '1800';
const height = process.env.CAPTURE_HEIGHT ?? '1200';
const fontSize = process.env.CAPTURE_FONT_SIZE ?? '20';
const generatedTapePath = path.join(artifactDir, 'capture-ui.generated.tape');

function normalizeTapePath(value) {
  return value.split(path.sep).join('/');
}

function escapeTapeString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function ensureRepoRelative(value, label) {
  const relativePath = path.relative(repoRoot, value);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must stay inside the repository so the Docker fallback can mount it.`);
  }
  return normalizeTapePath(relativePath);
}

function renderTape(template) {
  const gifTapePath = ensureRepoRelative(gifPath, 'CAPTURE_GIF_PATH');
  const pngTapePath = ensureRepoRelative(pngPath, 'CAPTURE_PNG_PATH');
  const replacements = new Map([
    ['__GIF_PATH__', gifTapePath],
    ['__PNG_PATH__', pngTapePath],
    ['__WIDTH__', width],
    ['__HEIGHT__', height],
    ['__FONT_SIZE__', fontSize],
    ['__WAIT_TIMEOUT__', waitTimeout],
    ['__SETTLE_SLEEP__', settleSleep],
    ['__START_COMMAND__', escapeTapeString(startCommand)],
  ]);

  let rendered = template;
  for (const [placeholder, value] of replacements) {
    rendered = rendered.replaceAll(placeholder, value);
  }
  return rendered;
}

mkdirSync(artifactDir, { recursive: true });

const renderedTape = renderTape(readFileSync(templatePath, 'utf8'));
writeFileSync(generatedTapePath, renderedTape);

// Delegate execution to a small wrapper so npm users get the same behavior on
// machines with a local VHS install or only Docker available.
const result = spawnSync(
  process.execPath,
  [path.join(scriptDir, 'run-vhs.mjs'), path.relative(repoRoot, generatedTapePath)],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  }
);

rmSync(generatedTapePath, { force: true });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Saved ${pngPath}`);
console.log(`Saved ${gifPath}`);
