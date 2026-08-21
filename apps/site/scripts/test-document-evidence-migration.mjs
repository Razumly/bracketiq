import assert from "node:assert/strict";
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
    INSERT INTO "Organizations" ("id") VALUES ('org_1');
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
        NULL,
        'Code of conduct',
        NULL,
        NULL,
        'event_missing_org',
        'team_missing_org',
        'SIGNED',
        '2026-08-04T10:00:00.000Z',
        NULL,
        NULL,
        NULL,
        '203.0.113.13',
        'request_missing_org_1'
      );

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
  await client.query(await readFile(forwardRepairMigrationPath, "utf8"));
  const signerColumn = await client.query(`
    SELECT "is_nullable"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SignedDocuments'
      AND column_name = 'userId'
  `);
  assert.deepEqual(signerColumn.rows, [{ is_nullable: "YES" }]);
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
  assert.deepEqual(legacyRowsAfter.rows, legacyRowsBefore.rows);
  assert.deepEqual(legacyRowsBefore.rows, [
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
      userId: null,
      documentName: "Code of conduct",
      hostId: null,
      organizationId: null,
      eventId: "event_missing_org",
      teamId: "team_missing_org",
      status: "SIGNED",
      signedAt: "2026-08-04T10:00:00.000Z",
      signerEmail: null,
      roleIndex: null,
      signerRole: null,
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
      id: "evidence_boldsign",
      signedDocumentId: "boldsign_document_1",
      provenance: "BOLDSIGN",
      providerDocumentId: "boldsign_document_1",
      documentSubjectId: "document-subject:org_1:child_1",
      signerUserId: "parent_1",
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
      documentSubjectId: null,
      signerUserId: null,
      scopeType: "ORGANIZATION",
      scopeId: null,
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
      satisfaction."id" AS "satisfactionId"
    FROM "SignedDocuments" sd
    LEFT JOIN "DocumentSubjects" ds ON ds."id" = sd."documentSubjectId"
    LEFT JOIN "DocumentRequirementSatisfactions" satisfaction
      ON satisfaction."sourceEvidenceId" = sd."id"
    WHERE sd."id" = 'evidence_no_organization'
  `);
  assert.deepEqual(unownedEvidence.rows, [{
    organizationId: null,
    eventId: "event_missing_org",
    teamId: "team_missing_org",
    documentSubjectId: null,
    signerUserId: null,
    scopeType: "ORGANIZATION",
    scopeId: null,
    subjectRowId: null,
    satisfactionId: null,
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
      status: "SATISFIED",
      isComplete: true,
      requiredSignerRoles: ["parent_guardian", "child"],
      completedSignerRoles: ["child", "parent_guardian"],
    },
    {
      sourceEvidenceId: "evidence_incomplete_team",
      documentSubjectId: "document-subject:org_1:team_player_1",
      templateDocumentId: "version_pdf",
      status: "PENDING",
      isComplete: false,
      requiredSignerRoles: ["parent_guardian", "child"],
      completedSignerRoles: ["Parent-Guardian"],
    },
    {
      sourceEvidenceId: "evidence_text",
      documentSubjectId: "document-subject:org_1:player_1",
      templateDocumentId: "version_text",
      status: "SATISFIED",
      isComplete: true,
      requiredSignerRoles: ["Participant"],
      completedSignerRoles: ["participant"],
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
