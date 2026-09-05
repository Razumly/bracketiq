import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium, request } from '@playwright/test';
import pg from 'pg';
import jwt from 'jsonwebtoken';

// This check uses local fixtures. It does not send provider email.
const baseURL = process.env.E2E_BASE_URL;
const databaseURL = process.env.DATABASE_URL;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname));
assert.equal(new URL(databaseURL).hostname, '127.0.0.1');
assert.match(new URL(databaseURL).pathname, /_test$/);
assert.equal(process.env.MVP_TEST_DISABLE_OUTBOUND_PROVIDERS, '1');
const pool = new pg.Pool({ connectionString: databaseURL });
const api = await request.newContext({ baseURL, timeout: 120_000 });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
let guardianId;
try {
  const login = await api.post('/api/auth/login', { data: { email: 'host@example.com', password: 'password123!' } });
  assert.equal(login.status(), 200);
  guardianId = (await login.json()).user.id;
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    const teamId = `guardian-check-${crypto.randomUUID()}`;
    const created = await api.post('/api/teams', { data: { id: teamId, name: 'River Club', teamSize: 6 } });
    assert.equal(created.status(), 201, await created.text());
    const invitation = await api.post(`/api/teams/${teamId}/member-invites`, { data: {
      firstName: 'Casey', lastName: 'River', isMinor: true, dateOfBirth: '2015-01-01',
      guardianEmail: 'host@example.com', shareOnly: true,
    } });
    assert.equal(invitation.status(), 201, await invitation.text());
    const invite = await invitation.json();
    const claimURL = new URL(invite.claimUrl);
    const returnTo = claimURL.pathname + claimURL.search;
    // Compile the dev API before the browser starts its shorter request timeout.
    const preview = await api.get(`/api/public/profile-claims/${encodeURIComponent(invite.invite.id)}${claimURL.search}`);
    assert.equal(preview.status(), 200, await preview.text());
    await pool.query('UPDATE "AuthUser" SET "emailVerifiedAt" = NULL WHERE id = $1', [guardianId]);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(error.message));
    page.setDefaultTimeout(60_000);
    await page.goto(baseURL + returnTo, { timeout: 120_000 });
    try {
      await page.getByRole('button', { name: 'Sign in as guardian', exact: true }).click();
    } catch (error) {
      await page.screenshot({ path: 'test-results/guardian-entry-failure.png', fullPage: true });
      console.error((await page.locator('body').innerText()).slice(0, 1500));
      throw error;
    }
    await page.locator('#email').fill('host@example.com');
    await page.locator('#password').fill('password123!');
    const loginRequest = page.waitForRequest((req) => req.url().endsWith('/api/auth/login') && req.method() === 'POST');
    await page.locator('button[type="submit"]').click();
    assert.equal((await loginRequest).postDataJSON().returnTo, returnTo);
    await page.locator('p').filter({ hasText: /^Please verify your email before signing in\.$/ }).waitFor();
    // The signed-token round trip has a separate email-boundary test.
    const token = jwt.sign({ type: 'initial_email_verification', userId: guardianId,
      email: 'host@example.com', returnTo }, process.env.AUTH_SECRET, { expiresIn: 1800 });
    await page.goto(`${baseURL}/api/auth/verify/confirm?token=${encodeURIComponent(token)}`);
    assert.equal(new URL(page.url()).searchParams.get('next'), returnTo);
    await page.locator('#email').fill('host@example.com');
    await page.locator('#password').fill('password123!');
    await page.locator('button[type="submit"]').click();
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
    await page.getByRole('heading', { name: 'Accept for your child' }).waitFor();
    await page.getByLabel(/I am this child’s parent or legal guardian/).check();
    await page.getByLabel('I accept this team invitation for Casey River.').check();
    await page.getByRole('button', { name: 'Accept team invitation', exact: true }).click();
    await page.getByRole('heading', { name: 'Invitation accepted' }).waitFor();
    const state = await pool.query('SELECT status, "declarationVersion" FROM "ParentChildLinks" WHERE "parentId" = $1 AND "childId" = $2', [guardianId, invite.invite.userId]);
    assert.equal(state.rows[0]?.status, 'ACTIVE');
    assert.equal(state.rows[0]?.declarationVersion, 1);
    assert.notEqual(invite.invite.userId, guardianId);
    const acceptedInvite = await pool.query('SELECT status FROM "Invites" WHERE id = $1', [invite.invite.id]);
    assert.equal(acceptedInvite.rows[0]?.status, 'ACCEPTED');
    await page.screenshot({ path: `test-results/guardian-accepted-${width}.png`, fullPage: true });
    await context.close();
    console.log(`PASS guardian authentication, verification, and acceptance at ${width}px`);
  }
} finally {
  if (guardianId) await pool.query('UPDATE "AuthUser" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE id = $1', [guardianId]);
  await browser.close();
  await api.dispose();
  await pool.end();
}
