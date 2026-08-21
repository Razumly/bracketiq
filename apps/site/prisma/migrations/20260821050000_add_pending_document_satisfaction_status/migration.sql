-- Allow a requirement to remain incomplete while signer roles are collected.
ALTER TYPE "DocumentRequirementSatisfactionStatusEnum" ADD VALUE IF NOT EXISTS 'PENDING';
