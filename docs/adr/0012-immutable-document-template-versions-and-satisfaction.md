# ADR-0012: Use immutable document template versions and shared satisfaction

- Status: Accepted
- Date: 2026-08-21
- Owners: BracketIQ web and backend
- Related issues: #97, #98, #99, #100, #101, #102, #103, #104

## Context

BracketIQ stores Organization document templates in `TemplateDocuments`. Existing Events, Teams, time slots, rentals, signing requests, and customer document flows store `TemplateDocuments.id` in raw ID arrays or records. The same row also contains the optional BoldSign provider template ID in `templateId`. A row currently behaves as both a mutable template and the identity used by an assignment.

The product needs two separate concepts:

- A **Document Requirement** is the stable Organization-owned obligation. It keeps its identity across material template changes.
- A **Document Template Version** is one immutable content and signing-configuration version of that obligation. A material change creates a new version.

The product also needs one completion concept:

- **Document Requirement Satisfaction** is the conclusion that one signed document completes every required signer role for one Document Subject in one Organization-wide or Event Participation scope.

Imported external PDFs will later create Satisfaction through a Document Import Attestation. BoldSign and BracketIQ text flows will project Satisfaction from their existing evidence. If completion remains inferred from raw signed-document rows, each workflow can apply different signer and scope rules.

## Decision

Add one `DocumentRequirements` row for each stable requirement. Keep each existing `TemplateDocuments` row as a Document Template Version. Use the existing `TemplateDocuments.id` as the immutable Version identity because current assignment arrays already store it.

Add these Version fields:

- `documentRequirementId`: the stable lineage ID.
- `versionSequence`: an automatic sequence unique within one Requirement. Existing rows become Version 1.
- `frozenAt`: nullable lifecycle state used when a Version becomes immutable. The expansion adds the field; the enforcement milestone sets and checks it.

Enforce a compound uniqueness rule on `(documentRequirementId, versionSequence)`. Store Organization ownership on both Requirement and Version. Application write paths must validate that the Version and Requirement belong to the same Organization.

Keep current assignment arrays unchanged. An Event, Team, time slot, rental, or later Document Requirement Assignment stores the Version ID, not a mutable pointer to the current Version. Creating a new Version never rewrites an existing assignment.

Keep Requirement display metadata separate from Version content. Seed the first Requirement title and description from the existing template during migration. Keep the existing Version title, description, type, content, sign-once setting, signer configuration, and provider ID unchanged for compatibility.

Use Document Requirement Satisfaction as the only completion source after the migration. Signed evidence remains the source artifact and history. It does not itself mean that every required signer role or scope is complete. Satisfaction identifies the Document Subject, Version, scope, source evidence, status, creation time, and invalidation time.

## Alternatives considered

### Create a new Version row and rewrite every assignment

Rejected. Existing assignments are stored in several raw ID arrays and records. Rewriting them would create a large migration surface and risk changing Event, Team, rental, and signing behavior. Keeping the existing row ID preserves the current application seam.

### Keep `TemplateDocuments` as the requirement and add a version table later

Rejected. A mutable template row cannot represent a stable requirement lineage without making existing IDs ambiguous. Adding the lineage now makes future version creation explicit and keeps provider IDs separate from application IDs.

### Infer completion directly from signed-document rows

Rejected. Signed rows represent provider or local evidence. They do not provide one consistent result for combined signer roles, sign-once scope, Event Participation, voiding, or imported attestation. A shared Satisfaction record gives each compliance reader one contract.

### Use one broad JSON configuration field for Versions

Rejected. Typed lineage, sequence, ownership, and freeze state are migration and authorization invariants. They must be queryable and constrained by the database. Existing typed Version fields remain the source for content and signer configuration.

## Consequences

Positive consequences:

- Existing assignment IDs remain valid.
- A material template change can create a new Version without changing existing Events or Teams.
- Provider identifiers remain distinct from BracketIQ Version identifiers.
- Imported, BoldSign, and BracketIQ text evidence can share one Satisfaction contract.
- Requirement and Version Organization ownership can be checked at the API boundary.

Negative consequences:

- Template creation and asynchronous BoldSign projection must create or preserve a Requirement row.
- Existing template records require a data migration.
- Later Version editing needs explicit freeze checks and a new-Version write path.
- Compliance callers need a coordinated migration before direct signed-document inference can be removed.
- Raw assignment arrays remain a compatibility storage shape until a later assignment model replaces them.

## Migration and rollout

The first migration creates one deterministic `DocumentRequirements` row for each existing `TemplateDocuments` row, assigns that row to the existing template as `versionSequence = 1`, adds the compound unique index, and makes the lineage ID required. It does not change existing template content or assignment arrays.

TEXT template creation creates a Requirement and Version in one transaction. The PDF creation operation carries a Requirement ID in its durable operation payload. The BoldSign webhook projection creates the Requirement if needed and reuses it on retries. Old pending operations without a carried ID use a stable fallback derived from the provider template ID.

The next milestones enforce immutability, add Satisfaction storage, project current completions, migrate compliance readers, and then add imported evidence. Each milestone must keep current customer and signing behavior working before the old path is removed.

## Validation

Validate the Prisma schema and generated client. Apply the migration to a dedicated test database built from the current migration history. Verify that existing PDF and TEXT rows retain their IDs, content, signer configuration, provider linkage, and Organization ownership, and gain one Requirement plus Version 1. Verify that existing assignment arrays still contain the same Version IDs. Run focused template and projection tests, then the complete site suite.
