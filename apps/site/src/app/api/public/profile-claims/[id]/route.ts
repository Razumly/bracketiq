import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';
import { normalizeOptionalName } from '@/lib/nameCase';
import { isActiveAccountForProfile } from '@/server/managedPlayers';
import { getOptionalSession } from '@/lib/permissions';
import { findGuardianAuthority, GUARDIAN_DECLARATION } from '@/server/guardianAuthority';
import { isMinorAtUtcDate, isUnknownDateOfBirth } from '@/server/userPrivacy';

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
    select: { id: true, firstName: true, lastName: true, isManagedPlayer: true, mergedIntoProfileId: true, dateOfBirth: true },
  });
  if (!profile || profile.mergedIntoProfileId) {
    return NextResponse.json({ available: false }, { status: 404 });
  }
  const auth = await prisma.authUser.findUnique({
    where: { id: profile.id },
    select: { id: true, email: true, passwordHash: true, lastLogin: true, emailVerifiedAt: true, disabledAt: true },
  });
  const isMinor = !isUnknownDateOfBirth(profile.dateOfBirth) && isMinorAtUtcDate(profile.dateOfBirth);
  if (!isMinor && (!profile.isManagedPlayer || isActiveAccountForProfile(auth))) {
    return NextResponse.json({ available: false }, { status: 404 });
  }
  const team = invite.teamId
    ? await prisma.canonicalTeams.findUnique({ where: { id: invite.teamId }, select: { id: true, name: true } })
    : null;
  const session = await getOptionalSession(req);
  const activeGuardian = isMinor && session
    ? await findGuardianAuthority(prisma, session.userId, profile.id)
    : null;
  return NextResponse.json({
    available: true,
    invite: {
      id: invite.id,
      profileId: profile.id,
      firstName: normalizeOptionalName(profile.firstName),
      lastName: normalizeOptionalName(profile.lastName),
      hasAttachedEmail: Boolean(isMinor ? invite.guardianEmail : invite.email),
      isMinor,
      guardianSetupRequired: isMinor && !activeGuardian,
      guardianContactRequired: isMinor && !activeGuardian && !invite.guardianEmail?.trim(),
      guardianDeclaration: isMinor ? GUARDIAN_DECLARATION : null,
      birthdateRequired: isUnknownDateOfBirth(profile.dateOfBirth),
      expiresAt: invite.linkExpiresAt,
      teamId: team?.id ?? null,
    },
    profile: {
      id: profile.id,
      displayName: `${normalizeOptionalName(profile.firstName) ?? ''} ${normalizeOptionalName(profile.lastName) ?? ''}`.trim() || 'Player',
      isManaged: profile.isManagedPlayer,
      dateOfBirth: session && isMinor ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
    },
    team,
  });
}
