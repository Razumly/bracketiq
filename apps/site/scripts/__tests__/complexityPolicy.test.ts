/** @jest-environment jsdom */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

type LintMessage = { ruleId: string | null; severity: number };
type LintReport = { messages: LintMessage[] };

function lintSource(source: string, extension: string) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), 'node_modules/eslint/bin/eslint.js'),
      '--config', 'eslint.complexity.config.mjs',
      '--stdin',
      '--stdin-filename', `src/__lint_policy__/sample.${extension}`,
      '--format', 'json',
    ],
    { cwd: process.cwd(), input: source, encoding: 'utf8', timeout: 30_000 },
  );
  if (result.error) throw result.error;
  if (!result.stdout.trim()) throw new Error(result.stderr);
  const reports: LintReport[] = JSON.parse(result.stdout);
  return {
    status: result.status,
    messages: reports.flatMap((report) => report.messages),
  };
}

function logicSource(branches: number) {
  const conditions = Array.from(
    { length: branches },
    (_, index) => `if (value > ${index}) total += ${index};`,
  ).join('\n');
  return `function evaluate(value) {
    let total = 0;
    ${conditions}
    return total;
  }
  globalThis.evaluate = evaluate;`;
}

function componentSource(branches: number) {
  const children = Array.from(
    { length: branches },
    (_, index) => `{values[${index}] && <span>Item ${index}</span>}`,
  ).join('\n');
  return `export function Preview({ values }) {
    return <section>${children}</section>;
  }`;
}

describe('changed-file complexity policy', () => {
  it.each(['js', 'ts', 'mjs', 'mts', 'cjs', 'cts'])(
    'blocks non-JSX %s functions above 10',
    (extension) => {
      const result = lintSource(logicSource(10), extension);
      expect(result.status).toBe(1);
      expect(result.messages).toContainEqual(expect.objectContaining({
        ruleId: 'complexity', severity: 2,
      }));
    },
    30_000,
  );

  it.each(['jsx', 'tsx'])(
    'allows %s complexity at 20 and reports higher complexity without failing',
    (extension) => {
      const atThreshold = lintSource(componentSource(19), extension);
      expect(atThreshold.status).toBe(0);
      expect(atThreshold.messages).not.toContainEqual(expect.objectContaining({ ruleId: 'complexity' }));

      const overThreshold = lintSource(componentSource(20), extension);
      expect(overThreshold.status).toBe(0);
      expect(overThreshold.messages).toContainEqual(expect.objectContaining({
        ruleId: 'complexity', severity: 1,
      }));
    },
    60_000,
  );

  it.each(['jsx', 'tsx'])(
    'still blocks excessive control-flow nesting in %s',
    (extension) => {
      const result = lintSource(`export function Preview({ value }) {
        if (value) { if (value.a) { if (value.b) { if (value.c) { if (value.d) {
          return <span>Nested</span>;
        } } } } }
        return null;
      }`, extension);
      expect(result.status).toBe(1);
      expect(result.messages).toContainEqual(expect.objectContaining({
        ruleId: 'max-depth', severity: 2,
      }));
    },
    30_000,
  );

  it.each(['jsx', 'tsx'])(
    'still blocks conditional React Hooks in %s',
    (extension) => {
      const result = lintSource(`import { useState } from 'react';
        export function Preview({ enabled }) {
          if (enabled) {
            const [value] = useState(0);
            return <span>{value}</span>;
          }
          return null;
        }`, extension);
      expect(result.status).toBe(1);
      expect(result.messages).toContainEqual(expect.objectContaining({
        ruleId: 'react-hooks/rules-of-hooks', severity: 2,
      }));
    },
    30_000,
  );
});
