import { planReflow } from '../../reflow/planReflow';
import type { ReflowInput, ReflowMatch } from '../../reflow/types';

const minute = 60_000;
const start = Date.UTC(2026, 8, 4, 9);
const at = (value: number) => start + value * minute;
const teams = ['Harbor', 'Summit', 'Riverside', 'Canyon', 'Metro', 'Pine', 'Lakeside', 'Falcon'];
export const scenarios = ['late', 'early', 'swap', 'optional', 'fields', 'noop', 'infeasible', 'budget'] as const;
export type DemoScenario = typeof scenarios[number];

/** Explicit fixtures feed the production planner. They do not select its result. */
export function runReflowDemo(scenario: DemoScenario, fieldPolicy: ReflowInput['fieldPolicy']) {
  if (!scenarios.includes(scenario)) throw new Error('Unknown demonstration.');
  const actualEnd = scenario === 'early' ? 45 : ['swap', 'optional', 'noop', 'fields'].includes(scenario) ? 55
    : scenario === 'infeasible' ? 100 : 65;
  const match = (id: string, order: number, time: number, fieldId: string, teamIds: string[], dependencies: string[], duty: string): ReflowMatch => ({
    id, order, batch: 0, isProtected: order < 5,
    placement: { start: at(time), end: at(time + 25), fieldId },
    actualEnd: order < 3 ? at(25) : order < 5 ? at(actualEnd) : null,
    teamIds, dependencyIds: dependencies, restMs: 5 * minute,
    windows: ['Court 1', 'Court 2', 'Court 3'].map((fieldId) => ({
      fieldId, start: at(0), end: at(scenario === 'infeasible' ? 120 : 240),
    })),
    staffing: {
      priority: scenario === 'optional' ? 'BEST_AVAILABLE_COVERAGE' : 'FULL_COVERAGE_REQUIRED',
      isTeamDutyRequired: true, teamCheckInMs: 0, eligibleTeamIds: teams,
      assignments: { teamOfficialId: duty, officialAssignments: [] },
    },
  });
  const matches = [
    match('M1', 1, 0, 'Court 1', ['Harbor', 'Summit'], [], 'Metro'),
    match('M2', 2, 0, 'Court 2', ['Riverside', 'Canyon'], [], 'Pine'),
    match('M3', 3, 30, 'Court 1', ['Metro', 'Pine'], [], 'Summit'),
    match('M4', 4, 30, 'Court 2', ['Lakeside', 'Falcon'], [], 'Canyon'),
    match('M5', 5, 60, 'Court 1', ['Harbor', 'Riverside'], ['M1', 'M2'], 'Pine'),
    match('M6', 6, 60, 'Court 2', ['Metro', 'Lakeside'], ['M3', 'M4'], 'Canyon'),
    match('M7', 7, 90, 'Court 1', [], ['M5', 'M6'], 'Summit'),
  ];
  matches[6]!.playingTeamSlots = [['Harbor', 'Riverside'], ['Metro', 'Lakeside']];
  if (scenario === 'swap') {
    matches[4]!.staffing!.assignments = { teamOfficialId: 'Falcon', officialAssignments: [] };
    matches[4]!.staffing!.eligibleTeamIds = ['Pine'];
    matches[5]!.staffing!.assignments = { teamOfficialId: 'Pine', officialAssignments: [] };
    matches[5]!.staffing!.eligibleTeamIds = ['Pine', 'Falcon'];
  }
  if (scenario === 'optional') matches[4]!.staffing!.eligibleTeamIds = [];
  if (scenario === 'fields') {
    for (const entry of matches) entry.windows = entry.windows.map((window) => window.fieldId === 'Court 1'
      ? { ...window, end: at(60) } : window);
  }
  const input: ReflowInput = {
    matches, fieldPolicy, now: at(actualEnd),
    changedMatchIds: ['swap', 'optional', 'fields'].includes(scenario) ? ['M5'] : ['M3', 'M4'],
    maxStates: scenario === 'budget' ? 1 : 20_000,
  };
  const before = performance.now();
  const result = planReflow(input);
  return {
    input, result, elapsedMs: performance.now() - before,
    entrants: { M5: ['Winner of Match 1: Harbor', 'Winner of Match 2: Riverside'],
      M6: ['Winner of Match 3: Metro', 'Winner of Match 4: Lakeside'],
      M7: ['Winner of Match 5: TBD', 'Winner of Match 6: TBD'] },
  };
}
