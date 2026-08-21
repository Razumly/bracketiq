import crypto from "crypto";
import { MIN_BRACKET_TEAM_COUNT } from "@/lib/divisionTypes";
import { Brackets } from "./Brackets";
import { OfficialStaffingPlanner } from "./officialStaffing";
import { ScheduleError } from "./scheduleErrors";
import { Schedule } from "./Schedule";
import {
  applyDivisionPhaseRulesToMatch,
  resolveScheduledMatchDurationMs,
} from "./divisionPhaseRules";
import { resolveMatchTimingPolicy } from "./matchTimingPolicy";
import {
  buildMatchSchedulingBatches,
  validateMatchBatchBoundaries,
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
};

type RegularSeasonMatchConfig = {
  gamesPerOpponent: number;
  durationMs: number;
  bufferMs: number;
  usesSets: boolean;
  setsPerMatch: number;
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

  constructor(
    event: League | Tournament,
    context: SchedulerContext,
    options: EventBuilderOptions = {},
  ) {
    this.context = context;
    this.event = event;
    this.includePlaceholderTeams = options.includePlaceholderTeams !== false;
    this.canUseCandidate = options.canUseCandidate;
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
    for (const team of Object.values(this.event.teams)) {
      if (String(team.kind ?? "").trim().toUpperCase() !== "PLACEHOLDER") {
        continue;
      }
      const phase = String(team.division?.phase ?? team.division?.kind ?? "")
        .trim()
        .toUpperCase();
      if (phase === "PLAYOFF" || phase === "BRACKET") {
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
    this.ensureFieldsAvailable();
    const matches = Object.values(this.event.matches);
    if (!matches.length) {
      return this.event;
    }
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

    const batches = buildMatchSchedulingBatches(
      this.event,
      matches,
      this.placementDivisions(),
    );
    const orderedMatches = batches.flatMap((batch) => batch.matches);
    for (const batch of batches) {
      for (const match of batch.matches) {
        this.placeGraphMatch(match);
      }
      const maxEnd = batch.matches.reduce(
        (latest, match) => (
          match.end.getTime() > latest.getTime() ? match.end : latest
        ),
        batch.matches[0]?.end ?? this.event.start,
      );
      this.schedule.advanceTo(maxEnd);
    }

    validateMatchBatchBoundaries(batches);
    if (!options.preserveMatchIds) {
      this.assignChronologicalMatchIds(orderedMatches);
    }
    this.assignUserOfficials(orderedMatches);
    const planner = this.officialStaffingPlanner;
    if (planner && orderedMatches.some((match) => planner.isTeamDutyRequired(match))) {
      this.assignTeamOfficials(orderedMatches);
    }

    if (planner?.isHardTeamCoverageRequired()) {
      const unstaffedMatch = orderedMatches.find(
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
    for (const field of Object.values(this.event.fields)) {
      field.matches = [...orderedMatches];
    }
    this.event.matches = Object.fromEntries(
      orderedMatches.map((match) => [match.id, match]),
    );
    return this.event;
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
      if (!official.divisions.length)
        official.divisions = [...officialDivisions];
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
    if (targetCount < 2) targetCount = 2;
    if (Object.keys(this.event.teams).length >= targetCount) return;
    const divisions =
      this.event.singleDivision || this.event.divisions.length === 0
        ? [this.defaultDivision()]
        : [...this.event.divisions];
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

    if (divisionTargets && divisionTargets.size && !this.event.singleDivision) {
      for (const [divisionId, target] of divisionTargets.entries()) {
        if (!Number.isFinite(target)) continue;
        const normalizedTarget = Math.max(0, Math.trunc(target));
        if (normalizedTarget < 1) continue;
        const division =
          divisions.find((entry) => entry.id === divisionId) ??
          this.defaultDivision();
        const currentCount = placeholderCounts.get(division.id) ?? 0;
        const missing = Math.max(0, normalizedTarget - currentCount);
        for (let index = 0; index < missing; index += 1) {
          this.addPlaceholderTeam(division, placeholderCounts);
        }
      }
    }

    const pickDivisionForPlaceholder = (): Division => {
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
    };

    while (Object.keys(this.event.teams).length < targetCount) {
      this.addPlaceholderTeam(pickDivisionForPlaceholder(), placeholderCounts);
    }
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
    const safeDivisionId = division.id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    for (let seedIndex = 0; seedIndex < count; seedIndex += 1) {
      const placeholderId = this.generatePlaceholderId(
        `playoff-${safeDivisionId}`,
      );
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
    if (this.event.singleDivision || this.event.divisions.length === 0) {
      return {
        total: Math.max(teamCount, maxParticipants, 2),
        byDivision: null,
      };
    }

    const participantsByDivision = new Map<string, number>();
    for (const team of Object.values(this.event.teams)) {
      const divisionId = team.division?.id ?? this.defaultDivision().id;
      participantsByDivision.set(
        divisionId,
        (participantsByDivision.get(divisionId) ?? 0) + 1,
      );
    }

    const configuredDivisions = this.event.divisions.length
      ? this.event.divisions
      : [this.defaultDivision()];
    const divisionFallbackCapacity =
      maxParticipants > 0
        ? Math.ceil(maxParticipants / Math.max(configuredDivisions.length, 1))
        : 0;

    const byDivision = new Map<string, number>();
    for (const division of configuredDivisions) {
      const currentCount = participantsByDivision.get(division.id) ?? 0;
      const configuredCapacity =
        typeof division.maxParticipants === "number" &&
        Number.isFinite(division.maxParticipants)
          ? Math.max(0, Math.trunc(division.maxParticipants))
          : divisionFallbackCapacity;
      byDivision.set(division.id, Math.max(currentCount, configuredCapacity));
      participantsByDivision.delete(division.id);
    }

    for (const [divisionId, count] of participantsByDivision.entries()) {
      byDivision.set(divisionId, count);
    }

    const divisionCapacityTotal = Array.from(byDivision.values()).reduce(
      (sum, count) => sum + Math.max(0, count),
      0,
    );
    return {
      total: Math.max(teamCount, divisionCapacityTotal, 2),
      byDivision,
    };
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
    if (!this.event.singleDivision) {
      if (
        team1?.division &&
        team2?.division &&
        team1.division.id === team2.division.id
      ) {
        return team1.division;
      }
      if (team1?.division) {
        return team1.division;
      }
      if (team2?.division) {
        return team2.division;
      }
    }
    return this.defaultDivision();
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
    const divisionConfig: LeagueDivisionConfig | null =
      this.isLeague || this.isTournamentPoolPlay
        ? (division?.leagueConfig ?? null)
        : null;
    const usesSets =
      typeof divisionConfig?.usesSets === "boolean"
        ? divisionConfig.usesSets
        : Boolean(this.event.usesSets);
    const matchRulesOverride =
      this.event.matchRulesOverride &&
      typeof this.event.matchRulesOverride === "object"
        ? (this.event.matchRulesOverride as Record<string, unknown>)
        : {};
    const gamesPerOpponent =
      this.isLeague || this.isTournamentPoolPlay
        ? this.normalizePositiveInt(
            divisionConfig?.gamesPerOpponent,
            this.event.gamesPerOpponent || 1,
          )
        : 1;
    const restTimeMinutes = this.normalizeNonNegativeInt(
      divisionConfig?.restTimeMinutes,
      this.event.restTimeMinutes ?? 0,
    );
    const timing = resolveMatchTimingPolicy({
      usesSets,
      segmentCount:
        divisionConfig?.setsPerMatch ??
        (typeof matchRulesOverride.segmentCount === "number"
          ? matchRulesOverride.segmentCount
          : null),
      segmentLengthMinutes:
        divisionConfig?.setDurationMinutes ??
        (typeof matchRulesOverride.segmentLengthMinutes === "number"
          ? matchRulesOverride.segmentLengthMinutes
          : null),
      segmentBreakMinutes:
        typeof matchRulesOverride.segmentBreakMinutes === "number"
          ? matchRulesOverride.segmentBreakMinutes
          : null,
      setsPerMatch: divisionConfig?.setsPerMatch ?? this.event.setsPerMatch,
      setDurationMinutes:
        divisionConfig?.setDurationMinutes ?? this.event.setDurationMinutes,
      matchDurationMinutes:
        divisionConfig?.matchDurationMinutes ?? this.event.matchDurationMinutes,
      restTimeMinutes,
    });
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

    if (this.event.singleDivision) {
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

    if (this.useSplitPlayoffDivisions) {
      const scheduledMatches: Match[] = [];
      const playoffStart =
        this.schedule.currentTime.getTime() > this.event.start.getTime()
          ? this.schedule.currentTime
          : this.event.start;
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

    const resolveDivisionPlayoffCount = (
      division: Division,
      teamCount: number,
    ): number => this.resolvePlayoffParticipantCount(division, teamCount);
    const seeded: Team[] = [];
    if (this.event.singleDivision) {
      const league = this.event as League;
      const playoffDivision =
        this.phasePlayoffDivisionFor(this.defaultDivision()) ??
        this.defaultDivision();
      const playoffCount = Math.min(
        league.playoffTeamCount ?? MIN_BRACKET_TEAM_COUNT,
        participants.length,
      );
      if (playoffCount < MIN_BRACKET_TEAM_COUNT) return [];
      seeded.push(
        ...this.buildLeaguePlayoffPlaceholders(playoffCount, playoffDivision),
      );
      if (seeded.length < MIN_BRACKET_TEAM_COUNT) {
        return [];
      }
      const playoffStart =
        this.schedule.currentTime.getTime() > this.event.start.getTime()
          ? this.schedule.currentTime
          : this.event.start;
      const config = this.resolvePlayoffTournamentConfig(playoffDivision);
      return this.scheduleLeaguePlayoffBracket(
        seeded,
        [playoffDivision],
        durationMs,
        playoffStart,
        config,
      );
    }

    const playoffStart =
      this.schedule.currentTime.getTime() > this.event.start.getTime()
        ? this.schedule.currentTime
        : this.event.start;
    const scheduledMatches: Match[] = [];
    const groupedByDivision = this.groupsByDivision(participants);
    for (const { division, teams } of groupedByDivision) {
      const playoffDivision =
        this.phasePlayoffDivisionFor(division) ?? division;
      const divisionPlayoffCount = resolveDivisionPlayoffCount(
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
    const normalizePositiveInt = (value: unknown, fallback: number): number => {
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(1, Math.trunc(parsed));
    };
    const normalizeNonNegativeInt = (
      value: unknown,
      fallback: number,
    ): number => {
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.trunc(parsed));
    };
    const normalizeOptionalNonNegativeInt = (
      value: unknown,
      fallback: unknown,
    ): number | undefined => {
      const parsed =
        value === null || value === undefined || value === ""
          ? NaN
          : typeof value === "number"
            ? value
            : Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
      }
      const parsedFallback =
        fallback === null || fallback === undefined || fallback === ""
          ? NaN
          : typeof fallback === "number"
            ? fallback
            : Number(fallback);
      return Number.isFinite(parsedFallback)
        ? Math.max(0, Math.trunc(parsedFallback))
        : undefined;
    };
    const normalizePoints = (
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

    const doubleElimination =
      typeof divisionConfig?.doubleElimination === "boolean"
        ? divisionConfig.doubleElimination
        : Boolean(this.event.doubleElimination);
    const winnerSetCount = normalizePositiveInt(
      divisionConfig?.winnerSetCount,
      typeof this.event.winnerSetCount === "number" &&
        Number.isFinite(this.event.winnerSetCount)
        ? this.event.winnerSetCount
        : 1,
    );
    const fallbackLoserSetCount =
      typeof this.event.loserSetCount === "number" &&
      Number.isFinite(this.event.loserSetCount)
        ? this.event.loserSetCount
        : 1;
    const rawLoserSetCount = normalizePositiveInt(
      divisionConfig?.loserSetCount,
      fallbackLoserSetCount,
    );
    const loserSetCount = doubleElimination ? rawLoserSetCount : 1;
    const enforceSingleSet = !this.event.usesSets;
    const normalizedWinnerSetCount = enforceSingleSet ? 1 : winnerSetCount;
    const normalizedLoserSetCount = enforceSingleSet ? 1 : loserSetCount;
    const winnerPointsFallback = Array.isArray(
      this.event.winnerBracketPointsToVictory,
    )
      ? this.event.winnerBracketPointsToVictory
      : [];
    const loserPointsFallback = Array.isArray(
      this.event.loserBracketPointsToVictory,
    )
      ? this.event.loserBracketPointsToVictory
      : [];
    const fallbackFieldCount = (() => {
      const configuredFieldCount = Object.keys(this.event.fields ?? {}).length;
      if (configuredFieldCount > 0) {
        return configuredFieldCount;
      }
      if (
        typeof this.event.fieldCount === "number" &&
        Number.isFinite(this.event.fieldCount)
      ) {
        return Math.max(1, Math.trunc(this.event.fieldCount));
      }
      return 1;
    })();

    return {
      doubleElimination,
      winnerSetCount: normalizedWinnerSetCount,
      loserSetCount: normalizedLoserSetCount,
      winnerBracketPointsToVictory: normalizePoints(
        divisionConfig?.winnerBracketPointsToVictory,
        normalizedWinnerSetCount,
        winnerPointsFallback,
      ),
      loserBracketPointsToVictory: normalizePoints(
        divisionConfig?.loserBracketPointsToVictory,
        normalizedLoserSetCount,
        loserPointsFallback,
      ),
      prize:
        typeof divisionConfig?.prize === "string"
          ? divisionConfig.prize
          : (this.event.prize ?? ""),
      fieldCount: normalizePositiveInt(
        divisionConfig?.fieldCount,
        fallbackFieldCount,
      ),
      restTimeMinutes: normalizeNonNegativeInt(
        divisionConfig?.restTimeMinutes,
        typeof this.event.restTimeMinutes === "number" &&
          Number.isFinite(this.event.restTimeMinutes)
          ? this.event.restTimeMinutes
          : 0,
      ),
      matchDurationMinutes: normalizeOptionalNonNegativeInt(
        divisionConfig?.matchDurationMinutes,
        this.event.matchDurationMinutes,
      ),
      setDurationMinutes: normalizeOptionalNonNegativeInt(
        divisionConfig?.setDurationMinutes,
        this.event.setDurationMinutes,
      ),
    };
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

    const playoffTournament = new Tournament({
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
    const bracketBuilder = new Brackets(playoffTournament, this.context, {
      placeMatches: this.shouldPlaceMatches,
    });
    bracketBuilder.bracketSchedule.advanceTo(playoffStart);
    bracketBuilder.buildBrackets();

    const bracketMatches = Object.values(
      bracketBuilder.tournament.matches,
    ).sort((a, b) => (a.matchId || 0) - (b.matchId || 0));
    const scheduledMatches: Match[] = [];
    const playoffBufferMs = Math.max(config.restTimeMinutes, 0) * MINUTE_MS;
    const playoffSetDurationMs =
      this.normalizePositiveDuration(
        config.setDurationMinutes,
        this.event.setDurationMinutes ||
          Math.max(1, Math.round(durationMs / MINUTE_MS)),
      ) * MINUTE_MS;
    const playoffMatchDurationMs =
      this.normalizePositiveDuration(
        config.matchDurationMinutes,
        this.event.matchDurationMinutes ||
          Math.max(1, Math.round(durationMs / MINUTE_MS)),
      ) * MINUTE_MS;
    for (const match of bracketMatches) {
      if (this.shouldPlaceMatches) {
        match.unschedule();
      }
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
      match.bufferMs = playoffBufferMs;
      const playoffDurationMs = this.event.usesSets
        ? playoffSetDurationMs *
          Math.max(
            1,
            match.losersBracket ? config.loserSetCount : config.winnerSetCount,
          )
        : playoffMatchDurationMs;
      if (this.shouldPlaceMatches) {
        this.scheduleMatch(
          match,
          resolveScheduledMatchDurationMs(this.event, match, playoffDurationMs),
        );
      }
      this.attachMatchToParticipants(match);
      scheduledMatches.push(match);
    }
    return scheduledMatches;
  }

  private scheduleMatch(match: Match, durationMs: number): void {
    const planner = this.officialStaffingPlanner;
    match.requiresTeamOfficial = planner?.isTeamDutyRequired(match) ?? false;
    match.reservesTeamOfficial =
      match.requiresTeamOfficial &&
      Boolean(planner?.isTeamDutySlotReserved(match));
    const requiresOfficialCoverage = Boolean(
      planner?.isHardOfficialCoverageRequired() &&
      planner.hasRequiredSlots(match),
    );
    if (this.canUseCandidate || requiresOfficialCoverage) {
      this.schedule.scheduleEventWithOptions(match, durationMs, {
        canUseCandidate: ({ resource, start, end }) => (
          (this.canUseCandidate?.({ event: match, resource, start, end }) ?? true) &&
          (!requiresOfficialCoverage || planner?.previewSchedulingCandidate(match, resource, start, end) === true)
        ),
      });
      if (requiresOfficialCoverage) {
        planner?.commitScheduledMatch(match);
      }
      return;
    }
    this.schedule.scheduleEvent(match, durationMs);
  }

  private resolvePlayoffParticipantCount(
    division: Division,
    fallbackTeamCount: number,
  ): number {
    const isSplitLeaguePlayoffTarget =
      this.isLeague &&
      this.useSplitPlayoffDivisions &&
      division.kind === "PLAYOFF";
    if (
      isSplitLeaguePlayoffTarget &&
      (typeof division.maxParticipants !== "number" ||
        !Number.isFinite(division.maxParticipants))
    ) {
      throw new ScheduleError(
        `Split League playoff division "${division.name ?? division.id}" requires maxParticipants.`,
        "PLAYING_TEAM",
      );
    }
    if (fallbackTeamCount < MIN_BRACKET_TEAM_COUNT) {
      return 0;
    }
    const explicitDivisionCount = (() => {
      if (isSplitLeaguePlayoffTarget) {
        return Math.max(
          MIN_BRACKET_TEAM_COUNT,
          Math.trunc(division.maxParticipants as number),
        );
      }
      if (
        typeof division.playoffTeamCount === "number" &&
        Number.isFinite(division.playoffTeamCount)
      ) {
        return Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(division.playoffTeamCount));
      }
      if (
        typeof division.maxParticipants === "number" &&
        Number.isFinite(division.maxParticipants)
      ) {
        return Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(division.maxParticipants));
      }
      return null;
    })();
    const eventPlayoffTeamCount = this.event.playoffTeamCount;
    const leagueCount =
      typeof eventPlayoffTeamCount === "number" &&
      Number.isFinite(eventPlayoffTeamCount)
        ? Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(eventPlayoffTeamCount))
        : MIN_BRACKET_TEAM_COUNT;
    const configured = explicitDivisionCount ?? leagueCount;
    return Math.min(configured, fallbackTeamCount);
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
    const ordered = [...matches].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.end.getTime() - b.end.getTime();
      if (endDiff !== 0) return endDiff;
      return (a.field?.id ?? "").localeCompare(b.field?.id ?? "");
    });
    const planner = this.officialStaffingPlanner;
    for (const match of ordered) {
      this.attachMatchToParticipants(match);
      if (
        match.teamOfficial
        || !match.division
        || !planner?.isTeamDutyRequired(match)
      ) {
        continue;
      }
      if (
        (!match.team1 || !match.team2)
        && !planner.isHardTeamCoverageRequired(match)
      ) {
        continue;
      }
      if (!planner.isTeamDutyCandidatePoolEnabled(match)) {
        continue;
      }
      const candidateDivisionIds = new Set([match.division.id]);
      const targetDivisionId = match.division.id.trim().toLowerCase();
      for (const sourceDivision of this.event.divisions) {
        const mapsToTarget = sourceDivision.playoffPlacementDivisionIds.some(
          (divisionId) => divisionId.trim().toLowerCase() === targetDivisionId,
        );
        if (mapsToTarget) {
          candidateDivisionIds.add(sourceDivision.id);
        }
      }
      for (const mappedDivisionId of match.division.playoffPlacementDivisionIds) {
        candidateDivisionIds.add(mappedDivisionId);
      }
      const candidateDivisions = Array.from(candidateDivisionIds)
        .map((divisionId) => divisionById.get(divisionId))
        .filter((division): division is Division => Boolean(division));
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
      const availableTeams = Array.from(availableTeamsById.values());
      const filtered = availableTeams.filter(
        (team) =>
          team.id !== match.team1?.id && team.id !== match.team2?.id,
      );
      let candidate: Team | null = null;
      for (let i = 0; i < unassigned.length; i += 1) {
        const candidateTeam = unassigned[0];
        unassigned.push(unassigned.shift() as Team);
        if (filtered.includes(candidateTeam)) {
          candidate = candidateTeam;
          const idx = unassigned.indexOf(candidateTeam);
          if (idx >= 0) unassigned.splice(idx, 1);
          break;
        }
      }
      if (!candidate) {
        candidate = filtered[0] ?? null;
      }
      if (candidate) {
        match.teamOfficial = candidate;
        candidate.matches.push(match);
        this.attachMatchToParticipants(match);
      }
    }
  }
}
