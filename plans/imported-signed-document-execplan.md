# Add immutable document requirements and imported signed-document evidence

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md`.

## Purpose / Big Picture

Organizations need to attach externally completed signed PDFs to existing BracketIQ customers. The customer must not sign the same document again. The delivered feature lets authorized Organization staff select a User customer, select the exact Document Template Version and scope, preview a PDF, attest to its completeness, and store it as private Imported Signed Document evidence. The import creates Document Requirement Satisfaction for only that Document Subject and scope. The customer and eligible guardian can view the evidence, while private migration notes and audit details remain restricted.

The implementation began with the data expansion required for this behavior. The completed milestones preserve TemplateDocuments identity, keep assignments pinned, project completion into Satisfaction, support imported evidence, and quarantine unsafe provider edits. The visible proof is the migration and route test coverage plus the passing site checks recorded below.

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
- [x] (2026-08-22T00:34Z) Implement immutable Version enforcement, evidence provenance, Satisfaction persistence, owner repair, atomic imports, and cross-cutting fixes from the review handoff.
- [x] (2026-08-22T00:34Z) Add contributor role snapshots, roleless completion handling, batch invalidation reads, imported-role migration repair, and frozen-provider operation quarantine.
- [x] (2026-08-22) Run focused document, template, import, signature, provider, and role tests; pass the site type check, Prisma schema validation, migration fixture JavaScript syntax check, and the complete site suite. The document-evidence and Document Requirement/Version migration fixtures passed against loopback PostgreSQL. The durable provider quarantine registry and generated client artifacts are included in the workstream.
- [x] (2026-08-22T02:43Z) Commit the completed document work as `b3be28cc7` and the separate billing authorization correction as `cf8802b87`.
- [x] (2026-08-22) Complete the issue #97 import behavior and issue #99 immutable-Version behavior, including team-snapshot scope resolution and durable provider quarantine.
- [x] (2026-08-22) Complete the final review remediation for Satisfaction-based dispatch, naming, service boundaries, invalidation seams, assignment freezing, and plan accuracy.
- [x] (2026-08-22) Add a post-migration signer-role normalization migration. Keep applied migration checksums unchanged. Run the evidence fixture through the new migration.
- [x] (2026-08-24) Complete issue #108 subject and eligible guardian access for Imported evidence, including customer-safe web and mobile document presentation.
- [x] (2026-08-24) Complete issue #109 Imported evidence voiding with owner and platform-admin defaults, fresh identity proof, private notes, Satisfaction invalidation, and preserved history.
- [x] (2026-08-24) Add transactional in-app document notifications and post-commit push and email delivery for import and void changes.
- [x] (2026-08-24) Add focused web and mobile tests for Imported visibility, private-field filtering, VOID history, Room persistence, card state, and local PDF opening.
- [x] (2026-08-24) Complete issue #110 restricted imported-evidence audit access, customer-safe response filtering, web audit rendering, and mobile contract verification.
- [x] (2026-08-24) Restore the subject-facing profile and notification navigation in the imported-document browser smoke and verify the authorized subject PDF response after the UI action.
- [x] (2026-08-24) Extend the restricted audit route and service response.
- [x] (2026-08-24) Render the authorized audit trail in the Organization customer view.
- [x] (2026-08-24) Remove private import time from customer-facing document responses.
- [x] (2026-08-24) Add server, web, mobile, and browser contract tests for audit access and private-field filtering.
- [x] (2026-08-24) Run typecheck, focused tests, lint, browser smoke, full site and mobile suites, and the two-axis code review.
- [x] (2026-08-24) Re-run typecheck, focused tests, full site suite, full mobile suite, and browser smoke after the final audit actor and subject PDF assertion fixes.
- [x] (2026-08-25) Complete issue #111 customer-safe import and void notifications across in-app, transactional email, optional push, browser links, and mobile document navigation.
- [x] (2026-08-25) Fix Event Participation import validation to inspect the latest subject registration for each EventTeam and reject terminal player registrations.
- [x] (2026-08-25) Update the document import browser test to select a non-sign-once Version, select Event Participation, and assert the PDF preview before attestation.
- [x] (2026-08-25) Update the browser smoke to drive the Version and Event selectors from keyboard focus and assert their selected values.
- [x] (2026-08-25) Run the focused import route tests, site typecheck, Prisma check, migration fixtures, focused mobile document tests, and the full site suite.
- [ ] (2026-08-25) Run the complete document import browser smoke against an authorized site runtime.


## Surprises & Discoveries

- Observation: `TemplateDocuments.id` is already the identifier stored in `Events.requiredTemplateIds`, `CanonicalTeams.requiredTemplateIds`, and time-slot requirement arrays. The `templateId` column is the optional BoldSign provider identifier and is not the application requirement identifier.
  Evidence: `apps/site/prisma/schema.prisma` stores both fields; template assignment routes query `TemplateDocuments.id`; the BoldSign route uses `templateId` for provider operations.

- Observation: Local TEXT templates are created directly in the Organization template route, while PDF templates are created later by the BoldSign webhook projection.
  Evidence: `apps/site/src/app/api/organizations/[id]/templates/route.ts` creates TEXT rows immediately; `apps/site/src/lib/boldsignWebhookSync.ts` creates PDF projection rows from the pending operation.

- Observation: The current working tree contains unrelated uncommitted changes on `main`.
  Evidence: `git status --short --branch` showed changes to customer billing and document routes plus a team invite migration. This implementation must stage only its own files.

- Observation: The BracketIQ project has a required Workstream field, but the published ticket did not have one until this implementation claimed it.
  Evidence: issue #98 was assigned to `Contract guard and cleanup` before its project status was changed to In progress.
- Observation: Imported completion is an attestation about the complete file, not a single structured signer event. A supplied signer role remains metadata, while Satisfaction receives every required Version role.
  Evidence: The import route test passes a combined Version with `signerRole: "Child"` and expects both required roles in `completedSignerRoles`.

- Observation: The immutable-Version trigger rejects changes to a frozen provider ID. Quarantine must therefore fail the BoldSign operation and leave the frozen row unchanged.
  Evidence: The provider projection test expects `FAILED` operation state and no material Version update for a reused frozen provider ID.

- Observation: Satisfaction invalidation can recompute several aggregates from one terminal evidence transition. Per-Satisfaction collection reads created avoidable database round trips.
  Evidence: `invalidateDocumentRequirementSatisfactions` now loads contributor links and evidence rows with one query per collection.
- Observation: Customer-safe in-app notifications are recorded after the evidence transaction commits. Push and transactional email delivery also run after commit, so delivery failure does not roll back customer data.
  Evidence: Import and void route tests reject notification delivery failures without changing the committed evidence or Satisfaction state.

- Observation: Aggregate Satisfaction completion is not enough for multi-signer document cards. A partial Satisfaction can already contain the current signer role.
  Evidence: Profile document aggregation now checks `completedSignerRoles` for the current signer context before it emits an unsigned card.

- Observation: Private imported-document audit data needs a separate response from the customer document list.
  Evidence: The audit route selects source note, attestation, uploader, import time, content hash, and append-only events only after `documents.audit`; the profile and Organization customer routes omit those fields.
- Observation: Filtering Event Registrations to only eligible statuses allowed an active Team registration and EventTeam snapshot to bypass a terminal individual registration for the same player.
  Evidence: The new route regression failed before the query included `PAYMENT_FAILED` and `CANCELLED`; it passed after the latest per-EventTeam registration check was added.

## Decision Log

- Decision: Use one new `DocumentRequirements` row as the stable lineage and keep each existing `TemplateDocuments` row as a Document Template Version.
  Rationale: Existing assignment arrays already store `TemplateDocuments.id`. Keeping that identifier avoids rewriting Event, Team, time-slot, rental, and signing contracts. A separate lineage row supports later versions without treating a mutable template row as the requirement itself.
  Date/Author: 2026-08-21 / Codex

- Decision: Use `TemplateDocuments.versionSequence` as the automatic human-readable sequence and the compound uniqueness key `(documentRequirementId, versionSequence)`.
  Rationale: The existing row ID remains the immutable Version identity. The sequence makes later versions ordered within one Requirement and gives the database a clear uniqueness invariant.
  Date/Author: 2026-08-21 / Codex

- Decision: Use `frozenAt` as the durable lifecycle marker for an immutable Version.
  Rationale: Database triggers set the marker on every assignment and evidence write, and the application detects existing references before material edits. The marker remains after an assignment is removed.
  Date/Author: 2026-08-22 / Codex

- Decision: Make the Version lineage reference non-null after the migration and update both creation paths in this ticket.
  Rationale: Every existing and newly created template must have a Requirement lineage. A nullable field would permit new versions that cannot participate in the identity or uniqueness contract. The route and webhook changes preserve their current response and provider behavior while supplying the new storage fields.
  Date/Author: 2026-08-21 / Codex

- Decision: Seed Requirement display fields from the existing template row and keep the existing Version display fields unchanged.
  Rationale: Existing customer and template displays must not change during expansion. The Requirement owns future display metadata; the Version retains the historical title, description, signer configuration, and content that the existing row represented.
  Date/Author: 2026-08-21 / Codex

- Decision: Use deterministic Requirement IDs in the migration and operation-carried UUIDs for new PDF projections.
  Rationale: A deterministic migration ID makes the data mapping auditable and retry-safe. A PDF operation already has a durable JSON payload, so carrying a generated Requirement ID through the asynchronous BoldSign projection keeps the Requirement stable across webhook retries.
  Date/Author: 2026-08-21 / Codex
- Decision: Expose one plural Satisfaction invalidation seam.
  Rationale: Webhook fallback rows can share one provider document. One batch read preserves aggregate recomputation and avoids a singular wrapper that adds no separate behavior.
  Date/Author: 2026-08-22 / Codex
- Decision: Deliver in-app, transactional email, and optional push notifications after the import or void transaction commits.
  Rationale: Customer notification delivery must not change committed evidence, audit events, or Satisfaction state. Stable notification IDs keep retry delivery idempotent, and the push channel applies the recipient's supported-device preference.
  Date/Author: 2026-08-25 / Codex

- Decision: Suppress an unsigned card when the current signer role already appears in Satisfaction evidence, even when another required role remains incomplete.
  Rationale: The existing signing routes reject a completed signer role. The profile list must not offer an action that cannot succeed.
  Date/Author: 2026-08-24 / Codex

- Decision: Treat imported evidence as complete for every required signer role and reject non-Organization scope for sign-once Versions.
  Rationale: An imported PDF is attested as a complete external artifact. A sign-once Version has Organization-wide scope by definition; accepting an Event or Team scope would create a second completion identity.
  Date/Author: 2026-08-22 / Codex

- Decision: Quarantine a reused frozen provider operation by marking its BoldSign operation failed without changing the frozen Version.
  Rationale: The database trigger protects frozen provider IDs. A failed operation prevents the webhook from confirming a remote edit while preserving the immutable local Version and its audit trail.
  Date/Author: 2026-08-22 / Codex

- Decision: Require the external `attestationAccepted === true` input and map it to the internal `isAttestationAccepted` value.
  Rationale: Client text must not define the legal assertion stored with imported evidence. The explicit acceptance flag blocks incomplete imports while server-owned constants provide a stable audit record. The external request key remains backward compatible.
  Date/Author: 2026-08-22 / Codex

- Decision: Store provider quarantine by global provider template ID in `TemplateProviderQuarantines`.
  Rationale: A mutable or deleted Version row must not make a previously edited provider template usable again. A registry preserves the block across Version replacement and deletion.
  Date/Author: 2026-08-22 / Codex

- Decision: Remove the parent feature's installed-mobile compatibility requirement.
  Rationale: Child issues state the mobile impact for each current capability and shared contract. Historical installed mobile versions are not a compatibility target.
  Date/Author: 2026-08-24 / User and Codex

- Decision: Return private imported-evidence fields through `auditTrail` and keep them out of customer document responses.
  Rationale: The existing subject, guardian, and Organization customer lists serve non-auditor users. A dedicated permission and response keep the private seam explicit.
  Date/Author: 2026-08-24 / Codex
- Decision: Reject terminal individual EventTeam registrations before applying EventTeam snapshot fallback.
  Rationale: The latest `PAYMENT_FAILED` or `CANCELLED` registration for the subject and EventTeam is authoritative. Snapshot membership is used only when no individual registration exists, so a stale snapshot cannot restore eligibility.
  Date/Author: 2026-08-25 / Codex

## Outcomes & Retrospective

Issue #98 delivered the additive Requirement and immutable Version storage contract. Existing template IDs, assignment arrays, signing behavior, and provider identifiers remain unchanged. Schema validation, generated-client validation, migration fixture coverage, focused route tests, and the site checks passed. The parent feature then consumed this lineage for Version enforcement and document evidence.

The completed parent feature repairs ownerless evidence before Satisfaction backfill, preserves historical evidence timestamps, records every contributing evidence row, handles roleless and imported completion, centralizes required-role derivation and provider quarantine eligibility, batches invalidation reads, and invalidates active Satisfaction after terminal provider failures. It requires explicit import attestation acceptance, stores server-derived attestation text and version, keeps pinned Versions addressable, resolves EventTeam snapshots to canonical teams, uses Satisfaction in signing preflight, persists assignment freezing, and blocks every signing and dispatch path before provider use.

Issues #108 and #109 complete the customer and guardian document experience. Imported evidence appears in the existing subject and guardian lists with customer-safe provenance and metadata. Authorized staff retain the private import and audit paths. Voiding changes lifecycle state and derived Satisfaction without changing or deleting historical evidence. Mobile maps the response into Room before it renders cards, keeps VOID history, removes voided completion from active state, and opens authorized local PDFs through the existing flow.

Issue #110 adds the restricted Organization audit trail. Authorized auditors can inspect the imported evidence snapshot and append-only import and void events. The response states that the application history is not tamper-proof. Customer document responses omit private audit fields, and mobile continues to map only the customer-safe DTO into Room.

The 2026-08-25 remediation rejects terminal individual EventTeam registrations while preserving snapshot fallback for legacy team registrations without an individual row. The focused import route suite passed with 42 tests. The final site suite passed with 871 suites and 5,221 tests; 2 suites and 4 tests remained skipped. The browser test now covers the required non-sign-once and Event Participation selections, but execution remains pending because no site runtime was running and repository rules prohibit starting one without explicit authorization. The customer-billing authorization correction remains in the separate commit `cf8802b87`.


## Context and Orientation

BracketIQ is a Next.js application in `apps/site` with a Prisma schema in `apps/site/prisma/schema.prisma`. The schema uses string IDs and mostly stores cross-model IDs without Prisma relation declarations. `TemplateDocuments` stores one application document template row. Its `id` is the application identity currently stored in requirement arrays. Its nullable `templateId` is the BoldSign provider template ID. Its `type` distinguishes PDF and TEXT templates. Its `requiredSignerType`, `signOnce`, signer role arrays, and content describe the current template behavior.

A Document Requirement is the stable Organization-owned obligation. It keeps its identity while material content or signing configuration changes. A Document Template Version is one immutable version of that obligation. For this expansion, the existing `TemplateDocuments.id` is the Version identity. `versionSequence` orders versions inside a Requirement. A Document Requirement Assignment is any Event, Team, time-slot, rental, or future compliance record that stores a Version ID. Existing assignments must continue to store the same IDs.

The Organization template route is `apps/site/src/app/api/organizations/[id]/templates/route.ts`. It creates TEXT rows and starts the BoldSign embedded-template operation for PDF rows. The asynchronous PDF projection is in `apps/site/src/lib/boldsignWebhookSync.ts`, in `createOrUpdateTemplateProjectionFromOperation`. Current template deletion and assignment code still uses `TemplateDocuments.id`; this ticket does not change that behavior.

The Prisma client is generated under `apps/site/src/generated/prisma`. Run generation from `apps/site` after schema changes. Generated files are repository artifacts and must be updated by the project command, not hand-edited.

The feature now includes evidence provenance, Document Subject identity, audit fields, Document Requirement Satisfaction storage, imported files, Event Participation and Team Membership scope validation, subject and guardian access, Imported presentation, voiding, restricted audit access, and transactional notifications. These routes validate that referenced Requirements, Versions, Subjects, Events, Teams, and Files belong to the same Organization.

## Completed Plan of Work

First add `DocumentRequirements` to the Prisma schema. The model stores its ID, timestamps, Organization owner, display title and description, creator, and status. Add `documentRequirementId`, `versionSequence`, and `frozenAt` to `TemplateDocuments`. Add an index on the lineage ID and a compound unique constraint on lineage plus sequence. Keep the existing fields and names unchanged.

Next add one migration after the current latest migration. The migration creates `DocumentRequirements`, adds the Version fields to `TemplateDocuments`, inserts one Requirement for each existing template, assigns that Requirement to the template as Version 1, creates the lineage index and uniqueness index, and then makes the lineage ID required. The migration must preserve all existing template columns and all assignment arrays. Use deterministic IDs based on the existing template ID so the data mapping is explicit and safe to retry in a repaired database.

Then update the local TEXT creation path. Generate a Requirement ID once, create the Requirement and Version 1 row in one Prisma transaction, and return the same template response as before with the additional persisted fields. Do not change title validation, permissions, type handling, or response status.

Update the PDF operation payload to carry a Requirement ID. In the BoldSign webhook projection, ensure the Requirement exists before creating a new Version 1 projection. On retries, reuse the existing Requirement and existing template projection. For older pending operations that have no Requirement ID, derive a new stable ID from the projected template ID and create the Requirement from the available operation metadata. Existing projection updates must preserve the existing lineage and sequence instead of creating a second Version.

Add focused tests at the public storage and route seams. The migration test should exercise the migration mapping through a test database or a deterministic migration fixture that proves an existing PDF and TEXT row keeps its ID, Organization, display fields, signing fields, provider ID, content, and assignment reference while gaining one Requirement and Version 1. The template route tests should prove a new TEXT template has a Requirement lineage and Version 1. The BoldSign projection tests should prove a new PDF projection creates one Requirement and retries reuse it. Do not add tests that only assert schema text or generated type shape.

Finally validate the expanded schema and generated client, run focused evidence and Version tests, run the full site suite once, review the diff against `main`, and commit the document remediation. Keep unrelated billing changes in a separate commit.

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

5. Run the focused evidence, import, Version, guest-signature, and BoldSign tests. Also run `node --check scripts/test-document-evidence-migration.mjs`. Expect every selected Jest test to pass.

6. If a loopback PostgreSQL test database is available, run `npm run migrate:deploy`, verify `npx prisma migrate status` reports no pending migrations, and run the migration integration test. Do not reset or alter a shared development database. If no loopback PostgreSQL service is available, record that exact prerequisite failure and do not use a shared or remote database.

7. Run the complete site suite once after focused checks are green:

    npm test -- --runInBand

8. Run the two-axis review against `main`. Check repository standards and the acceptance criteria for issues #97, #99, #100, and #101.

9. Stage only the document files for the document commit. Verify the staged file list. Commit the billing authorization correction separately from the document remediation.

## Validation and Acceptance

The schema validator must report that `apps/site/prisma/schema.prisma` is valid. Prisma generation must finish without errors and the generated client must expose `documentRequirements`, `documentRequirementId`, `versionSequence`, and `frozenAt`.

A migration validation must show that an existing template keeps its original `TemplateDocuments.id`, Organization owner, title, description, type, sign-once setting, signer configuration, content, provider `templateId`, and status. It must show one `DocumentRequirements` row for that template, `versionSequence = 1`, and the same template ID still present in its Event, Team, or time-slot assignment array.

The TEXT template route must still return HTTP 201 and the created template. The created row must have one Organization-owned Requirement and Version 1. The PDF route must still return HTTP 202 with the existing BoldSign operation response. A successful projection must create one PDF Version 1 row; a repeated projection must update that row and must not create another Requirement or Version.

Existing template listing, signing, assignment selection, and document dispatch tests pass without response or behavior changes. Typechecking and the full Jest suite pass. Route tests cover the import workflow and the browser is not required for these API and storage checks.

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

    TemplateProviderQuarantines {
      providerTemplateId: String
      quarantinedAt: DateTime
      reason: String
      createdAt: DateTime
      updatedAt: DateTime
    }

The import request must include the external `attestationAccepted: true` field. The server maps this field to `isAttestationAccepted`, stores the canonical attestation text and version constants, and does not accept client text or version fields. Every signing and dispatch route checks `TemplateProviderQuarantines` before provider use.

`TemplateDocuments.id` remains the value stored in current assignment arrays. `templateId` remains the optional BoldSign provider ID. The compound uniqueness rule is `(documentRequirementId, versionSequence)`. The current route response remains backward compatible; it may include the new persisted fields because Prisma serializes the created row.

`frozenAt` and the assignment/evidence references enforce immutable Version behavior. The evidence expansion references `TemplateDocuments.id` as the Version ID and `DocumentRequirements.id` as the lineage ID. Routes validate that both records share the same Organization before accepting a document, assignment, or Satisfaction.

## Parent Milestones

The parent feature enforces frozen Version writes and keeps existing assignments pinned. It stores evidence provenance, Document Subject identity, audit fields, and Document Requirement Satisfaction data. It projects existing BoldSign and BracketIQ text completions into Satisfaction. It moves Event and child compliance to Satisfaction. It moves Team and remaining compliance to Satisfaction and removes direct signed-document inference. It adds an Organization-scoped imported PDF flow with private storage, attestation, duplicate protection, and local file access. It adds Event Participation imports for direct and Team-based participation. It adds subject and guardian access, Imported presentation, voiding, restricted audit access, and transactional notifications.

No milestone creates Team customers as Document Subjects.

## Change Note

2026-08-21T00:55Z: Created this plan while starting issue #98. The plan records the existing dual template/provider identity, the chosen Requirement/Version storage shape, the required creation-path updates, and the full parent-feature sequence so later tickets can consume the same domain model without adding a second lineage.

2026-08-21: Updated the progress and outcome records after completing issue #98 and carrying the lineage into the later immutable-Version and evidence work. The current workstream also records the service-seam and review corrections made after the two-axis review.
2026-08-22T00:34Z: Updated the living plan after review remediation. The plan now records batch invalidation reads, imported role snapshots, timestamp-preserving owner repair, centralized role derivation, failed-operation quarantine, and terminal-failure Satisfaction invalidation. The database trigger prevents mutating a frozen provider ID, so quarantine marks the operation failed and leaves the Version unchanged.
2026-08-22: Completed the durable provider quarantine amendment. The registry migration and generated model are part of the patch. Import now requires explicit attestation acceptance and stores server-derived text/version. The template collection service uses the repository `getX` naming form. The complete focused and site suites passed.
2026-08-22: Completed the final review remediation. Signing preflight reads complete Satisfaction rows, provider quarantine eligibility uses one shared service, voiding uses the plural invalidation seam, assignment and evidence references persist Version freezing, and the plan records all parent milestones as complete.


## Downstream review handoff

Review scope: `main...workstream/document-versions` through `0e0d3b097`, covering issue #99 and issue #100. This section records the completed remediation. Each item is traceable to a focused test or a documented cross-cutting correction.

### Issue #99: immutable Version enforcement

The Version enforcement work is implemented in `src/server/documents/documentTemplateVersions.ts`, the template routes, the edit-url route, and the BoldSign projection. Unit and route tests cover frozen material rejection, separate Requirement metadata edits, pinned Version identity, and provider-edit quarantine. The migration fixture covers trigger and backfill persistence.

### Issue #100: evidence provenance and Satisfaction

The evidence work preserves the no-loss fields, keeps unknown structured Signers unknown, validates Organization ownership for referenced records, repairs uniquely owned ownerless rows, and writes evidence, Subject, Satisfaction, and audit data atomically. Satisfaction remains pending until every required role is complete. Imported evidence records every required role as complete, including a roleless import.

### Cross-cutting review corrections

The customer page fails explicitly when Version data is missing. New row mappings use typed selections where the changed boundary needs them, and the signer-role fallback is centralized in `lib/templateSignerTypes.ts`. The customer-billing authorization correction remains in its own commit and is not part of the document feature.


2026-08-21T17:20Z: Started the review remediation in the existing clean document workstream. The source branch is an ancestor of `main` plus the reviewed implementation; the remediation will remain isolated until final checks pass.
### 2026-08-21 two-axis review findings

Review target: local `main` at `445b9d3dc`, compared with `4705ea6df`. The review found the items recorded below. The later remediation entries and final verification resolved them.

The Standards review found an asynchronous billing permission bypass, mobile template-list compatibility risk, service-boundary duplication in the customer page, Boolean naming inconsistencies, and repeated pending-evidence writes. The billing permission checks and mobile response contract were corrected in the separate billing and template-service commits. The remaining service-boundary, naming, invalidation, provider, and Satisfaction corrections are recorded below.

The Specification review required frozen-provider protection, owner repair before Satisfaction backfill, contributor tracking for later voids, required-role derivation for guest and imported completion, terminal-failure replay semantics, and billing scope separation. The implementation quarantines a reused frozen-provider operation by marking it failed without mutating the frozen Version, repairs unique owners before backfill, tracks every contributor, derives imported roles from the Version, and invalidates active Satisfaction after terminal provider failures.

The issue comments for #97, #99, #100, and #101 record the review scope. The Progress section is the only checklist; this handoff records the decisions and evidence in narrative form.

2026-08-21T21:25Z: Integrated the reviewed document workstream into `main`. The remaining remediation is now tracked in `Progress`.

2026-08-21T21:25Z: Added the applied-schema migration seam. The existing immutable Version trigger migration is restored, and migration `20260821070000_repair_document_evidence_and_version_guards` repairs nullable signer storage, required signer roles, duplicate Satisfaction rows, and frozen-Version guards after the earlier migrations have run. The database fixture now verifies that a later write failure rolls back Subject, evidence, Satisfaction, and audit rows.

2026-08-21T21:25Z: Replaced the provider-bound template projection regression payload with the normalized operation payload. The import route now builds one validated scope object and reuses it for ownership, persisted evidence fields, and Satisfaction.

2026-08-22T00:34Z: Added batch contributor reads for Satisfaction invalidation, role snapshots for imported evidence, timestamp-preserving owner repair, centralized required-role derivation, roleless Satisfaction completion, failed-operation quarantine for reused frozen provider IDs, and terminal-failure Satisfaction invalidation. The replay test remains the behavioral proof.

### Review test seams

- `src/server/documents/documentTemplateVersions.ts` and its unit test cover freeze detection, sequence allocation, pinned assignment, rejected material writes, and display-only edits.
- `prisma/migrations/20260821030000_enforce_immutable_document_template_versions/migration.sql` and `scripts/test-document-requirement-version-migration.mjs` cover trigger and backfill persistence.
- `src/app/api/organizations/[id]/templates/[templateDocumentId]/route.ts` and its route test cover frozen TEXT edits and requirement metadata.
- `src/app/api/organizations/[id]/templates/[templateDocumentId]/edit-url/route.ts`, `src/lib/boldsignWebhookSync.ts`, and BoldSign tests cover provider edit sessions and frozen provider projections.
- `prisma/migrations/20260821040000_add_document_evidence_satisfaction/migration.sql`, the evidence migration fixture, and `src/server/__tests__/documentEvidence.test.ts` cover no-loss migration, subject identity, and multi-signer Satisfaction.
- `src/app/api/organizations/[id]/documents/import/route.ts` and its route test cover User, Event, Team, and File ownership plus atomic import writes.
- Signature and void route tests cover atomic evidence, Subject, Satisfaction, and audit transitions.


### 2026-08-22 follow-up two-axis review findings

Review target: local `main` at `445b9d3dc0e6690bca6075f3891bb5816a9b4f78`, compared with `HEAD` at `e8d32689f` plus current unstaged remediation. Historical diff command: `git diff 445b9d3dc0e6690bca6075f3891bb5816a9b4f78...HEAD`. Authoritative worktree-inclusive diff: `git diff 445b9d3dc0e6690bca6075f3891bb5816a9b4f78` (single base revision).

The follow-up review found residual findings after the earlier remediation. The related comments are recorded on issues #97, #99, #100, and #101. This section records findings only. It does not claim acceptance or closure.

#### Standards findings

- **Hard:** `src/server/__tests__/documentEvidence.test.ts:234-239` checks mock-call nesting, query count, and fixed chunk sizes. It does not assert Satisfaction results. This conflicts with `apps/site/CODING_STANDARDS.md`, which requires tests to prove observable behavior.
- **Hard:** `src/lib/boldsignService.ts:213-227` adds `listTemplates`. `apps/site/AGENTS.md:135-137` requires service methods to use `createX/getX/updateX/deleteX`. Rename this method and update its callers.
- **Hard:** `src/app/organizations/[id]/page.tsx:3231-3237` sends customer-bill HTTP requests directly through `apiRequest`. `apps/site/AGENTS.md:135-136` requires UI code to call service modules in `src/lib/*Service.ts`.
- **Hard:** `src/app/organizations/[id]/page.tsx:1213-1215` uses `customerBillModalOpen` and `creatingCustomerBill`. `apps/site/AGENTS.md:136` requires Boolean names to use the `is*` or `has*` convention.
- **Judgement call — Middle Man:** `src/server/documentEvidence.ts:468-477` adds a singular invalidation wrapper around the plural function. Call the plural function directly if no separate seam is required.
- **Judgement call — Duplicated Code / Shotgun Surgery:** `canManageCustomerBilling` is duplicated in both billing routes. A shared server helper would centralize this decision.
- **Fixed in this amendment:** Earlier plan text said that the migration fixture was blocked while later text recorded a passed document-evidence fixture. The plan now distinguishes that passed fixture from the separate unverified immutable-Version trigger fixture.

#### Specification findings

- **#97 P1:** `src/app/api/organizations/[id]/documents/import/route.ts:261-266` rejects invalid scope only for sign-once Versions. Non-sign-once imports must require Event Participation scope.
- **#99 P1:** `src/lib/boldsignWebhookSync.ts:978-982` can treat a later provider edit for a detached Version as safe after the first detached edit creates V2. A later edit can mutate content referenced by a frozen Version.
- **#99 P1:** `src/app/api/organizations/[id]/templates/route.ts:136-145` returns only the newest Version. Pinned Versions must remain addressable to current callers.
- **#100 P1:** `prisma/migrations/20260821080000_repair_ownerless_document_evidence/migration.sql:109-112` can replace an existing Subject timestamp with a repaired-row timestamp. Merge existing and repaired values with the earliest `createdAt` and latest `updatedAt`.
- **#101 P1:** `src/lib/boldsignWebhookSync.ts:1837-1848` writes `signedAt` during terminal bulk updates. `resolveDocumentSignedAtIso` at lines 488-506 can use the terminal webhook time. Omit `signedAt` from this update so the historical signing time remains unchanged.

### 2026-08-21 follow-up remediation

The four specification findings are fixed.

- #97 now requires Event Participation scope for non-sign-once imports. The route tests cover rejection and acceptance.
- #99 now quarantines later provider edits when the source or an existing Version is frozen. The guard reads the source Version directly, so a cloned provider template ID does not hide the frozen source. The templates response keeps all pinned Versions addressable.
- #100 now merges repaired Subject timestamps with the earliest `createdAt` and latest `updatedAt`. The migration fixture covers the merge.
- #101 now omits `signedAt` from terminal bulk updates. The provider projection test proves that a later terminal event does not replace the original signing time.

Verification completed:

- `DATABASE_URL=postgresql://localhost:5432/bracketiq npm run prisma:validate`
- `npx tsc --noEmit`
- Focused document and provider tests: 57 tests passed.
- Full site suite: 863 suites passed, 2 skipped; 5,095 tests passed, 4 skipped.
- ESLint passed for all changed TypeScript and migration-fixture files.
- `node --check scripts/test-document-evidence-migration.mjs` passed.
- `DOCUMENT_EVIDENCE_MIGRATION_TEST_DATABASE_URL=postgresql://mvp:mvp_password@127.0.0.1:5433/mvp npm run test:document-evidence-migration` passed.

The review findings in this historical section were resolved by the subsequent remediation entries below. The customer-billing authorization correction remains separate from the document behavior change.

### 2026-08-22 amended two-axis review remediation

The two amended specification findings are fixed.

- #97 now resolves Event Participation imports through the canonical team ID from an EventTeam snapshot. The route test covers the snapshot case.
- #99 now quarantines provider edits that reuse a frozen provider ID. Event, public guest, rental, and team dispatch signing paths reject quarantined Versions.
- The P2 customer billing scope finding remains intentionally separate from this document behavior work.

Verification completed for this remediation:

- `npx tsc --noEmit` passed.
- The import route regression passed with 23 tests.
- The provider projection regression passed with 11 tests.
- The team signing route regressions passed with 29 tests.
- The rental signing regression passed with 3 tests.
- The immutable-Version migration fixture passed.

The issue comments record the affected issue-specific findings.

### 2026-08-22 final review remediation

The final specification review found no remaining requirement gaps.

- Provider quarantine now covers every Version that uses a global provider template ID.
- A Version repointed to an already-quarantined provider keeps the quarantine state.
- Roleless SIGNED fallback updates fill `signedAt` only when it is null.
- Replayed completion events keep the first signing time.
- Non-SIGNED fallback events do not fill `signedAt`.

Final verification:

- `DATABASE_URL=postgresql://localhost:5432/bracketiq npm run prisma:check` passed.
- `npx tsc --noEmit` passed.
- Focused provider and Version tests passed: 32 tests.
- Full site suite passed: 864 suites and 5,103 tests; 2 suites and 4 tests skipped.
- The document evidence migration fixture passed.
- The Document Requirement and Document Template Version migration fixture passed.

### 2026-08-22 durable provider quarantine remediation

The provider quarantine state is now durable by provider template ID.

- `TemplateProviderQuarantines` stores quarantine state that survives Version replacement.
- New Versions inherit quarantine state when they use a quarantined provider template.
- Event, public guest, rental, team, and both collection dispatch paths check the registry before provider calls.
- Signed rows are checked before the quarantine response so completed evidence stays reusable.
- The migration fixture now verifies registry backfill from quarantined Version data.

Verification in this pass:

- `npm run prisma:check` passed.
- `npx tsc --noEmit` passed.
- Focused signing, provider, Version, import, and template route tests passed.
- Document evidence and Document Requirement migration fixtures passed on the loopback PostgreSQL test database.
- The full site suite passed: 864 suites and 5,103 tests; 2 suites and 4 tests skipped.

### 2026-08-22 final standards remediation

The final standards remediation is complete:

- Attestation input keeps the public `attestationAccepted` key and uses `isAttestationAccepted` for the internal Boolean.
- The template service uses `getTemplates`, and the customer page uses the service module for template collection.
- Provider quarantine eligibility is centralized by Version ID.
- The singular Satisfaction invalidation wrapper is removed.
- Event signing preflight reads complete Satisfaction rows before it creates a new signing request.
- Database triggers and the application reference check persist Version freezing.
- The unrelated customer-billing correction remains separate from this feature.

Focused tests passed after these changes. The full site suite result is recorded in the current review remediation below.

### 2026-08-21 current review remediation

The current review remediation centralized Version-level provider quarantine checks across event, guest, rental, team, and collection dispatch paths. It added event-signing preflight reads for complete Document Requirement Satisfaction rows. It removed the singular Satisfaction invalidation wrapper and updated the void route to use the plural seam. It added migration-fixture proof that removed assignments still leave a Version frozen. It kept the external `attestationAccepted` request key and used the internal `isAttestationAccepted` name.

Verification passed for `npx tsc --noEmit`, 12 focused suites with 109 tests, and both document migration fixtures against loopback PostgreSQL. The full site suite did not pass. It reported 856 passed suites, 6 failed suites, and 2 skipped suites; 5,099 passed tests, 6 failed tests, and 4 skipped tests.

### 2026-08-22 completion verification

The current review remediation is complete. The signed-file route now permits staff with `documents.import` to view private imported PDFs. The void-route tests now send POST requests with valid recent-auth fixtures.

Verification passed:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bracketiq npm run prisma:check`.
- `npx tsc --noEmit`.
- `npm run lint` (existing warnings only).
- Eight focused document suites with 80 tests.
- `DOCUMENT_VERSION_MIGRATION_TEST_DATABASE_URL=postgresql://mvp:mvp_password@127.0.0.1:5433/mvp npm run test:document-version-migration`.
- `DOCUMENT_EVIDENCE_MIGRATION_TEST_DATABASE_URL=postgresql://mvp:mvp_password@127.0.0.1:5433/mvp npm run test:document-evidence-migration`.
- `npm test -- --runInBand`: 866 suites passed, 2 skipped; 5,119 tests passed, 4 skipped.

## Plan Revision 2026-08-24

Removed the installed-mobile compatibility requirement from issue #97 and this plan. Child issues continue to state the required mobile parity for current capabilities and shared contracts.
 
### 2026-08-24 issue #108 and #109 verification

Issues #108 and #109 are complete. Imported evidence is visible to the subject and eligible linked guardian. Private source, attestation, uploader, content identity, and audit fields remain staff-only. Authorized staff can void imported evidence with the required permission and recent identity proof. Voiding preserves evidence history and removes active Satisfaction completion.

Web and mobile document tests cover response mapping, private-field filtering, subject and guardian access, VOID history, Room persistence, card state, and authorized local PDF opening. The notification panel test covers loading an unread document notification, marking it read, and updating the unread state.

Verification passed:

- `npx tsc --noEmit`.
- Profile document route test: 7 tests passed.
- Full site suite: 871 suites passed, 2 skipped; 5,211 tests passed, 4 skipped.
- Full mobile debug unit suite: `:composeApp:testDebugUnitTest` passed.
- Final concurrency review passed for organization assignment, staff member, and role lock ordering.

### 2026-08-24 issue #110 audit follow-up

Issue #110 extends the imported-document staff surface. The customer document responses stay customer-safe. The organization audit endpoint returns a restricted audit trail only after the `documents.audit` permission check. The audit trail includes imported evidence provenance, lifecycle status, source note, canonical attestation, attestation version, uploader, import time, and content hash. It also includes the append-only import and void events with actor, time, controlled reason, and private note.

The API response will name the result `auditTrail` and state that the application history is not tamper-proof. The audit route will accept only imported evidence in the requested Organization. The ordinary customer-document routes will not return the private import time. Mobile keeps its current customer-safe DTO and Room model. Unknown private response keys remain ignored by the mobile serializer.

Implementation and verification are complete. The `Progress` section is the only checklist. Verification passed with `npx tsc --noEmit`, three focused site suites covering 23 tests, two focused mobile document contract tests, the full site suite with 871 suites passed and 2 skipped (5,211 tests passed and 4 skipped), and the full mobile debug unit suite. Browser smoke rendered the authorized Organization audit view, rendered the subject imported card without private sentinels, and returned `200 application/pdf` for the subject PDF request after the UI action.

### 2026-08-24 change note

Added the issue #110 audit response, Organization customer audit UI, private-field filtering, and contract verification. The change uses a dedicated `documents.audit` permission so subjects, guardians, and ordinary staff do not receive source notes, attestation data, uploader data, import time, content identity, or internal audit events.

## Plan Revision 2026-08-25

The specification review found a terminal EventTeam participation bypass and incomplete browser interaction coverage. The route now reads `PAYMENT_FAILED` and `CANCELLED` registrations, selects the latest subject registration per EventTeam, rejects terminal status, and uses EventTeam snapshot membership only when no subject registration exists. The browser test now selects a non-sign-once Version and Event Participation, uploads the PDF, asserts the preview frame, and continues through import, access, audit, notification, void, and preserved-file checks.

Verification passed with `npx tsc --noEmit`, `npm run prisma:check`, 42 import-route tests, both document migration fixtures, focused mobile document tests, and the final site suite with 871 suites and 5,221 tests passed; 2 suites and 4 tests were skipped. Browser smoke remains pending because no site runtime was running and repository rules prohibit starting one without explicit authorization.