import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { acceptTeamInviteWithGuardianRules } from '@/server/teams/teamGuardianInvites';
import {
  loadCanonicalTeamById,
  normalizeIdList,
  replaceSingletonTeamStaffAssignment,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';
import { acquireTeamRosterLock } from '@/server/repositories/locks';

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
  const role = String(value ?? '').trim().toUpperCase();
  switch (role) {
    case 'MANAGER':
    case 'TEAM_MANAGER':
      return 'MANAGER';
    case 'HEAD_COACH':
    case 'TEAM_HEAD_COACH':
    case 'HEADCOACH':
      return 'HEAD_COACH';
    case 'ASSISTANT_COACH':
    case 'TEAM_ASSISTANT_COACH':
    case 'ASSISTANTCOACH':
      return 'ASSISTANT_COACH';
    case 'PLAYER':
    case 'TEAM_PLAYER':
      return 'PLAYER';
    default:
      return null;
  }
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const now = new Date();
  let invite = await prisma.invites.findUnique({ where: { id } });
  const inviteStatus = String(invite?.status ?? '').trim().toUpperCase();
  if (!invite || invite.type !== 'TEAM' || !invite.teamId || !['', 'PENDING', 'SENT', 'FAILED'].includes(inviteStatus)) {
    return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  }
  if (!verifyTeamInviteShareLink(invite, {
    version: req.nextUrl.searchParams.get('v'),
    expiresAt: req.nextUrl.searchParams.get('e'),
    signature: req.nextUrl.searchParams.get('s'),
  }, now)) {
    return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  }

  if (!invite.userId) {
    try {
      invite = await prisma.$transaction(async (tx) => {
        if (typeof tx?.$executeRaw === 'function') {
          await acquireTeamRosterLock(tx, invite!.teamId!);
        }
        const explicitStaffRole = inviteStaffRoleFromRole(invite!.role);
        const staffRoles = explicitStaffRole === 'PLAYER'
          ? []
          : explicitStaffRole
            ? [explicitStaffRole]
            : inviteStaffRoles(invite!.staffTypes);
        const claimed = await tx.invites.updateMany({
          where: {
            id: invite!.id,
            userId: null,
            OR: [
              { status: null },
              { status: { in: ['PENDING', 'SENT', 'FAILED'] } },
            ],
          },
          data: { userId: session.userId, claimedBy: session.userId, status: 'PENDING', updatedAt: now },
        });
        if (claimed.count !== 1) throw new Error('Invite unavailable');

        const team = await loadCanonicalTeamById(invite!.teamId!, tx);
        if (!team) throw new Error('Team not found');
        for (const role of staffRoles) {
          if (role === 'MANAGER' || role === 'HEAD_COACH') {
            await replaceSingletonTeamStaffAssignment({
              tx,
              teamId: invite!.teamId!,
              role,
              replacementInviteId: invite!.id,
              replacementUserId: session.userId,
              now,
            });
          }
        }
        if (staffRoles.length > 0) {
          await Promise.all(staffRoles.map((role) => tx.teamStaffAssignments.upsert({
            where: {
              teamId_userId_role: {
                teamId: invite!.teamId!,
                userId: session.userId,
                role,
              },
            },
            create: {
              id: `${invite!.teamId!}__${role}__${session.userId}`,
              teamId: invite!.teamId!,
              userId: session.userId,
              role,
              status: 'INVITED',
              createdBy: invite!.createdBy ?? session.userId,
              createdAt: now,
              updatedAt: now,
            },
            update: {
              status: 'INVITED',
              updatedAt: now,
            },
          })));
        } else {
          const activeIds = normalizeIdList((team as any).playerIds);
          const pendingIds = normalizeIdList((team as any).pending);
          const teamSize = Math.max(0, Math.trunc(Number((team as any).teamSize) || 0));
          if (!activeIds.includes(session.userId) && !pendingIds.includes(session.userId) && teamSize > 0 && activeIds.length + pendingIds.length >= teamSize) {
            throw new Error('Team is full');
          }
          await syncCanonicalTeamRoster({
            teamId: invite!.teamId!,
            captainId: (team as any).captainId,
            playerIds: activeIds,
            pendingPlayerIds: Array.from(new Set([...pendingIds, session.userId])),
            managerId: (team as any).managerId,
            headCoachId: (team as any).headCoachId,
            assistantCoachIds: normalizeIdList((team as any).coachIds),
            actingUserId: session.userId,
            now,
            cleanupRemovedPendingInvites: false,
          }, tx);
        }
        return tx.invites.findUnique({ where: { id } });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invite unavailable';
      if (message === 'Team is full') {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      if (message === 'Team not found') {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message === 'Invite unavailable') {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw error;
    }
  }

  if (!invite) return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  const result = await acceptTeamInviteWithGuardianRules({ invite, session, now });
  return NextResponse.json(result.body, { status: result.status });
}
