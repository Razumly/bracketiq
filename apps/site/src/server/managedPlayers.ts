import crypto from 'crypto';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import { normalizeOptionalName } from '@/lib/nameCase';
import { isFutureDateOfBirth, parseDateOfBirth } from '@/lib/dateOfBirth';
import { isMinorAtUtcDate, isUnknownDateOfBirth } from '@/server/userPrivacy';
import { advisoryLockId } from '@/server/repositories/locks';
import { rollbackTeamInviteEventSyncs } from '@/server/teams/teamInviteEventSync';

type PrismaLike = any;

export const UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH = new Date(0);

export type ManagedPlayerInput = {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string | null;
  isMinor?: boolean;
  guardianEmail?: string | null;
};

export type ManagedPlayerProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  userName: string;
  dateOfBirth: Date;
  isManagedPlayer: boolean;
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeContact = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const reserveManagedUserName = async (tx: PrismaLike, profileId: string, firstName: string, lastName: string): Promise<string> => {
  const first = firstName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const last = lastName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const prefix = `${first || 'managed'}.${last || 'player'}`.slice(0, 54);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${prefix}${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
    const conflict = await tx.userData.findFirst({
      where: { userName: { equals: candidate, mode: 'insensitive' }, id: { not: profileId } },
      select: { id: true },
    });
    if (!conflict) return candidate;
  }
  return `managed-${profileId.replace(/-/g, '').slice(0, 20)}`;
};

const normalizedBirthdate = (value: Date | string | null | undefined): Date => {
  if (value == null || value === '') return UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH;
  const parsed = parseDateOfBirth(value);
  if (!parsed) throw new Error('Invalid dateOfBirth');
  return parsed;
};

export const createManagedPlayerProfile = async (
  tx: PrismaLike,
  input: ManagedPlayerInput,
  now = new Date(),
): Promise<ManagedPlayerProfile> => {
  const firstName = normalizeOptionalName(input.firstName);
  const lastName = normalizeOptionalName(input.lastName);
  if (!firstName || !lastName) throw new Error('First and last name are required');

  const dateOfBirth = normalizedBirthdate(input.dateOfBirth);
  if (isFutureDateOfBirth(dateOfBirth, now)) throw new Error('dateOfBirth cannot be in the future');
  const isMinor = input.isMinor === true || isMinorAtUtcDate(dateOfBirth, now);
  const guardianEmail = normalizeEmail(input.guardianEmail);
  const hasKnownBirthDate = dateOfBirth.getTime() !== UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH.getTime();
  if ((input.isMinor === true || (isMinor && hasKnownBirthDate))
    && (!guardianEmail || !input.dateOfBirth)) {
    throw new Error('Minor players require a date of birth and guardian email');
  }

  const id = crypto.randomUUID();
  const userName = await reserveManagedUserName(tx, id, firstName, lastName);
  const profile = await tx.userData.create({
    data: {
      id,
      createdAt: now,
      updatedAt: now,
      firstName,
      lastName,
      dateOfBirth,
      userName,
      isManagedPlayer: true,
      friendIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      followingIds: [],
      uploadedImages: [],
      profileImageId: null,
    },
  });

  return profile as ManagedPlayerProfile;
};

export const isActiveAccountForProfile = (authUser: any): boolean => (
  Boolean(authUser && !authUser.disabledAt && !isInvitePlaceholderAuthUser(authUser))
);

const isCurrentInvite = (status: unknown): boolean => {
  const value = String(status ?? '').trim().toUpperCase();
  return value === '' || ['PENDING', 'SENT', 'FAILED', 'ACCEPTED'].includes(value);
};

const membershipStatusRank = (status: unknown): number => ({
  ACTIVE: 6,
  STARTED: 5,
  PENDING: 4,
  INVITED: 3,
  LEFT: 2,
  REMOVED: 1,
}[String(status ?? '').trim().toUpperCase()] ?? 0);

const inviteStatusRank = (status: unknown): number => ({
  ACCEPTED: 4,
  SENT: 3,
  PENDING: 3,
  FAILED: 2,
}[String(status ?? '').trim().toUpperCase()] ?? 0);

export type ClaimManagedPlayerInput = {
  profileId: string;
  inviteId: string;
  dateOfBirth?: string | Date | null;
  link: { version: string | null; expiresAt: string | null; signature: string | null };
  confirmation: boolean;
  claimantUserId: string;
  now?: Date;
  verifyLink: (invite: any, link: ClaimManagedPlayerInput['link'], now: Date) => boolean;
};

export type ClaimManagedPlayerResult = {
  status: 'CLAIMED' | 'MERGED' | 'GUARDIAN_LINKED' | 'ALREADY_CLAIMED' | 'BIRTHDATE_REQUIRED' | 'GUARDIAN_REQUIRED';
  primaryProfileId: string;
  sourceProfileId: string;
  mergeId?: string;
};

const lockProfiles = async (tx: PrismaLike, profileIds: string[]): Promise<void> => {
  if (typeof tx?.$executeRaw !== 'function') return;
  for (const profileId of Array.from(new Set(profileIds)).sort()) {
    const lockId = advisoryLockId(`user-profile:${profileId}`);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
  }
};

const replaceProfileInArray = (value: unknown, sourceId: string, targetId: string): string[] => {
  const values = Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
  return Array.from(new Set(values.map((entry) => (entry === sourceId ? targetId : entry))));
};

type MergeAssociationSnapshot = {
  rosterIds: string[];
  invitationIds: string[];
};

const mergeAssociations = async (
  tx: PrismaLike,
  sourceId: string,
  targetId: string,
  now: Date,
): Promise<MergeAssociationSnapshot> => {
  const rosterIds: string[] = [];
  const invitationIds: string[] = [];
  const teamRegistrations = tx.teamRegistrations?.findMany
    ? await tx.teamRegistrations.findMany({ where: { userId: sourceId } })
    : [];
  for (const registration of teamRegistrations) {
    if (registration.id) rosterIds.push(registration.id);
    const existing = tx.teamRegistrations?.findUnique
      ? await tx.teamRegistrations.findUnique({ where: { teamId_userId: { teamId: registration.teamId, userId: targetId } } })
      : null;
    if (existing) {
      const existingStatus = String(existing.status ?? '').toUpperCase();
      const sourceStatus = String(registration.status ?? '').toUpperCase();
      if (membershipStatusRank(sourceStatus) > membershipStatusRank(existingStatus)) {
        await tx.teamRegistrations?.update?.({
          where: { id: existing.id },
          data: { status: registration.status, updatedAt: now, isCaptain: registration.isCaptain },
        });
      }
      await tx.teamRegistrations?.update?.({
        where: { id: registration.id },
        data: { status: 'REMOVED', updatedAt: now, isCaptain: false },
      });
    } else {
      await tx.teamRegistrations?.update?.({ where: { id: registration.id }, data: { userId: targetId, updatedAt: now } });
    }
  }

  for (const delegateName of ['invites', 'teamInviteEventSyncs', 'eventRegistrations', 'matchRosterEntries']) {
    const delegate = tx[delegateName];
    if (!delegate?.updateMany) continue;
    const where = delegateName === 'eventRegistrations'
      ? { registrantId: sourceId }
      : { userId: sourceId };
    const data = delegateName === 'eventRegistrations' ? { registrantId: targetId } : { userId: targetId };
    const rows = delegate.findMany ? await delegate.findMany({
      where,
      select: delegateName === 'teamInviteEventSyncs'
        ? { id: true, inviteId: true, eventTeamId: true, userId: true }
        : delegateName === 'invites'
          ? { id: true, teamId: true, role: true, status: true, userId: true }
        : delegateName === 'eventRegistrations'
          ? {
            id: true,
            eventId: true,
            registrantId: true,
            registrantType: true,
            rosterRole: true,
            eventTeamId: true,
            slotId: true,
            occurrenceDate: true,
            divisionId: true,
            divisionTypeId: true,
          }
          : { id: true },
    }) : [];
    if (delegateName === 'invites') {
      rows.forEach((row: { id?: string }) => { if (row.id) invitationIds.push(row.id); });
    }
    for (const row of rows) {
      if (delegateName === 'invites' && row.teamId && String(row.role ?? '').toLowerCase() === 'player' && isCurrentInvite(row.status) && delegate.findFirst) {
        const duplicate = await delegate.findFirst({
          where: {
            teamId: row.teamId,
            userId: targetId,
            role: row.role,
            status: { in: ['PENDING', 'SENT', 'FAILED', 'ACCEPTED'] },
          },
          select: { id: true, status: true },
        });
        if (duplicate && duplicate.id !== row.id) {
          if (inviteStatusRank(row.status) > inviteStatusRank(duplicate.status) && delegate.update) {
            await delegate.update({ where: { id: duplicate.id }, data: { status: row.status, updatedAt: now } });
          }
          await delegate.update({ where: { id: row.id }, data: { status: 'CANCELLED', finalizedAt: now, updatedAt: now } });
          continue;
        }
      }
      if (delegateName === 'teamInviteEventSyncs' && delegate.findFirst) {
        const duplicate = await delegate.findFirst({
          where: {
            inviteId: row.inviteId,
            eventTeamId: row.eventTeamId,
            userId: targetId,
            status: { not: 'CANCELLED' },
          },
          select: { id: true },
        });
        if (duplicate && duplicate.id !== row.id) {
          await delegate.update({ where: { id: row.id }, data: { status: 'CANCELLED', updatedAt: now } });
          continue;
        }
      }
      if (delegateName === 'eventRegistrations' && delegate.findFirst) {
        const duplicate = await delegate.findFirst({
          where: {
            eventId: row.eventId,
            registrantId: targetId,
            registrantType: row.registrantType,
            rosterRole: row.rosterRole,
            eventTeamId: row.eventTeamId,
            slotId: row.slotId,
            occurrenceDate: row.occurrenceDate,
            divisionId: row.divisionId,
            divisionTypeId: row.divisionTypeId,
            status: { not: 'CANCELLED' },
          },
          select: { id: true },
        });
        if (duplicate && duplicate.id !== row.id) {
          await delegate.update({ where: { id: row.id }, data: { status: 'CANCELLED', updatedAt: now } });
          continue;
        }
      }
      await delegate.update({ where: { id: row.id }, data });
    }
  }

  if (tx.teamRegistrations?.updateMany) {
    await tx.teamRegistrations.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId, updatedAt: now } });
  }
  if (tx.eventRegistrations?.updateMany) {
    await tx.eventRegistrations.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId, updatedAt: now } });
  }
  if (tx.parentChildLinks?.updateMany) {
    await tx.parentChildLinks.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId, updatedAt: now } });
    await tx.parentChildLinks.updateMany({ where: { childId: sourceId }, data: { childId: targetId, updatedAt: now } });
  }

  if (tx.documentSubjects?.findMany && tx.documentSubjects?.update) {
    const sourceSubjects = await tx.documentSubjects.findMany({ where: { userId: sourceId } });
    for (const subject of sourceSubjects) {
      const existing = await tx.documentSubjects.findFirst({ where: { organizationId: subject.organizationId, userId: targetId } });
      if (!existing) {
        await tx.documentSubjects.update({ where: { id: subject.id }, data: { userId: targetId, updatedAt: now } });
        continue;
      }

      // Keep the source subject and all of its evidence together when the
      // target has a conflicting record. Move the complete subject only when
      // every signed document has an equivalent target record.
      if (tx.signedDocuments?.findMany && tx.signedDocuments?.update) {
        const sourceDocuments = await tx.signedDocuments.findMany({ where: { documentSubjectId: subject.id } });
        const targetDocuments = await tx.signedDocuments.findMany({ where: { documentSubjectId: existing.id } });
        const targetKeys = new Set(targetDocuments.map((document: any) => [
          document.organizationId,
          document.contentHash,
          document.templateId,
          document.scopeType,
          document.scopeId,
        ].map((value) => String(value ?? '')).join('|')));
        const hasConflict = sourceDocuments.some((document: any) => {
          const key = [
            document.organizationId,
            document.contentHash,
            document.templateId,
            document.scopeType,
            document.scopeId,
          ].map((value) => String(value ?? '')).join('|');
          return !targetKeys.has(key);
        });
        if (!hasConflict) {
          for (const document of sourceDocuments) {
            await tx.signedDocuments.update({ where: { id: document.id }, data: { documentSubjectId: existing.id, updatedAt: now } });
          }
          await tx.documentRequirementSatisfactions?.updateMany?.({
            where: { documentSubjectId: subject.id },
            data: { documentSubjectId: existing.id },
          });
        }
      } else {
        // A client without the evidence delegate cannot prove a safe merge.
        // Keep the source subject intact for later reconciliation.
        continue;
      }
    }
  }
  for (const delegateName of ['signedDocuments']) {
    const delegate = tx[delegateName];
    if (delegate?.updateMany) {
      await delegate.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
      await delegate.updateMany({ where: { signerUserId: sourceId }, data: { signerUserId: targetId } });
    }
  }

  // Event team rows hold the serialized player and pending arrays. Canonical
  // team rows store team metadata only and must not receive roster fields.
  const teamDelegates = [tx.teams].filter(Boolean);
  for (const teams of teamDelegates) {
    if (!teams.findMany || !teams.update) continue;
    const rows = await teams.findMany({ where: { OR: [{ playerIds: { has: sourceId } }, { pending: { has: sourceId } }] } });
    for (const row of rows) {
      await teams.update({
        where: { id: row.id },
        data: {
          playerIds: replaceProfileInArray(row.playerIds, sourceId, targetId),
          pending: replaceProfileInArray(row.pending, sourceId, targetId),
          ...(teams === tx.teams ? {
            ...(row.captainId === sourceId ? { captainId: targetId } : {}),
            ...(row.managerId === sourceId ? { managerId: targetId } : {}),
            ...(row.headCoachId === sourceId ? { headCoachId: targetId } : {}),
            coachIds: replaceProfileInArray(row.coachIds, sourceId, targetId),
          } : {}),
          updatedAt: now,
        },
      });
    }
  }
  return { rosterIds, invitationIds };
};

export const claimManagedPlayerProfile = async (
  client: PrismaLike,
  input: ClaimManagedPlayerInput,
): Promise<ClaimManagedPlayerResult> => {
  if (!input.confirmation) throw new Error('Profile claim confirmation is required');
  const now = input.now ?? new Date();
  return client.$transaction(async (tx: PrismaLike) => {
    await lockProfiles(tx, [input.profileId, input.claimantUserId]);
    const invite = await tx.invites.findUnique({ where: { id: input.inviteId } });
    const inviteRole = String(invite?.role ?? 'player').trim().toLowerCase();
    if (!invite || invite.type !== 'TEAM' || inviteRole !== 'player' || invite.userId !== input.profileId || !isCurrentInvite(invite.status)) {
      throw new Error('Claim invitation unavailable');
    }
    if (!input.verifyLink(invite, input.link, now)) throw new Error('Claim link is invalid or expired');

    const source = await tx.userData.findUnique({ where: { id: input.profileId } });
    if (!source) throw new Error('Profile not found');
    const claimant = await tx.userData.findUnique({ where: { id: input.claimantUserId } });
    if (!claimant) throw new Error('Claimant profile not found');
    if (source.mergedIntoProfileId || source.isManagedPlayer === false) {
      if (invite.claimedBy === input.claimantUserId) {
        return {
          status: 'ALREADY_CLAIMED',
          primaryProfileId: source.mergedIntoProfileId ?? source.id,
          sourceProfileId: source.id,
        };
      }
      throw new Error('Profile has already been claimed');
    }
    const claimantAuth = await tx.authUser.findUnique({ where: { id: input.claimantUserId } });
    if (!claimantAuth) throw new Error('Authenticated Account required');
    let sourceBirthDate = source.dateOfBirth as Date | null | undefined;
    let sourceHasUnknownBirthdate = isUnknownDateOfBirth(sourceBirthDate);
    let sourceIsMinor = isMinorAtUtcDate(sourceBirthDate, now);
    if (sourceIsMinor && invite.isMinor !== true && !sourceHasUnknownBirthdate) {
      throw new Error('Guardian authority is required for a minor profile');
    }
    const attachedEmail = normalizeEmail(sourceIsMinor ? (invite.guardianEmail ?? invite.email) : invite.email);
    if (attachedEmail && !claimantAuth.emailVerifiedAt) {
      throw new Error('Email verification is required for an attached Player email');
    }
    if (attachedEmail && claimantAuth.email.trim().toLowerCase() !== attachedEmail) {
      throw new Error(sourceIsMinor
        ? 'The Account email does not match the guardian email'
        : 'The Account email does not match the attached Player email');
    }

    const sourceAuth = await tx.authUser.findUnique({ where: { id: input.profileId } });
    if (isActiveAccountForProfile(sourceAuth)) {
      if (input.profileId === input.claimantUserId) {
        return { status: 'ALREADY_CLAIMED', primaryProfileId: input.profileId, sourceProfileId: input.profileId };
      }
      throw new Error('Profile is already controlled by another Account');
    }

    // Adult invites may omit a birthdate. Collect it before choosing the
    // adult or guardian acceptance path. Keep the roster assignment in place.
    if (sourceHasUnknownBirthdate) {
      if (!input.dateOfBirth) {
        return {
          status: 'BIRTHDATE_REQUIRED',
          primaryProfileId: input.profileId,
          sourceProfileId: input.profileId,
        };
      }
      const collectedBirthDate = normalizedBirthdate(input.dateOfBirth);
      if (collectedBirthDate > now) throw new Error('dateOfBirth cannot be in the future');
      sourceBirthDate = collectedBirthDate;
      sourceHasUnknownBirthdate = false;
      await tx.userData.update({
        where: { id: input.profileId },
        data: { dateOfBirth: collectedBirthDate, updatedAt: now },
      });
      await tx.invites.update({
        where: { id: input.inviteId },
        data: { dateOfBirth: collectedBirthDate, isMinor: isMinorAtUtcDate(collectedBirthDate, now), updatedAt: now },
      });
    }
    sourceIsMinor = isMinorAtUtcDate(sourceBirthDate, now);
    if (sourceIsMinor && invite.isMinor !== true && !sourceHasUnknownBirthdate) {
      // A newly discovered minor must not be claimed as the acting Account.
      // The guardian journey completes in the next invitation slice.
      return {
        status: 'GUARDIAN_REQUIRED',
        primaryProfileId: input.profileId,
        sourceProfileId: input.profileId,
      };
    }
    if (sourceIsMinor) {
      if (sourceHasUnknownBirthdate) {
        throw new Error('A valid date of birth is required before guardian approval');
      }
      if (!attachedEmail) {
        throw new Error('Guardian email is required for a minor profile');
      }
      const existingGuardianLink = tx.parentChildLinks?.findFirst
        ? await tx.parentChildLinks.findFirst({
          where: { childId: input.profileId, status: 'ACTIVE' },
          select: { id: true, parentId: true },
        })
        : null;
      if (existingGuardianLink && existingGuardianLink.parentId !== input.claimantUserId) {
        throw new Error('Profile is already controlled by another Account');
      }
      const claim = await tx.userProfileClaims.create({
        data: {
          id: crypto.randomUUID(),
          profileId: input.profileId,
          claimantUserId: input.claimantUserId,
          inviteId: input.inviteId,
          verificationMethod: 'GUARDIAN_EMAIL',
          verifiedEmail: attachedEmail,
          status: 'COMPLETED',
          confirmationAt: now,
          completedAt: now,
        },
      });
      if (!existingGuardianLink && tx.parentChildLinks?.create) {
        await tx.parentChildLinks.create({
          data: {
            id: crypto.randomUUID(),
            parentId: input.claimantUserId,
            childId: input.profileId,
            status: 'ACTIVE',
            relationship: 'guardian',
            linkMethod: 'MANAGED_PLAYER_INVITE',
            createdBy: input.claimantUserId,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      await tx.invites.update({ where: { id: input.inviteId }, data: { claimedBy: input.claimantUserId, updatedAt: now } });
      return {
        status: 'GUARDIAN_LINKED',
        primaryProfileId: input.profileId,
        sourceProfileId: input.profileId,
        mergeId: claim.id,
      };
    }
    if (sourceHasUnknownBirthdate) {
      throw new Error('A valid date of birth is required before profile claim');
    }

    const claim = await tx.userProfileClaims.create({
      data: {
        id: crypto.randomUUID(),
        profileId: input.profileId,
        claimantUserId: input.claimantUserId,
        inviteId: input.inviteId,
        verificationMethod: attachedEmail ? 'VERIFIED_EMAIL' : 'SIGNED_URL',
        verifiedEmail: attachedEmail,
        status: 'COMPLETED',
        confirmationAt: now,
        completedAt: now,
      },
    });

    if (input.profileId === input.claimantUserId) {
      await tx.userData.update({ where: { id: input.profileId }, data: { isManagedPlayer: false, updatedAt: now } });
      await tx.invites.update({ where: { id: input.inviteId }, data: { claimedBy: input.claimantUserId, updatedAt: now } });
      return { status: 'CLAIMED', primaryProfileId: input.profileId, sourceProfileId: input.profileId };
    }

    const associationSnapshot = await mergeAssociations(tx, input.profileId, input.claimantUserId, now);
    const mergedBlockedUserIds = Array.from(new Set([
      ...(Array.isArray(source.blockedUserIds) ? source.blockedUserIds : []),
      ...(Array.isArray(claimant.blockedUserIds) ? claimant.blockedUserIds : []),
    ]));
    if (tx.userData.update) {
      await tx.userData.update({
        where: { id: input.claimantUserId },
        data: { blockedUserIds: mergedBlockedUserIds, updatedAt: now },
      });
    }
    const merge = await tx.userProfileMerges.create({
      data: {
        id: crypto.randomUUID(),
        sourceProfileId: input.profileId,
        primaryProfileId: input.claimantUserId,
        claimantUserId: input.claimantUserId,
        confirmationAt: now,
        rosterIds: associationSnapshot.rosterIds,
        invitationIds: associationSnapshot.invitationIds,
        metadata: { claimId: claim.id },
      },
    });
    await tx.userData.update({
      where: { id: input.profileId },
      data: { isManagedPlayer: false, mergedIntoProfileId: input.claimantUserId, mergedAt: now, updatedAt: now },
    });
    await tx.invites.update({ where: { id: input.inviteId }, data: { claimedBy: input.claimantUserId, updatedAt: now } });
    return {
      status: 'MERGED',
      primaryProfileId: input.claimantUserId,
      sourceProfileId: input.profileId,
      mergeId: merge.id,
    };
  });
};

export type ManagedContactCorrectionInput = {
  profileId: string;
  inviteId: string;
  teamId: string;
  managerUserId: string;
  email?: string | null;
  phone?: string | null;
  now?: Date;
  authorize?: (tx: PrismaLike) => Promise<boolean>;
};

export const correctManagedPlayerContact = async (
  client: PrismaLike,
  input: ManagedContactCorrectionInput,
) => client.$transaction(async (tx: PrismaLike) => {
  const now = input.now ?? new Date();
  await lockProfiles(tx, [input.profileId]);
  if (input.authorize && !(await input.authorize(tx))) throw new Error('Forbidden');
  const profile = await tx.userData.findUnique({ where: { id: input.profileId } });
  if (!profile || !profile.isManagedPlayer) throw new Error('Only an unclaimed Managed Player can be corrected');
  const account = await tx.authUser.findUnique({ where: { id: input.profileId } });
  if (isActiveAccountForProfile(account)) throw new Error('Claimed profiles cannot be corrected by a manager');
  const invite = await tx.invites.findFirst({
    where: {
      id: input.inviteId,
      teamId: input.teamId,
      type: 'TEAM',
      userId: input.profileId,
      role: 'player',
      status: { in: ['PENDING', 'SENT', 'FAILED'] },
    },
  });
  if (!invite) throw new Error('No current Player invitation found');
  const email = input.email === undefined ? normalizeEmail(invite.email) : normalizeEmail(input.email);
  const phone = input.phone === undefined ? normalizeContact(invite.phone) : normalizeContact(input.phone);
  if (!email && !phone) throw new Error('A corrected email or phone is required');

  const pendingSyncRows = tx.teamInviteEventSyncs?.findMany
    ? await tx.teamInviteEventSyncs.findMany({ where: { inviteId: invite.id, status: 'PENDING' } })
    : [];
  await rollbackTeamInviteEventSyncs(tx, invite, 'CANCELLED', now);
  await tx.invites.update({ where: { id: invite.id }, data: { status: 'CANCELLED', finalizedAt: now, updatedAt: now } });
  const replacement = await tx.invites.create({
    data: {
      id: crypto.randomUUID(),
      type: 'TEAM',
      teamId: invite.teamId,
      userId: input.profileId,
      email,
      phone,
      playerEmail: input.email === undefined ? invite.playerEmail : email,
      status: 'PENDING',
      role: 'player',
      firstName: profile.firstName,
      lastName: profile.lastName,
      isAssigned: true,
      isMinor: Boolean(invite.isMinor),
      dateOfBirth: invite.dateOfBirth,
      guardianEmail: invite.guardianEmail,
      createdBy: input.managerUserId,
      linkVersion: 1,
      linkExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    },
  });
  if (pendingSyncRows.length && tx.teamInviteEventSyncs?.create) {
    for (const row of pendingSyncRows) {
      const eventTeam = await tx.teams?.findUnique?.({ where: { id: row.eventTeamId }, select: { playerIds: true, pending: true } });
      if (eventTeam && tx.teams?.update) {
        const playerIds = Array.isArray(eventTeam.playerIds) ? eventTeam.playerIds.map(String) : [];
        const pending = Array.isArray(eventTeam.pending) ? eventTeam.pending.map(String) : [];
        await tx.teams.update({
          where: { id: row.eventTeamId },
          data: {
            playerIds,
            pending: playerIds.includes(input.profileId) ? pending : Array.from(new Set([...pending, input.profileId])),
            updatedAt: now,
          },
        });
      }
      await tx.teamInviteEventSyncs.create({
        data: {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          inviteId: replacement.id,
          canonicalTeamId: row.canonicalTeamId,
          eventId: row.eventId,
          eventTeamId: row.eventTeamId,
          userId: input.profileId,
          previousRegistrationSnapshot: row.previousRegistrationSnapshot,
          eventTeamHadUser: row.eventTeamHadUser,
          eventTeamHadPendingUser: row.eventTeamHadPendingUser,
          sourceTeamRegistrationId: row.sourceTeamRegistrationId,
          status: 'PENDING',
        },
      });
    }
  }
  await tx.userProfileContactCorrections.create({
    data: {
      id: crypto.randomUUID(),
      profileId: input.profileId,
      managerUserId: input.managerUserId,
      previousEmail: normalizeEmail(invite.email),
      correctedEmail: email,
      previousPhone: normalizeContact(invite.phone),
      correctedPhone: phone,
      inviteId: replacement.id,
      createdAt: now,
    },
  });
  return replacement;
});
