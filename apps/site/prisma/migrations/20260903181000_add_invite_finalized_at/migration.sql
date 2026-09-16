-- Keep the terminal outcome time separate from later operational updates.
ALTER TABLE "Invites"
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Invites_status_finalizedAt_idx"
  ON "Invites"("status", "finalizedAt");
