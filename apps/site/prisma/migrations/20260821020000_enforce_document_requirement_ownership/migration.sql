-- Keep every Requirement and Version owned by an existing Organization.
ALTER TABLE "DocumentRequirements"
  ADD CONSTRAINT "DocumentRequirements_id_organizationId_key"
  UNIQUE ("id", "organizationId");

ALTER TABLE "DocumentRequirements"
  ADD CONSTRAINT "DocumentRequirements_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "TemplateDocuments"
  ALTER COLUMN "versionSequence" DROP DEFAULT;

ALTER TABLE "TemplateDocuments"
  ADD CONSTRAINT "TemplateDocuments_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "TemplateDocuments"
  ADD CONSTRAINT "TemplateDocuments_documentRequirement_organization_fkey"
  FOREIGN KEY ("documentRequirementId", "organizationId")
  REFERENCES "DocumentRequirements"("id", "organizationId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
