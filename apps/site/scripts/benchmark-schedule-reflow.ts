import assert from 'node:assert/strict';
import { planReflow } from '../src/server/scheduler/reflow/planReflow';
import type { ReflowMatch } from '../src/server/scheduler/reflow/types';

const minute = 60_000;
const at = (minutes: number) => Date.UTC(2026, 8, 4, 9) + minutes * minute;

for (const teamCount of [32, 128, 512]) {
  const teams = Array.from({ length: teamCount }, (_, index) => `Team ${index + 1}`);
  const matches: ReflowMatch[] = [];
  const fields = Array.from({ length: 8 }, (_, index) => `Court ${index + 1}`);
  let previous: { match: ReflowMatch; entrants: string[] }[] = [];
  let cursor = 0;
  for (let count = teamCount / 2; count >= 1; count /= 2) {
    const round = Array.from({ length: count }, (_, index) => {
      const dependencies = previous.length ? [previous[index * 2]!, previous[index * 2 + 1]!] : [];
      const entrants = dependencies.length ? dependencies.flatMap((entry) => entry.entrants) : teams.slice(index * 2, index * 2 + 2);
      const start = cursor + Math.floor(index / fields.length) * 30;
      const match: ReflowMatch = {
        id: `M${matches.length + index + 1}`, order: matches.length + index, batch: 0,
        isProtected: !dependencies.length,
        placement: { fieldId: fields[index % fields.length]!, start: at(start), end: at(start + 25) },
        actualEnd: dependencies.length ? null : at(start + 25),
        teamIds: dependencies.length ? [] : entrants,
        playingTeamSlots: dependencies.map((entry) => entry.entrants),
        dependencyIds: dependencies.map((entry) => entry.match.id), restMs: 5 * minute,
        windows: fields.map((fieldId) => ({ fieldId, start: at(0), end: at(10_000) })),
        staffing: { priority: 'FULL_COVERAGE_REQUIRED', isTeamDutyRequired: true,
          teamCheckInMs: 0, eligibleTeamIds: teams,
          assignments: { teamOfficialId: null, officialAssignments: [] } },
      };
      return { match, entrants };
    });
    matches.push(...round.map((entry) => entry.match));
    previous = round;
    cursor += Math.ceil(count / fields.length) * 30;
  }
  const changed = matches.filter((match) => match.isProtected).slice(-4);
  changed.forEach((match) => { match.actualEnd! += 10 * minute; });
  const before = JSON.stringify(matches);
  const started = performance.now();
  const result = planReflow({ matches, changedMatchIds: changed.map((match) => match.id),
    now: Math.max(...changed.map((match) => match.actualEnd!)), fieldPolicy: 'KEEP_ASSIGNED_FIELDS' });
  const elapsedMs = performance.now() - started;
  assert.equal(JSON.stringify(matches), before);
  assert.ok(result.exploredStates <= 20_000);
  assert.ok(result.placementChanges.every((change) => !result.protectedMatchIds.includes(change.matchId)));
  if (['INFEASIBLE', 'SEARCH_LIMIT'].includes(result.status)) {
    assert.equal(result.placementChanges.length + result.assignmentChanges.length, 0);
  }
  console.log(JSON.stringify({ teams: teamCount, matches: matches.length, elapsedMs: Math.round(elapsedMs),
    status: result.status, states: result.exploredStates, placements: result.placementChanges.length,
    assignments: result.assignmentChanges.length }));
}
