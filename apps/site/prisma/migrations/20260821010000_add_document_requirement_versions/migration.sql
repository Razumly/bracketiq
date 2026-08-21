CREATE TABLE "DocumentRequirements" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdBy" TEXT,
  "status" TEXT,
  CONSTRAINT "DocumentRequirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentRequirements_organizationId_idx"
  ON "DocumentRequirements"("organizationId");

ALTER TABLE "TemplateDocuments"
  ADD COLUMN "documentRequirementId" TEXT,
  ADD COLUMN "versionSequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "frozenAt" TIMESTAMP(3);

INSERT INTO "DocumentRequirements" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "title",
  "description",
  "createdBy",
  "status"
)
SELECT
  'document-requirement:' || "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "title",
  "description",
  "createdBy",
  COALESCE("status", 'ACTIVE')
FROM "TemplateDocuments";

UPDATE "TemplateDocuments"
SET "documentRequirementId" = 'document-requirement:' || "id"
WHERE "documentRequirementId" IS NULL;

ALTER TABLE "TemplateDocuments"
  ALTER COLUMN "documentRequirementId" SET NOT NULL;

CREATE INDEX "TemplateDocuments_documentRequirementId_idx"
  ON "TemplateDocuments"("documentRequirementId");

CREATE UNIQUE INDEX "TemplateDocuments_documentRequirementId_versionSequence_key"
  ON "TemplateDocuments"("documentRequirementId", "versionSequence");
