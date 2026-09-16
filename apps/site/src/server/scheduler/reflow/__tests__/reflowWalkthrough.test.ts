/** @jest-environment node */
import { runReflowDemo } from '../../prototypes/reflow-flow/demo';

test('the displayed swap changes only Team Duty through the shared planner', () => {
  const { result } = runReflowDemo('swap', 'KEEP_ASSIGNED_FIELDS');
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges.map((change) => [change.matchId, change.after.teamOfficialId])).toEqual([
    ['M5', 'Pine'], ['M6', 'Falcon'],
  ]);
});

test('the displayed field policy changes feasibility without changing protected Matches', () => {
  expect(runReflowDemo('fields', 'KEEP_ASSIGNED_FIELDS').result.status).toBe('INFEASIBLE');
  const { result } = runReflowDemo('fields', 'ALLOW_ELIGIBLE_FIELD_CHANGES');
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges.map((change) => change.matchId)).toEqual(['M5', 'M7']);
  expect(result.placementChanges.every((change) => change.after.fieldId !== 'Court 1')).toBe(true);
});

test.each(['noop', 'infeasible', 'budget'] as const)('the %s demonstration exposes no partial changes', (scenario) => {
  const { result } = runReflowDemo(scenario, 'KEEP_ASSIGNED_FIELDS');
  expect(result.status).toBe({ noop: 'NO_OP', infeasible: 'INFEASIBLE', budget: 'SEARCH_LIMIT' }[scenario]);
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges).toEqual([]);
});
