import type { DivisionCompetitionPhase } from '@/types';

type PhaseEntry = {
  id: string;
  key?: string | null;
  name?: string | null;
  kind?: 'LEAGUE' | 'PLAYOFF' | string | null;
  sortOrder?: number | null;
  sourceDivisionId?: string | null;
  fieldIds?: string[] | null;
  teamIds?: string[] | null;
  price?: number | null;
  maxParticipants?: number | null;
  playoffTeamCount?: number | null;
  playoffPlacementDivisionIds?: string[] | null;
  standingsOverrides?: unknown;
  phaseSettings?: unknown;
  gamesPerOpponent?: number | null;
  restTimeMinutes?: number | null;
  usesSets?: boolean | null;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
  setsPerMatch?: number | null;
  pointsToVictory?: number[] | null;
  playoffDoubleElimination?: boolean | null;
  playoffWinnerSetCount?: number | null;
  playoffLoserSetCount?: number | null;
  playoffWinnerBracketPointsToVictory?: number[] | null;
  playoffLoserBracketPointsToVictory?: number[] | null;
  playoffPrize?: string | null;
  playoffFieldCount?: number | null;
  playoffRestTimeMinutes?: number | null;
  playoffMatchDurationMinutes?: number | null;
  playoffSetDurationMinutes?: number | null;
  standingsConfirmedAt?: string | Date | null;
  standingsConfirmedBy?: string | null;
  allowPaymentPlans?: boolean | null;
  installmentCount?: number | null;
  installmentDueDates?: Array<string | Date> | null;
  installmentDueRelativeDays?: number[] | null;
  installmentAmounts?: number[] | null;
  divisionTypeId?: string | null;
  skillDivisionTypeId?: string | null;
  ageDivisionTypeId?: string | null;
  ratingType?: string | null;
  gender?: string | null;
  ageCutoffDate?: string | Date | null;
  ageCutoffLabel?: string | null;
  ageCutoffSource?: string | null;
  minRating?: number | null;
  maxRating?: number | null;
  sportId?: string | null;
};

type PhasePlan = {
  id: string;
  phase: DivisionCompetitionPhase;
  sortOrder: number;
  template: PhaseEntry;
  sourceEntryIds: string[];
  participantTeamIds: string[];
  fieldIds: string[];
  clone: boolean;
};

type PhaseDivisionRow = {

  id: string;
  role?: unknown;
  phase?: unknown;
  sourceDivisionId?: string | null;
  teamIds?: unknown;
};
export type PhaseDivisionCandidate = {
  id: string;
  role?: unknown;
  phase?: unknown;
};

export const collectScheduledDivisions = <T extends PhaseDivisionCandidate>(
  scheduled: {
    divisions?: readonly T[] | null;
    playoffDivisions?: readonly T[] | null;
  },
): T[] => Array.from(
  new Map(
    [
      ...(scheduled.divisions ?? []),
      ...(scheduled.playoffDivisions ?? []),
    ]
      .filter((division) => String(division.id ?? "").trim().length > 0)
      .map((division) => [division.id, division] as const),
  ).values(),
);

export const collectPhaseDivisions = <T extends PhaseDivisionCandidate>(
  scheduled: {
    divisions?: readonly T[] | null;
    playoffDivisions?: readonly T[] | null;
  },
): T[] => collectScheduledDivisions(scheduled).filter((division) => (
  String(division.role ?? '').trim().toUpperCase() === 'PHASE'
  && String(division.phase ?? '').trim().length > 0
));

type PhaseSourceRow = {
  entryDivisionId?: string | null;
  phaseDivisionId?: string | null;
};

type PhaseParticipantRow = {
  phaseDivisionId?: string | null;
  eventTeamId?: string | null;
};

export type PhasePersistenceClient = {
  divisions?: {
    findMany?: (args: unknown) => Promise<PhaseDivisionRow[]>;
    update?: (args: unknown) => Promise<unknown>;
    deleteMany?: (args: unknown) => Promise<unknown>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
  eventDivisionPhaseSources?: {
    findMany?: (args: unknown) => Promise<PhaseSourceRow[]>;
    deleteMany?: (args: unknown) => Promise<unknown>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
  eventDivisionPhaseParticipants?: {
    findMany?: (args: unknown) => Promise<PhaseParticipantRow[]>;
    deleteMany?: (args: unknown) => Promise<unknown>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
};

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean)))
    : []
);

const asPositionalStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim())
    : []
);

export const persistPhaseParticipantAssignments = async (params: {
  client: PhasePersistenceClient;
  eventId: string;
  teamIdsByPhaseDivision: Record<string, string[]>;
}): Promise<void> => {
  const participants = params.client.eventDivisionPhaseParticipants;
  if (!participants?.deleteMany || !participants?.upsert) {
    return;
  }

  const assignments = Object.entries(params.teamIdsByPhaseDivision)
    .map(([phaseDivisionId, teamIds]) => [
      String(phaseDivisionId ?? '').trim(),
      asStringArray(teamIds),
    ] as const)
    .filter(([phaseDivisionId]) => phaseDivisionId.length > 0);
  if (!assignments.length) {
    return;
  }

  const phaseDivisionIds = assignments.map(([phaseDivisionId]) => phaseDivisionId);
  const sourceRows = params.client.eventDivisionPhaseSources?.findMany
    ? await params.client.eventDivisionPhaseSources.findMany({
      where: {
        eventId: params.eventId,
        phaseDivisionId: { in: phaseDivisionIds },
      },
      select: { phaseDivisionId: true, entryDivisionId: true },
    })
    : [];
  const sourceEntryDivisionIdByPhase = new Map<string, string>();
  for (const row of sourceRows) {
    const phaseDivisionId = String(row.phaseDivisionId ?? '').trim();
    const entryDivisionId = String(row.entryDivisionId ?? '').trim();
    if (phaseDivisionId && entryDivisionId && !sourceEntryDivisionIdByPhase.has(phaseDivisionId)) {
      sourceEntryDivisionIdByPhase.set(phaseDivisionId, entryDivisionId);
    }
  }

  await participants.deleteMany({
    where: {
      eventId: params.eventId,
      phaseDivisionId: { in: phaseDivisionIds },
    },
  });

  for (const [phaseDivisionId, teamIds] of assignments) {
    for (const eventTeamId of teamIds) {
      const participantId = `phase-participant-${params.eventId}-${phaseDivisionId}-${eventTeamId}`;
      await participants.upsert({
        where: { id: participantId },
        create: {
          id: participantId,
          eventId: params.eventId,
          phaseDivisionId,
          eventTeamId,
          sourceEntryDivisionId: sourceEntryDivisionIdByPhase.get(phaseDivisionId) ?? null,
        },
        update: {
          eventId: params.eventId,
          phaseDivisionId,
          eventTeamId,
          sourceEntryDivisionId: sourceEntryDivisionIdByPhase.get(phaseDivisionId) ?? null,
        },
      });
    }
  }
};

const asNumberArray = (value: unknown): number[] => (
  Array.isArray(value)
    ? value
      .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry))
      .map((entry) => Math.trunc(entry))
    : []
);

const asDate = (value: string | Date | null | undefined): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const phaseLabel = (phase: DivisionCompetitionPhase): string => ({
  LEAGUE: 'League',
  POOL: 'Pool',
  BRACKET: 'Bracket',
  PLAYOFF: 'Playoff',
}[phase]);

const phaseIdFor = (entryId: string, phase: DivisionCompetitionPhase): string => (
  `${entryId}__phase__${phase.toLowerCase()}`
);

const phaseKeyFor = (entry: PhaseEntry, phase: DivisionCompetitionPhase): string => (
  `${entry.key ?? entry.id}__phase__${phase.toLowerCase()}`
);

const generatedPlayoffStandingsOverridesFor = (
  entry: PhaseEntry,
  preserveFallback: boolean,
): Record<string, unknown> | null => {
  const hasPlayoffFields = [
    entry.playoffDoubleElimination,
    entry.playoffWinnerSetCount,
    entry.playoffLoserSetCount,
    entry.playoffPrize,
    entry.playoffFieldCount,
    entry.playoffRestTimeMinutes,
    entry.playoffMatchDurationMinutes,
    entry.playoffSetDurationMinutes,
  ].some((value) => value !== null && value !== undefined)
    || asNumberArray(entry.playoffWinnerBracketPointsToVictory).length > 0
    || asNumberArray(entry.playoffLoserBracketPointsToVictory).length > 0;
  if (!hasPlayoffFields) {
    if (!preserveFallback) return null;
    return entry.standingsOverrides
      && typeof entry.standingsOverrides === 'object'
      && !Array.isArray(entry.standingsOverrides)
      ? entry.standingsOverrides as Record<string, unknown>
      : null;
  }
  return {
    doubleElimination: entry.playoffDoubleElimination ?? false,
    winnerSetCount: entry.playoffWinnerSetCount ?? 1,
    loserSetCount: entry.playoffLoserSetCount ?? 1,
    winnerBracketPointsToVictory: asNumberArray(entry.playoffWinnerBracketPointsToVictory),
    loserBracketPointsToVictory: asNumberArray(entry.playoffLoserBracketPointsToVictory),
    prize: entry.playoffPrize ?? '',
    fieldCount: entry.playoffFieldCount ?? 1,
    restTimeMinutes: entry.playoffRestTimeMinutes ?? 0,
    matchDurationMinutes: entry.playoffMatchDurationMinutes ?? null,
    setDurationMinutes: entry.playoffSetDurationMinutes ?? null,
  };
};

const phaseStandingsOverridesFor = (
  entry: PhaseEntry,
  isBracket: boolean,
  preserveFallback: boolean,
): Record<string, unknown> | null => (
  isBracket ? generatedPlayoffStandingsOverridesFor(entry, preserveFallback) : (
    entry.standingsOverrides
      && typeof entry.standingsOverrides === 'object'
      && !Array.isArray(entry.standingsOverrides)
      ? entry.standingsOverrides as Record<string, unknown>
      : null
  )
);

const writeDataFor = (
  plan: PhasePlan,
  eventId: string,
  organizationId: string | null | undefined,
): Record<string, unknown> => {
  const entry = plan.template;
  const isBracket = plan.phase === 'BRACKET' || plan.phase === 'PLAYOFF';
  const maxParticipants = isBracket
    ? (entry.playoffTeamCount ?? entry.maxParticipants ?? null)
    : (entry.maxParticipants ?? null);
  const playoffTeamCount = isBracket
    ? (entry.playoffTeamCount ?? entry.maxParticipants ?? null)
    : (entry.playoffTeamCount ?? null);
  return {
    id: plan.id,
    key: phaseKeyFor(entry, plan.phase),
    name: `${entry.name ?? entry.id} — ${phaseLabel(plan.phase)}`,
    kind: isBracket ? 'PLAYOFF' : 'LEAGUE',
    sortOrder: plan.sortOrder,
    eventId,
    scope: 'EVENT',
    role: 'PHASE',
    phase: plan.phase,
    status: 'ACTIVE',
    sourceDivisionId: plan.sourceEntryIds[0] ?? entry.id,
    organizationId: organizationId ?? null,
    sportId: entry.sportId ?? null,
    price: isBracket ? null : (entry.price ?? null),
    maxParticipants,
    playoffTeamCount,
    playoffPlacementDivisionIds: asPositionalStringArray(entry.playoffPlacementDivisionIds),
    standingsOverrides: phaseStandingsOverridesFor(entry, isBracket, !plan.clone),
    phaseSettings: entry.phaseSettings ?? {},
    gamesPerOpponent: entry.gamesPerOpponent ?? null,
    restTimeMinutes: entry.restTimeMinutes ?? null,
    usesSets: entry.usesSets ?? null,
    matchDurationMinutes: entry.matchDurationMinutes ?? null,
    setDurationMinutes: entry.setDurationMinutes ?? null,
    setsPerMatch: entry.setsPerMatch ?? null,
    pointsToVictory: asNumberArray(entry.pointsToVictory),
    playoffDoubleElimination: entry.playoffDoubleElimination ?? null,
    playoffWinnerSetCount: entry.playoffWinnerSetCount ?? null,
    playoffLoserSetCount: entry.playoffLoserSetCount ?? null,
    playoffWinnerBracketPointsToVictory: asNumberArray(entry.playoffWinnerBracketPointsToVictory),
    playoffLoserBracketPointsToVictory: asNumberArray(entry.playoffLoserBracketPointsToVictory),
    playoffPrize: entry.playoffPrize ?? null,
    playoffFieldCount: entry.playoffFieldCount ?? null,
    playoffRestTimeMinutes: entry.playoffRestTimeMinutes ?? null,
    playoffMatchDurationMinutes: entry.playoffMatchDurationMinutes ?? null,
    playoffSetDurationMinutes: entry.playoffSetDurationMinutes ?? null,
    standingsConfirmedAt: asDate(entry.standingsConfirmedAt),
    standingsConfirmedBy: entry.standingsConfirmedBy ?? null,
    allowPaymentPlans: isBracket ? false : (entry.allowPaymentPlans ?? null),
    installmentCount: isBracket ? null : (entry.installmentCount ?? null),
    installmentDueDates: isBracket
      ? []
      : (entry.installmentDueDates ?? []).map((value) => asDate(value)).filter((value): value is Date => Boolean(value)),
    installmentDueRelativeDays: isBracket ? [] : asNumberArray(entry.installmentDueRelativeDays),
    installmentAmounts: isBracket ? [] : asNumberArray(entry.installmentAmounts),
    divisionTypeId: entry.divisionTypeId ?? null,
    skillDivisionTypeId: entry.skillDivisionTypeId ?? null,
    ageDivisionTypeId: entry.ageDivisionTypeId ?? null,
    ratingType: entry.ratingType ?? null,
    gender: entry.gender ?? null,
    ageCutoffDate: asDate(entry.ageCutoffDate),
    ageCutoffLabel: entry.ageCutoffLabel ?? null,
    ageCutoffSource: entry.ageCutoffSource ?? null,
    minRating: entry.minRating ?? null,
    maxRating: entry.maxRating ?? null,
    fieldIds: asStringArray(plan.fieldIds),
    teamIds: isBracket ? [] : asStringArray(plan.participantTeamIds),
  };
};

const planClone = (
  entry: PhaseEntry,
  phase: DivisionCompetitionPhase,
  sortOrder: number,
): PhasePlan => ({
  id: phaseIdFor(entry.id, phase),
  phase,
  sortOrder,
  template: entry,
  sourceEntryIds: [entry.id],
  participantTeamIds: asStringArray(entry.teamIds),
  fieldIds: asStringArray(entry.fieldIds),
  clone: true,
});

export const syncEventDivisionPhases = async (params: {
  client: PhasePersistenceClient;
  eventId: string;
  eventType?: string | null;
  includePlayoffs?: boolean;
  tournamentPoolPlayEnabled?: boolean;
  organizationId?: string | null;
  entries: PhaseEntry[];
}): Promise<void> => {
  const client = params.client;
  const sources = client.eventDivisionPhaseSources;
  const participants = client.eventDivisionPhaseParticipants;
  const eventType = String(params.eventType ?? '').toUpperCase();
  if (!['LEAGUE', 'TOURNAMENT'].includes(eventType)) {
    if (client.divisions?.deleteMany) {
      await client.divisions.deleteMany({
        where: { eventId: params.eventId, role: 'PHASE' },
      });
    }
    if (sources?.deleteMany) {
      await sources.deleteMany({ where: { eventId: params.eventId } });
    }
    if (participants?.deleteMany) {
      await participants.deleteMany({ where: { eventId: params.eventId } });
    }
    return;
  }
  if (!sources?.upsert || !participants?.upsert || !client.divisions?.upsert) {
    return;
  }

  const entries = params.entries.filter((entry) => entry.kind !== 'PLAYOFF');
  const playoffEntries = params.entries.filter((entry) => entry.kind === 'PLAYOFF');
  const sourceFieldIds = Array.from(
    new Set(entries.flatMap((entry) => asStringArray(entry.fieldIds))),
  );
  const phaseFieldIdsFor = (entry: PhaseEntry): string[] => Array.from(
    new Set([...asStringArray(entry.fieldIds), ...sourceFieldIds]),
  );
  const plans: PhasePlan[] = [];
  const addClone = (entry: PhaseEntry, phase: DivisionCompetitionPhase, sortOrder: number) => {
    if (!plans.some((plan) => plan.id === phaseIdFor(entry.id, phase))) {
      plans.push(planClone(entry, phase, sortOrder));
    }
  };

  if (eventType === 'LEAGUE') {
    entries.forEach((entry, index) => addClone(entry, 'LEAGUE', index));
    if (params.includePlayoffs) {
      if (playoffEntries.length) {
        const allParticipantIds = entries.flatMap((entry) => asStringArray(entry.teamIds));
        playoffEntries.forEach((entry, index) => plans.push({
          id: entry.id,
          phase: 'PLAYOFF',
          sortOrder: entries.length + index,
          template: entry,
          sourceEntryIds: entry.sourceDivisionId ? [entry.sourceDivisionId] : entries.map((source) => source.id),
          participantTeamIds: allParticipantIds,
          fieldIds: phaseFieldIdsFor(entry),
          clone: false,
        }));
      } else {
        entries.forEach((entry, index) => addClone(entry, 'PLAYOFF', entries.length + index));
      }
    }
  } else if (params.tournamentPoolPlayEnabled) {
    entries.forEach((entry, index) => addClone(entry, 'POOL', index));
    if (playoffEntries.length) {
      const allParticipantIds = entries.flatMap((entry) => asStringArray(entry.teamIds));
      playoffEntries.forEach((entry, index) => plans.push({
        id: entry.id,
        phase: 'BRACKET',
        sortOrder: entries.length + index,
        template: entry,
        sourceEntryIds: entries.map((source) => source.id),
        fieldIds: phaseFieldIdsFor(entry),
        participantTeamIds: allParticipantIds,
        clone: false,
      }));
    } else {
      entries.forEach((entry, index) => addClone(entry, 'BRACKET', entries.length + index));
    }
  } else {
    entries.forEach((entry, index) => addClone(entry, 'BRACKET', index));
    const allParticipantIds = entries.flatMap((entry) => asStringArray(entry.teamIds));
    playoffEntries.forEach((entry, index) => plans.push({
      id: entry.id,
      phase: 'BRACKET',
      sortOrder: entries.length + index,
      template: entry,
      sourceEntryIds: entries.map((source) => source.id),
      participantTeamIds: allParticipantIds,
      fieldIds: phaseFieldIdsFor(entry),
      clone: false,
    }));
  }
  const planIds = new Set(plans.map((plan) => plan.id));
  const existingPhaseRows = client.divisions.findMany
    ? await client.divisions.findMany({
      where: { eventId: params.eventId, role: 'PHASE' },
      select: { id: true, phase: true, teamIds: true },
    })
    : [];
  const existingPhaseRowsById = new Map(existingPhaseRows.map((row) => [row.id, row]));
  const existingPhaseParticipantRows = participants.findMany
    ? await participants.findMany({
      where: { eventId: params.eventId },
      select: { phaseDivisionId: true, eventTeamId: true },
    })
    : [];
  const existingParticipantIdsByPhase = new Map<string, string[]>();
  for (const row of existingPhaseParticipantRows) {
    const phaseId = String(row.phaseDivisionId ?? '').trim();
    const eventTeamId = String(row.eventTeamId ?? '').trim();
    if (!phaseId || !eventTeamId) continue;
    const teamIds = existingParticipantIdsByPhase.get(phaseId) ?? [];
    if (!teamIds.includes(eventTeamId)) teamIds.push(eventTeamId);
    existingParticipantIdsByPhase.set(phaseId, teamIds);
  }
  const staleIds = existingPhaseRows.map((row) => row.id).filter((id) => !planIds.has(id));
  if (staleIds.length && client.divisions.deleteMany) {
    await client.divisions.deleteMany({ where: { id: { in: staleIds } } });
  }
  if (sources.deleteMany) await sources.deleteMany({ where: { eventId: params.eventId } });
  if (participants.deleteMany) await participants.deleteMany({ where: { eventId: params.eventId } });

  for (const plan of plans) {
    const participantTeamIds =
      existingParticipantIdsByPhase.has(plan.id)
        ? existingParticipantIdsByPhase.get(plan.id) ?? []
        : existingPhaseRowsById.has(plan.id)
          ? asStringArray(existingPhaseRowsById.get(plan.id)?.teamIds)
          : plan.participantTeamIds;
    const data = {
      ...writeDataFor(plan, params.eventId, params.organizationId),
      ...(plan.phase === 'POOL' ? { teamIds: participantTeamIds } : {}),
    };
    const update: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    delete update.id;
    await client.divisions.upsert({
      where: { id: plan.id },
      create: data,
      update,
    });

    for (const [sourceIndex, sourceEntryId] of plan.sourceEntryIds.entries()) {
      const sourceId = `phase-source-${params.eventId}-${plan.id}-${sourceEntryId}`;
      await sources.upsert({
        where: { id: sourceId },
        create: {
          id: sourceId,
          eventId: params.eventId,
          entryDivisionId: sourceEntryId,
          phaseDivisionId: plan.id,
          phase: plan.phase,
          sortOrder: plan.sortOrder + sourceIndex,
        },
        update: {
          eventId: params.eventId,
          entryDivisionId: sourceEntryId,
          phaseDivisionId: plan.id,
          phase: plan.phase,
          sortOrder: plan.sortOrder + sourceIndex,
        },
      });
    }

    for (const eventTeamId of Array.from(new Set(participantTeamIds))) {
      const participantId = `phase-participant-${params.eventId}-${plan.id}-${eventTeamId}`;
      await participants.upsert({
        where: { id: participantId },
        create: {
          id: participantId,
          eventId: params.eventId,
          phaseDivisionId: plan.id,
          eventTeamId,
          sourceEntryDivisionId: plan.sourceEntryIds[0] ?? null,
        },
        update: {
          eventId: params.eventId,
          phaseDivisionId: plan.id,
          eventTeamId,
          sourceEntryDivisionId: plan.sourceEntryIds[0] ?? null,
        },
      });
    }
  }
};
