import { calculateTimedMatchDurationMinutes } from '@/lib/divisionPhaseSettings';
import {
  resolveMatchRulesForContext,
  resolveMatchRulesForDivisionPhase,
} from '@/server/matches/matchOperations';
import { resolveMatchTimingPolicy } from './matchTimingPolicy';
import {
  classifyMatchPhase,
  type ScheduledMatchPhase,
} from './matchSchedulingOrder';
import type { Division, League, Match, Tournament } from './types';

type SchedulerEvent = League | Tournament;


const durationMinutesFromSnapshot = (
  event: SchedulerEvent,
  match: Match,
  phase: ScheduledMatchPhase,
): number | null => {
  const snapshot = match.matchRulesSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const rules = snapshot as {
    scoringModel?: unknown;
    segmentCount?: unknown;
  };
  const division = match.division;
  const bracketMatch =
    phase === 'PLAYOFF'
    || phase === 'BRACKET'
    || division.kind === 'PLAYOFF';
  const divisionConfig = bracketMatch
    ? division.playoffConfig
    : division.leagueConfig;
  const phaseSettings = division.phaseSettings?.[phase] ?? {};
  const usesSets = bracketMatch || division.kind === 'PLAYOFF'
    ? event.usesSets
    : division.leagueConfig?.usesSets ?? event.usesSets;
  const segmentCount = Number(rules.segmentCount);
  const configuredSegmentLength = phaseSettings.segmentLengthMinutes
    ?? divisionConfig?.setDurationMinutes
    ?? event.setDurationMinutes
    ?? null;
  const configuredSegmentBreak = phaseSettings.segmentBreakMinutes ?? 0;

  if (usesSets || phaseSettings.segmentLengthMinutes != null) {
    const timedDuration = calculateTimedMatchDurationMinutes({
      segmentCount,
      segmentLengthMinutes: configuredSegmentLength,
      segmentBreakMinutes: configuredSegmentBreak,
    });
    if (timedDuration != null) {
      return timedDuration;
    }
  }
  const timing = resolveMatchTimingPolicy({
    scoringModel:
      typeof rules.scoringModel === 'string' ? rules.scoringModel : undefined,
    usesSets,
    segmentCount: Number.isFinite(segmentCount) ? segmentCount : null,
    setsPerMatch: division.kind === 'LEAGUE' && !bracketMatch
      ? division.leagueConfig?.setsPerMatch
      : event.setsPerMatch
      ?? (Number.isFinite(segmentCount) ? segmentCount : null),
    segmentLengthMinutes: configuredSegmentLength,
    setDurationMinutes: configuredSegmentLength,
    matchDurationMinutes: divisionConfig?.matchDurationMinutes
      ?? event.matchDurationMinutes,
    segmentBreakMinutes: configuredSegmentBreak,
    restTimeMinutes: divisionConfig?.restTimeMinutes
      ?? event.restTimeMinutes,
  });
  return timing.durationMinutes;
};

export const applyDivisionPhaseRulesToMatch = (
  event: SchedulerEvent,
  match: Match,
): number | null => {
  const division = match.division;
  const phase = classifyMatchPhase(event, match);
  const bracketMatch =
    phase === 'PLAYOFF'
    || phase === 'BRACKET'
    || division.kind === 'PLAYOFF';

  if (match.matchRulesSnapshot) {
    match.resolvedMatchRules = match.matchRulesSnapshot as NonNullable<typeof match.resolvedMatchRules>;
    return durationMinutesFromSnapshot(event, match, phase);
  }
  const playoffConfig = bracketMatch || division.kind === 'PLAYOFF'
    ? division.playoffConfig
    : null;
  const usesSets = playoffConfig
    ? event.usesSets
    : division.kind === 'LEAGUE'
      ? division.leagueConfig?.usesSets ?? event.usesSets
      : event.usesSets;
  const setsPerMatch = playoffConfig
    ? event.setsPerMatch ?? null
    : division.leagueConfig?.setsPerMatch ?? event.setsPerMatch ?? null;
  const winnerSetCount = playoffConfig?.winnerSetCount ?? event.winnerSetCount ?? null;
  const loserSetCount = playoffConfig?.loserSetCount ?? event.loserSetCount ?? null;
  const phaseRules = resolveMatchRulesForDivisionPhase({
    phase,
    phaseSettings: division.phaseSettings,
    sportTemplate: event.resolvedMatchRules,
    autoCreatePointMatchIncidents: event.autoCreatePointMatchIncidents,
    usesSets,
    setsPerMatch,
    winnerSetCount,
    matchDurationMinutes: playoffConfig?.matchDurationMinutes
      ?? division.leagueConfig?.matchDurationMinutes
      ?? event.matchDurationMinutes,
    officialPositions: event.officialPositions,
  });
  const contextualRules = resolveMatchRulesForContext({
    baseRules: phaseRules,
    eventType: event.eventType,
    usesSets,
    setsPerMatch,
    winnerSetCount,
    loserSetCount,
    losersBracket: match.losersBracket,
    previousLeftMatch: match.previousLeftMatch,
    previousRightMatch: match.previousRightMatch,
    winnerNextMatch: match.winnerNextMatch,
    loserNextMatch: match.loserNextMatch,
    existingSegmentCount: Math.max(
      match.segments.length,
      match.team1Points.length,
      match.team2Points.length,
    ),
  }) ?? phaseRules;

  match.resolvedMatchRules = contextualRules;
  match.matchRulesSnapshot = contextualRules;

  if (usesSets) return null;
  const settings = division.phaseSettings[phase];
  return calculateTimedMatchDurationMinutes({
    segmentCount: contextualRules.segmentCount,
    segmentLengthMinutes: settings?.segmentLengthMinutes,
    segmentBreakMinutes: settings?.segmentBreakMinutes,
  });
};

export const resolveScheduledMatchDurationMs = (
  event: SchedulerEvent,
  match: Match,
  fallbackDurationMs: number,
): number => {
  const phaseDurationMinutes = applyDivisionPhaseRulesToMatch(event, match);
  return phaseDurationMinutes == null ? fallbackDurationMs : phaseDurationMinutes * 60 * 1000;
};
