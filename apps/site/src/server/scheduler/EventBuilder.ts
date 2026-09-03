import crypto from "crypto";
import { MIN_BRACKET_TEAM_COUNT } from "@/lib/divisionTypes";
import { Brackets } from "./Brackets";
import { OfficialStaffingPlanner } from "./officialStaffing";
import { ScheduleError, type ScheduleFailureFactor } from "./scheduleErrors";
import {
  diagnoseScheduleProposal,
  type ScheduleDiagnosticEvidence,
} from "./scheduleDiagnostics";
import type { EventEditorScheduleDiagnostics } from "@/contracts/eventEditor";
import { Schedule } from "./Schedule";
import {
  applyDivisionPhaseRulesToMatch,
  resolveScheduledMatchDurationMs,
} from "./divisionPhaseRules";
import { resolveMatchTimingPolicy } from "./matchTimingPolicy";
import {
  buildMatchSchedulingBatches,
  validateMatchBatchBoundaries,
  MatchSchedulingBatch,
} from "./matchSchedulingOrder";
import {
  Division,
  League,
  Match,
  PlayingField,
  Team,
  Tournament,
  UserData,
  MINUTE_MS,
  SchedulerContext,
  LeagueDivisionConfig,
  PlayoffDivisionConfig,
} from "./types";

const createId = () => crypto.randomUUID();

type EventBuilderOptions = {
  includePlaceholderTeams?: boolean;
  canUseCandidate?: (candidate: {
    event: Match;
    resource: PlayingField;
    start: Date;
    end: Date;
  }) => boolean;
  allowPartialPlacement?: boolean;
};

export type EventBuilderPlacementFailure = {
  matchId: string;
  message: string;
  restrictingFactor: ScheduleFailureFactor;
  evidence?: ScheduleDiagnosticEvidence[];
  candidateCount?: number;
  searchExhaustive?: boolean;
};

type RegularSeasonMatchConfig = {
  gamesPerOpponent: number;
  durationMs: number;
  bufferMs: number;
  usesSets: boolean;
  setsPerMatch: number;
};
type PlayoffMatchDurations = {
  bufferMs: number;
  setDurationMs: number;
  matchDurationMs: number;
};
const normalizePositiveIntValue = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
};

const normalizeNonNegativeIntValue = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
};

const parseOptionalFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOptionalNonNegativeIntValue = (
  value: unknown,
  fallback: unknown,
): number | undefined => {
  const parsed = parseOptionalFiniteNumber(value);
  if (parsed !== null) {
    return Math.max(0, Math.trunc(parsed));
  }
  const parsedFallback = parseOptionalFiniteNumber(fallback);
  return parsedFallback === null
    ? undefined
    : Math.max(0, Math.trunc(parsedFallback));
};

const finiteNumberValue = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const numericRuleOverride = (
  rules: Record<string, unknown>,
  key: string,
): number | null => {
  if (typeof rules[key] !== "number") {
    return null;
  }
  return rules[key] as number;
};
const preferConfiguredValue = <T>(
  value: T | null | undefined,
  fallback: T | null | undefined,
): T | null | undefined => {
  if (value !== null && value !== undefined) {
    return value;
  }
  return fallback;
};

const resolvePlayoffPointsFallbacks = (
  event: League | Tournament,
): { winner: number[]; loser: number[] } => {
  const winner = Array.isArray(event.winnerBracketPointsToVictory)
    ? event.winnerBracketPointsToVictory
    : [];
  const loser = Array.isArray(event.loserBracketPointsToVictory)
    ? event.loserBracketPointsToVictory
    : [];
  return { winner, loser };
};

const resolvePlayoffPrize = (
  event: League | Tournament,
  divisionConfig: PlayoffDivisionConfig | null,
): string => {
  if (typeof divisionConfig?.prize === "string") {
    return divisionConfig.prize;
  }
  return event.prize ?? "";
};


const normalizePlayoffPoints = (
  value: unknown,
  length: number,
  fallback: number[],
): number[] => {
  const values = Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.max(1, Math.trunc(entry)))
    : [...fallback];
  const next = values.slice(0, length);
  while (next.length < length) {
    next.push(21);
  }
  return next;
};

const resolvePlayoffFieldCount = (event: League | Tournament): number => {
  const configuredFieldCount = Object.keys(event.fields ?? {}).length;
  if (configuredFieldCount > 0) {
    return configuredFieldCount;
  }
  const eventFieldCount = finiteNumberValue(event.fieldCount);
  if (eventFieldCount !== null) {
    return Math.max(1, Math.trunc(eventFieldCount));
  }
  return 1;
};

const resolvePlayoffSetCounts = (
  event: League | Tournament,
  divisionConfig: PlayoffDivisionConfig | null,
): {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
} => {
  const doubleElimination =
    typeof divisionConfig?.doubleElimination === "boolean"
      ? divisionConfig.doubleElimination
      : Boolean(event.doubleElimination);
  const winnerSetCount = normalizePositiveIntValue(
    divisionConfig?.winnerSetCount,
    finiteNumberValue(event.winnerSetCount) ?? 1,
  );
  const rawLoserSetCount = normalizePositiveIntValue(
    divisionConfig?.loserSetCount,
    finiteNumberValue(event.loserSetCount) ?? 1,
  );
  const loserSetCount = doubleElimination ? rawLoserSetCount : 1;
  const enforceSingleSet = !event.usesSets;
  return {
    doubleElimination,
    winnerSetCount: enforceSingleSet ? 1 : winnerSetCount,
    loserSetCount: enforceSingleSet ? 1 : loserSetCount,
  };
};

const resolvePlayoffTournamentConfigValues = (
  event: League | Tournament,
  divisionConfig: PlayoffDivisionConfig | null,
): PlayoffDivisionConfig => {
  const counts = resolvePlayoffSetCounts(event, divisionConfig);
  const pointsFallbacks = resolvePlayoffPointsFallbacks(event);
  return {
    doubleElimination: counts.doubleElimination,
    winnerSetCount: counts.winnerSetCount,
    loserSetCount: counts.loserSetCount,
    winnerBracketPointsToVictory: normalizePlayoffPoints(
      divisionConfig?.winnerBracketPointsToVictory,
      counts.winnerSetCount,
      pointsFallbacks.winner,
    ),
    loserBracketPointsToVictory: normalizePlayoffPoints(
      divisionConfig?.loserBracketPointsToVictory,
      counts.loserSetCount,
      pointsFallbacks.loser,
    ),
    prize: resolvePlayoffPrize(event, divisionConfig),
    fieldCount: normalizePositiveIntValue(
      divisionConfig?.fieldCount,
      resolvePlayoffFieldCount(event),
    ),
    restTimeMinutes: normalizeNonNegativeIntValue(
      divisionConfig?.restTimeMinutes,
      finiteNumberValue(event.restTimeMinutes) ?? 0,
    ),
    matchDurationMinutes: normalizeOptionalNonNegativeIntValue(
      divisionConfig?.matchDurationMinutes,
      event.matchDurationMinutes,
    ),
    setDurationMinutes: normalizeOptionalNonNegativeIntValue(
      divisionConfig?.setDurationMinutes,
      event.setDurationMinutes,
    ),
  };
};


const collectPlayoffDivisions = (event: League | Tournament): Division[] => {
  const divisions = [
    ...(event.playoffDivisions ?? []),
    ...event.divisions.filter((division) =>
      ["BRACKET", "PLAYOFF"].includes(
        String(division.phase ?? division.kind ?? "").trim().toUpperCase(),
      ),
    ),
  ];
  return Array.from(
    new Map(divisions.map((division) => [division.id, division])).values(),
  );
};

const collectPersistedPlayoffTeamIds = (
  event: League | Tournament,
): Set<string> =>
  new Set(
    collectPlayoffDivisions(event).flatMap((division) => division.teamIds),
  );

const playoffPlaceholderPrefix = (division: Division): string => {
  const safeDivisionId = division.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return `playoff-${safeDivisionId}-`;
};

const isPlaceholderTeam = (team: Team): boolean =>
  String(team.kind ?? "").trim().toUpperCase() === "PLACEHOLDER";

const isPlayoffPlaceholderTeam = (
  team: Team,
  persistedPlayoffTeamIds: Set<string>,
  playoffDivisions: Division[],
): boolean => {
  const phase = String(team.division?.phase ?? team.division?.kind ?? "")
    .trim()
    .toUpperCase();
  const divisionId = String(team.division?.id ?? "").trim();
  return (
    phase === "PLAYOFF" ||
    phase === "BRACKET" ||
    persistedPlayoffTeamIds.has(team.id) ||
    playoffDivisions.some((division) =>
      division.id === divisionId
      || team.id.startsWith(playoffPlaceholderPrefix(division)),
    )
  );
};

export class EventBuilder {
  event: League | Tournament;
  context: SchedulerContext;
  schedule: Schedule<Match, any, any, Division>;
  private includePlaceholderTeams: boolean;
  private canUseCandidate: EventBuilderOptions["canUseCandidate"];
  private shouldPlaceMatches = true;
  private regularPlaceholderIds: Set<string> = new Set();
  private playoffPlaceholderIds: Set<string> = new Set();
  private nextPlaceholderOrdinal: number = 1;
  private participants: Record<string, Team | UserData> = {};
  private officialStaffingPlanner: OfficialStaffingPlanner | null = null;
  readonly placementFailures: EventBuilderPlacementFailure[] = [];
  private allowPartialPlacement: boolean;

  constructor(
    event: League | Tournament,
    context: SchedulerContext,
    options: EventBuilderOptions = {},
  ) {
    this.context = context;
    this.event = event;
    this.includePlaceholderTeams = options.includePlaceholderTeams !== false;
    this.canUseCandidate = options.canUseCandidate;
    this.allowPartialPlacement = options.allowPartialPlacement === true;
    this.participants = this.participantsForSchedule(this.event.teams);
    this.schedule = new Schedule(
      this.event.start,
      this.event.fields,
      this.participants,
      this.schedulingDivisions(),
      undefined,
      { endTime: this.event.end, timeSlots: this.event.timeSlots },
    );
    this.officialStaffingPlanner = new OfficialStaffingPlanner(this.event);
    this.hydratePlaceholderIdentitySets();
  }
  private hydratePlaceholderIdentitySets(): void {
    this.regularPlaceholderIds.clear();
    this.playoffPlaceholderIds.clear();
    const playoffDivisions = collectPlayoffDivisions(this.event);
    const persistedPlayoffTeamIds = collectPersistedPlayoffTeamIds(this.event);
    for (const team of Object.values(this.event.teams)) {
      if (!isPlaceholderTeam(team)) {
        continue;
      }
      if (
        isPlayoffPlaceholderTeam(
          team,
          persistedPlayoffTeamIds,
          playoffDivisions,
        )
      ) {
        this.playoffPlaceholderIds.add(team.id);
      } else {
        this.regularPlaceholderIds.add(team.id);
      }
    }
  }

  private get isLeague(): boolean {
    return this.event instanceof League;
  }

  private get isTournamentPoolPlay(): boolean {
    return (
      !(this.event instanceof League) &&
      String(this.event.eventType ?? "").toUpperCase() === "TOURNAMENT" &&
      this.event.includePlayoffs === true &&
      Array.isArray(this.event.playoffDivisions) &&
      this.event.playoffDivisions.length > 0
    );
  }
  private get usesSinglePreliminaryDivision(): boolean {
    return (
      this.event.singleDivision
      && this.event.divisions.length <= 1
      && !this.isTournamentPoolPlay
    );
  }

  private get useSplitPlayoffDivisions(): boolean {
    if (this.event instanceof League) {
      return Boolean(this.event.splitLeaguePlayoffDivisions);
    }
    return this.isTournamentPoolPlay;
  }
  private phasePlayoffDivisionFor(sourceDivision?: Division): Division | null {
    const playoffDivisions = this.event.playoffDivisions ?? [];
    if (!playoffDivisions.length) {
      return null;
    }
    if (sourceDivision) {
      const sourceId = sourceDivision.id.toLowerCase();
      const sourceBaseId = sourceId.replace(
        /__phase__(league|pool|bracket|playoff)$/,
        "",
      );
      const generated = playoffDivisions.find(
        (division) =>
          (division.phase === "PLAYOFF" || division.phase === "BRACKET") &&
          division.id.toLowerCase() === `${sourceBaseId}__phase__playoff`,
      );
      if (generated) {
        return generated;
      }
    }
    return (
      playoffDivisions.find(
        (division) =>
          division.phase === "PLAYOFF" || division.phase === "BRACKET",
      ) ??
      playoffDivisions[0] ??
      null
    );
  }

  private schedulingDivisions(): Division[] {
    const divisions: Division[] = [...this.event.divisions];
    if (!this.useSplitPlayoffDivisions) {
      return divisions;
    }
    const seen = new Set(divisions.map((division) => division.id));
    for (const playoffDivision of this.event.playoffDivisions ?? []) {
      if (seen.has(playoffDivision.id)) {
        continue;
      }
      seen.add(playoffDivision.id);
      divisions.push(playoffDivision);
    }
    return divisions;
  }
  private placementDivisions(): Division[] {
    const divisions = this.schedulingDivisions();
    const seen = new Set(divisions.map((division) => division.id));
    for (const playoffDivision of this.event.playoffDivisions ?? []) {
      if (seen.has(playoffDivision.id)) continue;
      seen.add(playoffDivision.id);
      divisions.push(playoffDivision);
    }
    return divisions;
  }

  buildSchedule(): League | Tournament {
    this.buildMatchGraph();
    return this.placeMatchGraph();
  }
  buildMatchGraph(): League | Tournament {
    this.shouldPlaceMatches = false;
    this.resetState();

    const participantTargets = this.includePlaceholderTeams
      ? this.desiredParticipantCapacity()
      : undefined;
    const participants = this.prepareParticipants(participantTargets);
    if (Object.keys(participants).length < 2) {
      if (!this.includePlaceholderTeams) {
        this.event.matches = {};
        return this.event;
      }
      throw new ScheduleError(
        "Event requires at least two participants to build a Match Graph",
        "PLAYING_TEAM",
      );
    }

    this.participants = participants;
    const scheduleParticipants = this.participantsForSchedule(participants);
    this.schedule = new Schedule(
      this.event.start,
      this.event.fields,
      scheduleParticipants,
      this.schedulingDivisions(),
      undefined,
      { endTime: this.event.end, timeSlots: this.event.timeSlots },
    );
    this.officialStaffingPlanner = new OfficialStaffingPlanner(this.event);

    const durationMs = this.matchDuration();
    const graphMatches: Match[] = [];
    const usesPreliminaryPhase = this.isLeague || this.isTournamentPoolPlay;
    if (usesPreliminaryPhase) {
      const regularMatches = this.scheduleRegularSeason(
        Object.values(participants),
      );
      graphMatches.push(...regularMatches);
      if (this.eventHasAdvancementBracket(Object.values(participants).length)) {
        graphMatches.push(
          ...this.schedulePlayoffs(Object.values(participants), durationMs),
        );
      }
    } else {
      graphMatches.push(
        ...this.schedulePlayoffs(Object.values(participants), durationMs),
      );
    }
    for (const match of graphMatches) {
      applyDivisionPhaseRulesToMatch(this.event, match);
      match.placementState = "UNPLACED";
      this.event.matches[match.id] = match;
    }
    return this.event;
  }

  placeMatchGraph(options: { preserveMatchIds?: boolean } = {}): League | Tournament {
    this.shouldPlaceMatches = true;
    this.placementFailures.length = 0;
    this.ensureFieldsAvailable();
    const matches = Object.values(this.event.matches);
    if (!matches.length) {
      return this.event;
    }
    this.preparePlacementState(matches);
    const batches = buildMatchSchedulingBatches(
      this.event,
      matches,
      this.placementDivisions(),
    );
    const orderedMatches = this.placeMatchBatches(batches);
    this.finalizePlacement(orderedMatches, batches, options);
    return this.event;
  }

  private preparePlacementState(matches: Match[]): void {
    const canonicalDivisions = new Map(
      this.placementDivisions().map((division) => [division.id, division]),
    );
    for (const match of matches) {
      const canonicalDivision = canonicalDivisions.get(match.division.id);
      if (canonicalDivision) {
        match.division = canonicalDivision;
      }
    }

    for (const field of Object.values(this.event.fields)) {
      field.matches = [];
    }
    for (const team of Object.values(this.event.teams)) {
      team.matches = [];
    }
    for (const official of this.event.officials) {
      official.matches = [];
    }

    const scheduleParticipants = this.participantsForSchedule(this.event.teams);
    this.schedule = new Schedule(
      this.event.start,
      this.event.fields,
      scheduleParticipants,
      this.placementDivisions(),
      undefined,
      { endTime: this.event.end, timeSlots: this.event.timeSlots },
    );
    this.officialStaffingPlanner = new OfficialStaffingPlanner(this.event);
  }

  private placeMatchBatches(
    batches: MatchSchedulingBatch[],
  ): Match[] {
    const orderedMatches = batches.flatMap((batch) => batch.matches);
    for (const batch of batches) {
      for (const match of batch.matches) {
        try {
          this.placeGraphMatch(match);
        } catch (error) {
          if (!this.allowPartialPlacement || !(error instanceof ScheduleError)) {
            throw error;
          }
          match.unschedule();
          match.official = null;
          match.officialAssignments = [];
          const teamIds = [match.team1?.id, match.team2?.id, match.teamOfficial?.id]
            .filter((id): id is string => Boolean(id));
          match.teamOfficial = null;
          const evidence = error.diagnosticEvidence.length > 0
            ? error.diagnosticEvidence
            : [{
              kind: "PLACEMENT_SEARCH" as const,
              message: error.message,
              matchIds: [match.id],
              divisionIds: [match.division.id],
              teamIds,
              dependencyIds: match.getDependencies().map((dependency) => dependency.id),
              candidateCount: error.candidateCount,
            }];
          this.placementFailures.push({
            matchId: match.id,
            message: error.message,
            restrictingFactor: error.restrictingFactor,
            evidence,
            candidateCount: error.candidateCount,
            searchExhaustive: error.searchExhaustive,
          });
        }
      }
      const maxEnd = batch.matches.reduce(
        (latest, match) => (
          match.end.getTime() > latest.getTime() ? match.end : latest
        ),
        batch.matches[0]?.end ?? this.event.start,
      );
      this.schedule.advanceTo(maxEnd);
    }
    return orderedMatches;
  }

  getScheduleDiagnostics(): EventEditorScheduleDiagnostics {
    return diagnoseScheduleProposal({
      event: this.event,
      matches: Object.values(this.event.matches),
      placementFailures: this.placementFailures,
    });
  }

  private finalizePlacement(
    orderedMatches: Match[],
    batches: MatchSchedulingBatch[],
    options: { preserveMatchIds?: boolean },
  ): void {
    const placedBatches = batches
      .map((batch) => ({
        ...batch,
        matches: batch.matches.filter((match) => match.placementState === "PLACED"),
      }))
      .filter((batch) => batch.matches.length > 0);
    validateMatchBatchBoundaries(placedBatches);
    if (!options.preserveMatchIds) {
      this.assignChronologicalMatchIds(orderedMatches);
    }
    const placedMatches = orderedMatches.filter(
      (match) => match.placementState === "PLACED",
    );
    this.assignUserOfficials(placedMatches);
    const planner = this.officialStaffingPlanner;
    if (
      planner
      && placedMatches.some((match) => planner.isTeamDutyRequired(match))
    ) {
      this.assignTeamOfficials(placedMatches);
    }
    this.ensureHardTeamCoverage(placedMatches, planner);
    this.assignMatchesToFields(orderedMatches);
    this.event.matches = Object.fromEntries(
      orderedMatches.map((match) => [match.id, match]),
    );
  }

  private assignMatchesToFields(matches: Match[]): void {
    for (const field of Object.values(this.event.fields)) {
      field.matches = matches.filter((match) => match.field?.id === field.id);
    }
  }

  private ensureHardTeamCoverage(
    matches: Match[],
    planner: OfficialStaffingPlanner | null,
  ): void {
    if (!planner?.isHardTeamCoverageRequired()) {
      return;
    }
    const unstaffedMatch = matches.find(
      (match) =>
        planner.isHardTeamCoverageRequired(match)
        && match.requiresTeamOfficial
        && !match.teamOfficial,
    );
    if (unstaffedMatch) {
      throw new ScheduleError(
        "Unable to fully staff all matches with Team officials.",
        "TEAM_DUTY",
      );
    }
  }



  private placeGraphMatch(match: Match): void {
    const durationMs = resolveScheduledMatchDurationMs(
      this.event,
      match,
      this.matchDuration(),
    );
    try {
      this.scheduleMatch(match, durationMs);
    } catch (error) {
      if (
        error instanceof ScheduleError
        && error.restrictingFactor === "RESOURCE"
        && match.getDependencies().some(
          (dependency) =>
            (dependency as { placementRestriction?: string }).placementRestriction === "TEAM_DUTY",
        )
      ) {
        throw new ScheduleError(error.message, "TEAM_DUTY");
      }
      throw error;
    }
    if (
      match.getDependencies().some(
        (dependency) =>
          (dependency as { placementRestriction?: string }).placementRestriction === "TEAM_DUTY",
      )
    ) {
      (match as Match & { placementRestriction?: "TEAM_DUTY" }).placementRestriction = "TEAM_DUTY";
    }
    this.attachMatchToParticipants(match);
  }



  private leagueHasPlayoffs(participantCount: number): boolean {
    if (!this.isLeague) return false;
    if (!this.event.includePlayoffs) {
      return false;
    }
    if (this.useSplitPlayoffDivisions) {
      const league = this.event as League;
      if (!league.playoffDivisions.length) {
        throw new Error(
          "Split playoff divisions are enabled but no playoff divisions are configured. Add at least one playoff division or disable split playoffs.",
        );
      }
      return league.playoffDivisions.some(
        (division) =>
          this.resolvePlayoffParticipantCount(division, participantCount) >=
          MIN_BRACKET_TEAM_COUNT,
      );
    }
    const configuredCount =
      typeof this.event.playoffTeamCount === "number" &&
      Number.isFinite(this.event.playoffTeamCount)
        ? Math.trunc(this.event.playoffTeamCount)
        : MIN_BRACKET_TEAM_COUNT;
    return (
      participantCount >= MIN_BRACKET_TEAM_COUNT &&
      configuredCount >= MIN_BRACKET_TEAM_COUNT
    );
  }

  private eventHasAdvancementBracket(participantCount: number): boolean {
    if (this.isLeague) {
      return this.leagueHasPlayoffs(participantCount);
    }
    if (!this.isTournamentPoolPlay) {
      return false;
    }
    const playoffDivisions = this.event.playoffDivisions ?? [];
    if (!playoffDivisions.length) {
      throw new Error(
        "Pool play is enabled but no bracket divisions are configured.",
      );
    }
    return playoffDivisions.some(
      (division) =>
        this.resolvePlayoffParticipantCount(division, participantCount) >=
        MIN_BRACKET_TEAM_COUNT,
    );
  }

  private resetState(): void {
    this.hydratePlaceholderIdentitySets();
    this.removePersistedPlayoffPlaceholders();
    this.event.matches = {};
    const officialDivisions = this.schedulingDivisions();
    for (const field of Object.values(this.event.fields)) {
      field.matches = [];
    }
    for (const team of Object.values(this.event.teams)) {
      team.matches = [];
    }
    for (const official of this.event.officials) {
      official.matches = [];
      if (!official.divisions.length) {
        official.divisions = [...officialDivisions];
      }
    }
    this.regularPlaceholderIds.clear();
    this.playoffPlaceholderIds.clear();
    this.nextPlaceholderOrdinal = Object.keys(this.event.teams).length + 1;
  }

  private removePersistedPlayoffPlaceholders(): void {
    if (!this.playoffPlaceholderIds.size) {
      return;
    }
    const placeholderIds = this.playoffPlaceholderIds;
    for (const placeholderId of placeholderIds) {
      delete this.event.teams[placeholderId];
    }
    this.event.registeredTeamIds = this.event.registeredTeamIds.filter(
      (teamId) => !placeholderIds.has(teamId),
    );
    const allDivisions = [
      ...this.event.divisions,
      ...(this.event.playoffDivisions ?? []),
    ];
    for (const division of allDivisions) {
      division.teamIds = division.teamIds.filter(
        (teamId) => !placeholderIds.has(teamId),
      );
    }
  }

  private ensureFieldsAvailable(): void {
    if (!Object.keys(this.event.fields).length) {
      throw new ScheduleError(
        "Unable to schedule event because no fields are configured.",
        "RESOURCE",
      );
    }
  }

  private defaultDivision(): Division {
    if (this.event.divisions.length) return this.event.divisions[0];
    return new Division("OPEN", "OPEN");
  }
  private prepareParticipants(placeholderTargets?: {
    total: number;
    byDivision: Map<string, number> | null;
  }): Record<string, Team> {
    for (const team of Object.values(this.event.teams)) {
      team.matches = [];
    }
    if (placeholderTargets) {
      this.ensurePlaceholderCapacity(
        placeholderTargets.total,
        placeholderTargets.byDivision,
      );
    }
    return this.event.teams;
  }

  private participantsForSchedule(
    teams: Record<string, Team>,
  ): Record<string, Team | UserData> {
    const participants: Record<string, Team | UserData> = {};
    for (const [teamId, team] of Object.entries(teams)) {
      participants[teamId] = team;
    }
    const officialDivisions = this.schedulingDivisions();
    for (const official of this.event.officials) {
      if (!official.divisions.length) {
        official.divisions = [...officialDivisions];
      }
      official.matches = [];
      participants[official.id] = official;
    }
    return participants;
  }

  private attachMatchToParticipants(match: Match): void {
    for (const participant of match.getParticipants()) {
      const matchesAttr = (participant as any).matches as Match[] | undefined;
      if (!matchesAttr) continue;
      if (!matchesAttr.includes(match)) {
        matchesAttr.push(match);
      }
    }
  }

  private ensurePlaceholderCapacity(
    targetCount: number,
    divisionTargets: Map<string, number> | null = null,
  ): void {
    const normalizedTargetCount = Math.max(targetCount, 2);
    if (Object.keys(this.event.teams).length >= normalizedTargetCount) return;
    const divisions = this.placeholderDivisions();
    const placeholderCounts = this.countPlaceholderTeamsByDivision(divisions);
    this.ensureDivisionPlaceholderTargets(
      divisions,
      divisionTargets,
      placeholderCounts,
    );
    this.fillPlaceholderCapacity(
      normalizedTargetCount,
      divisions,
      placeholderCounts,
    );
  }

  private placeholderDivisions(): Division[] {
    if (
      this.usesSinglePreliminaryDivision
      || this.event.divisions.length === 0
    ) {
      return [this.defaultDivision()];
    }
    return [...this.event.divisions];
  }

  private countPlaceholderTeamsByDivision(
    divisions: Division[],
  ): Map<string, number> {
    const placeholderCounts = new Map<string, number>();
    for (const division of divisions) {
      placeholderCounts.set(division.id, 0);
    }
    for (const team of Object.values(this.event.teams)) {
      const divisionId = team.division?.id ?? this.defaultDivision().id;
      placeholderCounts.set(
        divisionId,
        (placeholderCounts.get(divisionId) ?? 0) + 1,
      );
    }
    return placeholderCounts;
  }

  private ensureDivisionPlaceholderTargets(
    divisions: Division[],
    divisionTargets: Map<string, number> | null,
    placeholderCounts: Map<string, number>,
  ): void {
    if (
      !divisionTargets
      || !divisionTargets.size
      || this.usesSinglePreliminaryDivision
    ) {
      return;
    }
    for (const [divisionId, target] of divisionTargets.entries()) {
      this.addDivisionPlaceholderCapacity(
        divisions,
        divisionId,
        target,
        placeholderCounts,
      );
    }
  }

  private addDivisionPlaceholderCapacity(
    divisions: Division[],
    divisionId: string,
    target: number,
    placeholderCounts: Map<string, number>,
  ): void {
    if (!Number.isFinite(target)) return;
    const normalizedTarget = Math.max(0, Math.trunc(target));
    if (normalizedTarget < 1) return;
    const division =
      divisions.find((entry) => entry.id === divisionId) ??
      this.defaultDivision();
    const currentCount = placeholderCounts.get(division.id) ?? 0;
    const missing = Math.max(0, normalizedTarget - currentCount);
    for (let index = 0; index < missing; index += 1) {
      this.addPlaceholderTeam(division, placeholderCounts);
    }
  }

  private fillPlaceholderCapacity(
    targetCount: number,
    divisions: Division[],
    placeholderCounts: Map<string, number>,
  ): void {
    while (Object.keys(this.event.teams).length < targetCount) {
      this.addPlaceholderTeam(
        this.pickDivisionForPlaceholder(divisions, placeholderCounts),
        placeholderCounts,
      );
    }
  }

  private pickDivisionForPlaceholder(
    divisions: Division[],
    placeholderCounts: Map<string, number>,
  ): Division {
    let selected = divisions[0];
    let selectedCount = placeholderCounts.get(selected.id) ?? 0;

    for (const division of divisions) {
      const count = placeholderCounts.get(division.id) ?? 0;
      if (count < selectedCount) {
        selected = division;
        selectedCount = count;
      }
    }

    return selected;
  }

  private addPlaceholderTeam(
    division: Division,
    placeholderCounts: Map<string, number>,
  ): void {
    const placeholderId = createId();
    const ordinal = this.nextPlaceholderOrdinal;
    this.nextPlaceholderOrdinal += 1;
    const placeholder = new Team({
      id: placeholderId,
      captainId: "",
      kind: "PLACEHOLDER",
      division,
      matches: [],
      playerIds: [],
      name: `Place Holder ${ordinal}`,
    });
    this.event.teams[placeholderId] = placeholder;
    this.regularPlaceholderIds.add(placeholderId);
    placeholderCounts.set(
      division.id,
      (placeholderCounts.get(division.id) ?? 0) + 1,
    );
  }

  private generatePlaceholderId(prefix: string): string {
    let index = 1;
    while (true) {
      const candidate = `${prefix}-${index}`;
      if (
        !this.event.teams[candidate] &&
        !this.regularPlaceholderIds.has(candidate) &&
        !this.playoffPlaceholderIds.has(candidate)
      ) {
        return candidate;
      }
      index += 1;
    }
  }

  private groupsByDivision(
    participants: Team[],
  ): Array<{ division: Division; teams: Team[] }> {
    const grouped = new Map<string, { division: Division; teams: Team[] }>();
    for (const team of participants) {
      const division = team.division ?? this.defaultDivision();
      const key = division.id;
      const existing = grouped.get(key);
      if (existing) {
        existing.teams.push(team);
        continue;
      }
      grouped.set(key, { division, teams: [team] });
    }

    const ordered: Array<{ division: Division; teams: Team[] }> = [];
    const knownDivisionIds = new Set<string>();
    for (const division of this.event.divisions) {
      const entry = grouped.get(division.id);
      if (!entry) continue;
      ordered.push(entry);
      knownDivisionIds.add(division.id);
    }
    for (const [divisionId, entry] of grouped.entries()) {
      if (knownDivisionIds.has(divisionId)) continue;
      ordered.push(entry);
    }
    return ordered;
  }

  private buildLeaguePlayoffPlaceholders(
    count: number,
    division: Division,
  ): Team[] {
    const placeholders: Team[] = [];
    const prefix = playoffPlaceholderPrefix(division);
    for (let seedIndex = 0; seedIndex < count; seedIndex += 1) {
      const placeholderId = this.generatePlaceholderId(prefix);
      const placeholder = new Team({
        id: placeholderId,
        captainId: "",
        kind: "PLACEHOLDER",
        division,
        matches: [],
        playerIds: [],
        name: `Seed ${seedIndex + 1}`,
      });
      this.event.teams[placeholderId] = placeholder;
      this.playoffPlaceholderIds.add(placeholderId);
      placeholders.push(placeholder);
    }
    return placeholders;
  }

  private desiredParticipantCapacity(): {
    total: number;
    byDivision: Map<string, number> | null;
  } {
    const maxParticipants = this.event.maxParticipants ?? 0;
    const teamCount = Object.keys(this.event.teams).length;
    if (
      this.usesSinglePreliminaryDivision
      || this.event.divisions.length === 0
    ) {
      return {
        total: Math.max(teamCount, maxParticipants, 2),
        byDivision: null,
      };
    }

    const participantsByDivision = this.participantCountsByDivision();
    const configuredDivisions = this.event.divisions.length
      ? this.event.divisions
      : [this.defaultDivision()];
    const divisionFallbackCapacity =
      maxParticipants > 0
        ? Math.ceil(maxParticipants / Math.max(configuredDivisions.length, 1))
        : 0;
    const byDivision = this.configuredParticipantCapacity(
      participantsByDivision,
      configuredDivisions,
      divisionFallbackCapacity,
    );
    this.addUnconfiguredParticipantCapacity(
      participantsByDivision,
      byDivision,
    );

    const divisionCapacityTotal = Array.from(byDivision.values()).reduce(
      (sum, count) => sum + Math.max(0, count),
      0,
    );
    return {
      total: Math.max(teamCount, divisionCapacityTotal, 2),
      byDivision,
    };
  }

  private participantCountsByDivision(): Map<string, number> {
    const participantsByDivision = new Map<string, number>();
    for (const team of Object.values(this.event.teams)) {
      const divisionId = team.division?.id ?? this.defaultDivision().id;
      participantsByDivision.set(
        divisionId,
        (participantsByDivision.get(divisionId) ?? 0) + 1,
      );
    }
    return participantsByDivision;
  }

  private configuredParticipantCapacity(
    participantsByDivision: Map<string, number>,
    configuredDivisions: Division[],
    fallbackCapacity: number,
  ): Map<string, number> {
    const byDivision = new Map<string, number>();
    for (const division of configuredDivisions) {
      const currentCount = participantsByDivision.get(division.id) ?? 0;
      const configuredCapacity = this.configuredDivisionCapacity(
        division,
        fallbackCapacity,
      );
      byDivision.set(division.id, Math.max(currentCount, configuredCapacity));
      participantsByDivision.delete(division.id);
    }
    return byDivision;
  }

  private configuredDivisionCapacity(
    division: Division,
    fallbackCapacity: number,
  ): number {
    if (
      typeof division.maxParticipants === "number"
      && Number.isFinite(division.maxParticipants)
    ) {
      return Math.max(0, Math.trunc(division.maxParticipants));
    }
    return fallbackCapacity;
  }

  private addUnconfiguredParticipantCapacity(
    participantsByDivision: Map<string, number>,
    byDivision: Map<string, number>,
  ): void {
    for (const [divisionId, count] of participantsByDivision.entries()) {
      byDivision.set(divisionId, count);
    }
  }

  private matchDuration(): number {
    const matchRulesOverride =
      this.event.matchRulesOverride &&
      typeof this.event.matchRulesOverride === "object"
        ? (this.event.matchRulesOverride as Record<string, unknown>)
        : {};
    return (
      resolveMatchTimingPolicy({
        usesSets: this.event.usesSets,
        segmentCount:
          typeof matchRulesOverride.segmentCount === "number"
            ? matchRulesOverride.segmentCount
            : null,
        segmentLengthMinutes:
          typeof matchRulesOverride.segmentLengthMinutes === "number"
            ? matchRulesOverride.segmentLengthMinutes
            : null,
        segmentBreakMinutes:
          typeof matchRulesOverride.segmentBreakMinutes === "number"
            ? matchRulesOverride.segmentBreakMinutes
            : null,
        setsPerMatch: this.event.setsPerMatch,
        setDurationMinutes: this.event.setDurationMinutes,
        matchDurationMinutes: this.event.matchDurationMinutes,
      }).durationMinutes * MINUTE_MS
    );
  }

  private matchBuffer(): number {
    return (
      resolveMatchTimingPolicy({
        usesSets: this.event.usesSets,
        setsPerMatch: this.event.setsPerMatch,
        setDurationMinutes: this.event.setDurationMinutes,
        matchDurationMinutes: this.event.matchDurationMinutes,
        restTimeMinutes: this.event.restTimeMinutes,
      }).breakMinutes * MINUTE_MS
    );
  }

  private resolveMatchDivision(
    team1: Team | null,
    team2: Team | null,
  ): Division {
    if (this.usesSinglePreliminaryDivision) {
      return this.defaultDivision();
    }
    return this.resolveConfiguredMatchDivision(team1, team2);
  }

  private resolveConfiguredMatchDivision(
    team1: Team | null,
    team2: Team | null,
  ): Division {
    const team1Division = team1?.division;
    const team2Division = team2?.division;
    if (
      team1Division
      && team2Division
      && team1Division.id === team2Division.id
    ) {
      return team1Division;
    }
    return team1Division ?? team2Division ?? this.defaultDivision();
  }

  private normalizePositiveInt(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.trunc(parsed));
  }

  private normalizePositiveDuration(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Math.max(1, Math.trunc(fallback));
    }
    return Math.max(1, Math.trunc(parsed));
  }

  private normalizeNonNegativeInt(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.trunc(parsed));
  }

  private resolveRegularSeasonConfig(
    division?: Division,
  ): RegularSeasonMatchConfig {
    const usesLeagueRules = this.isLeague || this.isTournamentPoolPlay;
    const divisionConfig: LeagueDivisionConfig | null = usesLeagueRules
      ? (division?.leagueConfig ?? null)
      : null;
    const usesSets = this.resolveRegularSeasonUsesSets(divisionConfig);
    const matchRulesOverride = this.resolveMatchRulesOverride();
    const gamesPerOpponent = this.resolveRegularSeasonGamesPerOpponent(
      divisionConfig,
      usesLeagueRules,
    );
    const restTimeMinutes = this.normalizeNonNegativeInt(
      divisionConfig?.restTimeMinutes,
      this.event.restTimeMinutes ?? 0,
    );
    const timing = this.resolveRegularSeasonTiming(
      divisionConfig,
      matchRulesOverride,
      usesSets,
      restTimeMinutes,
    );
    return {
      gamesPerOpponent,
      durationMs: timing.durationMinutes * MINUTE_MS,
      bufferMs: timing.breakMinutes * MINUTE_MS,
      usesSets,
      setsPerMatch: usesSets
        ? this.normalizePositiveInt(
            divisionConfig?.setsPerMatch,
            this.event.setsPerMatch || 1,
          )
        : 1,
    };
  }

  private resolveRegularSeasonUsesSets(
    divisionConfig: LeagueDivisionConfig | null,
  ): boolean {
    if (typeof divisionConfig?.usesSets === "boolean") {
      return divisionConfig.usesSets;
    }
    return Boolean(this.event.usesSets);
  }

  private resolveMatchRulesOverride(): Record<string, unknown> {
    if (
      this.event.matchRulesOverride
      && typeof this.event.matchRulesOverride === "object"
    ) {
      return this.event.matchRulesOverride as Record<string, unknown>;
    }
    return {};
  }

  private resolveRegularSeasonGamesPerOpponent(
    divisionConfig: LeagueDivisionConfig | null,
    usesLeagueRules: boolean,
  ): number {
    if (!usesLeagueRules) {
      return 1;
    }
    return this.normalizePositiveInt(
      divisionConfig?.gamesPerOpponent,
      this.event.gamesPerOpponent || 1,
    );
  }

  private resolveRegularSeasonTiming(
    divisionConfig: LeagueDivisionConfig | null,
    matchRulesOverride: Record<string, unknown>,
    usesSets: boolean,
    restTimeMinutes: number,
  ) {
    return resolveMatchTimingPolicy({
      usesSets,
      segmentCount: preferConfiguredValue(
        divisionConfig?.setsPerMatch,
        numericRuleOverride(matchRulesOverride, "segmentCount"),
      ),
      segmentLengthMinutes: preferConfiguredValue(
        divisionConfig?.setDurationMinutes,
        numericRuleOverride(matchRulesOverride, "segmentLengthMinutes"),
      ),
      segmentBreakMinutes: numericRuleOverride(
        matchRulesOverride,
        "segmentBreakMinutes",
      ),
      setsPerMatch: preferConfiguredValue(
        divisionConfig?.setsPerMatch,
        this.event.setsPerMatch,
      ),
      setDurationMinutes: preferConfiguredValue(
        divisionConfig?.setDurationMinutes,
        this.event.setDurationMinutes,
      ),
      matchDurationMinutes: preferConfiguredValue(
        divisionConfig?.matchDurationMinutes,
        this.event.matchDurationMinutes,
      ),
      restTimeMinutes,
    });
  }

  private createMatch(
    team1: Team | null,
    team2: Team | null,
    divisionOverride?: Division,
    config: RegularSeasonMatchConfig = this.resolveRegularSeasonConfig(
      divisionOverride,
    ),
  ): Match {
    const setCount = config.usesSets ? config.setsPerMatch : 1;
    const division = divisionOverride ?? this.resolveMatchDivision(team1, team2);
    const match = new Match({
      id: createId(),
      matchId: null,
      team1,
      team2,
      team1Points: Array(setCount).fill(0),
      team2Points: Array(setCount).fill(0),
      start: this.event.start,
      end: this.event.start,
      official: null,
      officialAssignments: [],
      teamOfficial: null,
      requiresTeamOfficial: false,
      winnerNextMatch: null,
      loserNextMatch: null,
      losersBracket: false,
      division,
      field: null,
      bufferMs: config.bufferMs,
      side: null,
      officialCheckedIn: false,
      eventId: this.event.id,
    });
    match.requiresTeamOfficial = this.officialStaffingPlanner?.isTeamDutyRequired(match) ?? false;
    return match;
  }

  private scheduleRegularSeasonForDivision(
    participants: Team[],
    division?: Division,
  ): Match[] {
    const config = this.resolveRegularSeasonConfig(division);
    const rounds = this.roundRobinRounds(participants, config.gamesPerOpponent);
    const scheduled: Match[] = [];
    for (const roundPairs of rounds) {
      const roundScheduled: Match[] = [];
      for (const [home, away] of roundPairs) {
        const match = this.createMatch(home, away, division, config);
        if (this.shouldPlaceMatches) {
          this.scheduleMatch(
            match,
            resolveScheduledMatchDurationMs(
              this.event,
              match,
              config.durationMs,
            ),
          );
        }
        this.attachMatchToParticipants(match);
        scheduled.push(match);
        roundScheduled.push(match);
      }
      if (this.shouldPlaceMatches && roundScheduled.length) {
        const lastEnd = roundScheduled.reduce(
          (acc, match) => (match.end > acc ? match.end : acc),
          roundScheduled[0].end,
        );
        this.schedule.advanceTo(new Date(lastEnd.getTime() + config.bufferMs));
      }
    }
    return scheduled;
  }

  private scheduleRegularSeason(participants: Team[]): Match[] {
    if (participants.length < 2) {
      return [];
    }

    if (this.usesSinglePreliminaryDivision) {
      return this.scheduleRegularSeasonForDivision(
        participants,
        this.defaultDivision(),
      );
    }

    const groupedByDivision = this.groupsByDivision(participants);
    const scheduled: Match[] = [];
    const regularSeasonStart = new Date(this.event.start);
    for (const { division, teams } of groupedByDivision) {
      if (teams.length < 2) {
        continue;
      }
      // Split divisions should start from the same baseline so each division can
      // use its own weekly slot cadence in parallel.
      this.schedule.currentTime = new Date(regularSeasonStart);
      scheduled.push(...this.scheduleRegularSeasonForDivision(teams, division));
    }

    return scheduled;
  }

  private roundRobinRounds(
    participants: Team[],
    gamesPerOpponent: number,
  ): Array<Array<[Team, Team]>> {
    const teams = [...participants];
    if (teams.length < 2) return [];
    if (teams.length % 2 === 1) teams.push(null as any);
    const teamCount = teams.length;
    const half = teamCount / 2;
    const baseRounds: Array<Array<[Team, Team]>> = [];
    let working = [...teams];
    for (let i = 0; i < teamCount - 1; i += 1) {
      const pairings: Array<[Team, Team]> = [];
      for (let idx = 0; idx < half; idx += 1) {
        const home = working[idx];
        const away = working[teamCount - 1 - idx];
        if (!home || !away) continue;
        pairings.push([home, away]);
      }
      baseRounds.push(pairings);
      working = [
        working[0],
        working[working.length - 1],
        ...working.slice(1, -1),
      ];
    }
    const fullSchedule: Array<Array<[Team, Team]>> = [];
    for (let repeat = 0; repeat < gamesPerOpponent; repeat += 1) {
      for (const pairings of baseRounds) {
        if (repeat % 2 === 1) {
          fullSchedule.push(pairings.map(([home, away]) => [away, home]));
        } else {
          fullSchedule.push([...pairings]);
        }
      }
    }
    return fullSchedule;
  }

  private schedulePlayoffs(participants: Team[], durationMs: number): Match[] {
    if (participants.length < MIN_BRACKET_TEAM_COUNT) return [];
    if (!this.isLeague && !this.isTournamentPoolPlay) {
      return this.scheduleTournamentPlayoffs();
    }
    if (this.useSplitPlayoffDivisions) {
      return this.scheduleSplitPlayoffs(participants, durationMs);
    }
    if (this.event.singleDivision) {
      return this.scheduleSingleDivisionPlayoffs(participants, durationMs);
    }
    return this.scheduleGroupedPlayoffs(participants, durationMs);
  }

  private scheduleTournamentPlayoffs(): Match[] {
    const bracketBuilder = new Brackets(
      this.event as Tournament,
      this.context,
      {
        placeMatches: this.shouldPlaceMatches,
      },
    );
    bracketBuilder.buildBrackets();
    this.schedule = bracketBuilder.bracketSchedule;
    this.event = bracketBuilder.tournament as League | Tournament;
    return Object.values(this.event.matches).sort(
      (a, b) => (a.matchId || 0) - (b.matchId || 0),
    );
  }

  private playoffStart(): Date {
    if (
      this.schedule.currentTime.getTime() > this.event.start.getTime()
    ) {
      return this.schedule.currentTime;
    }
    return this.event.start;
  }

  private scheduleSplitPlayoffs(
    participants: Team[],
    durationMs: number,
  ): Match[] {
    const scheduledMatches: Match[] = [];
    const playoffStart = this.playoffStart();
    const playoffDivisions = this.event.playoffDivisions ?? [];
    for (const playoffDivision of playoffDivisions) {
      const playoffCount = this.resolvePlayoffParticipantCount(
        playoffDivision,
        participants.length,
      );
      if (playoffCount < MIN_BRACKET_TEAM_COUNT) {
        continue;
      }
      // Ensure each playoff division begins from the shared playoff start anchor.
      this.schedule.currentTime = new Date(playoffStart);
      const seeded = this.buildLeaguePlayoffPlaceholders(
        playoffCount,
        playoffDivision,
      );
      const config = this.resolvePlayoffTournamentConfig(playoffDivision);
      scheduledMatches.push(
        ...this.scheduleLeaguePlayoffBracket(
          seeded,
          [playoffDivision],
          durationMs,
          playoffStart,
          config,
        ),
      );
    }
    return scheduledMatches;
  }

  private scheduleSingleDivisionPlayoffs(
    participants: Team[],
    durationMs: number,
  ): Match[] {
    const league = this.event as League;
    const playoffDivision =
      this.phasePlayoffDivisionFor(this.defaultDivision()) ??
      this.defaultDivision();
    const playoffCount = Math.min(
      league.playoffTeamCount ?? MIN_BRACKET_TEAM_COUNT,
      participants.length,
    );
    if (playoffCount < MIN_BRACKET_TEAM_COUNT) return [];
    const seeded = this.buildLeaguePlayoffPlaceholders(
      playoffCount,
      playoffDivision,
    );
    if (seeded.length < MIN_BRACKET_TEAM_COUNT) {
      return [];
    }
    const playoffStart = this.playoffStart();
    const config = this.resolvePlayoffTournamentConfig(playoffDivision);
    return this.scheduleLeaguePlayoffBracket(
      seeded,
      [playoffDivision],
      durationMs,
      playoffStart,
      config,
    );
  }

  private scheduleGroupedPlayoffs(
    participants: Team[],
    durationMs: number,
  ): Match[] {
    const playoffStart = this.playoffStart();
    const scheduledMatches: Match[] = [];
    const groupedByDivision = this.groupsByDivision(participants);
    for (const { division, teams } of groupedByDivision) {
      const playoffDivision =
        this.phasePlayoffDivisionFor(division) ?? division;
      const divisionPlayoffCount = this.resolvePlayoffParticipantCount(
        playoffDivision,
        teams.length,
      );
      if (divisionPlayoffCount < MIN_BRACKET_TEAM_COUNT) {
        continue;
      }
      this.schedule.currentTime = new Date(playoffStart);
      const divisionSeeds = this.buildLeaguePlayoffPlaceholders(
        divisionPlayoffCount,
        playoffDivision,
      );
      const config = this.resolvePlayoffTournamentConfig(playoffDivision);
      scheduledMatches.push(
        ...this.scheduleLeaguePlayoffBracket(
          divisionSeeds,
          [playoffDivision],
          durationMs,
          playoffStart,
          config,
        ),
      );
    }
    return scheduledMatches;
  }

  private resolvePlayoffTournamentConfig(
    division?: Division,
  ): PlayoffDivisionConfig {
    const fallbackDivision =
      division ??
      (!this.useSplitPlayoffDivisions ? this.defaultDivision() : undefined);
    // Single-division events own their bracket settings at the event level. A
    // stale generated division config must not override those settings.
    const divisionConfig = this.event.singleDivision
      ? null
      : (fallbackDivision?.playoffConfig ?? null);
    return resolvePlayoffTournamentConfigValues(this.event, divisionConfig);
  }

  private scheduleLeaguePlayoffBracket(
    seeded: Team[],
    tournamentDivisions: Division[],
    durationMs: number,
    playoffStart: Date,
    config: PlayoffDivisionConfig,
  ): Match[] {
    if (seeded.length < MIN_BRACKET_TEAM_COUNT) {
      return [];
    }
    const teamLookup = Object.fromEntries(
      seeded.map((team) => [team.id, team]),
    );
    const playoffTournament = this.createPlayoffTournament(
      seeded,
      tournamentDivisions,
      playoffStart,
      config,
    );
    const bracketBuilder = new Brackets(playoffTournament, this.context, {
      placeMatches: this.shouldPlaceMatches,
    });
    bracketBuilder.bracketSchedule.advanceTo(playoffStart);
    bracketBuilder.buildBrackets();

    const bracketMatches = Object.values(
      bracketBuilder.tournament.matches,
    ).sort((a, b) => (a.matchId || 0) - (b.matchId || 0));
    const playoffDurations = this.resolvePlayoffMatchDurations(
      durationMs,
      config,
    );
    const scheduledMatches: Match[] = [];
    for (const match of bracketMatches) {
      this.reparentAndPlacePlayoffMatch(
        match,
        teamLookup,
        playoffDurations,
        config,
      );
      scheduledMatches.push(match);
    }
    return scheduledMatches;
  }

  private createPlayoffTournament(
    seeded: Team[],
    tournamentDivisions: Division[],
    playoffStart: Date,
    config: PlayoffDivisionConfig,
  ): Tournament {
    const tournamentFields: Record<string, PlayingField> = {};
    for (const [fieldId, field] of Object.entries(this.event.fields)) {
      tournamentFields[fieldId] = new PlayingField({
        id: field.id,
        organizationId: field.organizationId,
        divisions: tournamentDivisions,
        matches: [],
        events: [],
        rentalSlots: [...field.rentalSlots],
        name: field.name,
      });
    }

    const tournamentTeams: Record<string, Team> = {};
    for (const team of seeded) {
      tournamentTeams[team.id] = new Team({
        id: team.id,
        captainId: team.captainId,
        division: team.division,
        name: team.name,
        matches: [],
        playerIds: [...team.playerIds],
      });
    }

    return new Tournament({
      id: `${this.event.id}-${tournamentDivisions.map((division) => division.id).join("-") || "playoffs"}`,
      name: `${this.event.name} Playoffs`,
      start: playoffStart,
      end: this.event.end,
      fields: tournamentFields,
      doubleElimination: config.doubleElimination,
      matches: {},
      location: this.event.location,
      organizationId: this.event.organizationId,
      winnerSetCount: config.winnerSetCount,
      loserSetCount: config.loserSetCount,
      winnerBracketPointsToVictory: [...config.winnerBracketPointsToVictory],
      loserBracketPointsToVictory: [...config.loserBracketPointsToVictory],
      prize: config.prize,
      fieldCount: config.fieldCount,
      teams: tournamentTeams,
      players: this.event.players,
      officials: this.event.officials,
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: seeded.length,
      teamSignup: true,
      divisions: tournamentDivisions,
      eventType: this.event.eventType,
      timeSlots: this.event.timeSlots,
      restTimeMinutes: config.restTimeMinutes,
      matchDurationMinutes:
        config.matchDurationMinutes ?? this.event.matchDurationMinutes,
      usesSets: this.event.usesSets,
      setDurationMinutes:
        config.setDurationMinutes ?? this.event.setDurationMinutes,
      officialSchedulingMode: this.event.officialSchedulingMode,
      staffingPriority: this.event.staffingPriority,
      officialPositions: this.event.officialPositions,
      matchRulesOverride: this.event.matchRulesOverride,
      autoCreatePointMatchIncidents: this.event.autoCreatePointMatchIncidents,
      resolvedMatchRules: this.event.resolvedMatchRules,
      eventOfficials: this.event.eventOfficials,
      doTeamsOfficiate: this.event.doTeamsOfficiate,
      teamOfficialsMaySwap: this.event.doTeamsOfficiate
        ? this.event.teamOfficialsMaySwap
        : false,
    });
  }

  private resolvePlayoffMatchDurations(
    durationMs: number,
    config: PlayoffDivisionConfig,
  ): PlayoffMatchDurations {
    const fallbackDurationMinutes = Math.max(
      1,
      Math.round(durationMs / MINUTE_MS),
    );
    return {
      bufferMs: Math.max(config.restTimeMinutes, 0) * MINUTE_MS,
      setDurationMs:
        this.normalizePositiveDuration(
          config.setDurationMinutes,
          this.event.setDurationMinutes || fallbackDurationMinutes,
        ) * MINUTE_MS,
      matchDurationMs:
        this.normalizePositiveDuration(
          config.matchDurationMinutes,
          this.event.matchDurationMinutes || fallbackDurationMinutes,
        ) * MINUTE_MS,
    };
  }

  private reparentAndPlacePlayoffMatch(
    match: Match,
    teamLookup: Record<string, Team>,
    durations: PlayoffMatchDurations,
    config: PlayoffDivisionConfig,
  ): void {
    // The bracket is built through a temporary Tournament, but its Match nodes
    // belong to the parent event once they are returned.
    match.eventId = this.event.id;
    if (this.shouldPlaceMatches) {
      match.unschedule();
    }
    this.replacePlayoffMatchTeams(match, teamLookup);

    match.bufferMs = durations.bufferMs;
    const playoffDurationMs = this.event.usesSets
      ? durations.setDurationMs *
        Math.max(
          1,
          match.losersBracket ? config.loserSetCount : config.winnerSetCount,
        )
      : durations.matchDurationMs;
    if (this.shouldPlaceMatches) {
      this.scheduleMatch(
        match,
        resolveScheduledMatchDurationMs(this.event, match, playoffDurationMs),
      );
    }
    this.attachMatchToParticipants(match);
  }
  private replacePlayoffMatchTeams(
    match: Match,
    teamLookup: Record<string, Team>,
  ): void {
    if (match.team1) {
      match.team1 = teamLookup[match.team1.id] ?? match.team1;
    }
    if (match.team2) {
      match.team2 = teamLookup[match.team2.id] ?? match.team2;
    }
    if (match.teamOfficial) {
      match.teamOfficial =
        teamLookup[match.teamOfficial.id] ?? match.teamOfficial;
    }
  }

  private scheduleMatch(match: Match, durationMs: number): void {
    const planner = this.officialStaffingPlanner;
    this.applyTeamOfficialRequirements(match, planner);
    const requiresOfficialCoverage = this.requiresOfficialCoverage(
      match,
      planner,
    );
    if (this.canUseCandidate || requiresOfficialCoverage) {
      this.scheduleMatchWithOptions(
        match,
        durationMs,
        planner,
        requiresOfficialCoverage,
      );
      if (requiresOfficialCoverage) {
        planner?.commitScheduledMatch(match);
      }
      return;
    }
    this.schedule.scheduleEvent(match, durationMs);
  }

  private applyTeamOfficialRequirements(
    match: Match,
    planner: OfficialStaffingPlanner | null,
  ): void {
    match.requiresTeamOfficial = planner?.isTeamDutyRequired(match) ?? false;
    match.reservesTeamOfficial =
      match.requiresTeamOfficial &&
      Boolean(planner?.isTeamDutySlotReserved(match));
  }

  private requiresOfficialCoverage(
    match: Match,
    planner: OfficialStaffingPlanner | null,
  ): boolean {
    if (!planner?.isHardOfficialCoverageRequired()) {
      return false;
    }
    return planner.hasRequiredSlots(match);
  }

  private scheduleMatchWithOptions(
    match: Match,
    durationMs: number,
    planner: OfficialStaffingPlanner | null,
    requiresOfficialCoverage: boolean,
  ): void {
    let candidateCount = 0;
    const evidence: ScheduleDiagnosticEvidence[] = [];
    try {
      this.schedule.scheduleEventWithOptions(match, durationMs, {
        canUseCandidate: ({ resource, start, end }) => {
          candidateCount += 1;
          const candidate = {
            kind: "PLACEMENT_SEARCH" as const,
            message: `Candidate Resource ${resource.id} at ${start.toISOString()} was rejected during placement.`,
            matchIds: [match.id],
            resourceIds: [resource.id],
            divisionIds: [match.division.id],
            intervals: [{ start: start.toISOString(), end: end.toISOString() }],
            candidateCount,
          };
          if (
            this.canUseCandidate
            && !this.canUseCandidate({ event: match, resource, start, end })
          ) {
            evidence.push(candidate);
            return false;
          }
          if (!requiresOfficialCoverage) return true;
          try {
            const staffable = planner?.previewSchedulingCandidate(match, resource, start, end) === true;
            if (!staffable) evidence.push({
              ...candidate,
              kind: "OFFICIAL_MATCHING",
              message: `Candidate Resource ${resource.id} at ${start.toISOString()} had no complete required Official assignment.`,
              officialIds: planner?.userById ? Array.from(planner.userById.keys()).sort() : [],
            });
            return staffable;
          } catch (error) {
            if (error instanceof ScheduleError) {
              evidence.push({
                ...candidate,
                kind: "OFFICIAL_MATCHING",
                message: error.message,
                officialIds: planner?.userById ? Array.from(planner.userById.keys()).sort() : [],
              });
              return false;
            }
            throw error;
          }
        },
        candidateFailureFactor: requiresOfficialCoverage
          ? "NAMED_OFFICIAL_POSITION"
          : "RESOURCE",
      });
    } catch (error) {
      if (!(error instanceof ScheduleError) || candidateCount === 0) {
        throw error;
      }
      const restrictingFactor = error.restrictingFactor === "NAMED_OFFICIAL_POSITION"
        && evidence.length > 0
        && evidence.every((entry) => entry.kind === "PLACEMENT_SEARCH")
        ? "RESOURCE"
        : error.restrictingFactor;
      throw new ScheduleError(error.message, restrictingFactor, {
        diagnosticEvidence: evidence,
        candidateCount,
        searchExhaustive: true,
      });
    }
  }

  private resolvePlayoffParticipantCount(
    division: Division,
    fallbackTeamCount: number,
  ): number {
    const isSplitLeaguePlayoffTarget =
      this.isSplitLeaguePlayoffTarget(division);
    this.validateSplitPlayoffCapacity(division, isSplitLeaguePlayoffTarget);
    if (fallbackTeamCount < MIN_BRACKET_TEAM_COUNT) {
      return 0;
    }
    const explicitDivisionCount =
      this.resolveExplicitPlayoffParticipantCount(
        division,
        isSplitLeaguePlayoffTarget,
      );
    const eventPlayoffTeamCount = finiteNumberValue(
      this.event.playoffTeamCount,
    );
    const leagueCount = eventPlayoffTeamCount === null
      ? MIN_BRACKET_TEAM_COUNT
      : Math.max(
          MIN_BRACKET_TEAM_COUNT,
          Math.trunc(eventPlayoffTeamCount),
        );
    const configured = explicitDivisionCount ?? leagueCount;
    return Math.min(configured, fallbackTeamCount);
  }

  private isSplitLeaguePlayoffTarget(division: Division): boolean {
    if (!this.isLeague) {
      return false;
    }
    if (!this.useSplitPlayoffDivisions) {
      return false;
    }
    return division.kind === "PLAYOFF";
  }

  private validateSplitPlayoffCapacity(
    division: Division,
    isSplitLeaguePlayoffTarget: boolean,
  ): void {
    if (!isSplitLeaguePlayoffTarget) {
      return;
    }
    if (finiteNumberValue(division.maxParticipants) !== null) {
      return;
    }
    throw new ScheduleError(
      `Split League playoff division "${division.name ?? division.id}" requires maxParticipants.`,
      "PLAYING_TEAM",
    );
  }

  private resolveExplicitPlayoffParticipantCount(
    division: Division,
    isSplitLeaguePlayoffTarget: boolean,
  ): number | null {
    if (isSplitLeaguePlayoffTarget) {
      return Math.max(
        MIN_BRACKET_TEAM_COUNT,
        Math.trunc(division.maxParticipants as number),
      );
    }
    const divisionPlayoffTeamCount = finiteNumberValue(
      division.playoffTeamCount,
    );
    if (divisionPlayoffTeamCount !== null) {
      return Math.max(
        MIN_BRACKET_TEAM_COUNT,
        Math.trunc(divisionPlayoffTeamCount),
      );
    }
    const divisionMaxParticipants = finiteNumberValue(
      division.maxParticipants,
    );
    if (divisionMaxParticipants !== null) {
      return Math.max(
        MIN_BRACKET_TEAM_COUNT,
        Math.trunc(divisionMaxParticipants),
      );
    }
    return null;
  }


  private assignChronologicalMatchIds(matches: Match[]): void {
    const ordered = [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      const fieldDiff = (a.field?.id ?? "").localeCompare(b.field?.id ?? "");
      if (fieldDiff !== 0) return fieldDiff;
      return a.id.localeCompare(b.id);
    });
    ordered.forEach((match, index) => {
      match.matchId = index + 1;
    });
  }
  private assignUserOfficials(matches: Match[]): void {
    const planner =
      this.officialStaffingPlanner ?? new OfficialStaffingPlanner(this.event);
    this.officialStaffingPlanner = planner;
    if (!matches.some((match) => planner.hasRequiredSlots(match))) {
      return;
    }
    if (planner.isHardOfficialCoverageRequired()) {
      const unstaffedMatch = matches.find(
        (match) =>
          planner.hasRequiredSlots(match)
          && !planner.hasCommittedAssignments(match),
      );
      if (unstaffedMatch) {
        throw new ScheduleError("Unable to fully staff all matches without conflicts.", "NAMED_OFFICIAL_POSITION");
      }
      return;
    }
    planner.assignMatches(matches);
  }

  private assignTeamOfficials(matches: Match[]): void {
    const teams = Object.values(this.event.teams);
    const unassigned = [...teams];
    const divisionById = new Map(
      this.schedulingDivisions().map((division) => [division.id, division]),
    );
    const ordered = this.orderTeamOfficialMatches(matches);
    const planner = this.officialStaffingPlanner;
    for (const match of ordered) {
      this.attachMatchToParticipants(match);
      if (this.shouldSkipTeamOfficialAssignment(match, planner)) {
        continue;
      }
      if (!planner) {
        continue;
      }
      const candidateDivisionIds =
        this.resolveTeamOfficialCandidateDivisionIds(match.division);
      const candidateDivisions = Array.from(candidateDivisionIds)
        .map((divisionId) => divisionById.get(divisionId))
        .filter((division): division is Division => Boolean(division));
      const availableTeams = this.findAvailableTeamOfficials(
        match,
        candidateDivisions,
        candidateDivisionIds,
        teams,
        planner,
      );
      const filtered = availableTeams.filter(
        (team) =>
          team.id !== match.team1?.id && team.id !== match.team2?.id,
      );
      const candidate = this.selectTeamOfficialCandidate(unassigned, filtered);
      if (candidate) {
        this.assignTeamOfficial(match, candidate);
      }
    }
  }

  private orderTeamOfficialMatches(matches: Match[]): Match[] {
    return [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      return (a.field?.id ?? "").localeCompare(b.field?.id ?? "");
    });
  }

  private shouldSkipTeamOfficialAssignment(
    match: Match,
    planner: OfficialStaffingPlanner | null,
  ): boolean {
    if (match.teamOfficial || !match.division || !planner) {
      return true;
    }
    if (!planner.isTeamDutyRequired(match)) {
      return true;
    }
    if (
      (!match.team1 || !match.team2)
      && !planner.isHardTeamCoverageRequired(match)
    ) {
      return true;
    }
    return !planner.isTeamDutyCandidatePoolEnabled(match);
  }

  private resolveTeamOfficialCandidateDivisionIds(
    division: Division,
  ): Set<string> {
    const candidateDivisionIds = new Set([division.id]);
    const targetDivisionId = division.id.trim().toLowerCase();
    for (const sourceDivision of this.event.divisions) {
      const mapsToTarget = sourceDivision.playoffPlacementDivisionIds.some(
        (divisionId) => divisionId.trim().toLowerCase() === targetDivisionId,
      );
      if (mapsToTarget) {
        candidateDivisionIds.add(sourceDivision.id);
      }
    }
    for (const mappedDivisionId of division.playoffPlacementDivisionIds) {
      candidateDivisionIds.add(mappedDivisionId);
    }
    return candidateDivisionIds;
  }

  private findAvailableTeamOfficials(
    match: Match,
    candidateDivisions: Division[],
    candidateDivisionIds: Set<string>,
    teams: Team[],
    planner: OfficialStaffingPlanner,
  ): Team[] {
    const availableTeamsById = new Map<string, Team>();
    for (const division of candidateDivisions) {
      const freeTeams = this.schedule
        .freeParticipants(
          division,
          match.start,
          match.end,
          match.bufferMs,
        )
        .filter((participant) => participant instanceof Team) as Team[];
      for (const team of freeTeams) {
        availableTeamsById.set(team.id, team);
      }
    }
    if (planner.isTeamDutyConflictAllowed()) {
      for (const team of teams) {
        if (!candidateDivisionIds.has(team.division?.id ?? "")) continue;
        availableTeamsById.set(team.id, team);
      }
    }
    return Array.from(availableTeamsById.values());
  }

  private selectTeamOfficialCandidate(
    unassigned: Team[],
    availableTeams: Team[],
  ): Team | null {
    for (let i = 0; i < unassigned.length; i += 1) {
      const candidateTeam = unassigned[0];
      unassigned.push(unassigned.shift() as Team);
      if (availableTeams.includes(candidateTeam)) {
        const idx = unassigned.indexOf(candidateTeam);
        if (idx >= 0) unassigned.splice(idx, 1);
        return candidateTeam;
      }
    }
    return availableTeams[0] ?? null;
  }

  private assignTeamOfficial(match: Match, candidate: Team): void {
    match.teamOfficial = candidate;
    candidate.matches.push(match);
    this.attachMatchToParticipants(match);
  }
}
