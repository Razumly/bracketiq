import { resolveDivisionCompetitionPhase } from '@/lib/divisionPhaseSettings';
import type { DivisionCompetitionPhase } from '@/types';
import { ScheduleError } from './scheduleErrors';
import { League } from './types';
import type { Division, Match, Tournament } from './types';

type SchedulerEvent = League | Tournament;

export type ScheduledMatchPhase = DivisionCompetitionPhase;

export type MatchSchedulingBatch = {
  rank: 0 | 1;
  divisionIndex: number;
  divisionId: string;
  phase: ScheduledMatchPhase;
  matches: Match[];
};

export type MatchBatchOrderingOptions = {
  lockedMatchIds?: ReadonlySet<string>;
  affectedMatchIds?: ReadonlySet<string>;
};

export const PROTECTED_DIVISION_ORDER_MESSAGE =
  'Protected Matches conflict with Division scheduling order.';

const PHASE_ORDER: Record<ScheduledMatchPhase, number> = {
  LEAGUE: 0,
  POOL: 1,
  PLAYOFF: 2,
  BRACKET: 3,
};

const normalizePhase = (value: unknown): ScheduledMatchPhase | null => {
  const phase = String(value ?? '').trim().toUpperCase();
  if (
    phase === 'LEAGUE'
    || phase === 'POOL'
    || phase === 'PLAYOFF'
    || phase === 'BRACKET'
  ) {
    return phase;
  }
  return null;
};

const normalizeDivisionId = (value: unknown): string => (
  String(value ?? '').trim().toLowerCase()
);

const hasBracketLinks = (match: Match): boolean => Boolean(
  match.losersBracket
  || match.previousLeftMatch
  || match.previousRightMatch
  || match.winnerNextMatch
  || match.loserNextMatch
);

const eventTypeFor = (event: SchedulerEvent): string => {
  const explicitEventType = String(event.eventType ?? '').trim().toUpperCase();
  if (explicitEventType) {
    return explicitEventType;
  }
  return event instanceof League ? 'LEAGUE' : 'TOURNAMENT';
};

export const classifyMatchPhase = (
  event: SchedulerEvent,
  match: Match,
): ScheduledMatchPhase => {
  const explicitPhase = normalizePhase(match.division.phase);
  if (explicitPhase) {
    return explicitPhase;
  }

  const bracketMatch = hasBracketLinks(match);
  if (bracketMatch) {
    return eventTypeFor(event) === 'TOURNAMENT' ? 'BRACKET' : 'PLAYOFF';
  }

  return resolveDivisionCompetitionPhase({
    eventType: eventTypeFor(event),
    divisionKind: match.division.kind,
    hasBracketLinks: false,
  });
};

const rankForPhase = (phase: ScheduledMatchPhase): 0 | 1 => (
  phase === 'LEAGUE' || phase === 'POOL' ? 0 : 1
);

const orderingError = (message: string): ScheduleError => (
  new ScheduleError(message, 'DIVISION_ORDER')
);

const hasLockedMatch = (
  matches: Match[],
  lockedMatchIds: ReadonlySet<string> | undefined,
): boolean => matches.some((match) => (
  match.locked || Boolean(lockedMatchIds?.has(match.id))
));
type ReadyMatch = {
  match: Match;
  sourceIndex: number;
};

const compareReadyMatches = (left: ReadyMatch, right: ReadyMatch): number => (
  left.sourceIndex - right.sourceIndex
  || left.match.id.localeCompare(right.match.id)
);

const pushReadyMatch = (heap: ReadyMatch[], entry: ReadyMatch): void => {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = heap[parentIndex];
    if (!parent || compareReadyMatches(parent, entry) <= 0) {
      break;
    }
    heap[index] = parent;
    index = parentIndex;
  }
  heap[index] = entry;
};

const popReadyMatch = (heap: ReadyMatch[]): ReadyMatch | undefined => {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || !heap.length) {
    return first;
  }
  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    if (leftIndex >= heap.length) {
      break;
    }
    const rightIndex = leftIndex + 1;
    const right = heap[rightIndex];
    const childIndex = (
      right && compareReadyMatches(right, heap[leftIndex]!) < 0
        ? rightIndex
        : leftIndex
    );
    const child = heap[childIndex]!;
    if (compareReadyMatches(last, child) <= 0) {
      break;
    }
    heap[index] = child;
    index = childIndex;
  }
  heap[index] = last;
  return first;
};

const topologicallySortMatchGraphForScheduling = (
  matches: Match[],
  options: MatchBatchOrderingOptions,
): Match[] => {
  const sourceIndexByMatchId = new Map<string, number>();
  const matchById = new Map<string, Match>();
  for (const [sourceIndex, match] of matches.entries()) {
    sourceIndexByMatchId.set(match.id, sourceIndex);
    matchById.set(match.id, match);
  }

  const indegreeByMatchId = new Map<string, number>();
  const dependantsByDependencyId = new Map<string, Match[]>();
  const affectedMatchIds = options.affectedMatchIds;
  const isIgnoredProtectedEdge = (match: Match, dependency: Match): boolean => {
    if (!affectedMatchIds) {
      return false;
    }
    const endpointsAreUnaffected = (
      !affectedMatchIds.has(match.id)
      && !affectedMatchIds.has(dependency.id)
    );
    const endpointsAreProtected = (
      (match.locked || Boolean(options.lockedMatchIds?.has(match.id)))
      && (dependency.locked || Boolean(options.lockedMatchIds?.has(dependency.id)))
    );
    return endpointsAreUnaffected && endpointsAreProtected;
  };

  for (const match of matches) {
    let indegree = 0;
    for (const dependency of match.getDependencies()) {
      if (isIgnoredProtectedEdge(match, dependency) || !matchById.has(dependency.id)) {
        continue;
      }
      indegree += 1;
      const dependants = dependantsByDependencyId.get(dependency.id) ?? [];
      dependants.push(match);
      dependantsByDependencyId.set(dependency.id, dependants);
    }
    indegreeByMatchId.set(match.id, indegree);
  }

  const ready: ReadyMatch[] = [];
  for (const match of matches) {
    if (indegreeByMatchId.get(match.id) === 0) {
      pushReadyMatch(ready, {
        match,
        sourceIndex: sourceIndexByMatchId.get(match.id) ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const result: Match[] = [];
  while (ready.length) {
    const next = popReadyMatch(ready);
    if (!next) {
      break;
    }
    result.push(next.match);
    const dependants = dependantsByDependencyId.get(next.match.id);
    if (!dependants) {
      continue;
    }
    for (const dependant of dependants) {
      const nextIndegree = (indegreeByMatchId.get(dependant.id) ?? 0) - 1;
      indegreeByMatchId.set(dependant.id, nextIndegree);
      if (nextIndegree === 0) {
        pushReadyMatch(ready, {
          match: dependant,
          sourceIndex: sourceIndexByMatchId.get(dependant.id) ?? Number.MAX_SAFE_INTEGER,
        });
      }
    }
  }
  if (result.length !== matches.length) {
    throw new Error('Match graph contains a dependency cycle.');
  }
  return result;
};

const dependencyIsAffected = (
  match: Match,
  dependency: Match,
  affectedMatchIds: ReadonlySet<string> | undefined,
): boolean => (
  !affectedMatchIds
  || affectedMatchIds.has(match.id)
  || affectedMatchIds.has(dependency.id)
);

const dependencyIsProtected = (
  match: Match,
  dependency: Match,
  options: MatchBatchOrderingOptions,
): boolean => (
  (match.locked || Boolean(options.lockedMatchIds?.has(match.id)))
  && (dependency.locked || Boolean(options.lockedMatchIds?.has(dependency.id)))
);

const shouldValidateDependency = (
  match: Match,
  dependency: Match,
  options: MatchBatchOrderingOptions,
): boolean => (
  dependencyIsAffected(match, dependency, options.affectedMatchIds)
  || !dependencyIsProtected(match, dependency, options)
);


export const validateMatchBatchDependencyOrder = (
  batches: MatchSchedulingBatch[],
  options: MatchBatchOrderingOptions = {},
): void => {
  const batchIndexByMatchId = new Map<string, number>();
  batches.forEach((batch, batchIndex) => {
    for (const match of batch.matches) {
      batchIndexByMatchId.set(match.id, batchIndex);
    }
  });

  for (const [batchIndex, batch] of batches.entries()) {
    for (const match of batch.matches) {
      for (const dependency of match.getDependencies()) {
        if (!shouldValidateDependency(match, dependency, options)) {
          continue;
        }
        const dependencyBatchIndex = batchIndexByMatchId.get(dependency.id);
        if (
          dependencyBatchIndex !== undefined
          && dependencyBatchIndex > batchIndex
        ) {
          if (
            match.locked
            || dependency.locked
            || (
              options.lockedMatchIds
              && (
                options.lockedMatchIds.has(match.id)
                || options.lockedMatchIds.has(dependency.id)
              )
            )
          ) {
            throw new ScheduleError(
              PROTECTED_DIVISION_ORDER_MESSAGE,
              'DIVISION_ORDER',
            );
          }
          throw orderingError(
            `Match ${match.id} depends on a later Division scheduling batch.`,
          );
        }
      }
    }
  }
};

export const buildMatchSchedulingBatches = (
  event: SchedulerEvent,
  matches: Match[],
  canonicalDivisions: Division[],
  options: MatchBatchOrderingOptions = {},
): MatchSchedulingBatch[] => {
  let sourceOrder: Match[];
  try {
    sourceOrder = topologicallySortMatchGraphForScheduling(matches, options);
  } catch (error) {
    if (error instanceof Error && error.message === 'Match graph contains a dependency cycle.') {
      throw orderingError(
        'Match graph contains a dependency cycle that violates Division scheduling order.',
      );
    }
    throw error;
  }

  const divisionIndexById = new Map<string, number>();
  for (const [index, division] of canonicalDivisions.entries()) {
    const divisionId = normalizeDivisionId(division.id);
    if (!divisionIndexById.has(divisionId)) {
      divisionIndexById.set(divisionId, index);
    }
  }
  const fallbackDivisionIndexes = new Map<string, number>();
  for (const match of matches) {
    const divisionId = normalizeDivisionId(match.division.id);
    if (divisionIndexById.has(divisionId) || fallbackDivisionIndexes.has(divisionId)) {
      continue;
    }
    fallbackDivisionIndexes.set(
      divisionId,
      canonicalDivisions.length + fallbackDivisionIndexes.size,
    );
  }
  const batchesByKey = new Map<string, MatchSchedulingBatch>();
  for (const match of sourceOrder) {
    const phase = classifyMatchPhase(event, match);
    const rank = rankForPhase(phase);
    const divisionId = normalizeDivisionId(match.division.id);
    let divisionIndex = divisionIndexById.get(divisionId);
    if (divisionIndex === undefined) {
      divisionIndex = fallbackDivisionIndexes.get(divisionId);
      if (divisionIndex === undefined) {
        divisionIndex = canonicalDivisions.length + fallbackDivisionIndexes.size;
        fallbackDivisionIndexes.set(divisionId, divisionIndex);
      }
    }
    const key = `${rank}:${divisionIndex}:${phase}`;
    const existing = batchesByKey.get(key);
    if (existing) {
      existing.matches.push(match);
      continue;
    }
    batchesByKey.set(key, {
      rank,
      divisionIndex,
      divisionId,
      phase,
      matches: [match],
    });
  }

  const batches = [...batchesByKey.values()].sort((left, right) => (
    left.rank - right.rank
    || left.divisionIndex - right.divisionIndex
    || PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase]
  ));
  validateMatchBatchDependencyOrder(batches, options);
  return batches;
};

const batchBounds = (batch: MatchSchedulingBatch): {
  maxEnd: number;
  minStart: number;
} => {
  let maxEnd = Number.NEGATIVE_INFINITY;
  let minStart = Number.POSITIVE_INFINITY;
  for (const match of batch.matches) {
    const start = match.start instanceof Date ? match.start.getTime() : Number.NaN;
    const end = match.end instanceof Date ? match.end.getTime() : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw orderingError(
        `Match ${match.id} has no valid placement time for Division scheduling order.`,
      );
    }
    maxEnd = Math.max(maxEnd, end);
    minStart = Math.min(minStart, start);
  }
  return { maxEnd, minStart };
};

const batchIsAffected = (
  batch: MatchSchedulingBatch,
  affectedMatchIds: ReadonlySet<string> | undefined,
): boolean => (
  !affectedMatchIds
  || batch.matches.some((match) => affectedMatchIds.has(match.id))
);

export const validateMatchBatchBoundaries = (
  batches: MatchSchedulingBatch[],
  options: MatchBatchOrderingOptions = {},
): void => {
  for (let previousIndex = 0; previousIndex < batches.length - 1; previousIndex += 1) {
    const previousBatch = batches[previousIndex];
    if (!previousBatch?.matches.length) {
      continue;
    }
    for (let nextIndex = previousIndex + 1; nextIndex < batches.length; nextIndex += 1) {
      const nextBatch = batches[nextIndex];
      if (!nextBatch?.matches.length) {
        continue;
      }
      if (
        options.affectedMatchIds
        && !batchIsAffected(previousBatch, options.affectedMatchIds)
        && !batchIsAffected(nextBatch, options.affectedMatchIds)
      ) {
        continue;
      }
      const previousBounds = batchBounds(previousBatch);
      const nextBounds = batchBounds(nextBatch);
      if (previousBounds.maxEnd <= nextBounds.minStart) {
        continue;
      }
      if (
        hasLockedMatch(previousBatch.matches, options.lockedMatchIds)
        || hasLockedMatch(nextBatch.matches, options.lockedMatchIds)
      ) {
        throw new ScheduleError(PROTECTED_DIVISION_ORDER_MESSAGE, 'DIVISION_ORDER');
      }
      throw orderingError(
        'Matches conflict with Division scheduling order.',
      );
    }
  }
};
