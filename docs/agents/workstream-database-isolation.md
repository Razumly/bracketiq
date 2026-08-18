# Workstream test database isolation

Use this reference for a Workstream issue that needs Prisma-backed tests, E2E seeding, backend-calling mobile tests, or Room persistence tests.

## Postgres server and issue database

- Reuse one authorized local Postgres server.
- Run at most one copy of `apps/site/docker-compose.yml`.
- Allocate one logical Postgres database to each active database-backed issue branch.
- Name the issue database `bracketiq_e2e_<issue>_<worker>`.
- Use only lowercase letters, numbers, and underscores in the database name.
- Scope `DATABASE_URL` to the worker process or worktree.
- Use local test credentials.

The current Compose file has a fixed container name and a shared default port. Parallel copies collide.

Prepare every Postgres database in this reference with the database preparation sequence in [`apps/site/AGENTS.md`](../../apps/site/AGENTS.md#testing--quality-assurance). Set `DATABASE_URL` to that database for each command in the sequence.

Recreate the issue database when migration histories diverge. Drop the issue database after its branch is integrated.

## Mobile persistence tests

Use Postgres for a mobile test only when the test calls the backend. Prefer an in-memory Room database for a mobile persistence test. Otherwise, use a unique Room database name. Delete that Room database after the test.

## Integrated database verification

Create a fresh `bracketiq_e2e_integration` database for a database-backed integration. Build it from the merged `main` migration history. Run the integrated checks against this database.
