#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEnvFile = path.join(siteRoot, '.env.docker.local');
const envFile = existsSync(localEnvFile) ? '.env.docker.local' : '.env.docker';
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';

const runCompose = (args, stdio = 'inherit') => new Promise((resolve) => {
  const child = spawn(dockerCommand, ['compose', '--env-file', envFile, ...args], {
    cwd: siteRoot,
    env: process.env,
    stdio,
  });

  child.on('error', (error) => {
    if (stdio !== 'ignore') {
      console.error(`[local-db] Could not run Docker Compose: ${error.message}`);
    }
    resolve(1);
  });
  child.on('exit', (code, signal) => {
    resolve(typeof code === 'number' ? code : signal ? 1 : 0);
  });
});

const waitForDatabase = async () => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const code = await runCompose(['exec', '-T', 'db', 'pg_isready', '-q'], 'ignore');
    if (code === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('Usage: node scripts/local-db.mjs <up|down|ps|logs>');
    return 1;
  }

  console.log(`[local-db] Using ${envFile}`);

  if (command === 'up') {
    const upCode = await runCompose(['up', '-d', 'db']);
    if (upCode !== 0) return upCode;
    if (!(await waitForDatabase())) {
      console.error('[local-db] Postgres did not become ready within 60 seconds.');
      return 1;
    }
    console.log('[local-db] Postgres is ready.');
    return 0;
  }

  const commandArgs = {
    down: ['down', ...args],
    ps: ['ps', ...args],
    logs: ['logs', '-f', 'db', ...args],
  }[command];

  if (!commandArgs) {
    console.error(`Unknown local database command: ${command}`);
    return 1;
  }

  return runCompose(commandArgs);
};

process.exitCode = await main();
