#!/usr/bin/env node

import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function runBuffered(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'pipe',
    env: process.env,
    encoding: 'utf8',
  });
}

function hasCommand(command, versionArgs = ['--version']) {
  const result = spawnSync(command, versionArgs, { stdio: 'ignore' });
  return result.status === 0;
}

// Prefer a native VHS install when present. Docker remains a portable fallback
// for contributors who do not want to manage local ttyd/ffmpeg dependencies.
if (hasCommand('vhs')) {
  const result = runBuffered('vhs', args);
  if (result.status === 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exit(0);
  }

  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (!hasCommand('docker', ['version'])) {
    process.exit(result.status ?? 1);
  }

  console.error('Local VHS execution failed. Falling back to the Docker image.');
}

// if (hasCommand('docker', ['version'])) {
//   const dockerConfigDir =
//     process.env.DOCKER_CONFIG ?? mkdtempSync(path.join(os.tmpdir(), 'bagsbot-vhs-docker-'));
//   const dockerArgs = [
//     'run',
//     '--rm',
//     '-v',
//     `${repoRoot}:/vhs`,
//     '-w',
//     '/vhs',
//     'ghcr.io/charmbracelet/vhs',
//     ...args,
//   ];
//   const result = run('docker', dockerArgs, {
//     env: {
//       ...process.env,
//       DOCKER_CONFIG: dockerConfigDir,
//     },
//   });

//   if (process.env.DOCKER_CONFIG === undefined) {
//     rmSync(dockerConfigDir, { recursive: true, force: true });
//   }

//   process.exit(result.status ?? 1);
// }

console.error('VHS is not installed and Docker is not available.');
console.error(
  'Install VHS locally with `brew install vhs ttyd`, `winget install charmbracelet.vhs`, or use Docker.'
);
process.exit(1);
