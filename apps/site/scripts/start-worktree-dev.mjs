#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(siteRoot, '.env.local') });

const missingEnvironment = ['DATABASE_URL', 'AUTH_SECRET'].filter(
  (name) => !process.env[name]?.trim(),
);
if (missingEnvironment.length > 0) {
  console.error(`[dev:worktree] Missing ${missingEnvironment.join(', ')} in .env.local.`);
  process.exit(1);
}

const run = (command, args) => spawnSync(command, args, {
  cwd: siteRoot,
  env: process.env,
  stdio: 'inherit',
});

const database = run(process.execPath, [path.join(siteRoot, 'scripts', 'local-db.mjs'), 'up']);
if (database.status !== 0) {
  process.exit(database.status ?? 1);
}

const migration = run(process.execPath, [
  path.join(siteRoot, 'node_modules', 'prisma', 'build', 'index.js'),
  'migrate',
  'deploy',
]);
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

const server = spawn(process.execPath, ['server.mjs', '--dev'], {
  cwd: siteRoot,
  env: process.env,
  stdio: 'inherit',
});

const stopServer = (signal) => {
  if (!server.killed) server.kill(signal);
};

process.once('SIGINT', () => stopServer('SIGINT'));
process.once('SIGTERM', () => stopServer('SIGTERM'));

server.on('error', (error) => {
  console.error(`[dev:worktree] Could not start the backend: ${error.message}`);
  process.exitCode = 1;
});

server.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
  process.exit(process.exitCode);
});
