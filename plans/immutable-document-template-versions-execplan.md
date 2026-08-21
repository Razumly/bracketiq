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
- [x] Delete Organization Requirements with Organization-owned templates during admin Organization deletion.
- [x] Add a focused TEXT creation contract test.
- [x] Run Prisma migration validation against an isolated database.
- [x] Run focused tests and the full site test suite.
- [ ] Review the final diff and commit the completed implementation.

## Design

### Storage

`DocumentRequirements` stores the stable Organization-owned obligation: `id`, timestamps, Organization ownership, display title, description, creator, and status.

`TemplateDocuments` remains the Version record for compatibility. It gains:

- `documentRequirementId`, required after migration.
- `versionSequence`, defaulting to `1`.
- `frozenAt`, reserved for the immutability enforcement milestone.

The database enforces unique `(documentRequirementId, versionSequence)` and indexes the lineage ID and Organization ownership.

### Migration

Create `DocumentRequirements` first. Add the Version columns as a nullable lineage ID plus a default Version sequence. Insert one deterministic Requirement ID, `document-requirement:<template-document-id>`, for every existing template. Copy the template Organization, title, description, creator, status, and timestamps. Assign the deterministic Requirement ID to the existing template. Then make the lineage ID required and add the index and compound unique index.

The migration preserves every existing template ID, provider template ID, content, signer configuration, assignment array, and Organization ID.

### Creation paths

TEXT creation generates a Requirement ID and Version ID, then creates both rows in one Prisma transaction. PDF creation generates both IDs before starting the BoldSign operation and includes the Requirement ID in the durable operation payload. The webhook projection reads that ID. For old pending operations without the field, it uses `document-requirement:boldsign:<boldsign-template-id>` as a deterministic retry fallback.

The webhook upsert and Version projection run in one Prisma transaction. A projected existing Version keeps its existing lineage ID. A new Version receives sequence `1`. The projection does not rewrite Event, Team, time-slot, or rental assignment arrays.

### Non-goals

- Do not enforce `frozenAt` in this milestone.
- Do not create Version 2 or rewrite existing assignments.
- Do not infer or migrate Document Requirement Satisfaction.
- Do not import server types into mobile code.
- Do not change BoldSign signing behavior.

## Testing Decisions

- The template route test must prove the observable transaction contract: one Requirement row, one Version row, matching lineage IDs, Organization ownership, and Version 1.
- Prisma schema validation and generated-client typechecking must run after the schema change.
- Migration checks must use the repository test database preparation sequence from `apps/site/AGENTS.md` when database credentials are available.
- Focused tests must run before the full site suite.

## Surprises & Discoveries

- Existing assignments store `TemplateDocuments.id` directly in several raw ID arrays. Reusing the existing row as Version 1 avoids a broad assignment rewrite.
- PDF template creation is asynchronous. The operation payload is the only durable seam that can carry a newly generated Requirement ID to the webhook projection.
- Existing BoldSign operation payloads do not contain a Requirement ID. The deterministic provider-template fallback preserves retry compatibility.

## Decision Log

- 2026-08-21: Use one new Requirement row per existing template and keep the existing template row as Version 1.
- 2026-08-21: Use `TemplateDocuments.id` as the immutable Version identity because installed assignment records already store it.
- 2026-08-21: Carry a generated Requirement ID in PDF operation payloads and use a provider-template fallback for old operations.
- 2026-08-21: Defer Version freeze enforcement and shared Satisfaction projection to later issue slices.

## Outcomes & Retrospective

The Prisma schema check, generated-client check, isolated migration deployment, and migration fixture passed. The focused template, webhook, and Organization deletion contracts passed: 10 tests in 3 suites. The full `npm run test:ci` run completed 854 passing suites and 5,008 passing tests, with one failure in `test/ciConfiguration.test.ts` because `.github/workflows/site-ci.yml` does not contain the test command that the test requires. This milestone did not change the workflow file.

The final diff review passed. Commit `74ae8cce5` contains this implementation. Unrelated pre-existing work remains unstaged in the working tree.
