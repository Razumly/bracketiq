import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: siteRoot,
  encoding: "utf8",
});

if (rootResult.error || rootResult.status !== 0) {
  process.stderr.write(
    rootResult.stderr || "Unable to locate the Git repository root.\n",
  );
  process.exit(rootResult.status ?? 1);
}

const repositoryRoot = rootResult.stdout.trim();
const sitePath = path
  .relative(repositoryRoot, siteRoot)
  .split(path.sep)
  .join("/");

let base = null;
const argumentsList = process.argv.slice(2);
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === "--base") {
    base = argumentsList[index + 1] ?? "";
    index += 1;
    continue;
  }
  if (argument.startsWith("--base=")) {
    base = argument.slice("--base=".length);
    continue;
  }
  process.stderr.write(`Unknown argument: ${argument}\n`);
  process.exit(2);
}

if (base !== null && !base.trim()) {
  process.stderr.write("The --base option requires a Git revision.\n");
  process.exit(2);
}

const runGit = (argumentsForGit) => {
  const result = spawnSync("git", argumentsForGit, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      result.stderr || `Git failed: git ${argumentsForGit.join(" ")}\n`,
    );
    process.exit(result.status ?? 1);
  }
  return result.stdout.split("\0").filter(Boolean);
};

const changedPaths =
  base === null
    ? runGit([
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
        "HEAD",
        "--",
        sitePath,
      ])
    : runGit([
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
        `${base}...HEAD`,
        "--",
        sitePath,
      ]);

if (base === null) {
  changedPaths.push(
    ...runGit([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      sitePath,
    ]),
  );
}

const sitePrefix = `${sitePath}/`;
const lintableFiles = Array.from(new Set(changedPaths))
  .filter((filePath) => filePath.startsWith(sitePrefix))
  .filter((filePath) => /\.(?:[cm]?[jt]sx?)$/u.test(filePath))
  .map((filePath) => path.resolve(repositoryRoot, filePath))
  .filter((filePath) => existsSync(filePath))
  .map((filePath) => path.relative(siteRoot, filePath))
  .sort();

if (lintableFiles.length === 0) {
  console.log("No changed site JavaScript or TypeScript files to lint.");
  process.exit(0);
}

console.log(
  `Linting ${lintableFiles.length} changed site file${lintableFiles.length === 1 ? "" : "s"} for complexity.`,
);

const eslintExecutable = path.join(
  siteRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "eslint.cmd" : "eslint",
);
const lintResult = spawnSync(
  eslintExecutable,
  [
    "--config",
    "eslint.complexity.config.mjs",
    "--cache",
    "--cache-location",
    "node_modules/.cache/eslint/complexity",
    ...lintableFiles,
  ],
  {
    cwd: siteRoot,
    stdio: "inherit",
  },
);

if (lintResult.error) {
  console.error(lintResult.error.message);
  process.exit(1);
}

process.exit(lintResult.status ?? 1);
