ALTER TABLE "ParentChildLinks"
  ADD COLUMN "declarationVersion" INTEGER,
  ADD COLUMN "declarationText" TEXT,
  ADD COLUMN "declarationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "declarationInviteId" TEXT;
