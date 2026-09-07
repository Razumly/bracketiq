import type { Invites, Prisma } from '@/generated/prisma/client';
import { normalizeTeamInviteRole } from '@/lib/staff';
import { assertTeamInvitationAllowed, TeamInvitationRestrictionError } from '@/server/teams/teamInvitationRestrictions';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { acceptTeamInviteWithGuardianRules } from '@/server/teams/teamGuardianInvites';
import {
  loadCanonicalTeamById,
  replaceSingletonTeamStaffAssignment,
} from '@/server/teams/teamMembership';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';
import { acquireTeamRosterLock } from '@/server/repositories/locks';
import { requiresPlayerProfileClaim } from '@/server/teams/playerInvitationClaim';

export const dynamic = 'force-dynamic';

type TeamStaffRole = 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';

const inviteStaffRoles = (value: unknown): TeamStaffRole[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((entry) => String(entry ?? '').trim().toUpperCase())
    .filter((entry): entry is TeamStaffRole => (
      entry === 'MANAGER' || entry === 'HEAD_COACH' || entry === 'ASSISTANT_COACH'
    ))));
};

const inviteStaffRoleFromRole = (value: unknown): TeamStaffRole | 'PLAYER' | null => {
  const role = normalizeTeamInviteRole(value);
  if (!role) return null;
  const roles = { player: 'PLAYER', team_manager: 'MANAGER', team_head_coach: 'HEAD_COACH', team_assistant_coach: 'ASSISTANT_COACH' } as const;
  return roles[role];
};

const linkFields = (req: NextRequest) => ({
  version: req.nextUrl.searchParams.get('v'), expiresAt: req.nextUrl.searchParams.get('e'), signature: req.nextUrl.searchParams.get('s'),
});

const isAvailable = (invite: Invites | null): invite is Invites & { teamId: string } => Boolean(
  invite && invite.type === 'TEAM' && invite.teamId && ['', 'PENDING', 'SENT', 'FAILED'].includes(String(invite.status ?? '').trim().toUpperCase()),
);

async function assignStaff(tx: Prisma.TransactionClient, invite: Invites & { teamId: string }, userId: string, now: Date) {
  const explicitRole = inviteStaffRoleFromRole(invite.role);
  const roles = explicitRole && explicitRole !== 'PLAYER' ? [explicitRole] : inviteStaffRoles(invite.staffTypes);
  if (!roles.length) throw new Error('Invite unavailable');
  const team = await loadCanonicalTeamById(invite.teamId, tx);
  if (!team) throw new Error('Team not found');
  for (const role of roles) {
    if (role === 'MANAGER' || role === 'HEAD_COACH') {
      await replaceSingletonTeamStaffAssignment({ tx, teamId: invite.teamId, role, replacementInviteId: invite.id, replacementUserId: userId, now });
    }
    await tx.teamStaffAssignments.upsert({
      where: { teamId_userId_role: { teamId: invite.teamId, userId, role } },
      create: { id: `${invite.teamId}__${role}__${userId}`, teamId: invite.teamId, userId, role,
        status: 'INVITED', createdBy: invite.createdBy ?? userId, createdAt: now, updatedAt: now },
      update: { status: 'INVITED', updatedAt: now },
    });
  }
}

async function bindStaffInvitation(invite: Invites & { teamId: string }, userId: string, req: NextRequest, now: Date) {
  return prisma.$transaction(async tx => {
    await acquireTeamRosterLock(tx, invite.teamId);
    const current = await tx.invites.findUnique({ where: { id: invite.id } });
    if (!isAvailable(current) || !verifyTeamInviteShareLink(current, linkFields(req), new Date())) throw new Error('Invite unavailable');
    if (await requiresPlayerProfileClaim(tx, current)) throw new Error('Invite unavailable');
    if (current.createdBy) await assertTeamInvitationAllowed(tx, { teamId: current.teamId, playerIds: [userId], senderId: current.createdBy }, now);
    const claimed = await tx.invites.updateMany({
      where: { id: current.id, userId: null, OR: [{ status: null }, { status: { in: ['PENDING', 'SENT', 'FAILED'] } }] },
      data: { userId, claimedBy: userId, status: 'PENDING', updatedAt: now },
    });
    if (claimed.count !== 1) throw new Error('Invite unavailable');
    await assignStaff(tx, current, userId, now);
    return tx.invites.findUnique({ where: { id: current.id } });
  });
}

function claimError(error: unknown) {
  if (error instanceof TeamInvitationRestrictionError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message === 'Team not found') return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof Error && error.message === 'Invite unavailable') return NextResponse.json({ error: error.message }, { status: 409 });
  throw error;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action && !['accept', 'review'].includes(body.action)) return NextResponse.json({ error: 'Invalid invitation action.' }, { status: 400 });
  const now = new Date();
  let invite = await prisma.invites.findUnique({ where: { id } });
  if (!isAvailable(invite) || !verifyTeamInviteShareLink(invite, linkFields(req), now)) {
    return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  }

  if (await requiresPlayerProfileClaim(prisma, invite)) {
    return NextResponse.json({ error: 'Use the Player profile claim flow. Ask the manager for a current claim link if this legacy invitation is not prepared.' }, { status: 409 });
  }
  if (!invite.userId) {
    try { invite = await bindStaffInvitation(invite, session.userId, req, now); }
    catch (error) { return claimError(error); }
  }

  if (!invite) return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  if (body.action === 'review') return NextResponse.json({ ok: true });
  return acceptInvitation(invite, session, now);
}

async function acceptInvitation(invite: Invites, session: Awaited<ReturnType<typeof requireSession>>, now: Date) {
  try {
    const result = await acceptTeamInviteWithGuardianRules({ invite, session, now });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof TeamInvitationRestrictionError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
