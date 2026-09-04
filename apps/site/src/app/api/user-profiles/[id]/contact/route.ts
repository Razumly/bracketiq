import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { loadCanonicalTeamById, normalizeIdList } from '@/server/teams/teamMembership';
import { correctManagedPlayerContact } from '@/server/managedPlayers';
import { buildManagedPlayerClaimUrl, buildTeamInviteShareUrl } from '@/server/teamInviteLinks';
import { canManageTeamInvites } from '@/app/api/teams/[id]/member-invites/inviteHelpers';

export const dynamic = 'force-dynamic';

const schema = z.object({
  inviteId: z.string().min(1),
  teamId: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
}).refine((value) => Boolean(value.email || value.phone), 'A corrected email or phone is required');

const canManageRoster = async (profileId: string, teamId: string, inviteId: string, session: { userId: string; isAdmin?: boolean }): Promise<boolean> => {
  if (session.isAdmin) return true;
  const invite = await prisma.invites.findFirst({
    where: { id: inviteId, teamId, type: 'TEAM', userId: profileId, role: 'player', status: { in: ['PENDING', 'SENT', 'FAILED'] } },
    select: { teamId: true },
  });
  if (!invite?.teamId) return false;
  const team = await loadCanonicalTeamById(invite.teamId, prisma) as any;
  if (!team) return false;
  if ([team.captainId, team.managerId, team.headCoachId, ...normalizeIdList(team.coachIds)].includes(session.userId)) {
    return true;
  }
  return false;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id: profileId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contact correction' }, { status: 400 });
  if (!(await canManageRoster(profileId, parsed.data.teamId, parsed.data.inviteId, session))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const invite = await correctManagedPlayerContact(prisma, {
      profileId,
      inviteId: parsed.data.inviteId,
      teamId: parsed.data.teamId,
      managerUserId: session.userId,
      authorize: (tx) => canManageTeamInvites(parsed.data.teamId, session, tx),
      email: parsed.data.email,
      phone: parsed.data.phone,
    });
    const baseUrl = getRequestOrigin(req);
    const claimUrl = buildManagedPlayerClaimUrl(invite, baseUrl);
    return NextResponse.json({
      ok: true,
      invite,
      shareUrl: claimUrl,
      claimUrl,
      teamInviteUrl: buildTeamInviteShareUrl(invite, baseUrl),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contact correction failed';
    return NextResponse.json({ error: message }, { status: /Forbidden|claimed/i.test(message) ? 403 : 409 });
  }
}
