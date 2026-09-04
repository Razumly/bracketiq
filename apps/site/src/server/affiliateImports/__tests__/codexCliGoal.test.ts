/** @jest-environment node */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';

it('fails closed with the governed retirement message and exit 78', () => {
  const siteRoot = path.resolve(__dirname, '../../../../');
  const result = spawnSync(
    path.join(siteRoot, 'node_modules/.bin/tsx'),
    [path.join(__dirname, '..', 'codexCliGoal.ts')],
    { cwd: siteRoot, encoding: 'utf8' },
  );

  expect(result.status).toBe(78);
  expect(result.stderr.trim()).toBe(RETIREMENT_MESSAGE);
  expect(result.stdout).toBe('');
});
