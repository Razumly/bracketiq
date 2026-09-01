import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeTeamInviteRole } from '@/lib/staff';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';

export const dynamic = 'force-dynamic';

const inviteRole = (role: unknown, staffTypes: unknown): 'PLAYER' | 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' => {
  const explicitRole = normalizeTeamInviteRole(role);
  if (explicitRole === 'team_manager') return 'MANAGER';
  if (explicitRole === 'team_head_coach') return 'HEAD_COACH';
  if (explicitRole === 'team_assistant_coach') return 'ASSISTANT_COACH';
  if (explicitRole === 'player') return 'PLAYER';
  if (!Array.isArray(staffTypes)) return 'PLAYER';
  const legacyRole = staffTypes
    .map((value) => String(value ?? '').trim().toUpperCase())
    .find((value) => ['MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH'].includes(value));
  return (legacyRole as 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' | undefined) ?? 'PLAYER';
};

const unavailable = () => NextResponse.json({ available: false }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite || invite.type !== 'TEAM' || !invite.teamId || !['PENDING', 'FAILED'].includes(invite.status ?? '')) {
    return unavailable();
  }
  if (!verifyTeamInviteShareLink(invite, {
    version: req.nextUrl.searchParams.get('v'),
    expiresAt: req.nextUrl.searchParams.get('e'),
    signature: req.nextUrl.searchParams.get('s'),
  })) {
    return unavailable();
  }

  const team = await prisma.canonicalTeams.findUnique({
    where: { id: invite.teamId },
    select: { id: true, name: true, sport: true, division: true, teamSize: true },
  });
  if (!team) return unavailable();

  return NextResponse.json({
    available: true,
    invite: {
      id: invite.id,
      firstName: invite.firstName,
      expiresAt: invite.linkExpiresAt,
      isAssigned: invite.isAssigned,
      role: inviteRole(invite.role, invite.staffTypes),
    },
    team,
  });
}
