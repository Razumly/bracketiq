CREATE TABLE "EventEditorCreateOperations" (
    "createOperationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL DEFAULT 201,
    "responseJson" JSONB,
    "emailDelivery" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventEditorCreateOperations_pkey" PRIMARY KEY ("createOperationId")
);

CREATE UNIQUE INDEX "EventEditorCreateOperations_eventId_key"
  ON "EventEditorCreateOperations"("eventId");

CREATE INDEX "EventEditorCreateOperations_actorUserId_createdAt_idx"
  ON "EventEditorCreateOperations"("actorUserId", "createdAt");
