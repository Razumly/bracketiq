CREATE TABLE "TemplateProviderQuarantines" (
  "providerTemplateId" TEXT NOT NULL,
  "quarantinedAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateProviderQuarantines_pkey" PRIMARY KEY ("providerTemplateId")
);

INSERT INTO "TemplateProviderQuarantines" (
  "providerTemplateId",
  "quarantinedAt",
  "reason",
  "createdAt",
  "updatedAt"
)
SELECT
  "templateId",
  MIN("providerQuarantinedAt"),
  COALESCE(MAX("providerQuarantineReason"), 'BoldSign provider edit was quarantined because the Document Template Version is frozen.'),
  MIN("providerQuarantinedAt"),
  CURRENT_TIMESTAMP
FROM "TemplateDocuments"
WHERE "templateId" IS NOT NULL
  AND "providerQuarantinedAt" IS NOT NULL
GROUP BY "templateId";
