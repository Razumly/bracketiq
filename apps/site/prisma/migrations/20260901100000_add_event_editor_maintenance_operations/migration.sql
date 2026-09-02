CREATE TABLE "EventEditorMaintenanceOperations" (
  "operationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestJson" JSONB NOT NULL,
  "proposalRevision" TEXT,
  "revisionBindingJson" JSONB,
  "proposalJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "acceptanceOperationId" TEXT,
  "acceptedResponseJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventEditorMaintenanceOperations_pkey" PRIMARY KEY ("operationId")
);

CREATE INDEX "EventEditorMaintenanceOperations_eventId_createdAt_idx"
  ON "EventEditorMaintenanceOperations" ("eventId", "createdAt");
CREATE INDEX "EventEditorMaintenanceOperations_eventId_operation_idx"
  ON "EventEditorMaintenanceOperations" ("eventId", "operation");
CREATE INDEX "EventEditorMaintenanceOperations_status_updatedAt_idx"
  ON "EventEditorMaintenanceOperations" ("status", "updatedAt");
