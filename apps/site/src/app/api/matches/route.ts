import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput } from '@/server/requestParsing';
import { serializeMatchRecord } from '@/server/matches/instantPayloads';
import { getVisibleEventIds } from '@/server/eventVisibility';

export const dynamic = 'force-dynamic';

const normalizeIds = (value: string | null): string[] =>
  Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const eventIds = normalizeIds(params.get('eventIds'));
  if (eventIds.length === 0) {
    return NextResponse.json(
      { error: 'eventIds query parameter is required' },
      { status: 400 },
    );
  }

  const fieldIds = normalizeIds(params.get('fieldIds'));
  const start = parseDateInput(params.get('start'));
  const end = parseDateInput(params.get('end'));

  const rangeWhere = (() => {
    if (start && end) {
      return {
        AND: [
          { start: { lte: end } },
          {
            OR: [
              { end: null },
              { end: { gte: start } },
            ],
          },
        ],
      };
    }
    if (start) {
      return {
        OR: [
          { end: null },
          { end: { gte: start } },
        ],
      };
    }
    if (end) {
      return { start: { lte: end } };
    }
    return {};
  })();

  const eventAccessRows = await prisma.events.findMany({
    where: {
      id: { in: eventIds },
      archivedAt: null,
    },
    select: {
      id: true,
      state: true,
      archivedAt: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  const visibleEventIds = await getVisibleEventIds(req, eventAccessRows);
  if (!visibleEventIds.size) {
    return NextResponse.json({ matches: [] }, { status: 200 });
  }

  const matches = await prisma.matches.findMany({
    where: {
      eventId: { in: Array.from(visibleEventIds) },
      ...(fieldIds.length > 0 ? { fieldId: { in: fieldIds } } : {}),
      ...rangeWhere,
    },
    orderBy: { start: 'asc' },
  });

  const divisionIds = Array.from(
    new Set(
      matches
        .map((match) => match.division)
        .filter((divisionId): divisionId is string => typeof divisionId === 'string' && divisionId.length > 0),
    ),
  );
  const divisionRows = divisionIds.length > 0
    ? await prisma.divisions.findMany({
      where: { id: { in: divisionIds } },
      select: {
        id: true,
        role: true,
        phase: true,
        sourceDivisionId: true,
      },
    })
    : [];
  const divisionsById = new Map(divisionRows.map((division) => [division.id, division]));

  return NextResponse.json({
    matches: matches.map((match) => {
      const division = typeof match.division === 'string'
        ? divisionsById.get(match.division)
        : undefined;
      const isPhaseMatch = division?.role === 'PHASE';
      return serializeMatchRecord({
        ...match,
        phase: isPhaseMatch ? division.phase : null,
        sourceDivisionId: isPhaseMatch ? division.sourceDivisionId : null,
        phaseDivisionId: isPhaseMatch ? division.id : null,
        division: isPhaseMatch
          ? (division.sourceDivisionId ?? division.id)
          : match.division,
      });
    }),
  }, { status: 200 });
}
