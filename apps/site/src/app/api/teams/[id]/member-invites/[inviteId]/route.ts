import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { buildManagedPlayerClaimUrl, buildTeamInviteShareUrl, TEAM_INVITE_LINK_TTL_MS } from '@/server/teamInviteLinks';
import { correctManagedPlayerContact } from '@/server/managedPlayers';
import { removeCanonicalPendingInvitee, rollbackTeamInviteEventSyncs } from '@/server/teams/teamInviteEventSync';
import { loadCanonicalTeamById, normalizeId } from '@/server/teams/teamMembership';
import {
  assertEditableAccountlessTeamPlayer,
  canManageTeamInvites,
  MemberInviteRouteError,
  normalizedName,
  normalizeOptionalContact,
} from '@/app/api/teams/[id]/member-invites/inviteHelpers';

export const dynamic = 'force-dynamic';

const contactEditSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
}).passthrough();

const errorResponse = (error: unknown) => {
  if (error instanceof MemberInviteRouteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Failed to update member invite';
  return NextResponse.json({ error: message }, { status: 500 });
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const session = await requireSession(req);
  const { id, inviteId } = await params;
  const teamId = normalizeId(id);
  const normalizedInviteId = normalizeId(inviteId);
  if (!teamId || !normalizedInviteId) {
    return NextResponse.json({ error: 'Invalid team or invite id' }, { status: 400 });
  }

  const parsed = contactEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const firstName = normalizedName(parsed.data.firstName);
  const lastName = normalizedName(parsed.data.lastName);
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
  }
  const email = normalizeOptionalContact(parsed.data.email);
  if (email && !z.string().email().safeParse(email).success) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  const phone = normalizeOptionalContact(parsed.data.phone);
  const now = new Date();

  // Managed Players use the profile correction audit trail. Keep the legacy
  // accountless route for old invitations and staff tooling.
  const managedInvite = await (prisma as any).invites?.findFirst?.({
    where: { id: normalizedInviteId, teamId },
  });
  if (managedInvite?.userId && (prisma as any).userData?.findUnique) {
    const profile = await (prisma as any).userData.findUnique({ where: { id: managedInvite.userId } });
    if (profile?.isManagedPlayer) {
      if (!(await canManageTeamInvites(teamId, session, prisma as any))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      try {
        const replacement = await correctManagedPlayerContact(prisma, {
          profileId: managedInvite.userId,
          inviteId: normalizedInviteId,
          teamId,
          managerUserId: session.userId,
          authorize: (tx) => canManageTeamInvites(teamId, session, tx),
          email: parsed.data.email === undefined ? managedInvite.email : email,
          phone: parsed.data.phone === undefined ? managedInvite.phone : phone,
          now,
        });
        const baseUrl = getRequestOrigin(req);
        const claimUrl = buildManagedPlayerClaimUrl(replacement, baseUrl);
        return NextResponse.json({
          ok: true,
          invite: replacement,
          shareUrl: claimUrl,
          claimUrl,
        }, { status: 200 });
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  try {
    const invite = await prisma.$transaction(async (tx) => {
      const team = await loadCanonicalTeamById(teamId, tx);
      if (!team) throw new MemberInviteRouteError(404, 'Team not found');
      if (!(await canManageTeamInvites(teamId, session, tx))) {
        throw new MemberInviteRouteError(403, 'Forbidden');
      }
      const existing = await tx.invites.findFirst({
        where: { id: normalizedInviteId, teamId },
      });
      const editable = assertEditableAccountlessTeamPlayer(existing);
      const nextEmail = parsed.data.email === undefined
        ? (typeof editable.email === 'string' ? editable.email : null)
        : email;
      const nextPhone = parsed.data.phone === undefined
        ? (typeof editable.phone === 'string' ? editable.phone : null)
        : phone;
      return tx.invites.update({
        where: { id: normalizedInviteId },
        data: {
          firstName,
          lastName,
          email: nextEmail,
          phone: nextPhone,
          status: 'PENDING',
          linkExpiresAt: new Date(now.getTime() + TEAM_INVITE_LINK_TTL_MS),
          updatedAt: now,
        },
      });
    });
    const baseUrl = getRequestOrigin(req);
    return NextResponse.json({
      ok: true,
      invite,
      shareUrl: buildTeamInviteShareUrl(invite, baseUrl),
    }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const session = await requireSession(req);
  const { id, inviteId } = await params;
  const teamId = normalizeId(id);
  const normalizedInviteId = normalizeId(inviteId);
  if (!teamId || !normalizedInviteId) {
    return NextResponse.json({ error: 'Invalid team or invite id' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const team = await loadCanonicalTeamById(teamId, tx);
      if (!team) throw new MemberInviteRouteError(404, 'Team not found');
      if (!(await canManageTeamInvites(teamId, session, tx))) {
        throw new MemberInviteRouteError(403, 'Forbidden');
      }
      const existing = await tx.invites.findFirst({
        where: { id: normalizedInviteId, teamId },
      });
      if (!existing) {
        throw new MemberInviteRouteError(404, 'Invite not found');
      }
      const managedProfile = existing?.userId
        ? await tx.userData?.findUnique?.({ where: { id: existing.userId }, select: { isManagedPlayer: true, mergedIntoProfileId: true } })
        : null;
      const hasClaimHistory = Boolean(existing.claimedBy)
        || Boolean(tx.userProfileClaims?.findFirst && await tx.userProfileClaims.findFirst({
          where: { inviteId: existing.id, status: 'COMPLETED' },
          select: { id: true },
        }))
        || Boolean(tx.userProfileMerges?.findFirst && await tx.userProfileMerges.findFirst({
          where: { invitationIds: { has: existing.id } },
          select: { id: true },
        }));
      if (managedProfile?.isManagedPlayer || managedProfile?.mergedIntoProfileId || hasClaimHistory) {
        const now = new Date();
        await rollbackTeamInviteEventSyncs(tx, existing, 'CANCELLED', now);
        await removeCanonicalPendingInvitee(tx, existing, session.userId, now);
        await tx.invites.update({ where: { id: normalizedInviteId }, data: { status: 'CANCELLED', finalizedAt: now, updatedAt: now } });
        return;
      }
      assertEditableAccountlessTeamPlayer(existing);
      await tx.invites.delete({ where: { id: normalizedInviteId } });
    });
    return NextResponse.json({ ok: true, inviteId: normalizedInviteId }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
