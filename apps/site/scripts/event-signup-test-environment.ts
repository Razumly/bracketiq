/** Restrict reusable signup fixtures to the named local slice databases. */
export function requireEventSignupTestDatabase(slice: number): URL {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const allowed = [`/bracketiq_e2e_${slice}_codex`, '/bracketiq_e2e_153_codex'];
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || !allowed.includes(database.pathname)) {
    throw new Error(`Use the isolated issue ${slice} or 153 database.`);
  }
  return database;
}

export function requireEventSignupTestServer(slice: number): URL {
  const database = requireEventSignupTestDatabase(slice);
  const port = database.pathname === '/bracketiq_e2e_153_codex' ? '3153' : String(3000 + slice);
  const base = new URL(process.env.MVP_TEST_BACKEND_URL ?? `http://127.0.0.1:${port}`);
  if (!['localhost', '127.0.0.1'].includes(base.hostname) || base.port !== port) {
    throw new Error(`Use the isolated test server on port ${port}.`);
  }
  return base;
}
