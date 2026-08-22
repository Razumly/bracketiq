type EventHistoryRow = Record<string, unknown>;

type ModelDelegate = {
  findMany?: (args: Record<string, unknown>) => Promise<unknown>;
  findFirst?: (args: Record<string, unknown>) => Promise<unknown>;
};

export type EventProtectedHistory = {
  matches: EventHistoryRow[];
  divisionRows: EventHistoryRow[];
  segments: EventHistoryRow[];
  incidents: EventHistoryRow[];
  receipts: EventHistoryRow[];
  checkIns: EventHistoryRow[];
  rosters: EventHistoryRow[];
  broadcastActions: EventHistoryRow[];
  broadcastStates: EventHistoryRow[];
  protectedMatchIds: Set<string>;
};
export const PROTECTED_MATCH_HISTORY_DELETE_CONFIRMATION = 'DELETE_PROTECTED_MATCH_HISTORY';


const getModelDelegate = (client: unknown, model: string): ModelDelegate | null => {
  const candidate = (client as Record<string, unknown> | null)?.[model];
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as ModelDelegate;
};

const callFindMany = async (
  client: unknown,
  model: string,
  args: Record<string, unknown>,
): Promise<EventHistoryRow[]> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findMany !== 'function') return [];
  const rows = await delegate.findMany(args);
  return Array.isArray(rows)
    ? rows.filter((row): row is EventHistoryRow => Boolean(row) && typeof row === 'object')
    : [];
};

const hasNonZeroScores = (value: unknown): boolean => (
  Array.isArray(value)
  && value.some((score) => (
    typeof score === 'number' && Number.isFinite(score) && score !== 0
  ))
);

const PROTECTED_MATCH_STATUSES = new Set([
  'STARTED',
  'IN_PROGRESS',
  'COMPLETE',
  'COMPLETED',
  'FINAL',
  'SUSPENDED',
]);

const hasNonEmptyValue = (value: unknown): boolean => (
  value !== null
  && value !== undefined
  && (typeof value !== 'string' || value.trim().length > 0)
);

const hasProtectedMatchState = (row: EventHistoryRow): boolean => {
  const status = typeof row.status === 'string' ? row.status.trim().toUpperCase() : null;
  return (status !== null && PROTECTED_MATCH_STATUSES.has(status))
    || hasNonEmptyValue(row.actualStart)
    || hasNonEmptyValue(row.actualEnd)
    || hasNonEmptyValue(row.resultStatus)
    || hasNonEmptyValue(row.resultType)
    || hasNonEmptyValue(row.winnerEventTeamId)
    || hasNonZeroScores(row.team1Points)
    || hasNonZeroScores(row.team2Points);
};

const hasProtectedSegmentState = (row: EventHistoryRow): boolean => {
  const status = typeof row.status === 'string' ? row.status.trim().toUpperCase() : null;
  return (status !== null && PROTECTED_MATCH_STATUSES.has(status))
    || hasNonEmptyValue(row.startedAt)
    || hasNonEmptyValue(row.endedAt)
    || hasNonEmptyValue(row.resultType)
    || hasNonEmptyValue(row.winnerEventTeamId)
    || hasNonZeroScores(row.scores);
};


export const loadEventProtectedHistory = async (
  eventId: string,
  client: unknown,
): Promise<EventProtectedHistory> => {
  const [matches, divisionRows] = await Promise.all([
    callFindMany(client, 'matches', {
      where: { eventId },
      select: {
        id: true,
        matchId: true,
        start: true,
        end: true,
        locked: true,
        placementState: true,
        division: true,
        fieldId: true,
        team1Id: true,
        team2Id: true,
        team1Seed: true,
        team2Seed: true,
        status: true,
        resultStatus: true,
        resultType: true,
        actualStart: true,
        actualEnd: true,
        statusReason: true,
        winnerEventTeamId: true,
        winnerNextMatchId: true,
        loserNextMatchId: true,
        previousLeftId: true,
        previousRightId: true,
        side: true,
        team1Points: true,
        team2Points: true,
        updatedAt: true,
      },
    }),
    callFindMany(client, 'divisions', {
      where: { eventId, scope: 'EVENT', status: 'ACTIVE' },
      select: { id: true, phase: true },
    }),
  ]);

  const matchIds = matches
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const matchWhere = { matchId: { in: matchIds } };
  const [
    segments,
    incidents,
    receipts,
    checkIns,
    rosters,
    broadcastActions,
    broadcastStates,
  ] = await Promise.all([
    callFindMany(client, 'matchSegments', {
      where: matchWhere,
      select: {
        id: true,
        matchId: true,
        sequence: true,
        status: true,
        scores: true,
        winnerEventTeamId: true,
        startedAt: true,
        endedAt: true,
        resultType: true,
        statusReason: true,
        updatedAt: true,
      },
    }),
    callFindMany(client, 'matchIncidents', {
      where: matchWhere,
      select: {
        id: true,
        matchId: true,
        incidentType: true,
        sequence: true,
        updatedAt: true,
      },
    }),
    callFindMany(client, 'matchOperationReceipts', {
      where: matchWhere,
      select: {
        clientOperationId: true,
        matchId: true,
        operationKind: true,
        requestHash: true,
        createdAt: true,
      },
    }),
    callFindMany(client, 'teamCheckIns', {
      where: matchWhere,
      select: {
        id: true,
        matchId: true,
        eventTeamId: true,
        scope: true,
        status: true,
        checkedInAt: true,
        updatedAt: true,
      },
    }),
    callFindMany(client, 'matchRosterEntries', {
      where: matchWhere,
      select: {
        id: true,
        matchId: true,
        eventTeamId: true,
        userId: true,
        source: true,
        status: true,
        removedAt: true,
        updatedAt: true,
      },
    }),
    callFindMany(client, 'broadcastOverlayActions', {
      where: { eventId, matchId: { not: null } },
      select: {
        id: true,
        matchId: true,
        actionType: true,
        requestId: true,
        presentationRevision: true,
        createdAt: true,
      },
    }),
    callFindMany(client, 'broadcastOverlayStates', {
      where: { eventId },
      select: {
        id: true,
        activeMatchId: true,
        revision: true,
        updatedAt: true,
      },
    }),
  ]);

  const protectedMatchIds = new Set<string>();
  for (const row of matches) {
    if (hasProtectedMatchState(row) && typeof row.id === 'string') {
      protectedMatchIds.add(row.id);
    }
  }
  for (const row of segments) {
    if (hasProtectedSegmentState(row) && typeof row.matchId === 'string') {
      protectedMatchIds.add(row.matchId);
    }
  }

  return {
    matches,
    divisionRows,
    segments,
    incidents,
    receipts,
    checkIns,
    rosters,
    broadcastActions,
    broadcastStates,
    protectedMatchIds,
  };
};

export const hasProtectedEventHistory = async (
  eventId: string,
  client: unknown,
): Promise<boolean> => {
  const matchesDelegate = getModelDelegate(client, 'matches');
  if (typeof matchesDelegate?.findMany === 'function') {
    const rows = await matchesDelegate.findMany({
      where: { eventId },
      select: { id: true },
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return false;
    }
  } else if (typeof matchesDelegate?.findFirst === 'function') {
    const row = await matchesDelegate.findFirst({
      where: { eventId },
      select: { id: true },
    });
    if (!row) {
      return false;
    }
  } else {
    return false;
  }
  return (await loadEventProtectedHistory(eventId, client)).protectedMatchIds.size > 0;
};
