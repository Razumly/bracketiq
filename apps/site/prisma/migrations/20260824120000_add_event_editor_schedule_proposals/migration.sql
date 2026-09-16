ALTER TABLE "EventEditorCreateOperations"
  ADD COLUMN "proposalJson" JSONB,
  ADD COLUMN "proposalRevision" TEXT,
  ADD COLUMN "proposalStatus" TEXT NOT NULL DEFAULT 'NONE';

CREATE INDEX "EventEditorCreateOperations_proposalStatus_updatedAt_idx"
  ON "EventEditorCreateOperations" ("proposalStatus", "updatedAt");
