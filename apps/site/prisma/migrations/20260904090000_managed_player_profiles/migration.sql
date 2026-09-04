ALTER TABLE "UserData"
  ADD COLUMN "isManagedPlayer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mergedIntoProfileId" TEXT,
  ADD COLUMN "mergedAt" TIMESTAMP(3);

ALTER TABLE "Invites"
  ADD COLUMN "isMinor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "guardianEmail" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE TABLE "UserProfileClaims" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "profileId" TEXT NOT NULL,
  "claimantUserId" TEXT NOT NULL,
  "inviteId" TEXT,
  "verificationMethod" TEXT NOT NULL,
  "verifiedEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "confirmationAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  CONSTRAINT "UserProfileClaims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProfileMerges" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceProfileId" TEXT NOT NULL,
  "primaryProfileId" TEXT NOT NULL,
  "claimantUserId" TEXT NOT NULL,
  "confirmationAt" TIMESTAMP(3) NOT NULL,
  "rosterIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "invitationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  CONSTRAINT "UserProfileMerges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProfileContactCorrections" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "profileId" TEXT NOT NULL,
  "managerUserId" TEXT NOT NULL,
  "previousEmail" TEXT,
  "correctedEmail" TEXT,
  "previousPhone" TEXT,
  "correctedPhone" TEXT,
  "inviteId" TEXT,
  CONSTRAINT "UserProfileContactCorrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserProfileClaims_profileId_status_idx" ON "UserProfileClaims"("profileId", "status");
CREATE INDEX "UserProfileClaims_claimantUserId_status_idx" ON "UserProfileClaims"("claimantUserId", "status");
CREATE INDEX "UserProfileClaims_inviteId_idx" ON "UserProfileClaims"("inviteId");
CREATE INDEX "UserProfileMerges_sourceProfileId_idx" ON "UserProfileMerges"("sourceProfileId");
CREATE INDEX "UserProfileMerges_primaryProfileId_idx" ON "UserProfileMerges"("primaryProfileId");
CREATE INDEX "UserProfileMerges_claimantUserId_idx" ON "UserProfileMerges"("claimantUserId");
CREATE INDEX "UserProfileContactCorrections_profileId_createdAt_idx" ON "UserProfileContactCorrections"("profileId", "createdAt");
CREATE INDEX "UserProfileContactCorrections_managerUserId_createdAt_idx" ON "UserProfileContactCorrections"("managerUserId", "createdAt");
CREATE INDEX "Invites_teamId_createdBy_idempotencyKey_idx" ON "Invites"("teamId", "createdBy", "idempotencyKey");
