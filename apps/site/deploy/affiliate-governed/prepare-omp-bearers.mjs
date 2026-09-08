import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const MAX_BEARER_BYTES = 64 * 1024;
const EXPECTED_UID_BY_ROLE = {
  broker: 1003,
  gateway: 1004,
};
const PROFILE_BY_ROLE = {
  broker: 'affiliate-model-auth-broker',
  gateway: 'affiliate-model-gateway',
};

const fail = (message) => {
  console.error(`[prepare-omp-service] ${message}`);
  process.exit(78);
};

const fingerprint = (value) => createHash('sha256')
  .update(Buffer.from(value, 'utf8'))
  .digest('hex');

const readBearer = async (sourcePath) => {
  let handle;
  try {
    handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const sourceStat = await handle.stat();
    if (
      !sourceStat.isFile()
      || sourceStat.uid !== 0
      || sourceStat.gid !== 1003
      || (sourceStat.mode & 0o7777) !== 0o640
      || sourceStat.size < 1
      || sourceStat.size > MAX_BEARER_BYTES
    ) {
      fail(`invalid OMP bearer source metadata: ${sourcePath}`);
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength !== sourceStat.size) {
      fail(`OMP bearer source changed during validation: ${sourcePath}`);
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail(`OMP bearer source is not valid UTF-8: ${sourcePath}`);
    }
    const effective = text.trim();
    if (effective.length === 0) {
      fail(`OMP bearer source must contain a non-whitespace value: ${sourcePath}`);
    }
    return {
      sourcePath,
      isRegularFile: true,
      isSymlink: false,
      uid: sourceStat.uid,
      gid: sourceStat.gid,
      mode: (sourceStat.mode & 0o7777).toString(8).padStart(4, '0'),
      sizeBytes: sourceStat.size,
      effective,
      bytes: Buffer.from(effective, 'utf8'),
      sha256: fingerprint(effective),
    };
  } catch (error) {
    if (error?.code === 'ERR_INVALID_ARG_VALUE' || error?.code === 'ELOOP') {
      fail(`OMP bearer source must not be a symlink: ${sourcePath}`);
    }
    if (error?.message?.startsWith('[prepare-omp-service]')) throw error;
    fail(`unable to read OMP bearer source: ${sourcePath}`);
  } finally {
    await handle?.close().catch(() => {});
  }
};

const writeBearer = async (profileDir, targetName, bytes) => {
  const targetPath = path.join(profileDir, targetName);
  const temporaryPath = path.join(profileDir, `.${targetName}.tmp.${process.pid}`);
  let handle;
  try {
    handle = await open(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    await handle.write(bytes);
    await handle.chmod(0o600);
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, targetPath);
  } catch {
    await handle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    fail(`unable to install OMP bearer profile file: ${targetName}`);
  }
};

const cliArguments = process.argv.slice(2);
if (cliArguments[0] === 'capture') {
  const sourcePaths = cliArguments.slice(1);
  if (sourcePaths.length !== 2 || sourcePaths.some((sourcePath) => !sourcePath)) {
    fail('bearer source capture requires two source paths');
  }
  const capturedBearers = [];
  for (const sourcePath of sourcePaths) {
    capturedBearers.push(await readBearer(sourcePath));
  }
  if (
    capturedBearers[0].sourcePath === capturedBearers[1].sourcePath
    || capturedBearers[0].effective === capturedBearers[1].effective
  ) {
    fail('OMP bearer sources must use distinct paths and effective values');
  }
  process.stdout.write(`${JSON.stringify(capturedBearers.map((bearer) => ({
    path: bearer.sourcePath,
    isRegularFile: bearer.isRegularFile,
    isSymlink: bearer.isSymlink,
    uid: bearer.uid,
    gid: bearer.gid,
    mode: bearer.mode,
    sizeBytes: bearer.sizeBytes,
    sha256: bearer.sha256,
  })), null, 2)}\n`);
  process.exit(0);
}
const [role, home, ...argumentsAfterHome] = process.argv.slice(2);
const expectedUid = EXPECTED_UID_BY_ROLE[role];
const profile = PROFILE_BY_ROLE[role];
if (!expectedUid || !profile || home !== '/var/lib/omp') {
  fail('unsupported OMP service preparation request');
}
if (process.getuid?.() !== expectedUid) {
  fail(`OMP service ${role} must run as UID ${expectedUid}`);
}

const pairCount = role === 'broker' ? 1 : 2;
const markerIndex = pairCount * 2;
if (argumentsAfterHome[markerIndex] !== '--') {
  fail('OMP service command marker is missing');
}
const command = argumentsAfterHome.slice(markerIndex + 1);
if (command.length === 0) {
  fail('OMP service command is required');
}
const bearerPairs = [];
for (let index = 0; index < pairCount; index += 1) {
  const sourcePath = argumentsAfterHome[index * 2];
  const targetName = argumentsAfterHome[index * 2 + 1];
  if (!sourcePath || !targetName) fail('OMP bearer source specification is incomplete');
  bearerPairs.push({ sourcePath, targetName });
}
const bearers = [];
for (const pair of bearerPairs) {
  bearers.push({ ...pair, ...(await readBearer(pair.sourcePath)) });
}
if (
  role === 'gateway'
  && (bearers[0].sourcePath === bearers[1].sourcePath
    || bearers[0].effective === bearers[1].effective)
) {
  fail('OMP gateway bearer sources must use distinct paths and effective values');
}

const profileDir = path.join(home, '.omp', 'profiles', profile);
try {
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
} catch {
  fail('unable to create OMP profile directory');
}
await chmod(profileDir, 0o700);
for (const bearer of bearers) {
  await writeBearer(profileDir, bearer.targetName, bearer.bytes);
}
