import { spawnSync } from 'node:child_process';
import {
  chownSync, chmodSync, existsSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';

if (process.getuid?.() !== 0) throw new Error('Run this probe as the isolated runner control UID.');
if (process.argv.slice(2).some((argument) => argument !== '--reviewer')) throw new Error('Unknown probe mode.');
const readOnly = process.argv.includes('--reviewer');
const root = '/workspaces';
mkdirSync(root, { recursive: true });
if (readdirSync(root).length !== 0) throw new Error('Use an empty disposable workspace mount, not a live runner volume.');
const childUid = Number(process.env.AFFILIATE_AGENT_RUNNER_CHILD_UID ?? 1002);
const childGid = Number(process.env.AFFILIATE_AGENT_RUNNER_CHILD_GID ?? 1001);
const supervisorUid = Number(process.env.AFFILIATE_AGENT_UID ?? 1001);
if (![childUid, childGid, supervisorUid].every((id) => Number.isInteger(id) && id > 0 && id < 65535)
  || childUid === supervisorUid) throw new Error('Use the reviewed distinct child and supervisor identities.');
const workspace = mkdtempSync(join(root, 'sandbox-workspace-'));
const sibling = mkdtempSync(join(root, 'sandbox-sibling-'));
const home = join(workspace, '.codex');
const temporary = join(workspace, '.tmp');
for (const directory of [workspace, sibling, home, temporary]) {
  mkdirSync(directory, { recursive: true });
  chownSync(directory, supervisorUid, childGid);
  chmodSync(directory, 0o770);
}
if (readOnly) {
  for (const name of ['.git', '.agents']) {
    const directory = join(workspace, name);
    mkdirSync(directory);
    chownSync(directory, supervisorUid, childGid);
    chmodSync(directory, 0o550);
  }
  chmodSync(workspace, 0o550);
}
const insideRelativePath = readOnly ? '.tmp/inside-proof' : 'inside-proof';
const outsideFile = join(sibling, 'outside-proof');
const environment = {
  PATH: process.env.PATH,
  HOME: home,
  CODEX_HOME: home,
  TMPDIR: temporary,
  TMP: temporary,
  TEMP: temporary,
};
const options = { cwd: workspace, uid: childUid, gid: childGid, env: environment, encoding: 'utf8', timeout: 30000 };
try {
  const direct = spawnSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1],"control")', outsideFile], options);
  if (direct.status !== 0 || !existsSync(outsideFile)) {
    throw new Error('The sibling must be writable without the Codex sandbox for this probe to be valid.');
  }
  rmSync(outsideFile);
  const program = [
    'const fs=require("node:fs");',
    `fs.writeFileSync(${JSON.stringify(insideRelativePath)},"inside");`,
    `const readOnly=${JSON.stringify(readOnly)};let rootWriteDenied=null;`,
    'if(readOnly){rootWriteDenied=false;try{fs.writeFileSync("forbidden-root-write","outside");}catch(error){if(["EACCES","EPERM","EROFS"].includes(error.code))rootWriteDenied=true;else throw error;}if(!rootWriteDenied)throw Error("Reviewer root is writable");}',
    'let denied=false;',
    'try{fs.writeFileSync(process.argv[1],"outside");}catch(error){if(["EACCES","EPERM","EROFS"].includes(error.code))denied=true;else throw error;}',
    'const status=fs.readFileSync("/proc/self/status","utf8");',
    'const noNewPrivileges=/NoNewPrivs:\\s+1/.test(status);',
    'const noCapabilities=/CapEff:\\s+0+\\s/.test(status);',
    'console.log(JSON.stringify({workspaceMode:readOnly?"READ_ONLY":"READ_WRITE",insideWrite:true,rootWriteDenied,outsideWriteDenied:denied,noNewPrivileges,noCapabilities}));',
    'if(!denied||!noNewPrivileges||!noCapabilities)process.exitCode=42;',
  ].join('');
  const result = spawnSync('codex', [
    'sandbox', '-c', 'sandbox_mode="workspace-write"',
    '-c', 'sandbox_workspace_write.network_access=true',
    '-c', 'sandbox_workspace_write.exclude_slash_tmp=true',
    '--', process.execPath, '-e', program, outsideFile,
  ], options);
  // This probe has no model credentials or production data. Its diagnostics are safe to display.
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  const insideWritten = existsSync(join(workspace, insideRelativePath))
    && readFileSync(join(workspace, insideRelativePath), 'utf8') === 'inside';
  const outsideDenied = !existsSync(outsideFile);
  console.log(JSON.stringify({ phase: 'host-verification', workspaceMode: readOnly ? 'READ_ONLY' : 'READ_WRITE', exitCode: result.status, baselineSiblingWritable: true, insideWritten, outsideDenied }));
  if (result.status !== 0 || !insideWritten || !outsideDenied) process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(sibling, { recursive: true, force: true });
}
