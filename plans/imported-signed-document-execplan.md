# Add immutable document requirements and imported signed-document evidence

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md`.

## Purpose / Big Picture

Organizations need to attach externally completed signed PDFs to existing BracketIQ customers. The customer must not sign the same document again. After the complete feature is delivered, authorized Organization staff can select a User customer, select the exact Document Template Version and scope, preview a PDF, attest to its completeness, and store it as private Imported Signed Document evidence. The import creates Document Requirement Satisfaction for only that Document Subject and scope. The customer and eligible guardian can view the evidence, while private migration notes and audit details remain restricted.

This plan starts with the data expansion required for that behavior. The first milestone gives existing TemplateDocuments rows a stable Document Requirement lineage and Version sequence without changing current signing, assignment, or customer behavior. Later milestones migrate completion readers to Document Requirement Satisfaction and add the import workflow. The visible proof for the first milestone is a successful schema migration that preserves every existing template and assignment, plus the existing template API tests and type checks passing.

## Progress

- [x] (2026-08-21T00:55Z) Read the parent specification in issue #97 and the first implementation ticket in issue #98.
- [x] (2026-08-21T00:55Z) Selected `Contract guard and cleanup` as the Workstream and claimed issue #98.
- [x] (2026-08-21T00:55Z) Confirmed the current repository has unrelated uncommitted customer billing and document changes. Those changes must remain untouched.
- [x] (2026-08-21T00:55Z) Chose existing `TemplateDocuments.id` as the immutable Document Template Version identity, with a new Document Requirement lineage and automatic `versionSequence`.
- [x] Add the `DocumentRequirements` model and Version expansion fields to the Prisma schema.
- [x] Add the idempotent migration that creates one Requirement and Version 1 lineage for every existing template.
- [x] Update new TEXT and BoldSign-projected template creation to create or preserve a Requirement lineage.
- [x] Add migration and template-contract test coverage.
- [x] Validate the schema, generated client, focused tests, and site checks.
- [x] Run the two-axis code review against the pre-issue base and address findings.
- [x] Commit the issue #98 implementation and publish the issue outcome.
- [ ] (2026-08-21T17:20Z) Implement the review handoff for immutable Versions, evidence provenance, Satisfaction, ownership, atomicity, and cross-cutting cleanup.
- [ ] (2026-08-21T17:20Z) Run focused tests, type checks, the full site suite, and a two-axis review against `main`.
- [ ] (2026-08-21T17:20Z) Commit the review remediation and integrate the workstream into `main`.

## Surprises & Discoveries

- Observation: `TemplateDocuments.id` is already the identifier stored in `Events.requiredTemplateIds`, `CanonicalTeams.requiredTemplateIds`, and time-slot requirement arrays. The `templateId` column is the optional BoldSign provider identifier and is not the application requirement identifier.
  Evidence: `apps/site/prisma/schema.prisma` stores both fields; template assignment routes query `TemplateDocuments.id`; the BoldSign route uses `templateId` for provider operations.

- Observation: Local TEXT templates are created directly in the Organization template route, while PDF templates are created later by the BoldSign webhook projection.
  Evidence: `apps/site/src/app/api/organizations/[id]/templates/route.ts` creates TEXT rows immediately; `apps/site/src/lib/boldsignWebhookSync.ts` creates PDF projection rows from the pending operation.

- Observation: The current working tree contains unrelated uncommitted changes on `main`.
  Evidence: `git status --short --branch` showed changes to customer billing and document routes plus a team invite migration. This implementation must stage only its own files.

- Observation: The BracketIQ project has a required Workstream field, but the published ticket did not have one until this implementation claimed it.
  Evidence: issue #98 was assigned to `Contract guard and cleanup` before its project status was changed to In progress.

## Decision Log

- Decision: Use one new `DocumentRequirements` row as the stable lineage and keep each existing `TemplateDocuments` row as a Document Template Version.
  Rationale: Existing assignment arrays already store `TemplateDocuments.id`. Keeping that identifier avoids rewriting Event, Team, time-slot, rental, and signing contracts. A separate lineage row supports later versions without treating a mutable template row as the requirement itself.
  Date/Author: 2026-08-21 / Codex

- Decision: Use `TemplateDocuments.versionSequence` as the automatic human-readable sequence and the compound uniqueness key `(documentRequirementId, versionSequence)`.
  Rationale: The existing row ID remains the immutable Version identity. The sequence makes later versions ordered within one Requirement and gives the database a clear uniqueness invariant.
  Date/Author: 2026-08-21 / Codex

- Decision: Add `frozenAt` in the expansion even though this ticket does not enforce freezing.
  Rationale: The next ticket needs durable state for a Version that has become immutable. Adding the nullable state during expansion avoids a second incompatible model change. This ticket leaves it null for existing rows; the enforcement ticket will set it when a Requirement assignment or signed evidence first references the Version.
  Date/Author: 2026-08-21 / Codex

- Decision: Make the Version lineage reference non-null after the migration and update both creation paths in this ticket.
  Rationale: Every existing and newly created template must have a Requirement lineage. A nullable field would permit new versions that cannot participate in the identity or uniqueness contract. The route and webhook changes preserve their current response and provider behavior while supplying the new storage fields.
  Date/Author: 2026-08-21 / Codex

- Decision: Seed Requirement display fields from the existing template row and keep the existing Version display fields unchanged.
  Rationale: Existing customer and template displays must not change during expansion. The Requirement owns future display metadata; the Version retains the historical title, description, signer configuration, and content that the existing row represented.
  Date/Author: 2026-08-21 / Codex

- Decision: Use deterministic Requirement IDs in the migration and operation-carried UUIDs for new PDF projections.
  Rationale: A deterministic migration ID makes the data mapping auditable and retry-safe. A PDF operation already has a durable JSON payload, so carrying a generated Requirement ID through the asynchronous BoldSign projection keeps the Requirement stable across webhook retries.
  Date/Author: 2026-08-21 / Codex

## Outcomes & Retrospective

Issue #98 delivered the additive Requirement and immutable Version storage contract. Existing template IDs, assignment arrays, signing behavior, and provider identifiers remain unchanged. Schema validation, generated-client validation, migration fixture coverage, focused route tests, and the site checks passed. Later issues now consume this lineage for Version enforcement and document evidence.


## Context and Orientation

BracketIQ is a Next.js application in `apps/site` with a Prisma schema in `apps/site/prisma/schema.prisma`. The schema uses string IDs and mostly stores cross-model IDs without Prisma relation declarations. `TemplateDocuments` stores one application document template row. Its `id` is the application identity currently stored in requirement arrays. Its nullable `templateId` is the BoldSign provider template ID. Its `type` distinguishes PDF and TEXT templates. Its `requiredSignerType`, `signOnce`, signer role arrays, and content describe the current template behavior.

A Document Requirement is the stable Organization-owned obligation. It keeps its identity while material content or signing configuration changes. A Document Template Version is one immutable version of that obligation. For this expansion, the existing `TemplateDocuments.id` is the Version identity. `versionSequence` orders versions inside a Requirement. A Document Requirement Assignment is any Event, Team, time-slot, rental, or future compliance record that stores a Version ID. Existing assignments must continue to store the same IDs.

The Organization template route is `apps/site/src/app/api/organizations/[id]/templates/route.ts`. It creates TEXT rows and starts the BoldSign embedded-template operation for PDF rows. The asynchronous PDF projection is in `apps/site/src/lib/boldsignWebhookSync.ts`, in `createOrUpdateTemplateProjectionFromOperation`. Current template deletion and assignment code still uses `TemplateDocuments.id`; this ticket does not change that behavior.

The Prisma client is generated under `apps/site/src/generated/prisma`. Run generation from `apps/site` after schema changes. Generated files are repository artifacts and must be updated by the project command, not hand-edited.

The parent feature later adds explicit evidence provenance, Document Subject identity, Document Requirement Satisfaction, private imported files, Event Participation scope, voiding, audit access, and notifications. Those changes are not implemented in issue #98. This plan records the later milestones so the first schema expansion does not conflict with them.

## Plan of Work

First add `DocumentRequirements` to the Prisma schema. The model stores its ID, timestamps, Organization owner, display title and description, creator, and status. Add `documentRequirementId`, `versionSequence`, and `frozenAt` to `TemplateDocuments`. Add an index on the lineage ID and a compound unique constraint on lineage plus sequence. Keep the existing fields and names unchanged.

Next add one migration after the current latest migration. The migration creates `DocumentRequirements`, adds the Version fields to `TemplateDocuments`, inserts one Requirement for each existing template, assigns that Requirement to the template as Version 1, creates the lineage index and uniqueness index, and then makes the lineage ID required. The migration must preserve all existing template columns and all assignment arrays. Use deterministic IDs based on the existing template ID so the data mapping is explicit and safe to retry in a repaired database.

Then update the local TEXT creation path. Generate a Requirement ID once, create the Requirement and Version 1 row in one Prisma transaction, and return the same template response as before with the additional persisted fields. Do not change title validation, permissions, type handling, or response status.

Update the PDF operation payload to carry a Requirement ID. In the BoldSign webhook projection, ensure the Requirement exists before creating a new Version 1 projection. On retries, reuse the existing Requirement and existing template projection. For older pending operations that have no Requirement ID, derive a new stable ID from the projected template ID and create the Requirement from the available operation metadata. Existing projection updates must preserve the existing lineage and sequence instead of creating a second Version.

Add focused tests at the public storage and route seams. The migration test should exercise the migration mapping through a test database or a deterministic migration fixture that proves an existing PDF and TEXT row keeps its ID, Organization, display fields, signing fields, provider ID, content, and assignment reference while gaining one Requirement and Version 1. The template route tests should prove a new TEXT template has a Requirement lineage and Version 1. The BoldSign projection tests should prove a new PDF projection creates one Requirement and retries reuse it. Do not add tests that only assert schema text or generated type shape.

Finally validate the new schema and generated client, run the focused tests, run the full site suite once, review the diff against the pre-issue base, and commit only issue #98 files. Leave unrelated working-tree changes unstaged and unmodified.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/bracketiq/apps/site` unless a command names the repository root.

1. Update `prisma/schema.prisma`, create the next migration directory under `prisma/migrations`, and add the new ADR under `docs/adr` plus this plan under `plans`.

2. Generate the Prisma client and validate the schema:

    npm run prisma:validate
    npm run prisma:generate

3. Run the focused template and migration tests:

    npx jest --runInBand src/app/api/organizations/__tests__/customerDocumentRoute.test.ts src/app/api/organizations/__tests__/organizationUsersRoute.test.ts

    Replace or extend the selection with the new issue #98 tests. Expect all selected tests to pass.

4. Run the site type check:

    npx tsc --noEmit

5. If a Postgres test database is available, prepare the issue database using the Workstream test database rules, run `npm run migrate:deploy`, verify `npx prisma migrate status` reports no pending migrations, and run the migration integration test. Do not reset or alter a shared development database.

6. Run the complete site suite once after focused checks are green:

    npm test -- --runInBand

7. Run the issue review against the pre-issue base and address findings. The review must check both repository standards and issue #98 acceptance criteria.

8. Stage only the files belonging to issue #98. Verify the staged file list before committing. Commit with a message that names the Version storage expansion.

## Validation and Acceptance

The schema validator must report that `apps/site/prisma/schema.prisma` is valid. Prisma generation must finish without errors and the generated client must expose `documentRequirements`, `documentRequirementId`, `versionSequence`, and `frozenAt`.

A migration validation must show that an existing template keeps its original `TemplateDocuments.id`, Organization owner, title, description, type, sign-once setting, signer configuration, content, provider `templateId`, and status. It must show one `DocumentRequirements` row for that template, `versionSequence = 1`, and the same template ID still present in its Event, Team, or time-slot assignment array.

The TEXT template route must still return HTTP 201 and the created template. The created row must have one Organization-owned Requirement and Version 1. The PDF route must still return HTTP 202 with the existing BoldSign operation response. A successful projection must create one PDF Version 1 row; a repeated projection must update that row and must not create another Requirement or Version.

Existing template listing, signing, assignment selection, and document dispatch tests must pass without response or behavior changes. Typechecking and the full Jest suite must pass. The browser is not required for this storage-only issue because no customer-visible interaction changes; the later import ticket owns the full browser smoke.

## Idempotence and Recovery

The migration is applied once by Prisma. Its backfill uses deterministic Requirement IDs and only reads existing template rows, so a failed deployment can be repaired and retried without changing template IDs or assignment arrays. Do not run a destructive database reset. If the local database has unrelated migration drift, use a dedicated issue database or validate the SQL against a disposable database built from the current migration history.

The TEXT route creates the Requirement and Version in one transaction. If the transaction fails, neither row is visible. The PDF route carries the Requirement ID in the durable operation payload. If a webhook retry runs after a projection exists, it updates that projection and preserves its lineage. If an older operation has no carried ID, the fallback derived from the provider template ID is stable for that projection.

If generated Prisma artifacts include unrelated changes, restore only the generated files changed by this schema update and do not touch the user's existing uncommitted application changes. Before committing, stage files explicitly rather than using `git add -A`.

## Artifacts and Notes

The issue-specific artifacts are:

- `plans/imported-signed-document-execplan.md`, this living plan for the parent feature and issue #98 milestone.
- `docs/adr/0012-immutable-document-template-versions-and-satisfaction.md`, the architecture decision record for Version identity, pinned assignments, and the later Satisfaction source.
- `apps/site/prisma/schema.prisma`, the expanded storage contract.
- The next migration under `apps/site/prisma/migrations`, including the existing-template backfill.
- Focused route, projection, and migration tests.

Keep the migration SQL and test output concise in the final issue comment. Record any database drift or provider projection limitation in `Surprises & Discoveries` before changing the plan.

## Interfaces and Dependencies

The storage contract after this milestone is:

    DocumentRequirements {
      id: String
      createdAt: DateTime?
      updatedAt: DateTime?
      organizationId: String
      title: String
      description: String?
      createdBy: String?
      status: String?
    }

    TemplateDocuments {
      id: String
      documentRequirementId: String
      versionSequence: Int
      frozenAt: DateTime?
      ...existing template fields...
    }

`TemplateDocuments.id` remains the value stored in current assignment arrays. `templateId` remains the optional BoldSign provider ID. The compound uniqueness rule is `(documentRequirementId, versionSequence)`. The current route response remains backward compatible; it may include the new persisted fields because Prisma serializes the created row.

The next immutable-Version issue will read `frozenAt` and the assignment/evidence references before material updates. The evidence expansion will reference `TemplateDocuments.id` as the Version ID and `DocumentRequirements.id` as the lineage ID. Later routes must validate that both records share the same Organization before accepting a document, assignment, or Satisfaction.

## Later Parent Milestones

The remaining parent feature follows this order:

1. Enforce frozen Version writes while keeping existing assignments pinned.
2. Add evidence provenance, Document Subject identity, audit fields, and Document Requirement Satisfaction storage.
3. Project existing BoldSign and BracketIQ text completions into Satisfaction.
4. Move Event and child compliance to Satisfaction.
5. Move Team and remaining compliance to Satisfaction, then remove direct signed-document inference.
6. Add Organization-scoped imported PDF flow with private storage, attestation, duplicate protection, and local file access.
7. Add Event Participation imports for direct and Team-based participation.
8. Add subject and guardian access, Imported presentation, voiding, restricted audit access, and transactional notifications.

Each later milestone must keep the backend HTTP interface compatible with installed mobile clients and must not create Team customers as Document Subjects.

## Change Note

2026-08-21T00:55Z: Created this plan while starting issue #98. The plan records the existing dual template/provider identity, the chosen Requirement/Version storage shape, the required creation-path updates, and the full parent-feature sequence so later tickets can consume the same domain model without adding a second lineage.

2026-08-21: Updated the progress and outcome records after completing issue #98 and carrying the lineage into the later immutable-Version and evidence work. The current workstream also records the service-seam and review corrections made after the two-axis review.


## Downstream review handoff

Review scope: `main...workstream/document-versions` through `0e0d3b097`, covering issue #99 and issue #100. This section records the remediation now in progress. Each item remains traceable to a focused test or a documented cross-cutting correction.

### Issue #99: immutable Version enforcement

- [ ] Add persistence-backed proof that an assigned or used Version remains frozen after reload and remains pinned when a later Version is created.
- [ ] Extend the migration fixture to exercise the `030000` trigger and backfill path.
- [ ] Add a real rejected material update for frozen PDF and TEXT Versions.
- [ ] Prevent an existing BoldSign provider edit session or provider template ID from mutating frozen content.
- [ ] Keep Requirement display metadata edits separate from frozen Version content and signing configuration.

### Issue #100: evidence provenance and Satisfaction

- [ ] Expand no-loss migration coverage to preserve document name, timestamps, status, signing time, signer details, role fields, IP and request identifiers, provider identifiers, content, and Event or Team context.
- [ ] Preserve incomplete multi-signer evidence as incomplete. Do not mark Satisfaction complete until every required signer role is present.
- [ ] Keep an unknown structured Signer unknown. Do not infer a Signer from the Document Subject.
- [ ] Validate every referenced User, Event or Team scope, and File against the Organization before writing imported evidence.
- [ ] Do not skip existing evidence with a missing Organization when the accepted completion path can still use it. Define and test the ownership repair or rejection path.
- [ ] Keep evidence, Subject, and Satisfaction writes atomic. A later failure must roll back earlier signer or evidence writes.

### Cross-cutting review corrections

- [ ] Make the customer-page Version state fail explicitly when Version data is missing. Do not invent Version numbers or placeholder notifications.
- [ ] Replace new cross-boundary row mappings with typed row interfaces. Use `is*` or `has*` names for new Boolean fields.
- [ ] Remove duplicated evidence context and scope logic. Remove provider edit-url middle-man helpers when the real target can be called directly.
- [ ] Keep unrelated customer-billing label changes outside the Version and evidence work.

2026-08-21T17:20Z: Started the review remediation in the existing clean document workstream. The source branch is an ancestor of `main` plus the reviewed implementation; the remediation will remain isolated until final checks pass.
### 2026-08-21 two-axis review findings

Review target: local `main` at `445b9d3dc`, compared with `4705ea6df`. The review found the following open items. Do not close the related issue until each item has a focused fix and proof.

#### Standards

- [ ] Fix the billing permission bypass in `apps/site/src/app/api/organizations/[id]/bills/route.ts`. Await both permission checks. Keep this unrelated billing workflow outside this Workstream.
- [ ] Preserve the installed mobile template-list contract in `apps/site/src/app/api/organizations/[id]/templates/route.ts`.
- [ ] Move customer billing and document HTTP calls from `apps/site/src/app/organizations/[id]/page.tsx` into service modules.
- [ ] Rename new Boolean state fields to use the repository `is*` or `has*` convention.
- [ ] Consolidate repeated pending evidence writes across event, rental, team, guest, and customer routes.

#### Specification

- [ ] #99: Prevent an existing BoldSign edit session or provider template ID from changing frozen content. Add a rejection or quarantine path and a regression test.
- [ ] #100: Repair uniquely owned ownerless evidence before Satisfaction backfill. Reject only ambiguous rows. Add fixture coverage.
- [ ] #100/#101: Track every contributing evidence row or recompute Satisfaction when a later combined-signer row is voided.
- [ ] #101: Derive required signer roles for guest TEXT and imported completion paths. Add combined-signer tests.
- [ ] #101: Invalidate active Satisfaction after terminal BoldSign failures. Add replay and failure tests.
- [ ] Scope: Move the customer-billing workflow to a separate change.

The issue comments for #97, #99, #100, and #101 record this review. The existing unchecked remediation items above remain the execution checklist.