/** @jest-environment node */

import path from 'node:path';
import { AffiliateAgentValidationExecutor } from '../agentValidation';

const worktreeRoot = path.resolve('/tmp/worktree');
const toolchainRoot = path.resolve('/tmp/toolchain');
const jestExecutable = path.join(toolchainRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'jest.cmd' : 'jest');
const tsxExecutable = path.join(toolchainRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

describe('affiliate mapping named validation executor', () => {
  it('maps named tests to fixed Jest paths without exposing a shell', async () => {
    const calls: Array<{
      executable: string;
      args: string[];
      cwd: string;
      timeoutMs: number;
    }> = [];
    const executor = new AffiliateAgentValidationExecutor({
      worktreeRoot,
      toolchainRoot,
      commandRunner: async (input) => {
        calls.push(input);
        return { stdout: 'PASS', stderr: '', durationMs: 10 };
      },
    });
    const result = await executor.runFocusedTest('generated-source:river-city');
    expect(result.testPaths).toEqual([
      'src/server/affiliateImports/__tests__/river-cityGeneratedSource.test.ts',
    ]);
    expect(calls).toEqual([{
      executable: jestExecutable,
      args: [
        '--runInBand',
        'src/server/affiliateImports/__tests__/river-cityGeneratedSource.test.ts',
      ],
      cwd: worktreeRoot,
      timeoutMs: 300000,
    }]);
  });

  it('rejects arbitrary test ids and source-key command injection', async () => {
    const executor = new AffiliateAgentValidationExecutor({
      worktreeRoot,
      commandRunner: async () => ({ stdout: '', stderr: '', durationMs: 0 }),
    });
    await expect(executor.runFocusedTest('npm:test -- --watch')).rejects.toThrow(
      'not allowlisted',
    );
    await expect(executor.runFocusedTest('generated-source:../../escape')).rejects.toThrow(
      'unsafe source key',
    );
  });

  it('requires an explicit capability before running a local review scrape', async () => {
    const blocked = new AffiliateAgentValidationExecutor({
      worktreeRoot,
      commandRunner: async () => ({ stdout: '', stderr: '', durationMs: 0 }),
    });
    await expect(blocked.runReviewScrape('river-city')).rejects.toThrow(
      'disabled for this job',
    );

    const calls: string[][] = [];
    const allowed = new AffiliateAgentValidationExecutor({
      worktreeRoot,
      toolchainRoot,
      allowReviewScrape: true,
      commandRunner: async (input) => {
        calls.push([input.executable, ...input.args]);
        return { stdout: 'review only', stderr: '', durationMs: 25 };
      },
    });
    expect(await allowed.runReviewScrape('river-city')).toEqual(expect.objectContaining({
      sourceKey: 'river-city',
      setupPath: 'scripts/setup-river-city-affiliate-source.ts',
    }));
    expect(calls).toEqual([[
      tsxExecutable,
      'scripts/setup-river-city-affiliate-source.ts',
      '--scrape',
    ]]);
  });
});
