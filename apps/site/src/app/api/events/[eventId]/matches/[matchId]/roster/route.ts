import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { readOperationalMatchRosters } from '@/server/matches/operationalRosters';
import {
  addTemporaryMatchRosterPlayer,
  getMatchRoster,
  isTeamManagerOrCoach,
  removeMatchRosterPlayer,
  restoreMatchRosterPlayer,
} from '@/server/matches/teamCheckIns';

export const dynamic = 'force-dynamic';

const rosterOperationSchema = z.object({
  eventTeamId: z.string().trim().min(1),
  removePlayer: z.object({
    userId: z.string().trim().min(1),
  }).optional(),
  restorePlayer: z.object({
    userId: z.string().trim().min(1),
  }).optional(),
  addPlayer: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    entryId: z.string().optional(),
  }).optional(),
}).strict();

const toErrorResponse = (error: unknown) => {
  if (error instanceof Response) {
    return error;
  }
  console.error('Match roster route failed', error);
  return NextResponse.json({ error: 'Failed to update match roster.' }, { status: 500 });
};

const isAssignedOfficial = async (
  userId: string,
  eventId: string,
  match: { officialId: string | null; officialIds: unknown; teamOfficialId: string | null },
) => {
  const assignments = Array.isArray(match.officialIds) ? match.officialIds : [];
  const assigned = assignments.filter((entry) => entry && typeof entry === 'object' && entry.userId === userId);
  if (assigned.some((entry) => entry.holderType === 'PLAYER')) return true;
  if (match.officialId === userId || assigned.length) {
    const official = await prisma.eventOfficials.findFirst({
      where: { eventId, userId, isActive: { not: false },
        ...(match.officialId === userId ? {} : { id: { in: assigned.map((entry) => entry.eventOfficialId).filter((id): id is string => typeof id === 'string') } }) },
      select: { id: true },
    });
    if (official) return true;
  }
  if (!match.teamOfficialId) return false;
  if (await isTeamManagerOrCoach(prisma, match.teamOfficialId, userId)) return true;
  return Boolean(await prisma.eventRegistrations.findFirst({
    where: { eventId, eventTeamId: match.teamOfficialId, registrantId: userId,
      registrantType: { in: ['SELF', 'CHILD'] }, rosterRole: 'PARTICIPANT', status: 'ACTIVE', acceptedAt: { not: null } },
    select: { id: true },
  }));
};

const loadRosterContext = async (eventId: string, matchId: string) => {
  const [event, match] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
        teamSignup: true,
        start: true,
        requiredTemplateIds: true,
        allowMatchRosterEdits: true,
        allowTemporaryMatchPlayers: true,
      },
    }),
    prisma.matches.findFirst({
      where: { id: matchId, eventId },
      select: {
        id: true,
        eventId: true,
        team1Id: true,
        team2Id: true,
        officialId: true,
        officialIds: true,
        teamOfficialId: true,
        start: true,
        status: true,
        resultType: true,
        actualEnd: true,
      },
    }),
  ]);
  if (!event || !match) {
    throw new Response('Match not found.', { status: 404 });
  }
  const teamIds = [match.team1Id, match.team2Id].filter((teamId): teamId is string => Boolean(teamId));
  return { event, match, teamIds };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, matchId } = await params;
  try {
    const { event, match, teamIds } = await loadRosterContext(eventId, matchId);
    const isHost = await canManageEvent(session, event);
    const managed = await Promise.all(teamIds.map(async (id) => ({ id, allowed: await isTeamManagerOrCoach(prisma, id, session.userId) })));
    const managedIds = new Set(managed.filter((team) => team.allowed).map((team) => team.id));
    const isOfficial = !isHost && await isAssignedOfficial(session.userId, eventId, match);
    const visibleIds = isHost || isOfficial ? teamIds : teamIds.filter((id) => managedIds.has(id));
    if (!visibleIds.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const rosters = (await readOperationalMatchRosters(prisma, event, matchId, visibleIds)).map((roster) => ({
      ...roster, canEdit: isHost || managedIds.has(roster.eventTeamId),
    }));
    return NextResponse.json({
      rosters,
      allowMatchRosterEdits: event.allowMatchRosterEdits === true,
      allowTemporaryMatchPlayers: event.allowTemporaryMatchPlayers === true,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, matchId } = await params;
  const parsed = rosterOperationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [event, match] = await Promise.all([
        tx.events.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            hostId: true,
            assistantHostIds: true,
            organizationId: true,
            teamSignup: true,
            allowMatchRosterEdits: true,
            allowTemporaryMatchPlayers: true,
          },
        }),
        tx.matches.findFirst({
          where: { id: matchId, eventId },
          select: {
            id: true,
            eventId: true,
            team1Id: true,
            team2Id: true,
            start: true,
            status: true,
            resultType: true,
            actualEnd: true,
          },
        }),
      ]);
      if (!event || !match) {
        throw new Response('Match not found.', { status: 404 });
      }
      if (![match.team1Id, match.team2Id].includes(parsed.data.eventTeamId)) {
        throw new Response('Team is not assigned to this match.', { status: 400 });
      }
      const isManagerOrCoach = await isTeamManagerOrCoach(tx, parsed.data.eventTeamId, session.userId);
      const isHostOrAdmin = await canManageEvent(session, event, tx);
      if (!isManagerOrCoach && !isHostOrAdmin) {
        throw new Response('Forbidden', { status: 403 });
      }
      if (parsed.data.removePlayer) {
        await removeMatchRosterPlayer(tx, {
          eventId,
          matchId,
          eventTeamId: parsed.data.eventTeamId,
          userId: parsed.data.removePlayer.userId,
          actorUserId: session.userId,
          match,
          event,
        });
      } else if (parsed.data.restorePlayer) {
        await restoreMatchRosterPlayer(tx, {
          eventId,
          matchId,
          eventTeamId: parsed.data.eventTeamId,
          userId: parsed.data.restorePlayer.userId,
          match,
          event,
        });
      } else if (parsed.data.addPlayer) {
        await addTemporaryMatchRosterPlayer(tx, {
          eventId,
          matchId,
          eventTeamId: parsed.data.eventTeamId,
          firstName: parsed.data.addPlayer.firstName,
          lastName: parsed.data.addPlayer.lastName,
          email: parsed.data.addPlayer.email,
          existingEntryId: parsed.data.addPlayer.entryId,
          actorUserId: session.userId,
          match,
          event,
        });
      } else {
        throw new Response('No roster operation provided.', { status: 400 });
      }
      return getMatchRoster(tx, { eventId, matchId, eventTeamId: parsed.data.eventTeamId });
    });
    return NextResponse.json({ roster: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
