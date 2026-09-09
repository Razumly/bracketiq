import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type ProtectedHistoryClient = PrismaClient | Prisma.TransactionClient;
type FindManyFunction<TArgs, TRow> = (args: TArgs) => Promise<TRow[]>;

const callFindMany = async <TArgs, TRow>(
  client: ProtectedHistoryClient,
  model: string,
  args: TArgs,
): Promise<TRow[]> => {
  const delegate = (client as unknown as Record<string, unknown>)[model];
  if (!delegate || typeof delegate !== "object") {
    return [];
  }
  const findMany = (
    delegate as {
      findMany?: FindManyFunction<TArgs, TRow>;
    }
  ).findMany;
  if (typeof findMany !== "function") {
    return [];
  }
  const rows = await findMany.call(delegate, args);
  return Array.isArray(rows) ? rows : [];
};

const matchHistorySelect = {
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
  teamOfficialId: true,
  officialId: true,
  officialIds: true,
  officialCheckedIn: true,
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
} as const;
type MatchHistoryRow = Prisma.MatchesGetPayload<{
  select: typeof matchHistorySelect;
}>;

const divisionHistorySelect = {
  id: true,
  phase: true,
} as const;
type DivisionHistoryRow = Prisma.DivisionsGetPayload<{
  select: typeof divisionHistorySelect;
}>;

const segmentHistorySelect = {
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
} as const;
type SegmentHistoryRow = Prisma.MatchSegmentsGetPayload<{
  select: typeof segmentHistorySelect;
}>;

const incidentHistorySelect = {
  id: true,
  matchId: true,
  incidentType: true,
  sequence: true,
  updatedAt: true,
} as const;
type IncidentHistoryRow = Prisma.MatchIncidentsGetPayload<{
  select: typeof incidentHistorySelect;
}>;

const receiptHistorySelect = {
  clientOperationId: true,
  matchId: true,
  operationKind: true,
  requestHash: true,
  createdAt: true,
} as const;
type ReceiptHistoryRow = Prisma.MatchOperationReceiptsGetPayload<{
  select: typeof receiptHistorySelect;
}>;

const checkInHistorySelect = {
  id: true,
  matchId: true,
  eventTeamId: true,
  scope: true,
  status: true,
  checkedInAt: true,
  updatedAt: true,
} as const;
type CheckInHistoryRow = Prisma.TeamCheckInsGetPayload<{
  select: typeof checkInHistorySelect;
}>;

const rosterHistorySelect = {
  id: true,
  matchId: true,
  eventTeamId: true,
  userId: true,
  source: true,
  status: true,
  removedAt: true,
  updatedAt: true,
} as const;
type RosterHistoryRow = Prisma.MatchRosterEntriesGetPayload<{
  select: typeof rosterHistorySelect;
}>;

const broadcastActionHistorySelect = {
  id: true,
  matchId: true,
  actionType: true,
  requestId: true,
  presentationRevision: true,
  createdAt: true,
} as const;
type BroadcastActionHistoryRow = Prisma.BroadcastOverlayActionsGetPayload<{
  select: typeof broadcastActionHistorySelect;
}>;

const broadcastStateHistorySelect = {
  id: true,
  activeMatchId: true,
  revision: true,
  updatedAt: true,
} as const;
type BroadcastStateHistoryRow = Prisma.BroadcastOverlayStatesGetPayload<{
  select: typeof broadcastStateHistorySelect;
}>;

export type EventProtectedHistory = {
  matches: MatchHistoryRow[];
  divisionRows: DivisionHistoryRow[];
  segments: SegmentHistoryRow[];
  incidents: IncidentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  checkIns: CheckInHistoryRow[];
  rosters: RosterHistoryRow[];
  broadcastActions: BroadcastActionHistoryRow[];
  broadcastStates: BroadcastStateHistoryRow[];
  protectedMatchIds: Set<string>;
};
export const PROTECTED_MATCH_HISTORY_DELETE_CONFIRMATION =
  "DELETE_PROTECTED_MATCH_HISTORY";

const hasNonZeroScores = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.some(
    (score) =>
      typeof score === "number" && Number.isFinite(score) && score !== 0,
  );

const PROTECTED_MATCH_STATUSES = new Set([
  "STARTED",
  "IN_PROGRESS",
  "COMPLETE",
  "COMPLETED",
  "FINAL",
  "SUSPENDED",
]);

const hasNonEmptyValue = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  (typeof value !== "string" || value.trim().length > 0);

const hasProtectedMatchState = (row: MatchHistoryRow): boolean => {
  const status = row.status?.trim().toUpperCase() ?? null;
  return (
    row.locked === true ||
    (status !== null && PROTECTED_MATCH_STATUSES.has(status)) ||
    hasNonEmptyValue(row.actualStart) ||
    hasNonEmptyValue(row.actualEnd) ||
    hasNonEmptyValue(row.resultStatus) ||
    hasNonEmptyValue(row.resultType) ||
    hasNonEmptyValue(row.winnerEventTeamId) ||
    hasNonZeroScores(row.team1Points) ||
    hasNonZeroScores(row.team2Points)
  );
};

const hasProtectedSegmentState = (row: SegmentHistoryRow): boolean => {
  const status = row.status?.trim().toUpperCase() ?? null;
  return (
    (status !== null && PROTECTED_MATCH_STATUSES.has(status)) ||
    hasNonEmptyValue(row.startedAt) ||
    hasNonEmptyValue(row.endedAt) ||
    hasNonEmptyValue(row.resultType) ||
    hasNonEmptyValue(row.winnerEventTeamId) ||
    hasNonZeroScores(row.scores)
  );
};

export const loadEventProtectedHistory = async (
  eventId: string,
  client: ProtectedHistoryClient,
): Promise<EventProtectedHistory> => {
  const [matches, divisionRows] = await Promise.all([
    callFindMany<Prisma.MatchesFindManyArgs, MatchHistoryRow>(
      client,
      "matches",
      {
        where: { eventId },
        select: matchHistorySelect,
      },
    ),
    callFindMany<Prisma.DivisionsFindManyArgs, DivisionHistoryRow>(
      client,
      "divisions",
      {
        where: { eventId, scope: "EVENT", status: "ACTIVE" },
        select: divisionHistorySelect,
      },
    ),
  ]);

  const matchIds = matches.map((row) => row.id);
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
    callFindMany<Prisma.MatchSegmentsFindManyArgs, SegmentHistoryRow>(
      client,
      "matchSegments",
      {
        where: matchWhere,
        select: segmentHistorySelect,
      },
    ),
    callFindMany<Prisma.MatchIncidentsFindManyArgs, IncidentHistoryRow>(
      client,
      "matchIncidents",
      {
        where: matchWhere,
        select: incidentHistorySelect,
      },
    ),
    callFindMany<Prisma.MatchOperationReceiptsFindManyArgs, ReceiptHistoryRow>(
      client,
      "matchOperationReceipts",
      {
        where: matchWhere,
        select: receiptHistorySelect,
      },
    ),
    callFindMany<Prisma.TeamCheckInsFindManyArgs, CheckInHistoryRow>(
      client,
      "teamCheckIns",
      {
        // Event-scoped check-ins also control Team Duty eligibility.
        where: { eventId },
        select: checkInHistorySelect,
      },
    ),
    callFindMany<Prisma.MatchRosterEntriesFindManyArgs, RosterHistoryRow>(
      client,
      "matchRosterEntries",
      {
        where: matchWhere,
        select: rosterHistorySelect,
      },
    ),
    callFindMany<
      Prisma.BroadcastOverlayActionsFindManyArgs,
      BroadcastActionHistoryRow
    >(client, "broadcastOverlayActions", {
      where: { eventId, matchId: { not: null } },
      select: broadcastActionHistorySelect,
    }),
    callFindMany<
      Prisma.BroadcastOverlayStatesFindManyArgs,
      BroadcastStateHistoryRow
    >(client, "broadcastOverlayStates", {
      where: { eventId },
      select: broadcastStateHistorySelect,
    }),
  ]);

  const protectedMatchIds = new Set<string>();
  for (const row of matches) {
    if (hasProtectedMatchState(row)) {
      protectedMatchIds.add(row.id);
    }
  }
  for (const row of segments) {
    if (hasProtectedSegmentState(row)) {
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
  client: ProtectedHistoryClient,
): Promise<boolean> => {
  const rows = await callFindMany<
    Prisma.MatchesFindManyArgs,
    Pick<MatchHistoryRow, "id">
  >(client, "matches", {
    where: { eventId },
    select: { id: true },
  });
  if (rows.length === 0) {
    return false;
  }
  return (
    (await loadEventProtectedHistory(eventId, client)).protectedMatchIds.size >
    0
  );
};
