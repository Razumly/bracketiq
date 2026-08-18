import type { DivisionCompetitionPhase } from "@/types";
import type { Match, MatchPlacementState } from "./types";

export type MatchDemand = {
  total: number;
  byDivision: Record<string, number>;
  byPhase: Partial<Record<DivisionCompetitionPhase | "UNSPECIFIED", number>>;
  placed: number;
  unplaced: number;
};

export type PersistedMatchGraphRow = {
  divisionId?: string | null;
  phase?: DivisionCompetitionPhase | string | null;
  placementState?: MatchPlacementState | string | null;
  fieldId?: string | null;
};
export type PersistedMatchGraphDivision = {
  id: string;
  phase?: DivisionCompetitionPhase | string | null;
};

export class MatchGraphInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchGraphInvariantError";
  }
}

export const assertUnplacedMatchGraph = (matches: Match[]): void => {
  for (const match of matches) {
    if (match.placementState !== "UNPLACED" || match.field !== null) {
      throw new MatchGraphInvariantError(
        `Match Graph node ${match.id} must be unplaced and resource-free.`,
      );
    }
  }
};

export const assertPhaseOwnedMatchGraph = (matches: Match[]): void => {
  for (const match of matches) {
    const phase = normalizePhase(match.division.phase);
    if (match.division.role !== "PHASE" || phase === "UNSPECIFIED") {
      throw new MatchGraphInvariantError(
        `Match Graph node ${match.id} must belong to a Phase Division.`,
      );
    }
  }
};

export const rekeyMatchGraph = (
  eventId: string,
  matches: Match[],
): Match[] => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    throw new MatchGraphInvariantError(
      "Cannot assign stable Match Graph IDs without an Event ID.",
    );
  }
  const ordered = [...matches];
  const oldIds = new Set<string>();
  for (const match of ordered) {
    if (oldIds.has(match.id)) {
      throw new MatchGraphInvariantError(
        `Match Graph contains duplicate node ID ${match.id}.`,
      );
    }
    oldIds.add(match.id);
  }
  ordered.forEach((match, index) => {
    match.id = `${normalizedEventId}:match:${index + 1}`;
    match.matchId = index + 1;
  });
  return ordered;
};
const normalizePhase = (
  value: DivisionCompetitionPhase | string | null | undefined,
): DivisionCompetitionPhase | "UNSPECIFIED" => {
  const phase = String(value ?? "")
    .trim()
    .toUpperCase();
  return phase === "LEAGUE" ||
    phase === "POOL" ||
    phase === "BRACKET" ||
    phase === "PLAYOFF"
    ? phase
    : "UNSPECIFIED";
};

const isPlacedPersistedMatch = (row: PersistedMatchGraphRow): boolean =>
  String(row.placementState ?? "")
    .trim()
    .toUpperCase() === "PLACED" || Boolean(String(row.fieldId ?? "").trim());

const demandFromRows = (
  rows: PersistedMatchGraphRow[],
  phaseByDivision: Map<string, DivisionCompetitionPhase | string> = new Map(),
): MatchDemand => {
  const byDivision: Record<string, number> = {};
  const byPhase: Partial<
    Record<DivisionCompetitionPhase | "UNSPECIFIED", number>
  > = {};
  let placed = 0;
  for (const row of rows) {
    const divisionId = String(row.divisionId ?? "").trim() || "UNASSIGNED";
    byDivision[divisionId] = (byDivision[divisionId] ?? 0) + 1;
    const phase = normalizePhase(row.phase ?? phaseByDivision.get(divisionId));
    byPhase[phase] = (byPhase[phase] ?? 0) + 1;
    if (isPlacedPersistedMatch(row)) placed += 1;
  }
  return {
    total: rows.length,
    byDivision,
    byPhase,
    placed,
    unplaced: rows.length - placed,
  };
};

export const matchDemandFromPersistedGraph = (
  rows: PersistedMatchGraphRow[],
  divisions: PersistedMatchGraphDivision[] = [],
): MatchDemand => {
  const phaseByDivision = new Map(
    divisions.map((division) => [division.id, division.phase ?? "UNSPECIFIED"]),
  );
  return demandFromRows(rows, phaseByDivision);
};

export type PersistedMatchGraphNode = {
  id: string;
  matchId: number | null;
  divisionId: string;
  phase: DivisionCompetitionPhase | null;
  team1Id: string | null;
  team2Id: string | null;
  team1Seed: number | null;
  team2Seed: number | null;
  previousLeftMatchId: string | null;
  previousRightMatchId: string | null;
  winnerNextMatchId: string | null;
  loserNextMatchId: string | null;
  losersBracket: boolean;
  placementState: MatchPlacementState;
  start: string | null;
  end: string | null;
};

const phaseForMatch = (
  match: Match,
): DivisionCompetitionPhase | "UNSPECIFIED" =>
  match.division.phase ?? "UNSPECIFIED";

export const matchDemandFromGraph = (matches: Match[]): MatchDemand => {
  const byDivision: Record<string, number> = {};
  const byPhase: Partial<
    Record<DivisionCompetitionPhase | "UNSPECIFIED", number>
  > = {};
  let placed = 0;
  for (const match of matches) {
    byDivision[match.division.id] = (byDivision[match.division.id] ?? 0) + 1;
    const phase = phaseForMatch(match);
    byPhase[phase] = (byPhase[phase] ?? 0) + 1;
    if (match.placementState === "PLACED") placed += 1;
  }
  return {
    total: matches.length,
    byDivision,
    byPhase,
    placed,
    unplaced: matches.length - placed,
  };
};

export const serializeMatchGraph = (
  matches: Match[],
): PersistedMatchGraphNode[] =>
  matches.map((match) => ({
    id: match.id,
    matchId: match.matchId,
    divisionId: match.division.id,
    phase: match.division.phase ?? null,
    team1Id: match.team1?.id ?? null,
    team2Id: match.team2?.id ?? null,
    team1Seed: match.team1Seed,
    team2Seed: match.team2Seed,
    previousLeftMatchId: match.previousLeftMatch?.id ?? null,
    previousRightMatchId: match.previousRightMatch?.id ?? null,
    winnerNextMatchId: match.winnerNextMatch?.id ?? null,
    loserNextMatchId: match.loserNextMatch?.id ?? null,
    losersBracket: Boolean(match.losersBracket),
    placementState: match.placementState,
    start:
      match.placementState === "PLACED" && match.start
        ? match.start.toISOString()
        : null,
    end:
      match.placementState === "PLACED" && match.end
        ? match.end.toISOString()
        : null,
  }));

export const topologicallySortMatchGraph = (matches: Match[]): Match[] => {
  const sourceOrder = new Map(matches.map((match, index) => [match.id, index]));
  const remaining = new Map(matches.map((match) => [match.id, match]));
  const result: Match[] = [];
  while (remaining.size) {
    const next = [...remaining.values()]
      .filter((match) =>
        match
          .getDependencies()
          .every((dependency) => !remaining.has(dependency.id)),
      )
      .sort((left, right) => (
        (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      ))[0];
    if (!next) {
      throw new Error("Match graph contains a dependency cycle.");
    }
    remaining.delete(next.id);
    result.push(next);
  }
  return result;
};
