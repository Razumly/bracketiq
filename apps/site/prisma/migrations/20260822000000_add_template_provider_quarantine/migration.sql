ALTER TABLE "TemplateDocuments"
  ADD COLUMN "providerQuarantinedAt" TIMESTAMP(3),
  ADD COLUMN "providerQuarantineReason" TEXT;

CREATE INDEX "TemplateDocuments_templateId_providerQuarantinedAt_idx"
  ON "TemplateDocuments"("templateId", "providerQuarantinedAt");
