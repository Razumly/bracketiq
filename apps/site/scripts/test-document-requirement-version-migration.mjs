import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

process.env.TZ = 'UTC';
const { Client } = pg;

const connectionString = process.env.DOCUMENT_VERSION_MIGRATION_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'Set DOCUMENT_VERSION_MIGRATION_TEST_DATABASE_URL to a disposable local PostgreSQL database URL.',
  );
}

const parsedConnection = new URL(connectionString);
const hostname = parsedConnection.hostname.replace(/^\[|\]$/g, '').toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
  throw new Error('The Document Requirement migration fixture refuses non-loopback databases.');
}

const fixtureSchema = `document_version_fixture_${process.pid}_${Date.now()}`;
if (!/^[a-z0-9_]+$/.test(fixtureSchema)) {
  throw new Error('Unable to create a safe fixture schema name.');
}
const quotedFixtureSchema = `"${fixtureSchema}"`;
const migrationRoot = path.join(process.cwd(), 'prisma', 'migrations');
const expansionMigrationPath = path.join(
  migrationRoot,
  '20260821010000_add_document_requirement_versions',
  'migration.sql',
);
const ownershipMigrationPath = path.join(
  migrationRoot,
  '20260821020000_enforce_document_requirement_ownership',
  'migration.sql',
);

const client = new Client({ connectionString });
let connected = false;

const expectRejectedInsert = async (params) => {
  const savepoint = `document_version_constraint_${params.sequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await client.query(
      `INSERT INTO "TemplateDocuments" (
        "id",
        "documentRequirementId",
        "versionSequence",
        "type",
        "organizationId",
        "title",
        "requiredSignerType",
        "roleIndexes",
        "signerRoles"
      ) VALUES ($1, $2, $3, 'TEXT', $4, 'Rejected version', 'PARTICIPANT', ARRAY[]::INTEGER[], ARRAY[]::TEXT[])`,
      [params.id, params.documentRequirementId, params.versionSequence, params.organizationId],
    );
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.ok(rejection, `Expected ${params.id} to be rejected.`);
  assert.equal(rejection.constraint, params.expectedConstraint);
};

try {
  await client.connect();
  connected = true;
  await client.query(`CREATE SCHEMA ${quotedFixtureSchema}`);
  await client.query(`SET search_path TO ${quotedFixtureSchema}`);
  await client.query(`
    CREATE TABLE "Organizations" (
      "id" TEXT NOT NULL PRIMARY KEY
    );
    CREATE TABLE "TemplateDocuments" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "createdAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3),
      "templateId" TEXT,
      "type" TEXT,
      "organizationId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "signOnce" BOOLEAN,
      "requiredSignerType" TEXT NOT NULL DEFAULT 'PARTICIPANT',
      "status" TEXT,
      "createdBy" TEXT,
      "roleIndex" INTEGER,
      "roleIndexes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      "signerRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "content" TEXT
    );
    CREATE TABLE "Events" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "CanonicalTeams" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );

    INSERT INTO "Organizations" ("id") VALUES ('org_1'), ('org_2');
    INSERT INTO "TemplateDocuments" (
      "id",
      "createdAt",
      "updatedAt",
      "templateId",
      "type",
      "organizationId",
      "title",
      "description",
      "signOnce",
      "requiredSignerType",
      "status",
      "createdBy",
      "roleIndex",
      "roleIndexes",
      "signerRoles",
      "content"
    ) VALUES
      (
        'version_pdf_1',
        '2026-08-01 10:00:00',
        '2026-08-02 10:00:00',
        'boldsign_template_1',
        'PDF',
        'org_1',
        'Photo waiver',
        'Event photography consent',
        true,
        'PARENT_GUARDIAN_CHILD',
        'ACTIVE',
        'staff_1',
        2,
        ARRAY[2, 3],
        ARRAY['parent_guardian', 'child'],
        NULL
      ),
      (
        'version_text_1',
        '2026-08-03 10:00:00',
        '2026-08-04 10:00:00',
        NULL,
        'TEXT',
        'org_1',
        'Code of conduct',
        'Player behavior rules',
        false,
        'PARTICIPANT',
        'ACTIVE',
        'staff_2',
        0,
        ARRAY[]::INTEGER[],
        ARRAY[]::TEXT[],
        'I agree to follow the code of conduct.'
      );

    INSERT INTO "Events" ("id", "requiredTemplateIds")
    VALUES ('event_1', ARRAY['version_pdf_1', 'version_text_1']);
    INSERT INTO "CanonicalTeams" ("id", "requiredTemplateIds")
    VALUES ('team_1', ARRAY['version_text_1', 'version_pdf_1']);
  `);

  const expansionMigration = await readFile(expansionMigrationPath, 'utf8');
  const ownershipMigration = await readFile(ownershipMigrationPath, 'utf8');
  await client.query(expansionMigration);
  await client.query(ownershipMigration);

  const versions = await client.query(`
    SELECT
      "id",
      "createdAt",
      "updatedAt",
      "templateId",
      "documentRequirementId",
      "versionSequence",
      "frozenAt",
      "type",
      "organizationId",
      "title",
      "description",
      "signOnce",
      "requiredSignerType",
      "status",
      "createdBy",
      "roleIndex",
      "roleIndexes",
      "signerRoles",
      "content"
    FROM "TemplateDocuments"
    ORDER BY "id"
  `);
  assert.equal(versions.rows.length, 2);
  assert.deepEqual(versions.rows[0], {
    id: 'version_pdf_1',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    templateId: 'boldsign_template_1',
    documentRequirementId: 'document-requirement:version_pdf_1',
    versionSequence: 1,
    frozenAt: null,
    type: 'PDF',
    organizationId: 'org_1',
    title: 'Photo waiver',
    description: 'Event photography consent',
    signOnce: true,
    requiredSignerType: 'PARENT_GUARDIAN_CHILD',
    status: 'ACTIVE',
    createdBy: 'staff_1',
    roleIndex: 2,
    roleIndexes: [2, 3],
    signerRoles: ['parent_guardian', 'child'],
    content: null,
  });
  assert.deepEqual(versions.rows[1], {
    id: 'version_text_1',
    createdAt: new Date('2026-08-03T10:00:00.000Z'),
    updatedAt: new Date('2026-08-04T10:00:00.000Z'),
    templateId: null,
    documentRequirementId: 'document-requirement:version_text_1',
    versionSequence: 1,
    frozenAt: null,
    type: 'TEXT',
    organizationId: 'org_1',
    title: 'Code of conduct',
    description: 'Player behavior rules',
    signOnce: false,
    requiredSignerType: 'PARTICIPANT',
    status: 'ACTIVE',
    createdBy: 'staff_2',
    roleIndex: 0,
    roleIndexes: [],
    signerRoles: [],
    content: 'I agree to follow the code of conduct.',
  });

  const requirements = await client.query(`
    SELECT "id", "organizationId", "title", "description", "createdBy", "status"
    FROM "DocumentRequirements"
    ORDER BY "id"
  `);
  assert.deepEqual(requirements.rows, [
    {
      id: 'document-requirement:version_pdf_1',
      organizationId: 'org_1',
      title: 'Photo waiver',
      description: 'Event photography consent',
      createdBy: 'staff_1',
      status: 'ACTIVE',
    },
    {
      id: 'document-requirement:version_text_1',
      organizationId: 'org_1',
      title: 'Code of conduct',
      description: 'Player behavior rules',
      createdBy: 'staff_2',
      status: 'ACTIVE',
    },
  ]);
  assert.deepEqual(
    (await client.query('SELECT "requiredTemplateIds" FROM "Events" WHERE "id" = $1', ['event_1'])).rows[0].requiredTemplateIds,
    ['version_pdf_1', 'version_text_1'],
  );
  assert.deepEqual(
    (await client.query('SELECT "requiredTemplateIds" FROM "CanonicalTeams" WHERE "id" = $1', ['team_1'])).rows[0].requiredTemplateIds,
    ['version_text_1', 'version_pdf_1'],
  );

  const versionSequenceColumn = await client.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'TemplateDocuments'
      AND column_name = 'versionSequence'
  `, [fixtureSchema]);
  assert.equal(versionSequenceColumn.rows[0].column_default, null);

  await client.query('BEGIN');
  await expectRejectedInsert({
    sequence: 1,
    id: 'version_wrong_org',
    documentRequirementId: 'document-requirement:version_pdf_1',
    versionSequence: 2,
    organizationId: 'org_2',
    expectedConstraint: 'TemplateDocuments_documentRequirement_organization_fkey',
  });
  await expectRejectedInsert({
    sequence: 2,
    id: 'version_unknown_requirement',
    documentRequirementId: 'document-requirement:missing',
    versionSequence: 1,
    organizationId: 'org_1',
    expectedConstraint: 'TemplateDocuments_documentRequirement_organization_fkey',
  });
  await expectRejectedInsert({
    sequence: 3,
    id: 'version_duplicate_sequence',
    documentRequirementId: 'document-requirement:version_pdf_1',
    versionSequence: 1,
    organizationId: 'org_1',
    expectedConstraint: 'TemplateDocuments_documentRequirementId_versionSequence_key',
  });
  await client.query('COMMIT');

  console.log('Document Requirement and Document Template Version migration fixture passed.');
} finally {
  if (connected) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('SET search_path TO public').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${quotedFixtureSchema} CASCADE`).catch(() => undefined);
    await client.end();
  }
}
