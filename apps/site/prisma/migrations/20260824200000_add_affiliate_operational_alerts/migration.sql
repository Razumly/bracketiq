CREATE TABLE "AffiliateOperationalAlerts" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "subjectType" TEXT,
  "subjectId" TEXT,
  "rolloutCohort" TEXT,
  "contractVersion" INTEGER,
  "supplySourceId" TEXT,
  "coverageCellId" TEXT,
  "demandId" TEXT,
  "waveId" TEXT,
  "queue" TEXT,
  "lifecycleGeneration" INTEGER,
  "claimGeneration" INTEGER,
  "workerId" TEXT,
  "attempt" INTEGER,
  "previousState" TEXT,
  "nextState" TEXT,
  "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inputHash" TEXT,
  "outputHash" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "retentionClass" TEXT NOT NULL DEFAULT 'INDEFINITE',
  "retentionDeadline" TIMESTAMP(3),

  CONSTRAINT "AffiliateOperationalAlerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateOperationalAlerts_eventKey_key"
  ON "AffiliateOperationalAlerts"("eventKey");
CREATE INDEX "AffiliateOperationalAlerts_category_createdAt_idx"
  ON "AffiliateOperationalAlerts"("category", "createdAt");
CREATE INDEX "AffiliateOperationalAlerts_severity_createdAt_idx"
  ON "AffiliateOperationalAlerts"("severity", "createdAt");
CREATE INDEX "AffiliateOperationalAlerts_rolloutCohort_contractVersion_createdAt_idx"
  ON "AffiliateOperationalAlerts"("rolloutCohort", "contractVersion", "createdAt");
CREATE INDEX "AffiliateOperationalAlerts_supplySourceId_createdAt_idx"
  ON "AffiliateOperationalAlerts"("supplySourceId", "createdAt");

CREATE TABLE "AffiliateOperationalAlertDeliveries" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "alertId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "deliveredAt" TIMESTAMP(3),
  "responseCode" INTEGER,
  "responseBody" TEXT,
  "errorMessage" TEXT,

  CONSTRAINT "AffiliateOperationalAlertDeliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateOperationalAlertDeliveries_alertId_fkey"
    FOREIGN KEY ("alertId") REFERENCES "AffiliateOperationalAlerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AffiliateOperationalAlertDeliveries_alertId_createdAt_idx"
  ON "AffiliateOperationalAlertDeliveries"("alertId", "createdAt");
CREATE INDEX "AffiliateOperationalAlertDeliveries_status_createdAt_idx"
  ON "AffiliateOperationalAlertDeliveries"("status", "createdAt");


CREATE OR REPLACE FUNCTION "reject_affiliate_operational_alert_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Affiliate operational alerts are immutable.';
END;
$$;

CREATE TRIGGER "AffiliateOperationalAlerts_immutable"
BEFORE UPDATE OR DELETE ON "AffiliateOperationalAlerts"
FOR EACH ROW EXECUTE FUNCTION "reject_affiliate_operational_alert_mutation"();

CREATE TRIGGER "AffiliateOperationalAlertDeliveries_immutable"
BEFORE UPDATE OR DELETE ON "AffiliateOperationalAlertDeliveries"
FOR EACH ROW EXECUTE FUNCTION "reject_affiliate_operational_alert_mutation"();