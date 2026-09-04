import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';
import { normalizeOptionalName } from '@/lib/nameCase';
import { isActiveAccountForProfile } from '@/server/managedPlayers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: inviteId } = await params;
  const invite = await prisma.invites.findUnique({ where: { id: inviteId } });
  const status = String(invite?.status ?? '').trim().toUpperCase();
  if (!invite || invite.type !== 'TEAM' || invite.role !== 'player' || !invite.userId
    || !['', 'PENDING', 'SENT', 'FAILED', 'ACCEPTED'].includes(status)) {
    return NextResponse.json({ available: false }, { status: 404 });
  }
  if (!verifyTeamInviteShareLink(invite, {
    version: req.nextUrl.searchParams.get('v'),
    expiresAt: req.nextUrl.searchParams.get('e'),
    signature: req.nextUrl.searchParams.get('s'),
  })) {
    return NextResponse.json({ available: false }, { status: 404 });
  }
  const profile = await prisma.userData.findUnique({
    where: { id: invite.userId },
    select: { id: true, firstName: true, lastName: true, isManagedPlayer: true, mergedIntoProfileId: true },
  });
  if (!profile || profile.mergedIntoProfileId) {
    return NextResponse.json({ available: false }, { status: 404 });
  }
  const auth = await prisma.authUser.findUnique({
    where: { id: profile.id },
    select: { id: true, email: true, passwordHash: true, lastLogin: true, emailVerifiedAt: true, disabledAt: true },
  });
  if (!profile.isManagedPlayer || isActiveAccountForProfile(auth)) {
    return NextResponse.json({ available: false }, { status: 404 });
  }
  const team = invite.teamId
    ? await prisma.canonicalTeams.findUnique({ where: { id: invite.teamId }, select: { id: true, name: true } })
    : null;
  return NextResponse.json({
    available: true,
    invite: {
      id: invite.id,
      profileId: profile.id,
      firstName: normalizeOptionalName(profile.firstName),
      lastName: normalizeOptionalName(profile.lastName),
      hasAttachedEmail: Boolean(invite.email),
      isMinor: invite.isMinor === true,
      expiresAt: invite.linkExpiresAt,
      teamId: team?.id ?? null,
    },
    profile: {
      id: profile.id,
      displayName: `${normalizeOptionalName(profile.firstName) ?? ''} ${normalizeOptionalName(profile.lastName) ?? ''}`.trim() || 'Player',
      isManaged: true,
    },
    team,
  });
}
