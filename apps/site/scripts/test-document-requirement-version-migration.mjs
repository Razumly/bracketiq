import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

process.env.TZ = "UTC";
const { Client } = pg;

const connectionString =
  process.env.DOCUMENT_VERSION_MIGRATION_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "Set DOCUMENT_VERSION_MIGRATION_TEST_DATABASE_URL to a disposable local PostgreSQL database URL.",
  );
}

const parsedConnection = new URL(connectionString);
const hostname = parsedConnection.hostname
  .replace(/^\[|\]$/g, "")
  .toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error(
    "The Document Requirement migration fixture refuses non-loopback databases.",
  );
}

const fixtureSchema = `document_version_fixture_${process.pid}_${Date.now()}`;
if (!/^[a-z0-9_]+$/.test(fixtureSchema)) {
  throw new Error("Unable to create a safe fixture schema name.");
}
const quotedFixtureSchema = `"${fixtureSchema}"`;
const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
const expansionMigrationPath = path.join(
  migrationRoot,
  "20260821010000_add_document_requirement_versions",
  "migration.sql",
);
const ownershipMigrationPath = path.join(
  migrationRoot,
  "20260821020000_enforce_document_requirement_ownership",
  "migration.sql",
);
const immutabilityMigrationPath = path.join(
  migrationRoot,
  "20260821030000_enforce_immutable_document_template_versions",
  "migration.sql",
);

const client = new Client({ connectionString });
const reloadClient = new Client({ connectionString });
let connected = false;
let reloadConnected = false;

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
      [
        params.id,
        params.documentRequirementId,
        params.versionSequence,
        params.organizationId,
      ],
    );
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.ok(rejection, `Expected ${params.id} to be rejected.`);
  assert.equal(rejection.constraint, params.expectedConstraint);
};
const expectRejectedMaterialUpdate = async (params) => {
  const savepoint = `document_version_material_update_${params.sequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await client.query(
      `UPDATE "TemplateDocuments" SET "${params.column}" = $1 WHERE "id" = $2`,
      [params.value, params.id],
    );
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.ok(rejection, `Expected ${params.id} ${params.column} update to be rejected.`);
  assert.equal(rejection.code, "23514");
  assert.match(
    rejection.message,
    /frozen and cannot be materially edited/,
  );
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
    CREATE TABLE "Teams" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "EventTemplates" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "TimeSlots" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "hostRequiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "EventTemplateTimeSlots" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "hostRequiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "RentalBookingItems" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "hostRequiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    );
    CREATE TABLE "SignedDocuments" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "templateId" TEXT NOT NULL
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
    INSERT INTO "Teams" ("id", "requiredTemplateIds")
    VALUES ('team_1', ARRAY['version_text_1', 'version_pdf_1']);
    INSERT INTO "EventTemplates" ("id", "requiredTemplateIds")
    VALUES ('event_template_1', ARRAY['version_pdf_1']);
    INSERT INTO "TimeSlots" ("id", "requiredTemplateIds", "hostRequiredTemplateIds")
    VALUES ('slot_1', ARRAY['version_text_1'], ARRAY['version_pdf_1']);
    INSERT INTO "EventTemplateTimeSlots" ("id", "requiredTemplateIds", "hostRequiredTemplateIds")
    VALUES ('event_template_slot_1', ARRAY['version_pdf_1'], ARRAY['version_text_1']);
    INSERT INTO "RentalBookingItems" ("id", "requiredTemplateIds", "hostRequiredTemplateIds")
    VALUES ('rental_item_1', ARRAY['version_text_1'], ARRAY['version_pdf_1']);
    INSERT INTO "SignedDocuments" ("id", "templateId")
    VALUES ('signed_pdf_1', 'version_pdf_1'), ('signed_text_1', 'version_text_1');
  `);

  const expansionMigration = await readFile(expansionMigrationPath, "utf8");
  const ownershipMigration = await readFile(ownershipMigrationPath, "utf8");
  const immutabilityMigration = await readFile(
    immutabilityMigrationPath,
    "utf8",
  );
  await client.query(expansionMigration);
  await client.query(ownershipMigration);
  await client.query(immutabilityMigration);
  await reloadClient.connect();
  reloadConnected = true;
  await reloadClient.query(`SET search_path TO ${quotedFixtureSchema}`);

  const versions = await reloadClient.query(`
    SELECT
      "id",
      "createdAt",
      "templateId",
      "documentRequirementId",
      "versionSequence",
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
    id: "version_pdf_1",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    templateId: "boldsign_template_1",
    documentRequirementId: "document-requirement:version_pdf_1",
    versionSequence: 1,
    type: "PDF",
    organizationId: "org_1",
    title: "Photo waiver",
    description: "Event photography consent",
    signOnce: true,
    requiredSignerType: "PARENT_GUARDIAN_CHILD",
    status: "ACTIVE",
    createdBy: "staff_1",
    roleIndex: 2,
    roleIndexes: [2, 3],
    signerRoles: ["parent_guardian", "child"],
    content: null,
  });
  assert.deepEqual(versions.rows[1], {
    id: "version_text_1",
    createdAt: new Date("2026-08-03T10:00:00.000Z"),
    templateId: null,
    documentRequirementId: "document-requirement:version_text_1",
    versionSequence: 1,
    type: "TEXT",
    organizationId: "org_1",
    title: "Code of conduct",
    description: "Player behavior rules",
    signOnce: false,
    requiredSignerType: "PARTICIPANT",
    status: "ACTIVE",
    createdBy: "staff_2",
    roleIndex: 0,
    roleIndexes: [],
    signerRoles: [],
    content: "I agree to follow the code of conduct.",
  });

  const frozenVersions = await reloadClient.query(`
    SELECT "id", "frozenAt" IS NOT NULL AS "isFrozen"
    FROM "TemplateDocuments"
    ORDER BY "id"
  `);
  assert.deepEqual(frozenVersions.rows, [
    { id: "version_pdf_1", isFrozen: true },
    { id: "version_text_1", isFrozen: true },
  ]);

  const requirements = await reloadClient.query(`
    SELECT "id", "organizationId", "title", "description", "createdBy", "status"
    FROM "DocumentRequirements"
    ORDER BY "id"
  `);
  assert.deepEqual(requirements.rows, [
    {
      id: "document-requirement:version_pdf_1",
      organizationId: "org_1",
      title: "Photo waiver",
      description: "Event photography consent",
      createdBy: "staff_1",
      status: "ACTIVE",
    },
    {
      id: "document-requirement:version_text_1",
      organizationId: "org_1",
      title: "Code of conduct",
      description: "Player behavior rules",
      createdBy: "staff_2",
      status: "ACTIVE",
    },
  ]);
  assert.deepEqual(
    (
      await reloadClient.query(
        'SELECT "requiredTemplateIds" FROM "Events" WHERE "id" = $1',
        ["event_1"],
      )
    ).rows[0].requiredTemplateIds,
    ["version_pdf_1", "version_text_1"],
  );
  assert.deepEqual(
    (
      await reloadClient.query(
        'SELECT "requiredTemplateIds" FROM "Teams" WHERE "id" = $1',
        ["team_1"],
      )
    ).rows[0].requiredTemplateIds,
    ["version_text_1", "version_pdf_1"],
  );
  const reloadedAssignmentArrays = await reloadClient.query(`
    SELECT 'event_template' AS "source", "requiredTemplateIds", NULL::TEXT[] AS "hostRequiredTemplateIds"
    FROM "EventTemplates" WHERE "id" = 'event_template_1'
    UNION ALL
    SELECT 'time_slot', "requiredTemplateIds", "hostRequiredTemplateIds"
    FROM "TimeSlots" WHERE "id" = 'slot_1'
    UNION ALL
    SELECT 'event_template_time_slot', "requiredTemplateIds", "hostRequiredTemplateIds"
    FROM "EventTemplateTimeSlots" WHERE "id" = 'event_template_slot_1'
    UNION ALL
    SELECT 'rental_booking_item', "requiredTemplateIds", "hostRequiredTemplateIds"
    FROM "RentalBookingItems" WHERE "id" = 'rental_item_1'
    ORDER BY "source"
  `);
  assert.deepEqual(reloadedAssignmentArrays.rows, [
    {
      source: "event_template",
      requiredTemplateIds: ["version_pdf_1"],
      hostRequiredTemplateIds: null,
    },
    {
      source: "event_template_time_slot",
      requiredTemplateIds: ["version_pdf_1"],
      hostRequiredTemplateIds: ["version_text_1"],
    },
    {
      source: "rental_booking_item",
      requiredTemplateIds: ["version_text_1"],
      hostRequiredTemplateIds: ["version_pdf_1"],
    },
    {
      source: "time_slot",
      requiredTemplateIds: ["version_text_1"],
      hostRequiredTemplateIds: ["version_pdf_1"],
    },
  ]);
  const reloadedSignedDocuments = await reloadClient.query(`
    SELECT "id", "templateId"
    FROM "SignedDocuments"
    ORDER BY "id"
  `);
  assert.deepEqual(reloadedSignedDocuments.rows, [
    { id: "signed_pdf_1", templateId: "version_pdf_1" },
    { id: "signed_text_1", templateId: "version_text_1" },
  ]);

  await client.query(`
    INSERT INTO "DocumentRequirements" ("id", "organizationId", "title", "status")
    VALUES ('document-requirement:version_free', 'org_1', 'Free version', 'ACTIVE');
    INSERT INTO "TemplateDocuments" (
      "id",
      "createdAt",
      "updatedAt",
      "documentRequirementId",
      "versionSequence",
      "type",
      "organizationId",
      "title",
      "requiredSignerType",
      "roleIndexes",
      "signerRoles",
      "content"
    ) VALUES (
      'version_free',
      '2026-08-05 10:00:00',
      '2026-08-05 10:00:00',
      'document-requirement:version_free',
      1,
      'TEXT',
      'org_1',
      'Free version',
      'PARTICIPANT',
      ARRAY[]::INTEGER[],
      ARRAY[]::TEXT[],
      'Free text'
    );
    INSERT INTO "DocumentRequirements" ("id", "organizationId", "title", "status")
    VALUES ('document-requirement:version_team_free', 'org_1', 'Team-only version', 'ACTIVE');
    INSERT INTO "TemplateDocuments" (
      "id",
      "createdAt",
      "updatedAt",
      "documentRequirementId",
      "versionSequence",
      "type",
      "organizationId",
      "title",
      "requiredSignerType",
      "roleIndexes",
      "signerRoles",
      "content"
    ) VALUES (
      'version_team_free',
      '2026-08-05 11:00:00',
      '2026-08-05 11:00:00',
      'document-requirement:version_team_free',
      1,
      'TEXT',
      'org_1',
      'Team-only version',
      'PARTICIPANT',
      ARRAY[]::INTEGER[],
      ARRAY[]::TEXT[],
      'Team-only text'
    );
    UPDATE "Teams"
    SET "requiredTemplateIds" = array_append("requiredTemplateIds", 'version_team_free')
    WHERE "id" = 'team_1';
    UPDATE "Events"
    SET "requiredTemplateIds" = array_append("requiredTemplateIds", 'version_free')
    WHERE "id" = 'event_1';
    UPDATE "EventTemplates"
    SET "requiredTemplateIds" = array_append("requiredTemplateIds", 'version_free')
    WHERE "id" = 'event_template_1';
    UPDATE "TimeSlots"
    SET "requiredTemplateIds" = array_append("requiredTemplateIds", 'version_free'),
        "hostRequiredTemplateIds" = array_append("hostRequiredTemplateIds", 'version_free')
    WHERE "id" = 'slot_1';
    UPDATE "EventTemplateTimeSlots"
    SET "requiredTemplateIds" = array_append("requiredTemplateIds", 'version_free'),
        "hostRequiredTemplateIds" = array_append("hostRequiredTemplateIds", 'version_free')
    WHERE "id" = 'event_template_slot_1';
    UPDATE "RentalBookingItems"
    SET "requiredTemplateIds" = array_append("requiredTemplateIds", 'version_free'),
        "hostRequiredTemplateIds" = array_append("hostRequiredTemplateIds", 'version_free')
    WHERE "id" = 'rental_item_1';
    INSERT INTO "SignedDocuments" ("id", "templateId")
    VALUES ('signed_free_1', 'version_free');
  `);
  const triggerFrozenVersions = await reloadClient.query(`
    SELECT "id", "frozenAt" IS NOT NULL AS "isFrozen"
    FROM "TemplateDocuments"
    WHERE "id" IN ('version_free', 'version_team_free')
    ORDER BY "id"
  `);
  assert.deepEqual(triggerFrozenVersions.rows, [
    { id: "version_free", isFrozen: true },
    { id: "version_team_free", isFrozen: true },
  ]);

  await client.query("BEGIN");
  await expectRejectedMaterialUpdate({
    sequence: 1,
    id: "version_pdf_1",
    column: "content",
    value: "Changed PDF after assignment",
  });
  await expectRejectedMaterialUpdate({
    sequence: 2,
    id: "version_text_1",
    column: "content",
    value: "Changed TEXT after assignment",
  });
  await expectRejectedMaterialUpdate({
    sequence: 3,
    id: "version_pdf_1",
    column: "templateId",
    value: "boldsign_template_replacement",
  });
  await expectRejectedMaterialUpdate({
    sequence: 4,
    id: "version_text_1",
    column: "templateId",
    value: "provider_id_on_text",
  });
  await expectRejectedMaterialUpdate({
    sequence: 5,
    id: "version_pdf_1",
    column: "requiredSignerType",
    value: "PARTICIPANT",
  });
  await expectRejectedMaterialUpdate({
    sequence: 6,
    id: "version_text_1",
    column: "signerRoles",
    value: ["guardian"],
  });
  await client.query("COMMIT");
  const unchangedMaterialAfterRejectedWrites = await reloadClient.query(`
    SELECT "id", "templateId", "content", "requiredSignerType", "signerRoles"
    FROM "TemplateDocuments"
    WHERE "id" IN ('version_pdf_1', 'version_text_1')
    ORDER BY "id"
  `);
  assert.deepEqual(unchangedMaterialAfterRejectedWrites.rows, [
    {
      id: "version_pdf_1",
      templateId: "boldsign_template_1",
      content: null,
      requiredSignerType: "PARENT_GUARDIAN_CHILD",
      signerRoles: ["parent_guardian", "child"],
    },
    {
      id: "version_text_1",
      templateId: null,
      content: "I agree to follow the code of conduct.",
      requiredSignerType: "PARTICIPANT",
      signerRoles: [],
    },
  ]);
  await client.query(`
    INSERT INTO "TemplateDocuments" (
      "id",
      "createdAt",
      "updatedAt",
      "documentRequirementId",
      "versionSequence",
      "type",
      "organizationId",
      "title",
      "requiredSignerType",
      "roleIndexes",
      "signerRoles",
      "content"
    ) VALUES (
      'version_free_2',
      '2026-08-06 10:00:00',
      '2026-08-06 10:00:00',
      'document-requirement:version_free',
      2,
      'TEXT',
      'org_1',
      'Free version',
      'PARTICIPANT',
      ARRAY[]::INTEGER[],
      ARRAY[]::TEXT[],
      'Later free text'
    );
  `);
  const reloadedVersionChain = await reloadClient.query(`
    SELECT "id", "versionSequence", "content", "frozenAt" IS NOT NULL AS "isFrozen"
    FROM "TemplateDocuments"
    WHERE "documentRequirementId" = 'document-requirement:version_free'
    ORDER BY "versionSequence"
  `);
  assert.deepEqual(reloadedVersionChain.rows, [
    { id: "version_free", versionSequence: 1, content: "Free text", isFrozen: true },
    { id: "version_free_2", versionSequence: 2, content: "Later free text", isFrozen: false },
  ]);
  const pinnedAssignmentsAfterVersion = await reloadClient.query(`
    SELECT 'event' AS "source", "requiredTemplateIds"
    FROM "Events" WHERE "id" = 'event_1'
    UNION ALL
    SELECT 'team', "requiredTemplateIds"
    FROM "Teams" WHERE "id" = 'team_1'
    ORDER BY "source"
  `);
  assert.deepEqual(pinnedAssignmentsAfterVersion.rows, [
    {
      source: "event",
      requiredTemplateIds: ["version_pdf_1", "version_text_1", "version_free"],
    },
    {
      source: "team",
      requiredTemplateIds: ["version_text_1", "version_pdf_1", "version_team_free"],
    },
  ]);

  const versionSequenceColumn = await reloadClient.query(
    `
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'TemplateDocuments'
      AND column_name = 'versionSequence'
  `,
    [fixtureSchema],
  );
  assert.equal(versionSequenceColumn.rows[0].column_default, null);

  await client.query("BEGIN");
  await expectRejectedInsert({
    sequence: 1,
    id: "version_wrong_org",
    documentRequirementId: "document-requirement:version_pdf_1",
    versionSequence: 2,
    organizationId: "org_2",
    expectedConstraint:
      "TemplateDocuments_documentRequirement_organization_fkey",
  });
  await expectRejectedInsert({
    sequence: 2,
    id: "version_unknown_requirement",
    documentRequirementId: "document-requirement:missing",
    versionSequence: 1,
    organizationId: "org_1",
    expectedConstraint:
      "TemplateDocuments_documentRequirement_organization_fkey",
  });
  await expectRejectedInsert({
    sequence: 3,
    id: "version_duplicate_sequence",
    documentRequirementId: "document-requirement:version_pdf_1",
    versionSequence: 1,
    organizationId: "org_1",
    expectedConstraint:
      "TemplateDocuments_documentRequirementId_versionSequence_key",
  });
  await client.query("COMMIT");

  console.log(
    "Document Requirement and Document Template Version migration fixture passed.",
  );
} finally {
  if (reloadConnected) {
    await reloadClient.query("SET search_path TO public").catch(() => undefined);
    await reloadClient.end();
  }
  if (connected) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("SET search_path TO public").catch(() => undefined);
    await client
      .query(`DROP SCHEMA IF EXISTS ${quotedFixtureSchema} CASCADE`)
      .catch(() => undefined);
    await client.end();
  }
}
