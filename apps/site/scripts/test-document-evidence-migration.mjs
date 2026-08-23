import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
process.env.TZ = "UTC";
const { Client } = pg;
const connectionString =
  process.env.DOCUMENT_EVIDENCE_MIGRATION_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "Set DOCUMENT_EVIDENCE_MIGRATION_TEST_DATABASE_URL to a disposable local PostgreSQL database URL.",
  );
}

const parsedConnection = new URL(connectionString);
const hostname = parsedConnection.hostname
  .replace(/^\[|\]$/g, "")
  .toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error(
    "The Document Evidence migration fixture refuses non-loopback databases.",
  );
}

const fixtureSchema = `document_evidence_fixture_${process.pid}_${Date.now()}`;
const quotedFixtureSchema = `"${fixtureSchema}"`;
const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
const evidenceMigrationPath = path.join(
  migrationRoot,
  "20260821040000_add_document_evidence_satisfaction",
  "migration.sql",
);
const pendingStatusMigrationPath = path.join(
  migrationRoot,
  "20260821050000_add_pending_document_satisfaction_status",
  "migration.sql",
);
const pendingBackfillMigrationPath = path.join(
  migrationRoot,
  "20260821060000_backfill_pending_document_satisfactions",
  "migration.sql",
);
const forwardRepairMigrationPath = path.join(
  migrationRoot,
  "20260821070000_repair_document_evidence_and_version_guards",
  "migration.sql",
);
const ownerRepairMigrationPath = path.join(
  migrationRoot,
  "20260821080000_repair_ownerless_document_evidence",
  "migration.sql",
);
const contributorRoleMigrationPath = path.join(
  migrationRoot,
  "20260821230000_add_satisfaction_evidence_roles",
  "migration.sql",
);
const signerRoleNormalizationMigrationPath = path.join(
  migrationRoot,
  "20260822030000_normalize_document_satisfaction_roles",
  "migration.sql",
);
const client = new Client({ connectionString });
let connected = false;

try {
  await client.connect();
  connected = true;
  await client.query(`CREATE SCHEMA ${quotedFixtureSchema}`);
  await client.query(`SET search_path TO ${quotedFixtureSchema}`);
  await client.query(`
    CREATE TABLE "Organizations" ("id" TEXT NOT NULL PRIMARY KEY);
    CREATE TABLE "DocumentRequirements" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "createdBy" TEXT,
      "status" TEXT
    );
    CREATE TABLE "Events" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT
    );
    CREATE TABLE "Teams" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "organizationId" TEXT
    );
    CREATE TABLE "EventTeams" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "eventId" TEXT
    );
    CREATE TABLE "TemplateDocuments" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "createdAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3),
      "documentRequirementId" TEXT NOT NULL,
      "versionSequence" INTEGER NOT NULL,
      "frozenAt" TIMESTAMP(3),
      "templateId" TEXT,
      "type" TEXT,
      "organizationId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "content" TEXT,
      "signOnce" BOOLEAN,
      "requiredSignerType" TEXT,
      "roleIndex" INTEGER,
      "signerRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "SignedDocuments" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "createdAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3),
      "signedDocumentId" TEXT NOT NULL,
      "templateId" TEXT NOT NULL,
      "userId" TEXT,
      "documentName" TEXT NOT NULL,
      "hostId" TEXT,
      "organizationId" TEXT,
      "eventId" TEXT,
      "teamId" TEXT,
      "status" TEXT,
      "signedAt" TEXT,
      "signerEmail" TEXT,
      "roleIndex" INTEGER,
      "signerRole" TEXT,
      "ipAddress" TEXT,
      "requestId" TEXT
    );
    INSERT INTO "Organizations" ("id") VALUES ('org_1'), ('org_2');
    INSERT INTO "Events" ("id", "organizationId") VALUES
      ('event_missing_org', 'org_1'),
      ('event_org_2', 'org_2');
    INSERT INTO "Teams" ("id", "organizationId") VALUES
      ('team_missing_org', 'org_1');
    INSERT INTO "EventTeams" ("id", "eventId") VALUES
      ('team_missing_org', 'event_missing_org');
    INSERT INTO "DocumentRequirements" ("id", "organizationId", "title", "status") VALUES
      ('requirement_pdf', 'org_1', 'Photo waiver', 'ACTIVE'),
      ('requirement_text', 'org_1', 'Code of conduct', 'ACTIVE');
    INSERT INTO "TemplateDocuments" (
      "id", "documentRequirementId", "versionSequence", "templateId", "type", "organizationId",
      "title", "description", "content", "signOnce", "requiredSignerType", "roleIndex", "signerRoles"
    ) VALUES
      ('version_pdf', 'requirement_pdf', 1, 'boldsign_template_1', 'PDF', 'org_1', 'Photo waiver', 'External PDF', NULL, false, 'PARENT_GUARDIAN_CHILD', 2, ARRAY['parent_guardian', 'child']),
      ('version_text', 'requirement_text', 1, NULL, 'TEXT', 'org_1', 'Code of conduct', 'Local text', 'I agree.', true, 'PARTICIPANT', NULL, ARRAY[]::TEXT[]);
    INSERT INTO "SignedDocuments" (
      "id", "createdAt", "updatedAt", "signedDocumentId", "templateId", "userId", "documentName", "hostId",
      "organizationId", "eventId", "teamId", "status", "signedAt", "signerEmail", "roleIndex", "signerRole",
      "ipAddress", "requestId"
    ) VALUES
      (
        'evidence_boldsign',
        '2026-08-01 10:00:00',
        '2026-08-01 11:00:00',
        'boldsign_document_1',
        'version_pdf',
        'parent_1',
        'Photo waiver',
        'child_1',
        'org_1',
        'event_1',
        NULL,
        'SIGNED',
        '2026-08-01T10:00:00.000Z',
        'parent@example.com',
        2,
        'parent_guardian',
        '203.0.113.10',
        'request_boldsign_1'
      ),
      (
        'evidence_boldsign_child',
        '2026-08-01 10:05:00',
        '2026-08-01 11:05:00',
        'boldsign_document_1',
        'version_pdf',
        'child_1',
        'Photo waiver',
        NULL,
        'org_1',
        'event_1',
        NULL,
        'SIGNED',
        '2026-08-01T10:05:00.000Z',
        'child@example.com',
        3,
        'child',
        '203.0.113.14',
        'request_boldsign_child_1'
      ),
      (
        'evidence_text',
        '2026-08-02 10:00:00',
        '2026-08-02 11:00:00',
        'text-document-1',
        'version_text',
        'player_1',
        'Code of conduct',
        NULL,
        'org_1',
        NULL,
        NULL,
        'SIGNED',
        '2026-08-02T10:00:00.000Z',
        NULL,
        NULL,
        'participant',
        '203.0.113.11',
        'request_text_1'
      ),
      (
        'evidence_incomplete_team',
        '2026-08-02 12:00:00',
        '2026-08-02 13:00:00',
        'boldsign_document_team_1',
        'version_pdf',
        'team_player_1',
        'Photo waiver',
        NULL,
        'org_1',
        NULL,
        'team_1',
        'SIGNED',
        '2026-08-02T12:00:00.000Z',
        'team-player@example.com',
        2,
        'Parent-Guardian',
        '203.0.113.15',
        'request_boldsign_team_1'
      ),
      (
        'evidence_unknown_signer',
        '2026-08-03 10:00:00',
        '2026-08-03 11:00:00',
        'unknown-document-1',
        'version_pdf',
        NULL,
        'Photo waiver',
        NULL,
        'org_1',
        'event_unknown',
        NULL,
        'SIGNED',
        '2026-08-03T10:00:00.000Z',
        NULL,
        2,
        'parent_guardian',
        '203.0.113.12',
        'request_unknown_1'
      ),
      (
        'evidence_no_organization',
        '2026-08-04 10:00:00',
        '2026-08-04 11:00:00',
        'missing-org-document-1',
        'version_text',
        'player_1',
        'Code of conduct',
        NULL,
        NULL,
        'event_missing_org',
        'team_missing_org',
        'SIGNED',
        '2026-08-04T10:00:00.000Z',
        NULL,
        NULL,
        'participant',
        '203.0.113.13',
        'request_missing_org_1'
      ),

      (
        'evidence_ambiguous_owner',
        '2026-08-04 12:00:00',
        '2026-08-04 13:00:00',
        'ambiguous-document-1',
        'version_text',
        'player_1',
        'Code of conduct',
        NULL,
        NULL,
        'event_org_2',
        NULL,
        'SIGNED',
        '2026-08-04T12:00:00.000Z',
        NULL,
        NULL,
        'participant',
        '203.0.113.16',
        'request_ambiguous_owner_1'
      )
  `);
  const templateRowsBefore = await client.query(`
    SELECT
      "id",
      "templateId",
      "type",
      "title",
      "description",
      "content",
      "signOnce",
      "requiredSignerType",
      "roleIndex",
      "signerRoles"
    FROM "TemplateDocuments"
    ORDER BY "id"
  `);
  const legacyRowsBefore = await client.query(`
    SELECT
      "id",
      "createdAt",
      "updatedAt",
      "signedDocumentId",
      "templateId",
      "userId",
      "documentName",
      "hostId",
      "organizationId",
      "eventId",
      "teamId",
      "status",
      "signedAt",
      "signerEmail",
      "roleIndex",
      "signerRole",
      "ipAddress",
      "requestId"
    FROM "SignedDocuments"
    ORDER BY "id"
  `);
  await client.query(await readFile(evidenceMigrationPath, "utf8"));
  await client.query(await readFile(pendingStatusMigrationPath, "utf8"));
  await client.query(await readFile(pendingBackfillMigrationPath, "utf8"));
  await client.query(await readFile(forwardRepairMigrationPath, "utf8"));
  await client.query(`
    INSERT INTO "DocumentRequirementSatisfactions" (
      "id", "createdAt", "updatedAt", "organizationId", "documentRequirementId",
      "templateDocumentId", "documentSubjectId", "scopeType", "scopeId",
      "sourceEvidenceId", "status", "isComplete", "requiredSignerRoles",
      "completedSignerRoles"
    )
    SELECT
      'document-satisfaction:evidence_boldsign_child',
      "createdAt",
      "updatedAt",
      "organizationId",
      "documentRequirementId",
      "templateDocumentId",
      "documentSubjectId",
      "scopeType",
      "scopeId",
      'evidence_boldsign_child',
      'SATISFIED',
      TRUE,
      ARRAY['parent_guardian', 'child']::TEXT[],
      ARRAY['child']::TEXT[]
    FROM "DocumentRequirementSatisfactions"
    WHERE "sourceEvidenceId" = 'evidence_boldsign'
  `);
  await client.query(`
    UPDATE "DocumentRequirementSatisfactions"
    SET
      "status" = 'INVALIDATED',
      "isComplete" = FALSE,
      "invalidatedAt" = '2026-08-05T00:00:00.000Z'
    WHERE "id" = 'document-satisfaction:evidence_boldsign'
  `);
  await client.query(await readFile(ownerRepairMigrationPath, "utf8"));
  const legacyRowsAfter = await client.query(`
    SELECT
      "id",
      "createdAt",
      "updatedAt",
      "signedDocumentId",
      "templateId",
      "userId",
      "documentName",
      "hostId",
      "organizationId",
      "eventId",
      "teamId",
      "status",
      "signedAt",
      "signerEmail",
      "roleIndex",
      "signerRole",
      "ipAddress",
      "requestId"
    FROM "SignedDocuments"
    ORDER BY "id"
  `);
  assert.deepEqual(
    legacyRowsAfter.rows.map((row) => row.id),
    legacyRowsBefore.rows.map((row) => row.id),
  );
  assert.deepEqual(
    legacyRowsAfter.rows.map(({ id, createdAt, updatedAt }) => ({
      id,
      createdAt,
      updatedAt,
    })),
    legacyRowsBefore.rows.map(({ id, createdAt, updatedAt }) => ({
      id,
      createdAt,
      updatedAt,
    })),
  );
  assert.deepEqual(
    legacyRowsAfter.rows,
    legacyRowsBefore.rows.map((row) =>
      row.id === "evidence_no_organization"
        ? { ...row, organizationId: "org_1" }
        : row,
    ),
  );
  await client.query(`
    UPDATE "SignedDocuments"
    SET "provenance" = 'IMPORTED', "signerRole" = NULL
    WHERE "id" = 'evidence_boldsign'
  `);
  await client.query(`
    UPDATE "DocumentRequirementSatisfactions"
    SET
      "requiredSignerRoles" = ARRAY[]::TEXT[],
      "completedSignerRoles" = ARRAY[]::TEXT[],
      "status" = 'INVALIDATED',
      "isComplete" = FALSE,
      "invalidatedAt" = '2026-08-05T00:00:00.000Z'
    WHERE "id" = 'document-satisfaction:evidence_boldsign'
  `);
  await client.query(`
    UPDATE "TemplateDocuments"
    SET
      "requiredSignerType" = 'PARENT-GUARDIAN-CHILD',
      "signerRoles" = ARRAY[]::TEXT[]
    WHERE "id" = 'version_pdf'
  `);
  await client.query(await readFile(contributorRoleMigrationPath, "utf8"));
  await client.query(`
    UPDATE "TemplateDocuments"
    SET
      "requiredSignerType" = 'PARENT_GUARDIAN_CHILD',
      "signerRoles" = ARRAY['parent_guardian', 'child']::TEXT[]
    WHERE "id" = 'version_pdf'
  `);
  await client.query(await readFile(signerRoleNormalizationMigrationPath, "utf8"));
  const contributorRoleColumn = await client.query(`
    SELECT "is_nullable", "column_default"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'DocumentRequirementSatisfactionEvidence'
      AND column_name = 'completedSignerRoles'
  `);
  assert.equal(contributorRoleColumn.rows.length, 1);
  assert.equal(contributorRoleColumn.rows[0].is_nullable, "NO");
  const signerColumn = await client.query(`
    SELECT "is_nullable"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SignedDocuments'
      AND column_name = 'userId'
  `);
  assert.deepEqual(signerColumn.rows, [{ is_nullable: "YES" }]);
  assert.deepEqual(legacyRowsBefore.rows, [
    {
      id: "evidence_ambiguous_owner",
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      updatedAt: new Date("2026-08-04T13:00:00.000Z"),
      signedDocumentId: "ambiguous-document-1",
      templateId: "version_text",
      userId: "player_1",
      documentName: "Code of conduct",
      hostId: null,
      organizationId: null,
      eventId: "event_org_2",
      teamId: null,
      status: "SIGNED",
      signedAt: "2026-08-04T12:00:00.000Z",
      signerEmail: null,
      roleIndex: null,
      signerRole: "participant",
      ipAddress: "203.0.113.16",
      requestId: "request_ambiguous_owner_1",
    },
    {
      id: "evidence_boldsign",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T11:00:00.000Z"),
      signedDocumentId: "boldsign_document_1",
      templateId: "version_pdf",
      userId: "parent_1",
      documentName: "Photo waiver",
      hostId: "child_1",
      organizationId: "org_1",
      eventId: "event_1",
      teamId: null,
      status: "SIGNED",
      signedAt: "2026-08-01T10:00:00.000Z",
      signerEmail: "parent@example.com",
      roleIndex: 2,
      signerRole: "parent_guardian",
      ipAddress: "203.0.113.10",
      requestId: "request_boldsign_1",
    },
    {
      id: "evidence_boldsign_child",
      createdAt: new Date("2026-08-01T10:05:00.000Z"),
      updatedAt: new Date("2026-08-01T11:05:00.000Z"),
      signedDocumentId: "boldsign_document_1",
      templateId: "version_pdf",
      userId: "child_1",
      documentName: "Photo waiver",
      hostId: null,
      organizationId: "org_1",
      eventId: "event_1",
      teamId: null,
      status: "SIGNED",
      signedAt: "2026-08-01T10:05:00.000Z",
      signerEmail: "child@example.com",
      roleIndex: 3,
      signerRole: "child",
      ipAddress: "203.0.113.14",
      requestId: "request_boldsign_child_1",
    },
    {
      id: "evidence_incomplete_team",
      createdAt: new Date("2026-08-02T12:00:00.000Z"),
      updatedAt: new Date("2026-08-02T13:00:00.000Z"),
      signedDocumentId: "boldsign_document_team_1",
      templateId: "version_pdf",
      userId: "team_player_1",
      documentName: "Photo waiver",
      hostId: null,
      organizationId: "org_1",
      eventId: null,
      teamId: "team_1",
      status: "SIGNED",
      signedAt: "2026-08-02T12:00:00.000Z",
      signerEmail: "team-player@example.com",
      roleIndex: 2,
      signerRole: "Parent-Guardian",
      ipAddress: "203.0.113.15",
      requestId: "request_boldsign_team_1",
    },
    {
      id: "evidence_no_organization",
      createdAt: new Date("2026-08-04T10:00:00.000Z"),
      updatedAt: new Date("2026-08-04T11:00:00.000Z"),
      signedDocumentId: "missing-org-document-1",
      templateId: "version_text",
      userId: "player_1",
      documentName: "Code of conduct",
      hostId: null,
      organizationId: null,
      eventId: "event_missing_org",
      teamId: "team_missing_org",
      status: "SIGNED",
      signedAt: "2026-08-04T10:00:00.000Z",
      signerEmail: null,
      roleIndex: null,
      signerRole: "participant",
      ipAddress: "203.0.113.13",
      requestId: "request_missing_org_1",
    },
    {
      id: "evidence_text",
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T11:00:00.000Z"),
      signedDocumentId: "text-document-1",
      templateId: "version_text",
      userId: "player_1",
      documentName: "Code of conduct",
      hostId: null,
      organizationId: "org_1",
      eventId: null,
      teamId: null,
      status: "SIGNED",
      signedAt: "2026-08-02T10:00:00.000Z",
      signerEmail: null,
      roleIndex: null,
      signerRole: "participant",
      ipAddress: "203.0.113.11",
      requestId: "request_text_1",
    },
    {
      id: "evidence_unknown_signer",
      createdAt: new Date("2026-08-03T10:00:00.000Z"),
      updatedAt: new Date("2026-08-03T11:00:00.000Z"),
      signedDocumentId: "unknown-document-1",
      templateId: "version_pdf",
      userId: null,
      documentName: "Photo waiver",
      hostId: null,
      organizationId: "org_1",
      eventId: "event_unknown",
      teamId: null,
      status: "SIGNED",
      signedAt: "2026-08-03T10:00:00.000Z",
      signerEmail: null,
      roleIndex: 2,
      signerRole: "parent_guardian",
      ipAddress: "203.0.113.12",
      requestId: "request_unknown_1",
    },
  ]);
  const rows = await client.query(`
    SELECT
      "id",
      "signedDocumentId",
      "provenance",
      "providerDocumentId",
      "documentSubjectId",
      "signerUserId",
      "scopeType",
      "scopeId"
    FROM "SignedDocuments"
    ORDER BY "id"
  `);
  assert.deepEqual(rows.rows, [
    {
      id: "evidence_ambiguous_owner",
      signedDocumentId: "ambiguous-document-1",
      provenance: "BRACKETIQ",
      providerDocumentId: null,
      signerUserId: "player_1",
      documentSubjectId: null,
      scopeType: "ORGANIZATION",
      scopeId: null,
    },
    {
      id: "evidence_boldsign",
      signedDocumentId: "boldsign_document_1",
      provenance: "IMPORTED",
      providerDocumentId: "boldsign_document_1",
      signerUserId: "parent_1",
      documentSubjectId: "document-subject:org_1:child_1",
      scopeType: "EVENT_PARTICIPATION",
      scopeId: "event_1",
    },
    {
      id: "evidence_boldsign_child",
      signedDocumentId: "boldsign_document_1",
      provenance: "BOLDSIGN",
      providerDocumentId: "boldsign_document_1",
      documentSubjectId: "document-subject:org_1:child_1",
      signerUserId: "child_1",
      scopeType: "EVENT_PARTICIPATION",
      scopeId: "event_1",
    },
    {
      id: "evidence_incomplete_team",
      signedDocumentId: "boldsign_document_team_1",
      provenance: "BOLDSIGN",
      providerDocumentId: "boldsign_document_team_1",
      documentSubjectId: "document-subject:org_1:team_player_1",
      signerUserId: "team_player_1",
      scopeType: "TEAM_MEMBERSHIP",
      scopeId: "team_1",
    },
    {
      id: "evidence_no_organization",
      signedDocumentId: "missing-org-document-1",
      provenance: "BRACKETIQ",
      providerDocumentId: null,
      documentSubjectId: "document-subject:org_1:player_1",
      signerUserId: "player_1",
      scopeType: "ORGANIZATION",
      scopeId: "org_1",
    },
    {
      id: "evidence_text",
      signedDocumentId: "text-document-1",
      provenance: "BRACKETIQ",
      providerDocumentId: null,
      documentSubjectId: "document-subject:org_1:player_1",
      signerUserId: "player_1",
      scopeType: "ORGANIZATION",
      scopeId: "org_1",
    },
    {
      id: "evidence_unknown_signer",
      signedDocumentId: "unknown-document-1",
      provenance: "BOLDSIGN",
      providerDocumentId: "unknown-document-1",
      documentSubjectId: null,
      signerUserId: null,
      scopeType: "EVENT_PARTICIPATION",
      scopeId: "event_unknown",
    },
  ]);
  const unownedEvidence = await client.query(`
    SELECT
      sd."organizationId",
      sd."eventId",
      sd."teamId",
      sd."documentSubjectId",
      sd."signerUserId",
      sd."scopeType",
      sd."scopeId",
      ds."id" AS "subjectRowId",
      satisfaction."id" AS "satisfactionId",
      contributor."satisfactionId" AS "contributorSatisfactionId"
    FROM "SignedDocuments" sd
    LEFT JOIN "DocumentSubjects" ds ON ds."id" = sd."documentSubjectId"
    LEFT JOIN "DocumentRequirementSatisfactions" satisfaction
      ON satisfaction."sourceEvidenceId" = sd."id"
    LEFT JOIN "DocumentRequirementSatisfactionEvidence" contributor
      ON contributor."signedDocumentId" = sd."id"
    WHERE sd."id" = 'evidence_no_organization'
  `);
  assert.deepEqual(unownedEvidence.rows, [{
    organizationId: "org_1",
    eventId: "event_missing_org",
    teamId: "team_missing_org",
    documentSubjectId: "document-subject:org_1:player_1",
    signerUserId: "player_1",
    scopeType: "ORGANIZATION",
    scopeId: "org_1",
    subjectRowId: "document-subject:org_1:player_1",
    satisfactionId: null,
    contributorSatisfactionId: "document-satisfaction:evidence_text",
  }]);
  const repairedSubjectTimestamps = await client.query(`
    SELECT
      "createdAt",
      "updatedAt"
    FROM "DocumentSubjects"
    WHERE "id" = 'document-subject:org_1:player_1'
  `);
  assert.deepEqual(repairedSubjectTimestamps.rows, [{
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-04T11:00:00.000Z"),
  }]);

  const contributorRoles = await client.query(`
    SELECT
      contributor."signedDocumentId",
      contributor."completedSignerRoles"
    FROM "DocumentRequirementSatisfactionEvidence" contributor
    WHERE contributor."satisfactionId" = 'document-satisfaction:evidence_boldsign_child'
    ORDER BY contributor."signedDocumentId"
  `);
  assert.deepEqual(contributorRoles.rows, [
    {
      signedDocumentId: "evidence_boldsign",
      completedSignerRoles: ["Parent/Guardian", "Child"],
    },
    {
      signedDocumentId: "evidence_boldsign_child",
      completedSignerRoles: ["Child"],
    },
  ]);
  const historicalContributors = await client.query(`
    SELECT "signedDocumentId"
    FROM "DocumentRequirementSatisfactionEvidence"
    WHERE "satisfactionId" = 'document-satisfaction:evidence_boldsign'
  `);
  assert.deepEqual(historicalContributors.rows, []);
  const ambiguousEvidence = await client.query(`
    SELECT
      "organizationId",
      "documentSubjectId",
      "scopeId"
    FROM "SignedDocuments"
    WHERE "id" = 'evidence_ambiguous_owner'
  `);
  assert.deepEqual(ambiguousEvidence.rows, [{
    organizationId: null,
    documentSubjectId: null,
    scopeId: null,
  }]);

  const unknownStructuredSigner = await client.query(`
    SELECT
      "userId",
      "signerRole",
      "signerUserId",
      "documentSubjectId"
    FROM "SignedDocuments"
    WHERE "id" = 'evidence_unknown_signer'
  `);
  assert.deepEqual(unknownStructuredSigner.rows, [{
    userId: null,
    signerRole: "parent_guardian",
    signerUserId: null,
    documentSubjectId: null,
  }]);

  const satisfactions = await client.query(`
    SELECT
      "sourceEvidenceId",
      "documentSubjectId",
      "templateDocumentId",
      "status",
      "isComplete",
      "requiredSignerRoles",
      "completedSignerRoles"
    FROM "DocumentRequirementSatisfactions"
    ORDER BY "sourceEvidenceId"
  `);
  assert.deepEqual(satisfactions.rows, [
    {
      sourceEvidenceId: "evidence_boldsign",
      documentSubjectId: "document-subject:org_1:child_1",
      templateDocumentId: "version_pdf",
      status: "INVALIDATED",
      isComplete: false,
      requiredSignerRoles: ["Parent/Guardian", "Child"],
      completedSignerRoles: [],
    },
    {
      sourceEvidenceId: "evidence_boldsign_child",
      documentSubjectId: "document-subject:org_1:child_1",
      templateDocumentId: "version_pdf",
      status: "SATISFIED",
      isComplete: true,
      requiredSignerRoles: ["Parent/Guardian", "Child"],
      completedSignerRoles: ["Child", "Parent/Guardian"],
    },
    {
      sourceEvidenceId: "evidence_incomplete_team",
      documentSubjectId: "document-subject:org_1:team_player_1",
      templateDocumentId: "version_pdf",
      status: "PENDING",
      isComplete: false,
      requiredSignerRoles: ["Parent/Guardian", "Child"],
      completedSignerRoles: ["Parent/Guardian"],
    },
    {
      sourceEvidenceId: "evidence_text",
      documentSubjectId: "document-subject:org_1:player_1",
      templateDocumentId: "version_text",
      status: "SATISFIED",
      isComplete: true,
      requiredSignerRoles: ["Participant"],
      completedSignerRoles: ["Participant"],
    },
  ]);

  const templateRowsAfter = await client.query(`
    SELECT
      "id",
      "templateId",
      "type",
      "title",
      "description",
      "content",
      "signOnce",
      "requiredSignerType",
      "roleIndex",
      "signerRoles"
    FROM "TemplateDocuments"
    ORDER BY "id"
  `);
  assert.deepEqual(templateRowsAfter.rows, templateRowsBefore.rows);

  const templates = await client.query(
    'SELECT "id", "content", "templateId", "frozenAt" IS NOT NULL AS "isFrozen" FROM "TemplateDocuments" ORDER BY "id"',
  );
  assert.deepEqual(templates.rows, [
    {
      id: "version_pdf",
      content: null,
      templateId: "boldsign_template_1",
      isFrozen: true,
    },
    {
      id: "version_text",
      content: "I agree.",
      templateId: null,
      isFrozen: true,
    },
  ]);
  let transactionFailed = false;
  await client.query("BEGIN");
  try {
    await client.query(`
      INSERT INTO "DocumentSubjects" (
        "id", "createdAt", "updatedAt", "organizationId", "userId"
      ) VALUES (
        'transaction-subject', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'org_1', 'transaction-user'
      )
    `);
    await client.query(`
      INSERT INTO "SignedDocuments" (
        "id", "createdAt", "updatedAt", "signedDocumentId", "templateId", "userId",
        "documentName", "organizationId", "status"
      ) VALUES (
        'transaction-evidence', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        'transaction-provider-document', 'version_text', 'transaction-user',
        'Transaction evidence', 'org_1', 'SIGNED'
      )
    `);
    await client.query(`
      INSERT INTO "DocumentRequirementSatisfactions" (
        "id", "createdAt", "updatedAt", "organizationId", "documentRequirementId",
        "templateDocumentId", "documentSubjectId", "scopeType", "scopeId",
        "sourceEvidenceId", "status", "isComplete", "requiredSignerRoles",
        "completedSignerRoles"
      ) VALUES (
        'transaction-satisfaction', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'org_1',
        'requirement_text', 'version_text', 'transaction-subject', 'ORGANIZATION',
        'org_1', 'transaction-evidence', 'SATISFIED', TRUE, ARRAY['Participant']::TEXT[],
        ARRAY['Participant']::TEXT[]
      )
    `);
    await client.query(`
      INSERT INTO "DocumentEvidenceAuditEvents" (
        "id", "createdAt", "organizationId", "signedDocumentId", "eventType"
      ) VALUES (
        'transaction-audit', CURRENT_TIMESTAMP, 'org_1', 'transaction-evidence', 'IMPORT'
      )
    `);
    await client.query("SELECT 1 / 0");
  } catch {
    transactionFailed = true;
    await client.query("ROLLBACK");
  }
  assert.equal(transactionFailed, true);
  const rolledBackWrites = await client.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM "DocumentSubjects" WHERE "id" = 'transaction-subject') AS "subjects",
      (SELECT COUNT(*)::INTEGER FROM "SignedDocuments" WHERE "id" = 'transaction-evidence') AS "evidence",
      (SELECT COUNT(*)::INTEGER FROM "DocumentRequirementSatisfactions" WHERE "id" = 'transaction-satisfaction') AS "satisfactions",
      (SELECT COUNT(*)::INTEGER FROM "DocumentEvidenceAuditEvents" WHERE "id" = 'transaction-audit') AS "auditEvents"
  `);
  assert.deepEqual(rolledBackWrites.rows, [{
    subjects: 0,
    evidence: 0,
    satisfactions: 0,
    auditEvents: 0,
  }]);

  const concurrentClients = [
    new Client({ connectionString }),
    new Client({ connectionString }),
  ];
  try {
    await Promise.all(concurrentClients.map(async (connection) => {
      await connection.connect();
      await connection.query(`SET search_path TO ${quotedFixtureSchema}`);
    }));
    const concurrentIdentity = JSON.stringify([
      "document-requirement-satisfaction",
      "org_1",
      "requirement_text",
      "version_text",
      "document-subject:org_1:concurrent_player",
      "ORGANIZATION",
      "org_1",
    ]);
    const concurrentLockId = BigInt.asIntN(
      64,
      createHash("sha256").update(concurrentIdentity).digest().readBigInt64BE(0),
    );
    const writeConcurrentSatisfaction = async (connection, evidenceId, signerRole) => {
      await connection.query("BEGIN");
      await connection.query(
        "SELECT pg_advisory_xact_lock($1::bigint)",
        [concurrentLockId.toString()],
      );
      const existing = await connection.query(`
        SELECT "id", "completedSignerRoles"
        FROM "DocumentRequirementSatisfactions"
        WHERE "organizationId" = 'org_1'
          AND "documentRequirementId" = 'requirement_text'
          AND "templateDocumentId" = 'version_text'
          AND "documentSubjectId" = 'document-subject:org_1:concurrent_player'
          AND "scopeType" = 'ORGANIZATION'
          AND "scopeId" = 'org_1'
          AND "status" <> 'INVALIDATED'
        ORDER BY "updatedAt" DESC
        LIMIT 1
      `);
      const createdAt = new Date();
      if (existing.rowCount === 0) {
        await connection.query(`
          INSERT INTO "DocumentRequirementSatisfactions" (
            "id", "createdAt", "updatedAt", "organizationId", "documentRequirementId",
            "templateDocumentId", "documentSubjectId", "scopeType", "scopeId",
            "sourceEvidenceId", "status", "isComplete", "requiredSignerRoles",
            "completedSignerRoles"
          ) VALUES (
            $1, $2, $2, 'org_1', 'requirement_text', 'version_text',
            'document-subject:org_1:concurrent_player', 'ORGANIZATION', 'org_1',
            $3, 'PENDING', FALSE, ARRAY['Parent/Guardian', 'Participant']::TEXT[], $4::TEXT[]
          )
        `, [
          `document-satisfaction:${evidenceId}`,
          createdAt,
          evidenceId,
          [signerRole],
        ]);
      } else {
        await connection.query(`
          UPDATE "DocumentRequirementSatisfactions"
          SET
            "updatedAt" = $1,
            "completedSignerRoles" = ARRAY(
              SELECT DISTINCT role
              FROM unnest("completedSignerRoles" || $2::TEXT[]) AS role
              ORDER BY role
            ),
            "status" = CASE
              WHEN ARRAY['Parent/Guardian', 'Participant']::TEXT[]
                <@ ("completedSignerRoles" || $2::TEXT[])
                THEN 'SATISFIED'::"DocumentRequirementSatisfactionStatusEnum"
              ELSE 'PENDING'::"DocumentRequirementSatisfactionStatusEnum"
            END,
            "isComplete" = ARRAY['Parent/Guardian', 'Participant']::TEXT[]
              <@ ("completedSignerRoles" || $2::TEXT[])
          WHERE "id" = $3
        `, [createdAt, [signerRole], existing.rows[0].id]);
      }
      await connection.query("COMMIT");
    };
    await Promise.all([
      writeConcurrentSatisfaction(concurrentClients[0], "concurrency_parent", "Parent/Guardian"),
      writeConcurrentSatisfaction(concurrentClients[1], "concurrency_child", "Participant"),
    ]);
    const concurrentRows = await concurrentClients[0].query(`
      SELECT
        COUNT(*)::INTEGER AS "count",
        BOOL_AND("isComplete") AS "isComplete",
        ARRAY_AGG("completedSignerRoles" ORDER BY "id") AS "completedSignerRoles"
      FROM "DocumentRequirementSatisfactions"
      WHERE "documentSubjectId" = 'document-subject:org_1:concurrent_player'
    `);
    assert.deepEqual(concurrentRows.rows, [{
      count: 1,
      isComplete: true,
      completedSignerRoles: [["Parent/Guardian", "Participant"]],
    }]);
  } finally {
    await Promise.all(concurrentClients.map((connection) => (
      connection.end().catch(() => undefined)
    )));
  }

  console.log("Document Evidence migration fixture passed.");
} finally {
  if (connected) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("SET search_path TO public").catch(() => undefined);
    await client
      .query(`DROP SCHEMA IF EXISTS ${quotedFixtureSchema} CASCADE`)
      .catch(() => undefined);
    await client.end();
  }
}
