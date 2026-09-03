import type { EventEditorScheduleDiagnostics } from "@/contracts/eventEditor";
import {
  enumerateRepeatingTimeSlotOccurrences,
} from "@/lib/repeatingTimeSlotAvailability";
import {
  resolveOneTimeTimeSlot,
  type ResolvedOneTimeTimeSlot,
} from "@/lib/timeSlotAvailability";
import {
  applyDivisionPhaseRulesToMatch,
  resolveScheduledMatchDurationMs,
} from "./divisionPhaseRules";
import { matchDemandFromGraph, type MatchDemand } from "./matchGraph";
import { resolveMatchTimingPolicy } from "./matchTimingPolicy";
import type { ScheduleFailureFactor } from "./scheduleErrors";
import {
  Division,
  League,
  Match,
  PlayingField,
  TimeSlot,
  Tournament,
} from "./types";

const MINUTE_MS = 60 * 1000;

export type ScheduleDiagnosticFactor =
  | ScheduleFailureFactor
  | "ELIGIBILITY"
  | "FRAGMENTED_WINDOWS"
  | "DEPENDENCY";

export type ScheduleDiagnosticEvidence = {
  kind: "CAPACITY_BOUND" | "PLACEMENT_SEARCH" | "OFFICIAL_MATCHING";
  message: string;
  matchIds?: string[];
  resourceIds?: string[];
  divisionIds?: string[];
  teamIds?: string[];
  dependencyIds?: string[];
  officialIds?: string[];
  timeSlotIds?: string[];
  intervals?: Array<{ start: string; end: string }>;
  demand?: number;
  capacity?: number;
  deficit?: number;
  candidateCount?: number;
};

export type PlacementFailureForDiagnostics = {
  matchId: string;
  message: string;
  restrictingFactor: ScheduleFailureFactor;
  evidence?: ScheduleDiagnosticEvidence[];
  candidateCount?: number;
  searchExhaustive?: boolean;
};

export type CanonicalResourceInterval = {
  resourceId: string;
  start: Date;
  end: Date;
  timeSlotIds: string[];
  divisionIds: string[];
};

type ResourceSegment = CanonicalResourceInterval;

type CapacityBounds = {
  actual: number;
  relaxedEligibility: number;
  pooled: number;
  fullyRelaxed: number;
  resourceIds: string[];
  timeSlotIds: string[];
  intervals: CanonicalResourceInterval[];
};

const sortedUnique = (values: Iterable<string>): string[] => (
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
);

const eventResources = (event: League | Tournament): PlayingField[] => (
  Object.values(event.fields)
    .filter((field): field is PlayingField => Boolean(field && field.id))
    .sort((left, right) => left.id.localeCompare(right.id))
);

const resourceIdsForResolvedSlot = (
  slot: Pick<ResolvedOneTimeTimeSlot, "resourceIds">,
  resources: PlayingField[],
): string[] => {
  const knownResourceIds = new Set(resources.map((resource) => resource.id));
  return slot.resourceIds.length
    ? sortedUnique(slot.resourceIds.filter((resourceId) => knownResourceIds.has(resourceId)))
    : resources.map((resource) => resource.id);
};

const divisionIdsForResolvedSlot = (
  slot: Pick<ResolvedOneTimeTimeSlot, "divisionIds">,
): string[] => sortedUnique(slot.divisionIds);

const boundedInterval = (
  resourceId: string,
  start: Date,
  end: Date,
  timeSlotId: string,
  divisionIds: string[],
  event: League | Tournament,
): CanonicalResourceInterval | null => {
  const boundedStart = new Date(Math.max(start.getTime(), event.start.getTime()));
  const boundedEnd = new Date(Math.min(end.getTime(), event.end.getTime()));
  if (boundedEnd.getTime() <= boundedStart.getTime()) return null;
  return {
    resourceId,
    start: boundedStart,
    end: boundedEnd,
    timeSlotIds: [timeSlotId],
    divisionIds,
  };
};

const rawAvailabilityIntervals = (
  event: League | Tournament,
): CanonicalResourceInterval[] => {
  const resources = eventResources(event);
  const intervals: CanonicalResourceInterval[] = [];
  for (const slot of event.timeSlots as TimeSlot[]) {
    if (slot.repeating === false) {
      const resolved = resolveOneTimeTimeSlot(slot, slot.timeZone);
      for (const resourceId of resourceIdsForResolvedSlot(resolved, resources)) {
        const interval = boundedInterval(
          resourceId,
          resolved.start,
          resolved.end,
          resolved.slotId,
          divisionIdsForResolvedSlot(resolved),
          event,
        );
        if (interval) intervals.push(interval);
      }
      continue;
    }
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot,
      windowStart: event.start,
      windowEnd: event.end,
    });
    for (const occurrence of occurrences) {
      for (const resourceId of resourceIdsForResolvedSlot(occurrence, resources)) {
        const interval = boundedInterval(
          resourceId,
          occurrence.start,
          occurrence.end,
          occurrence.slotId,
          divisionIdsForResolvedSlot(occurrence),
          event,
        );
        if (interval) intervals.push(interval);
      }
    }
  }
  return intervals;
};

const sameIds = (left: string[], right: string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const canonicalSegmentsForResource = (
  intervals: CanonicalResourceInterval[],
): ResourceSegment[] => {
  const boundaries = Array.from(new Set(
    intervals.flatMap((interval) => [
      interval.start.getTime(),
      interval.end.getTime(),
    ]),
  )).sort((left, right) => left - right);
  const segments: ResourceSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index];
    const endMs = boundaries[index + 1];
    if (endMs <= startMs) continue;
    const active = intervals.filter((interval) => (
      interval.start.getTime() <= startMs
      && interval.end.getTime() >= endMs
    ));
    if (!active.length) continue;
    const segment: ResourceSegment = {
      resourceId: intervals[0].resourceId,
      start: new Date(startMs),
      end: new Date(endMs),
      timeSlotIds: sortedUnique(active.flatMap((interval) => interval.timeSlotIds)),
      divisionIds: sortedUnique(active.flatMap((interval) => interval.divisionIds)),
    };
    const previous = segments[segments.length - 1];
    if (
      previous
      && previous.end.getTime() === segment.start.getTime()
      && sameIds(previous.divisionIds, segment.divisionIds)
    ) {
      previous.end = segment.end;
      previous.timeSlotIds = sortedUnique([...previous.timeSlotIds, ...segment.timeSlotIds]);
    } else {
      segments.push(segment);
    }
  }
  return segments;
};

export const canonicalResourceIntervalsFor = (
  event: League | Tournament,
): CanonicalResourceInterval[] => {
  const byResource = new Map<string, CanonicalResourceInterval[]>();
  for (const interval of rawAvailabilityIntervals(event)) {
    const existing = byResource.get(interval.resourceId) ?? [];
    existing.push(interval);
    byResource.set(interval.resourceId, existing);
  }
  return Array.from(byResource.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, intervals]) => canonicalSegmentsForResource(intervals));
};

const defaultDurationMsFor = (event: League | Tournament): number => {
  const rules = event.matchRulesOverride && typeof event.matchRulesOverride === "object"
    ? event.matchRulesOverride as Record<string, unknown>
    : {};
  return resolveMatchTimingPolicy({
    usesSets: event.usesSets,
    segmentCount: typeof rules.segmentCount === "number" ? rules.segmentCount : null,
    segmentLengthMinutes: typeof rules.segmentLengthMinutes === "number" ? rules.segmentLengthMinutes : null,
    segmentBreakMinutes: typeof rules.segmentBreakMinutes === "number" ? rules.segmentBreakMinutes : null,
    setsPerMatch: event.setsPerMatch,
    setDurationMinutes: event.setDurationMinutes,
    matchDurationMinutes: event.matchDurationMinutes,
  }).durationMinutes * MINUTE_MS;
};

const durationByMatch = (
  event: League | Tournament,
  matches: Match[],
): Map<string, number> => {
  const fallback = defaultDurationMsFor(event);
  return new Map(
    matches.map((match) => {
      applyDivisionPhaseRulesToMatch(event, match);
      return [match.id, resolveScheduledMatchDurationMs(event, match, fallback)] as const;
    }),
  );
};

const fieldAllowsDivision = (field: PlayingField, divisionId: string): boolean => {
  const groups = field.getGroups();
  return groups.length === 0 || groups.some((group) => group.id === divisionId);
};

const segmentAllowsMatch = (
  segment: ResourceSegment,
  field: PlayingField | undefined,
  match: Match,
  relaxEligibility: boolean,
): boolean => {
  if (!field || (!relaxEligibility && !fieldAllowsDivision(field, match.division.id))) return false;
  if (relaxEligibility || segment.divisionIds.length === 0) return true;
  return segment.divisionIds.includes(match.division.id);
};

const capacityForSegments = (
  event: League | Tournament,
  matches: Match[],
  segments: ResourceSegment[],
  durations: Map<string, number>,
  options: { relaxEligibility: boolean; poolFragments: boolean },
): number => {
  const fieldsById = new Map(eventResources(event).map((field) => [field.id, field]));
  const usableByResource = new Map<string, Array<{ minutes: number; durationMs: number }>>();
  for (const segment of segments) {
    const field = fieldsById.get(segment.resourceId);
    const eligibleDurations = matches
      .filter((match) => segmentAllowsMatch(segment, field, match, options.relaxEligibility))
      .map((match) => durations.get(match.id) ?? defaultDurationMsFor(event));
    if (!eligibleDurations.length) continue;
    const values = usableByResource.get(segment.resourceId) ?? [];
    values.push({
      minutes: (segment.end.getTime() - segment.start.getTime()) / MINUTE_MS,
      durationMs: Math.min(...eligibleDurations),
    });
    usableByResource.set(segment.resourceId, values);
  }
  let capacity = 0;
  for (const values of usableByResource.values()) {
    if (!options.poolFragments) {
      capacity += values.reduce(
        (total, value) => total + Math.floor((value.minutes * MINUTE_MS) / value.durationMs),
        0,
      );
      continue;
    }
    const totalMinutes = values.reduce((total, value) => total + value.minutes, 0);
    const shortestDurationMs = Math.min(...values.map((value) => value.durationMs));
    capacity += Math.floor((totalMinutes * MINUTE_MS) / shortestDurationMs);
  }
  return capacity;
};

const calculateCapacityBounds = (
  event: League | Tournament,
  matches: Match[],
): CapacityBounds => {
  const intervals = canonicalResourceIntervalsFor(event);
  const byResource = new Map<string, CanonicalResourceInterval[]>();
  for (const interval of intervals) {
    const values = byResource.get(interval.resourceId) ?? [];
    values.push(interval);
    byResource.set(interval.resourceId, values);
  }
  const segments = Array.from(byResource.values()).flatMap(canonicalSegmentsForResource);
  const durations = durationByMatch(event, matches);
  return {
    actual: capacityForSegments(event, matches, segments, durations, {
      relaxEligibility: false,
      poolFragments: false,
    }),
    relaxedEligibility: capacityForSegments(event, matches, segments, durations, {
      relaxEligibility: true,
      poolFragments: false,
    }),
    pooled: capacityForSegments(event, matches, segments, durations, {
      relaxEligibility: false,
      poolFragments: true,
    }),
    fullyRelaxed: capacityForSegments(event, matches, segments, durations, {
      relaxEligibility: true,
      poolFragments: true,
    }),
    resourceIds: sortedUnique(intervals.map((interval) => interval.resourceId)),
    timeSlotIds: sortedUnique(intervals.flatMap((interval) => interval.timeSlotIds)),
    intervals,
  };
};

const evidenceForBound = (
  message: string,
  demand: number,
  capacity: number,
  bounds: CapacityBounds,
): ScheduleDiagnosticEvidence => ({
  kind: "CAPACITY_BOUND",
  message,
  demand,
  capacity,
  deficit: Math.max(0, demand - capacity),
  resourceIds: bounds.resourceIds,
  timeSlotIds: bounds.timeSlotIds,
  intervals: bounds.intervals.slice(0, 12).map((interval) => ({
    start: interval.start.toISOString(),
    end: interval.end.toISOString(),
  })),
});

const diagnosticMessageForFactor = (factor: ScheduleDiagnosticFactor): string => {
  switch (factor) {
    case "RESOURCE": return "Resource placement was restricting the proposal.";
    case "ELIGIBILITY": return "Resource or Division eligibility was restricting the proposal.";
    case "FRAGMENTED_WINDOWS": return "Available Resource time was split into windows that could not hold enough complete Matches.";
    case "PLAYING_TEAM": return "Playing Team availability was restricting the proposal.";
    case "TEAM_DUTY": return "Team-duty coverage was restricting the proposal.";
    case "NAMED_OFFICIAL_POSITION": return "Required named Official coverage was restricting the proposal.";
    case "DIVISION_ORDER": return "Division order was restricting the proposal.";
    case "DEPENDENCY": return "Match dependency order was restricting the proposal.";
    default: return "The placement search found a scheduling restriction.";
  }
};

const remedyForFactor = (
  factor: ScheduleDiagnosticFactor,
): Omit<EventEditorScheduleDiagnostics["remedies"][number], "evidence"> | null => {
  switch (factor) {
    case "RESOURCE":
    case "FRAGMENTED_WINDOWS":
      return {
        code: "ADD_OR_EXTEND_TIME_SLOTS",
        factor,
        message: "Add or extend eligible Resource Time Slots when the affected bound is below Match Demand.",
      };
    case "ELIGIBILITY":
      return {
        code: "REVIEW_RESOURCE_ELIGIBILITY",
        factor,
        message: "Review Resource and Division eligibility for the affected Matches.",
      };
    case "NAMED_OFFICIAL_POSITION":
      return {
        code: "ADD_ELIGIBLE_OFFICIALS",
        factor,
        message: "Add eligible Officials for the required positions.",
      };
    default:
      return null;
  }
};

type DiagnosticConfidence = "PROVEN_GLOBAL_BOUND" | "PROVEN_FOR_ATTEMPT" | "OBSERVED";
type DiagnosticResult = Pick<EventEditorScheduleDiagnostics, "restrictingFactors" | "remedies">;

const hasCapacityDeficitEvidence = (evidence: ScheduleDiagnosticEvidence[]): boolean => evidence.some((entry) => (
  entry.kind === "CAPACITY_BOUND"
  && typeof entry.demand === "number"
  && typeof entry.capacity === "number"
  && entry.capacity < entry.demand
));

const hasCapacityMeetingDemandEvidence = (evidence: ScheduleDiagnosticEvidence[]): boolean => evidence.some((entry) => (
  entry.kind === "CAPACITY_BOUND"
  && typeof entry.demand === "number"
  && typeof entry.capacity === "number"
  && entry.capacity >= entry.demand
));

const hasStaticOfficialShortage = (evidence: ScheduleDiagnosticEvidence[]): boolean => evidence.some((entry) => (
  entry.kind === "OFFICIAL_MATCHING"
  && entry.message.toLowerCase().includes("no complete position-eligible assignment exists")
));

const remedyForEvidence = (
  factor: ScheduleDiagnosticFactor,
  confidence: DiagnosticConfidence,
  evidence: ScheduleDiagnosticEvidence[],
): Omit<EventEditorScheduleDiagnostics["remedies"][number], "evidence"> | null => {
  if (
    factor === "RESOURCE"
    && confidence === "PROVEN_GLOBAL_BOUND"
    && hasCapacityDeficitEvidence(evidence)
  ) {
    return remedyForFactor(factor);
  }
  if (
    factor === "FRAGMENTED_WINDOWS"
    && confidence === "PROVEN_GLOBAL_BOUND"
    && hasCapacityMeetingDemandEvidence(evidence)
  ) {
    return remedyForFactor(factor);
  }
  if (factor === "ELIGIBILITY" && confidence === "PROVEN_GLOBAL_BOUND") {
    return remedyForFactor(factor);
  }
  if (factor === "NAMED_OFFICIAL_POSITION" && hasStaticOfficialShortage(evidence)) {
    return remedyForFactor(factor);
  }
  return null;
};

const addDiagnosticFactor = (
  result: DiagnosticResult,
  factor: ScheduleDiagnosticFactor,
  confidence: DiagnosticConfidence,
  evidence: ScheduleDiagnosticEvidence[],
): void => {
  const existing = result.restrictingFactors.find((entry) => entry.factor === factor);
  if (existing) {
    existing.evidence.push(...evidence);
    if (confidence === "PROVEN_GLOBAL_BOUND") existing.confidence = confidence;
    return;
  }
  result.restrictingFactors.push({
    factor,
    confidence,
    message: diagnosticMessageForFactor(factor),
    evidence,
  });
  const remedy = remedyForEvidence(factor, confidence, evidence);
  if (
    remedy
    && !result.remedies.some((entry) => entry.code === remedy.code && entry.factor === remedy.factor)
  ) {
    result.remedies.push({ ...remedy, evidence });
  }
};

const addCapacityFactors = (
  demand: MatchDemand,
  bounds: CapacityBounds,
  result: DiagnosticResult,
): void => {
  if (bounds.actual >= demand.total) return;
  if (bounds.fullyRelaxed < demand.total) {
    addDiagnosticFactor(
      result,
      "RESOURCE",
      "PROVEN_GLOBAL_BOUND",
      [evidenceForBound(
        "Even the fully pooled Resource upper bound is below Match Demand.",
        demand.total,
        bounds.fullyRelaxed,
        bounds,
      )],
    );
  }
  if (bounds.relaxedEligibility >= demand.total) {
    addDiagnosticFactor(
      result,
      "ELIGIBILITY",
      "PROVEN_GLOBAL_BOUND",
      [evidenceForBound(
        "Relaxing Resource and Division eligibility reaches Match Demand.",
        demand.total,
        bounds.relaxedEligibility,
        bounds,
      )],
    );
  }
  if (bounds.pooled >= demand.total) {
    addDiagnosticFactor(
      result,
      "FRAGMENTED_WINDOWS",
      "PROVEN_GLOBAL_BOUND",
      [evidenceForBound(
        "Pooling canonical Resource minutes reaches Match Demand.",
        demand.total,
        bounds.pooled,
        bounds,
      )],
    );
  }
  if (result.restrictingFactors.length === 0) {
    addDiagnosticFactor(
      result,
      "RESOURCE",
      "PROVEN_GLOBAL_BOUND",
      [evidenceForBound(
        "The eligible Resource upper bound is below Match Demand.",
        demand.total,
        bounds.actual,
        bounds,
      )],
    );
  }
};

const addPlacementFailureFactors = (
  failures: readonly PlacementFailureForDiagnostics[],
  result: DiagnosticResult,
): void => {
  for (const failure of failures) {
    const confidence: DiagnosticConfidence = failure.searchExhaustive
      ? "PROVEN_FOR_ATTEMPT"
      : "OBSERVED";
    addDiagnosticFactor(
      result,
      failure.restrictingFactor,
      confidence,
      failure.evidence && failure.evidence.length > 0 ? failure.evidence : [{
        kind: "PLACEMENT_SEARCH",
        message: failure.message,
        matchIds: [failure.matchId],
        candidateCount: failure.candidateCount,
      }],
    );
  }
};

const addUnknownFactor = (
  failures: readonly PlacementFailureForDiagnostics[],
  result: DiagnosticResult,
): void => {
  if (
    failures.length === 0
    || result.restrictingFactors.some((factor) => factor.factor !== "UNKNOWN")
  ) {
    return;
  }
  result.restrictingFactors.push({
    factor: "UNKNOWN",
    confidence: "OBSERVED",
    message: "The placement search did not prove one restricting factor.",
    evidence: [{
      kind: "PLACEMENT_SEARCH",
      message: "No causal scheduling restriction was proven from the attempted placements.",
      matchIds: failures.map((failure) => failure.matchId),
    }],
  });
};

export const diagnoseScheduleProposal = (params: {
  event: League | Tournament;
  matches: Match[];
  placementFailures?: readonly PlacementFailureForDiagnostics[];
}): EventEditorScheduleDiagnostics => {
  const demand: MatchDemand = matchDemandFromGraph(params.matches);
  const bounds = calculateCapacityBounds(params.event, params.matches);
  const minimumDeficitMatches = Math.max(0, demand.total - bounds.actual);
  const failures = params.placementFailures ?? [];
  const result: DiagnosticResult = { restrictingFactors: [], remedies: [] };
  addCapacityFactors(demand, bounds, result);
  addPlacementFailureFactors(failures, result);
  addUnknownFactor(failures, result);
  const searchComplete = failures.every(
    (failure) => failure.searchExhaustive !== false,
  );
  const hasSpecificCause = result.restrictingFactors.some((factor) => factor.factor !== "UNKNOWN");
  const message = bounds.actual < demand.total
    ? `Estimated Capacity is below Match Demand. The minimum capacity deficit is ${minimumDeficitMatches} Matches.`
    : failures.length > 0 && !hasSpecificCause
      ? "The scheduler could not place all Matches. It did not prove one restricting factor."
      : hasSpecificCause
        ? "The scheduler recorded the evidenced Restricting Factors below."
        : "Total Resource capacity is not proven insufficient.";

  return {
    message,
    matchDemand: demand,
    estimatedCapacity: bounds.actual,
    estimatedCapacityIsUpperBound: true,
    minimumDeficitMatches,
    searchComplete,
    restrictingFactors: result.restrictingFactors,
    remedies: result.remedies,
  };
};
