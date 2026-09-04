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

/**
 * Serializes roster assignments, pending invitations, and membership changes
 * for one canonical team inside a transaction.
 */
export const acquireTeamRosterLock = async (client: PrismaLike, teamId: string): Promise<void> => {
  const lockId = advisoryLockId(`team-roster:${teamId}`);
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

const acquireResourceLocks = async (
  client: PrismaLike,
  resourceType: string,
  resourceIds: string[],
): Promise<void> => {
  const normalizedResourceIds = Array.from(
    new Set(
      resourceIds
        .map((resourceId) => resourceId.trim())
        .filter((resourceId) => resourceId.length > 0),
    ),
  ).sort();
  for (const resourceId of normalizedResourceIds) {
    const lockId = advisoryLockId(`${resourceType}:${resourceId}`);
    await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
  }
};

export const acquireFieldLocks = async (
  client: PrismaLike,
  fieldIds: string[],
): Promise<void> => acquireResourceLocks(client, "field", fieldIds);

export const acquireTimeSlotLocks = async (
  client: PrismaLike,
  timeSlotIds: string[],
): Promise<void> => acquireResourceLocks(client, "time-slot", timeSlotIds);
export const acquireEventTemplateLocks = async (
  client: PrismaLike,
  templateIds: string[],
): Promise<void> => acquireResourceLocks(client, "event-template", templateIds);
export const acquireRentalBookingLocks = async (
  client: PrismaLike,
  bookingIds: string[],
  bookingItemIds: string[] = [],
): Promise<void> => {
  await acquireResourceLocks(client, "rental-booking", bookingIds);
  await acquireResourceLocks(client, "rental-booking-item", bookingItemIds);
};
