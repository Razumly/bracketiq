#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const PROTOCOL = "mvp-local-backend-lock/v1";
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

function fail(message, exitCode = 1) {
  process.stderr.write(`[backend-lock] ${message}\n`);
  process.exit(exitCode);
}

function sleep(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function parsePid(rawPid) {
  if (!/^\d+$/.test(rawPid ?? "")) {
    fail(`Invalid owner PID: ${rawPid ?? ""}`);
  }
  const pid = Number(rawPid);
  if (!Number.isSafeInteger(pid) || pid < 1) {
    fail(`Invalid owner PID: ${rawPid}`);
  }
  return pid;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (error?.code === "ESRCH") return "dead";
    return "unknown";
  }
}

function processIdentity(pid) {
  try {
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const closeParen = stat.lastIndexOf(")");
      if (closeParen < 0) return null;
      const fieldsAfterCommand = stat.slice(closeParen + 2).trim().split(/\s+/);
      const startTime = fieldsAfterCommand[19];
      return /^\d+$/.test(startTime ?? "") ? `linux-proc:${startTime}` : null;
    }

    if (process.platform === "darwin") {
      const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const started = result.status === 0 ? result.stdout.trim() : "";
      return started ? `darwin-ps:${started}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function newOwner(pid) {
  return {
    protocol: PROTOCOL,
    token: crypto.randomBytes(16).toString("hex"),
    pid,
    platform: process.platform,
    hostname: os.hostname(),
    processIdentity: processIdentity(pid),
    createdAt: new Date().toISOString(),
  };
}

function isValidOwner(owner) {
  return owner !== null
    && typeof owner === "object"
    && owner.protocol === PROTOCOL
    && typeof owner.token === "string"
    && TOKEN_PATTERN.test(owner.token)
    && Number.isSafeInteger(owner.pid)
    && owner.pid > 0
    && typeof owner.platform === "string"
    && owner.platform.length > 0
    && typeof owner.hostname === "string"
    && owner.hostname.length > 0
    && (owner.processIdentity === null || typeof owner.processIdentity === "string")
    && typeof owner.createdAt === "string";
}

function readOwner(directory) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(directory, "owner.json"), "utf8"));
    return isValidOwner(owner) ? owner : null;
  } catch {
    return null;
  }
}

function ownerState(owner) {
  if (!isValidOwner(owner)) return "unknown";
  if (owner.platform !== process.platform || owner.hostname !== os.hostname()) {
    return "unknown";
  }

  const existence = processExists(owner.pid);
  if (existence === "dead") return "dead";
  if (existence !== "alive") return "unknown";

  if (owner.processIdentity !== null) {
    const currentIdentity = processIdentity(owner.pid);
    if (currentIdentity === null) return "unknown";
    if (currentIdentity !== owner.processIdentity) return "dead";
  }
  return "alive";
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch {
    // Some Windows filesystems do not permit opening directories. The owner
    // file itself is still flushed before its directory is atomically renamed.
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function prepareDirectory(finalPath, owner, kind) {
  const parent = path.dirname(finalPath);
  fs.mkdirSync(parent, { recursive: true });
  const prefix = path.join(parent, `.${path.basename(finalPath)}.${kind}-`);
  const temporary = fs.mkdtempSync(prefix);
  const ownerPath = path.join(temporary, "owner.json");
  let descriptor;
  try {
    descriptor = fs.openSync(ownerPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  fsyncDirectory(temporary);
  return temporary;
}

function removeDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Cleanup is best effort for unpublished candidates and moved tombstones.
  }
}

function isDestinationConflict(error) {
  return ["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(error?.code);
}

function publishPreparedDirectory(temporary, destination) {
  try {
    fs.renameSync(temporary, destination);
    fsyncDirectory(path.dirname(destination));
    return true;
  } catch (error) {
    if (isDestinationConflict(error)) return false;
    throw error;
  }
}

function releaseOwnedDirectory(directory, expectedPid, expectedToken) {
  const current = readOwner(directory);
  if (!current || current.pid !== expectedPid || current.token !== expectedToken) {
    return false;
  }

  const tombstone = `${directory}.released-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  try {
    fs.renameSync(directory, tombstone);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }

  const moved = readOwner(tombstone);
  if (!moved || moved.pid !== expectedPid || moved.token !== expectedToken) {
    if (!fs.existsSync(directory)) {
      try {
        fs.renameSync(tombstone, directory);
      } catch {
        // Fail closed if an external actor changed the lock during release.
      }
    }
    return false;
  }
  removeDirectory(tombstone);
  fsyncDirectory(path.dirname(directory));
  return true;
}

function testPauseBeforePublish(owner) {
  const signalPath = process.env.MVP_LOCK_TEST_BEFORE_PUBLISH_SIGNAL;
  if (!signalPath) return;

  fs.writeFileSync(signalPath, `${owner.token}\n`, { flag: "wx" });
  const continuePath = process.env.MVP_LOCK_TEST_CONTINUE_FILE;
  if (!continuePath) fail("MVP_LOCK_TEST_CONTINUE_FILE is required with the pause hook.");

  const timeout = Number(process.env.MVP_LOCK_TEST_PAUSE_TIMEOUT_MS ?? "10000");
  const deadline = Date.now() + (Number.isFinite(timeout) && timeout > 0 ? timeout : 10000);
  while (!fs.existsSync(continuePath)) {
    if (Date.now() >= deadline) fail("Timed out in the lock pre-publication test hook.");
    sleep(10);
  }
}

function recoverDeadOwner(lockPath, observedOwner) {
  const recoveryPath = `${lockPath}.recovery-${observedOwner.token}`;
  const recoveryOwner = newOwner(process.pid);
  const recoveryTemporary = prepareDirectory(recoveryPath, recoveryOwner, "pending");
  if (!publishPreparedDirectory(recoveryTemporary, recoveryPath)) {
    removeDirectory(recoveryTemporary);
    return false;
  }

  try {
    const currentOwner = readOwner(lockPath);
    if (!currentOwner || currentOwner.token !== observedOwner.token) return false;
    if (ownerState(currentOwner) !== "dead") return false;

    const stalePath = `${lockPath}.stale-${observedOwner.token}-${crypto.randomBytes(8).toString("hex")}`;
    try {
      fs.renameSync(lockPath, stalePath);
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
    removeDirectory(stalePath);
    fsyncDirectory(path.dirname(lockPath));
    return true;
  } finally {
    if (!releaseOwnedDirectory(recoveryPath, recoveryOwner.pid, recoveryOwner.token)) {
      fail(`Could not safely release stale-lock recovery guard ${recoveryPath}.`);
    }
  }
}

function acquire(lockPath, ownerPid) {
  const owner = newOwner(ownerPid);
  const temporary = prepareDirectory(lockPath, owner, "pending");
  testPauseBeforePublish(owner);

  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (publishPreparedDirectory(temporary, lockPath)) {
        process.stdout.write(`${owner.token}\n`);
        return;
      }

      const existing = readOwner(lockPath);
      const state = ownerState(existing);
      if (state === "alive") {
        fail(`Another local-backend bootstrap is already running as PID ${existing.pid}.`, 2);
      }
      if (state === "unknown") {
        fail(`The local-backend lock owner cannot be verified safely; refusing to reclaim ${lockPath}.`, 2);
      }

      if (!recoverDeadOwner(lockPath, existing)) sleep(10);
    }
    fail(`Could not acquire the local-backend bootstrap lock at ${lockPath}.`, 2);
  } finally {
    removeDirectory(temporary);
  }
}

function release(lockPath, ownerPid, token) {
  if (!TOKEN_PATTERN.test(token ?? "")) fail("Invalid lock token.");
  const owner = readOwner(lockPath);
  if (!owner) fail(`The local-backend lock at ${lockPath} is missing or malformed.`);
  if (owner.platform !== process.platform || owner.hostname !== os.hostname()) {
    fail(`The local-backend lock at ${lockPath} belongs to another host or platform.`);
  }
  if (!releaseOwnedDirectory(lockPath, ownerPid, token)) {
    fail(`The local-backend lock at ${lockPath} is no longer owned by PID ${ownerPid}.`);
  }
}

const [command, lockPathArgument, ownerPidArgument, tokenArgument, ...extra] = process.argv.slice(2);
if (!command || !lockPathArgument || !ownerPidArgument || extra.length > 0) {
  fail("Usage: local-backend-lock.mjs acquire <lock-path> <owner-pid> | release <lock-path> <owner-pid> <token>");
}

const lockPath = path.resolve(lockPathArgument);
const ownerPid = parsePid(ownerPidArgument);
if (command === "acquire" && tokenArgument === undefined) {
  acquire(lockPath, ownerPid);
} else if (command === "release" && tokenArgument !== undefined) {
  release(lockPath, ownerPid, tokenArgument);
} else {
  fail("Usage: local-backend-lock.mjs acquire <lock-path> <owner-pid> | release <lock-path> <owner-pid> <token>");
}
