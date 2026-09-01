# BracketIQ repository rules

## ASD-STE100 Simplified Technical English

- Use ASD-STE100 Simplified Technical English for agent-authored plans, documentation, reports, instructions, code comments, and completion notes.
- Use short sentences and active voice.
- Use one action per instruction.
- Use one consistent term for each concept.
- Do not rewrite user-provided copy, quotations, legal text, product names, API names, or code identifiers only to conform to this standard.

## Repository layout

- `apps/site` contains the Next.js web application, API routes, Prisma schema, and production deployment files.
- `apps/mobile` contains the Kotlin Multiplatform, Android, iOS, Wear OS, and watchOS applications.
- `docs`, `plans`, `CONTEXT.md`, and `PLANS.md` describe the shared BracketIQ product.
- `.github/workflows` contains all repository automation.
- Keep the npm and Gradle build graphs separate. Do not add a root npm workspace or move the Gradle root above `apps/mobile`.

## Sources of truth

- `apps/site` is the source of truth for backend behavior, database definitions, API paths, and request and response contracts.
- The backend HTTP interface is the seam between the applications.
- Treat the current site and mobile code as the supported HTTP contract. Use a clean cutover when that contract changes.
- Do not import server TypeScript or Prisma types into the mobile application.
- Room is the mobile application's local source of truth for fetched API data.
- Write remote results to Room before UI code observes them, unless a transient flow is explicitly documented.

## Batch and atomic operations

- Use batch APIs for collection reads. Do not issue one request per item when a batch endpoint can serve the data.
- Use one server transaction for a save that changes related records.
- Roll back the complete save when one write fails.
- Update the backend route and the mobile caller together when a contract changes.

## Application rules

- Read `apps/site/AGENTS.md` before site, backend, database, or deployment work.
- Read `apps/mobile/AGENTS.md` before Kotlin, Android, iOS, Wear OS, or watchOS work.
- Run site commands from `apps/site`.
- Run Gradle and CocoaPods commands from `apps/mobile` or `apps/mobile/iosApp` as documented.
- Use `MVP_SITE_DIR` only to override the default in-repository backend path.

## ExecPlans

Use an ExecPlan for complex features and significant refactors. Follow `PLANS.md`. Store every new ExecPlan under `plans/`.

## Operational process control

- Do not start, stop, restart, enable, disable, deploy, or reconfigure a runtime unless the user explicitly requests that exact state change.
- Inspection, debugging, status checks, database access, and log review do not authorize a runtime state change.
- Limit an authorized operation to the named runtime.
## Production VPS access

- Use the SSH alias `bracketiq-prod` for the production VPS.
- The alias resolves to `15.204.81.193` and user `bracketiq`.
- The alias selects `~/.ssh/id_ed25519_bracketiq_prod` with `IdentitiesOnly yes`.
- Keep the private key outside the repository and never expose its contents.
- Use `ssh bracketiq-prod` for inspection, debugging, status checks, and log review.
- Do not add a public PostgreSQL port. Production PostgreSQL uses the private Docker network.


## GitHub and release boundaries

- Use `https://github.com/Razumly/bracketiq.git` as the canonical HTTPS remote after cutover.
- Keep site and mobile releases independent.
- Prefix future site release tags with `site-`.
- Prefix future mobile release tags with `mobile-`.
- Do not publish a production image or deploy production without separate current authorization.

## Agent skills

### Issue tracker and workstream execution

Issues are tracked in GitHub Issues for `Razumly/bracketiq`. See `docs/agents/issue-tracker.md`.
Concurrent issue work uses Workstreams and isolated issue branches. Read `docs/agents/workstream-execution.md` before claim, implementation, or integration.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single product context in root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
