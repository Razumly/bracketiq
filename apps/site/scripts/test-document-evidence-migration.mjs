import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

process.env.TZ = 'UTC';
const { Client } = pg;
const connectionString = process.env.DOCUMENT_EVIDENCE_MIGRATION_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('Set DOCUMENT_EVIDENCE_MIGRATION_TEST_DATABASE_URL to a disposable local PostgreSQL database URL.');
}

const parsedConnection = new URL(connectionString);
const hostname = parsedConnection.hostname.replace(/^\[|\]$/g, '').toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
  throw new Error('The Document Evidence migration fixture refuses non-loopback databases.');
}

const fixtureSchema = `document_evidence_fixture_${process.pid}_${Date.now()}`;
const quotedFixtureSchema = `"${fixtureSchema}"`;
const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260821040000_add_document_evidence_satisfaction',
  'migration.sql',
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
      "userId" TEXT NOT NULL,
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
      "organizationId", "eventId", "teamId", "status", "signedAt", "signerEmail", "roleIndex", "signerRole"
    ) VALUES
      ('evidence_boldsign', '2026-08-01 10:00:00', '2026-08-01 11:00:00', 'boldsign_document_1', 'version_pdf', 'parent_1', 'Photo waiver', 'child_1', 'org_1', 'event_1', NULL, 'SIGNED', '2026-08-01T10:00:00.000Z', 'parent@example.com', 2, 'parent_guardian'),
      ('evidence_text', '2026-08-02 10:00:00', '2026-08-02 11:00:00', 'text-document-1', 'version_text', 'player_1', 'Code of conduct', NULL, 'org_1', NULL, NULL, 'SIGNED', '2026-08-02T10:00:00.000Z', NULL, NULL, 'participant');
  `);

  await client.query(await readFile(migrationPath, 'utf8'));
  const rows = await client.query(`
    SELECT "id", "signedDocumentId", "provenance", "providerDocumentId", "documentSubjectId", "signerUserId", "scopeType", "scopeId"
    FROM "SignedDocuments"
    ORDER BY "id"
  `);
  assert.deepEqual(rows.rows, [
    {
      id: 'evidence_boldsign',
      signedDocumentId: 'boldsign_document_1',
      provenance: 'BOLDSIGN',
      providerDocumentId: 'boldsign_document_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      signerUserId: 'parent_1',
      scopeType: 'EVENT_PARTICIPATION',
      scopeId: 'event_1',
    },
    {
      id: 'evidence_text',
      signedDocumentId: 'text-document-1',
      provenance: 'BRACKETIQ',
      providerDocumentId: null,
      documentSubjectId: 'document-subject:org_1:player_1',
      signerUserId: 'player_1',
      scopeType: 'ORGANIZATION',
      scopeId: 'org_1',
    },
  ]);

  const satisfactions = await client.query(`
    SELECT "sourceEvidenceId", "documentSubjectId", "templateDocumentId", "status"
    FROM "DocumentRequirementSatisfactions"
    ORDER BY "sourceEvidenceId"
  `);
  assert.deepEqual(satisfactions.rows, [
    {
      sourceEvidenceId: 'evidence_boldsign',
      documentSubjectId: 'document-subject:org_1:child_1',
      templateDocumentId: 'version_pdf',
      status: 'SATISFIED',
    },
    {
      sourceEvidenceId: 'evidence_text',
      documentSubjectId: 'document-subject:org_1:player_1',
      templateDocumentId: 'version_text',
      status: 'SATISFIED',
    },
  ]);

  const templates = await client.query('SELECT "id", "content", "templateId", "frozenAt" IS NOT NULL AS "isFrozen" FROM "TemplateDocuments" ORDER BY "id"');
  assert.deepEqual(templates.rows, [
    { id: 'version_pdf', content: null, templateId: 'boldsign_template_1', isFrozen: true },
    { id: 'version_text', content: 'I agree.', templateId: null, isFrozen: true },
  ]);
  console.log('Document Evidence migration fixture passed.');
} finally {
  if (connected) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('SET search_path TO public').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${quotedFixtureSchema} CASCADE`).catch(() => undefined);
    await client.end();
  }
}
