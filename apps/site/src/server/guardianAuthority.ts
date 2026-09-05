import { calculateAgeOnDate } from '@/lib/age';
import type { Prisma } from '@/generated/prisma/client';

type GuardianAuthorityClient = Pick<Prisma.TransactionClient, 'userData' | 'parentChildLinks'>;

// Unknown legacy birthdates do not grant guardian authority.
export const hasGuardianAge = (value: Date | string | null | undefined, now = new Date()): boolean => {
  if (!value) return false;
  const dob = value instanceof Date ? value : new Date(value);
  const age = calculateAgeOnDate(dob, now);
  return dob.getTime() > 86400000 && age >= 0 && age < 18;
};

export const findGuardianAuthority = async (client: GuardianAuthorityClient, parentId: string, childId: string, now = new Date()) => {
  const child = await client.userData.findUnique({ where: { id: childId }, select: { dateOfBirth: true } });
  if (!hasGuardianAge(child?.dateOfBirth, now)) return null;
  return client.parentChildLinks.findFirst({ where: { parentId, childId, status: 'ACTIVE' } });
};

export const listGuardianChildIds = async (client: GuardianAuthorityClient, parentId: string, now = new Date()): Promise<string[]> => {
  const links = await client.parentChildLinks.findMany({ where: { parentId, status: 'ACTIVE' }, select: { childId: true } });
  if (!links.length) return [];
  const children = await client.userData.findMany({
    where: { id: { in: links.map((link) => link.childId) } },
    select: { id: true, dateOfBirth: true },
  });
  return children.filter((child) => hasGuardianAge(child.dateOfBirth, now)).map((child) => child.id);
};

export const GUARDIAN_DECLARATION_VERSION = 1;
export const GUARDIAN_DECLARATION = 'I am this child’s parent or legal guardian. I have authority to manage this child’s profile and accept this team invitation for them.';
