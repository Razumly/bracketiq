import crypto from 'crypto';
import { Prisma, PrismaClient } from '@/generated/prisma/client';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

export const advisoryLockId = (value: string): bigint => {
  const hash = crypto.createHash('sha256').update(value).digest();
  const raw = hash.readBigInt64BE(0);
  return BigInt.asIntN(64, raw);
};

export const acquireEventLock = async (client: PrismaLike, eventId: string): Promise<void> => {
  const lockId = advisoryLockId(eventId);
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
};
export const acquireOrganizationStaffMemberLock = async (
  client: PrismaLike,
  organizationId: string,
  userId: string,
): Promise<void> => {
  const lockId = advisoryLockId(`organization-staff-member:${organizationId}:${userId}`);
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
};
export const acquireOrganizationStaffAssignmentLock = async (
  client: PrismaLike,
  organizationId: string,
): Promise<void> => {
  const lockId = advisoryLockId(`organization-staff-assignment:${organizationId}`);
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
};


export const acquireTeamStaffRoleLock = async (
  client: PrismaLike,
  teamId: string,
  role: string,
): Promise<void> => {
  const lockId = advisoryLockId(`team-staff:${teamId}:${role}`);
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
};
