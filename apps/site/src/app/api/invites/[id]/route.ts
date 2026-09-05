import { isRoutineInvitationVisible } from '@/server/invitationRetention';
import { expireTeamInvitation } from '@/server/teams/teamInvitationState';
import { withTeamInvitationViews } from '@/server/teams/teamInvitationViews';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import { listActiveChildIdsForParent } from '@/server/teams/teamGuardianInvites';
import { acquireEventLock } from '@/server/repositories/locks';
import { cancelTeamInvitation } from '@/server/teams/teamInvitationCommands';
import { declineTeamInviteWithGuardianRules } from '@/server/teams/teamGuardianInvites';

export const dynamic = 'force-dynamic';


/**
 * Returns one invitation only to its recipient (or a linked guardian for an
 * active child TEAM invite). This is intentionally narrower than management
 * APIs so a push ID cannot become an invitation-enumeration primitive.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(_req);
  const { id } = await params;
  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite || !isRoutineInvitationVisible(invite)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const inviteeId = invite.userId?.trim() || null;
  const isDirectRecipient = inviteeId === session.userId;
  const isPendingChildTeamInvite = normalizeInviteType(invite.type) === 'TEAM'
    && !!inviteeId;
  const childInviteeIds = !session.isAdmin && !isDirectRecipient && isPendingChildTeamInvite
    ? await listActiveChildIdsForParent(prisma, session.userId)
    : [];
  const isLinkedGuardian = !!inviteeId && childInviteeIds.includes(inviteeId);

  // Use the same result for absent and unauthorized rows so a caller cannot
  // probe invitation identifiers from notification payloads.
  if (!session.isAdmin && !isDirectRecipient && !isLinkedGuardian) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const current = invite.type === 'TEAM' ? await expireTeamInvitation(prisma, invite) : invite;
  const [view] = await withTeamInvitationViews(prisma, current ? [current] : []);
  return NextResponse.json({ invite: isLinkedGuardian ? { ...view, viewerCanAcceptForChild: true, childUserId: inviteeId } : view }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite || !isRoutineInvitationVisible(invite)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (normalizeInviteType(invite.type) === 'TEAM' && invite.teamId) {
    const childIds = invite.userId !== session.userId ? await listActiveChildIdsForParent(prisma, session.userId) : [];
    const result = invite.userId === session.userId || (invite.userId && childIds.includes(invite.userId))
      ? await declineTeamInviteWithGuardianRules({ invite, session })
      : await cancelTeamInvitation(invite.id, session);
    return NextResponse.json(result.body, { status: result.status });
  }

  const eventStaffId = normalizeInviteType(invite.type) === 'STAFF'
    && typeof invite.eventId === 'string'
    && invite.eventId.trim()
    ? invite.eventId.trim()
    : null;
  if (eventStaffId) {
    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventStaffId);
      const lockedInvite = await tx.invites.findUnique({ where: { id } });
      if (
        !lockedInvite
        || normalizeInviteType(lockedInvite.type) !== 'STAFF'
        || lockedInvite.eventId !== eventStaffId
      ) {
        return { status: 404, body: { error: 'Not found' } };
      }

      let allowed = session.isAdmin
        || (lockedInvite.userId && lockedInvite.userId === session.userId)
        || (lockedInvite.createdBy && lockedInvite.createdBy === session.userId);
      if (!allowed) {
        const event = await tx.events.findUnique({
          where: { id: eventStaffId },
          select: {
            hostId: true,
            assistantHostIds: true,
            organizationId: true,
          },
        });
        allowed = await canManageEvent(session, event, tx);
      }
      if (!allowed) {
        return { status: 403, body: { error: 'Forbidden' } };
      }

      const managedProfile = lockedInvite.userId
        ? await tx.userData?.findUnique?.({ where: { id: lockedInvite.userId }, select: { isManagedPlayer: true, mergedIntoProfileId: true } })
        : null;
      if (managedProfile?.isManagedPlayer || managedProfile?.mergedIntoProfileId) {
        await tx.invites.update({
          where: { id: lockedInvite.id },
          data: { status: 'CANCELLED', finalizedAt: new Date(), updatedAt: new Date() },
        });
        return { status: 200, body: { deleted: true, cancelled: true } };
      }
      await tx.invites.delete({ where: { id: lockedInvite.id } });
      return { status: 200, body: { deleted: true } };
    });

    return NextResponse.json(result.body, { status: result.status });
  }

  if (!session.isAdmin) {
    let allowed = (invite.userId && invite.userId === session.userId)
      || (invite.createdBy && invite.createdBy === session.userId);
    if (!allowed && normalizeInviteType(invite.type) === 'STAFF') {
      if (invite.eventId) {
        const event = await prisma.events.findUnique({
          where: { id: invite.eventId },
          select: {
            hostId: true,
            assistantHostIds: true,
            organizationId: true,
          },
        });
        allowed = await canManageEvent(session, event, prisma);
      } else if (invite.organizationId) {
        const organization = await prisma.organizations.findUnique({
          where: { id: invite.organizationId },
          select: {
            id: true,
            ownerId: true,
          },
        });
        allowed = await canManageOrganization(session, organization, prisma);
      }
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const managedProfile = invite.userId
      ? await tx.userData?.findUnique?.({ where: { id: invite.userId }, select: { isManagedPlayer: true, mergedIntoProfileId: true } })
      : null;
    const hasClaimHistory = Boolean(invite.claimedBy)
      || Boolean(tx.userProfileClaims?.findFirst && await tx.userProfileClaims.findFirst({
        where: { inviteId: invite.id, status: 'COMPLETED' },
        select: { id: true },
      }))
      || Boolean(tx.userProfileMerges?.findFirst && await tx.userProfileMerges.findFirst({
        where: { invitationIds: { has: invite.id } },
        select: { id: true },
      }));
    if (managedProfile?.isManagedPlayer || managedProfile?.mergedIntoProfileId || hasClaimHistory) {
      await tx.invites.update({ where: { id: invite.id }, data: { status: 'CANCELLED', finalizedAt: now, updatedAt: now } });
    } else {
      await tx.invites.delete({ where: { id: invite.id } });
    }
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
