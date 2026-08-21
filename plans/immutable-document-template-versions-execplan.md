# Expand Document Requirement and Version storage

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md`.

## Purpose / Big Picture

BracketIQ must keep a stable Organization document obligation while allowing later immutable template revisions. Existing `TemplateDocuments.id` values are stored in Event, Team, time-slot, rental, and signing records. This change adds a `DocumentRequirements` lineage row and makes every existing or new template row Version 1 without changing those stored IDs or current signing behavior.

The first milestone delivers schema storage, a data migration, and creation-path compatibility. It does not enforce Version immutability or add Document Requirement Satisfaction. Those are later milestones in the parent issue sequence.

## Progress

- [x] Read repository rules, issue #98, current schema, template creation, webhook projection, assignment consumers, and test conventions.
- [x] Record the lineage and completion decisions in `docs/adr/0012-immutable-document-template-versions-and-satisfaction.md`.
- [x] Add `DocumentRequirements` and Version fields to `TemplateDocuments`.
- [x] Add a migration that creates one Requirement and Version 1 for each existing template.
- [x] Create TEXT Requirements and Version 1 rows in one transaction.
- [x] Carry the Requirement ID through PDF BoldSign template operations.
- [x] Make PDF webhook projection create or reuse the Requirement and Version 1.
- [x] Enforce Organization ownership with foreign keys for Requirements and Versions.
- [x] Allocate Version sequences in one transaction while locking the parent Requirement.
- [x] Delete Organization Versions before Requirements during admin Organization deletion.
- [x] Add a committed PDF and TEXT migration preservation fixture.
- [x] Add focused route, sequence, webhook projection, and Organization deletion contract tests.
- [x] Run Prisma validation, generated-client checks, and focused tests.
- [x] Review the final diff and record the remaining commit step.
- [ ] Commit the completed implementation.

## Design

### Storage

`DocumentRequirements` stores the stable Organization-owned obligation: `id`, timestamps, Organization ownership, display title, description, creator, and status. The schema links the row to `Organizations`.

`TemplateDocuments` remains the Version record for compatibility. It gains:

- `documentRequirementId`, required after migration.
- `versionSequence`, required on every write.
- `frozenAt`, reserved for the immutability enforcement milestone.

The database enforces Organization ownership for both tables. A Version stores both the Requirement ID and Organization ID in its foreign key. The composite foreign key rejects a Version that points to a Requirement owned by another Organization. The database also enforces unique `(documentRequirementId, versionSequence)` and indexes the lineage ID and Organization ownership.

Version creation uses `src/server/documents/documentTemplateVersions.ts`. The transaction locks the parent Requirement row with `FOR UPDATE`, reads the current highest sequence, and writes the next sequence. The database default was removed so callers cannot omit allocation.

### Migration

Create `DocumentRequirements` first. Add the Version columns as a nullable lineage ID plus a temporary Version sequence default. Insert one deterministic Requirement ID, `document-requirement:<template-document-id>`, for every existing template. Copy the template Organization, title, description, creator, status, and timestamps. Assign the deterministic Requirement ID to the existing template. Then make the lineage ID required and add the index and compound unique index.

The follow-up ownership migration adds the Organization foreign keys, the composite Requirement ownership key, and the Version sequence default removal. It preserves every existing template ID, provider template ID, content, signer configuration, assignment array, and Organization ID.

### Creation paths

TEXT creation uses the shared version storage module. It creates the Requirement and Version in one Prisma transaction and allocates Version 1. PDF creation generates both IDs before starting the BoldSign operation and includes the Requirement ID in the durable operation payload. The webhook projection reads that ID and uses the same sequence allocator. For old pending operations without the field, it uses `document-requirement:boldsign:<boldsign-template-id>` as a deterministic retry fallback.

The webhook upsert and Version projection run in one Prisma transaction. A projected existing Version keeps its existing lineage ID. A new Version receives the next sequence. The projection does not rewrite Event, Team, time-slot, or rental assignment arrays.

### Non-goals

- Do not enforce `frozenAt` in this milestone.
- Do not create Version 2 or rewrite existing assignments.
- Do not infer or migrate Document Requirement Satisfaction.
- Do not import server types into mobile code.
- Do not change BoldSign signing behavior.

## Testing Decisions

- The template route test uses a separate transaction client mock. It proves that Requirement and Version writes run inside the transaction and share one lineage ID.
- The sequence storage test proves Version 1 and the next sequence are persisted for one Requirement and rejects cross-Organization input.
- The webhook projection test calls the normalized application seam. It does not build a BoldSign provider payload.
- `apps/site/scripts/test-document-requirement-version-migration.mjs` applies both document migrations to a disposable loopback PostgreSQL schema. It proves PDF and TEXT preservation, assignment-array preservation, Version 1 lineage, ownership constraints, unique sequences, and the removed database default.
- Run the fixture from `apps/site` with `DOCUMENT_VERSION_MIGRATION_TEST_DATABASE_URL` set to a disposable local PostgreSQL URL.
- Prisma schema validation and generated-client typechecking must run after the schema change.
- Focused tests must run before the full site suite.

## Surprises & Discoveries

- Existing assignments store `TemplateDocuments.id` directly in several raw ID arrays. Reusing the existing row as Version 1 avoids a broad assignment rewrite.
- PDF template creation is asynchronous. The operation payload is the only durable seam that can carry a newly generated Requirement ID to the webhook projection.
- Existing BoldSign operation payloads do not contain a Requirement ID. The deterministic provider-template fallback preserves retry compatibility.
- Prisma 7 requires the migration-diff command to use `--to-schema`, and a migrations-directory diff also requires a configured shadow database. The committed migration fixture provides the isolated SQL validation for this change.

## Decision Log

- 2026-08-21: Use one new Requirement row per existing template and keep the existing template row as Version 1.
- 2026-08-21: Use `TemplateDocuments.id` as the immutable Version identity because installed assignment records already store it.
- 2026-08-21: Carry a generated Requirement ID in PDF operation payloads and use a provider-template fallback for old operations.
- 2026-08-21: Enforce Organization ownership with composite foreign keys instead of application-only checks.
- 2026-08-21: Allocate Version sequences while locking the parent Requirement and remove the database sequence default.
- 2026-08-21: Test webhook projection through a normalized application seam instead of a hand-built provider payload.
- 2026-08-21: Defer Version freeze enforcement and shared Satisfaction projection to later issue slices.

## Outcomes & Retrospective

The ownership migration, sequence allocator, migration fixture, normalized webhook projection seam, and transaction-boundary tests are implemented. Prisma validation, generated-client checks, TypeScript checks, the focused route, sequence, webhook, and Organization deletion tests passed. The migration fixture passed against the local disposable PostgreSQL schema. Focused ESLint checks also passed.

The full site suite passed after restoring the missing CI test step: 856 suites and 5,013 tests passed, with 2 suites and 4 tests skipped.

This worktree has no commit for these fixes. The remaining plan item is the commit step.

## Revision note

2026-08-21: Reworked the plan after review. Added relational ownership enforcement, automatic sequence allocation, durable migration evidence, the provider-independent projection test seam, stronger transaction assertions, and corrected the stale outcome record.
