/** @jest-environment node */
import { planReflow } from '../planReflow';
import type { ReflowInput, ReflowMatch, ReflowStaffing, ReflowOfficialCandidate } from '../types';

const minute = 60_000;
const time = (minutes: number) => Date.UTC(2026, 8, 3, 9) + minutes * minute;
const match = (id: string, start: number, fieldId: string, extra: Partial<ReflowMatch> = {}): ReflowMatch => ({
  id, order: Number(id.slice(1)), batch: 0, isProtected: false,
  placement: { start: time(start), end: time(start + 25), fieldId },
  actualEnd: null, teamIds: [], dependencyIds: [], restMs: 5 * minute,
  windows: [{ start: time(0), end: time(240), fieldId }],
  ...extra,
});

const bracket = (): ReflowInput => ({
  now: time(35), fieldPolicy: 'KEEP_ASSIGNED_FIELDS', changedMatchIds: ['M1'],
  matches: [
    match('M1', 0, 'F1', { isProtected: true, actualEnd: time(35), teamIds: ['harbor', 'summit'] }),
    match('M2', 0, 'F2', { isProtected: true, actualEnd: time(25), teamIds: ['riverside', 'canyon'] }),
    match('M3', 30, 'F1', { dependencyIds: ['M1', 'M2'], teamIds: ['harbor', 'riverside'] }),
    match('M4', 60, 'F1', { dependencyIds: ['M3'] }),
    match('M5', 40, 'F2', { teamIds: ['metro', 'pine'] }),
  ],
});

const duty = (teamOfficialId: string | null, eligibleTeamIds: string[]): ReflowStaffing => ({
  priority: 'FULL_COVERAGE_REQUIRED', isTeamDutyRequired: true, teamCheckInMs: 0,
  eligibleTeamIds, assignments: { teamOfficialId, officialAssignments: [] },
});

test('explicitly permitted staffing conflicts produce warnings without moving Matches', () => {
  const staffing = { ...duty('pine', ['pine']), priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED' as const };
  const result = planReflow({ now: time(0), fieldPolicy: 'KEEP_ASSIGNED_FIELDS', changedMatchIds: ['M1'],
    matches: [match('M1', 30, 'F1', { staffing }), match('M2', 30, 'F2', { staffing })] });
  expect(result.placementChanges).toEqual([]);
  expect(result.warnings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'ALLOWED_STAFFING_CONFLICT', matchIds: ['M1'] }),
    expect.objectContaining({ code: 'ALLOWED_STAFFING_CONFLICT', matchIds: ['M2'] }),
  ]));
});

test('a late result moves only the dependent chain and does not mutate the snapshot', () => {
  const input = bracket();
  const before = JSON.stringify(input);
  const result = planReflow(input);

  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges).toEqual([
    { matchId: 'M3', before: { start: time(30), end: time(55), fieldId: 'F1' },
      after: { start: time(40), end: time(65), fieldId: 'F1' } },
    { matchId: 'M4', before: { start: time(60), end: time(85), fieldId: 'F1' },
      after: { start: time(70), end: time(95), fieldId: 'F1' } },
  ]);
  expect(result.protectedMatchIds).toEqual(['M1', 'M2']);
  expect(JSON.stringify(input)).toBe(before);
});

test('an infeasible dependent chain returns no partial placement changes', () => {
  const input = bracket();
  input.matches = input.matches.map((entry) => entry.id === 'M4'
    ? { ...entry, windows: [{ start: time(0), end: time(90), fieldId: 'F1' }] }
    : entry);
  const before = JSON.stringify(input);
  const result = planReflow(input);
  expect(result.status).toBe('INFEASIBLE');
  expect(result.placementChanges).toEqual([]);
  expect(JSON.stringify(input)).toBe(before);
});

test.each(['field', 'playing Team'])('an affected protected %s conflict rejects the complete repair', (constraint) => {
  const input = bracket();
  input.matches = [...input.matches, match('M6', 30, constraint === 'field' ? 'F1' : 'F3', {
    isProtected: true, teamIds: constraint === 'playing Team' ? ['harbor'] : [],
  })];
  const result = planReflow(input);
  expect(result.status).toBe('INFEASIBLE');
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges).toEqual([]);
});

test.each(['Team Duty', 'named Official'])('a known playing Team cannot overlap a protected %s', (role) => {
  const staffing: ReflowStaffing = role === 'Team Duty' ? duty('pine', ['pine']) : {
    ...duty(null, []), isTeamDutyRequired: false,
    officialSlots: [{ positionId: 'referee', slotIndex: 0, candidates: [{
      userId: 'Dana', eventOfficialId: 'dana-ref', holderType: 'OFFICIAL', fieldIds: [], teamIds: ['pine'],
    }] }],
    assignments: { teamOfficialId: null, officialAssignments: [{
      positionId: 'referee', slotIndex: 0, userId: 'Dana', eventOfficialId: 'dana-ref',
      holderType: 'OFFICIAL', checkedIn: true, hasConflict: false,
    }] },
  };
  const input: ReflowInput = { now: time(50), changedMatchIds: ['M1'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS', matches: [
    match('M1', 0, 'F1', { isProtected: true, actualEnd: time(50), teamIds: ['harbor'], staffing }),
    match('M3', 40, 'F2', { teamIds: ['pine'] }),
  ] };
  const result = planReflow(input);
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([['M3', time(55)]]);
  expect(result.assignmentChanges).toEqual([]);
  input.matches = input.matches.map((entry) => entry.id === 'M3' ? { ...entry, isProtected: true } : entry);
  expect(planReflow(input).status).toBe('INFEASIBLE');
});

test('a locked Match blocks a candidate and the affected Match uses the next opening', () => {
  const input = bracket();
  input.matches = [...input.matches, match('M6', 40, 'F1', { isProtected: true })];
  const result = planReflow(input);
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([
    ['M3', time(65)], ['M4', time(95)],
  ]);
  expect(result.protectedMatchIds).toContain('M6');
});

test('a playing Match uses the protected Team Duty check-in release boundary', () => {
  const result = planReflow({ now: time(50), changedMatchIds: ['M1'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS', matches: [
    match('M1', 0, 'F1', { isProtected: true, actualEnd: time(50), teamIds: ['harbor'],
      staffing: { ...duty('pine', ['pine']), teamCheckInMs: 30 * minute } }),
    match('M3', 60, 'F2', { teamIds: ['pine'] }),
  ] });
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([['M3', time(80)]]);
  expect(result.assignmentChanges).toEqual([]);
});

test.each(['Team Duty', 'named Official'])('conflicting protected %s assignments reject the complete repair', (role) => {
  const staffing: ReflowStaffing = role === 'Team Duty' ? duty('pine', ['pine']) : {
    ...duty(null, []), isTeamDutyRequired: false,
    officialSlots: [{ positionId: 'referee', slotIndex: 0, candidates: [{
      userId: 'Dana', eventOfficialId: 'dana-ref', holderType: 'OFFICIAL', fieldIds: [], teamIds: [],
    }] }],
    assignments: { teamOfficialId: null, officialAssignments: [{
      positionId: 'referee', slotIndex: 0, userId: 'Dana', eventOfficialId: 'dana-ref',
      holderType: 'OFFICIAL', checkedIn: true, hasConflict: false,
    }] },
  };
  const result = planReflow({ now: time(50), changedMatchIds: ['M1'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS', matches: [
    match('M1', 0, 'F1', { isProtected: true, actualEnd: time(50), staffing }),
    match('M2', 40, 'F2', { isProtected: true, staffing }),
    match('M3', 30, 'F1', { dependencyIds: ['M1'] }),
  ] });
  expect(result.status).toBe('INFEASIBLE');
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges).toEqual([]);
});

test('permitted conflicts between protected assignments produce warnings without changing assignments', () => {
  const staffing: ReflowStaffing = { ...duty('pine', ['pine']), priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED' };
  const result = planReflow({ now: time(50), changedMatchIds: ['M1'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS', matches: [
    match('M1', 0, 'F1', { isProtected: true, actualEnd: time(50), staffing }),
    match('M2', 40, 'F2', { isProtected: true, staffing }),
  ] });
  expect(result.status).toBe('NO_OP');
  expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'ALLOWED_STAFFING_CONFLICT', matchIds: ['M1', 'M2'] }));
  expect(result.assignmentChanges).toEqual([]);
});

test.each([
  ['Resource', 'F1', [], 85, 95],
  ['Team rest', 'F3', ['harbor'], 60, 70],
] as const)('a moved Match expands only its %s conflict chain', (_cause, field, teams, start, expectedStart) => {
  const input = bracket();
  input.matches = [...input.matches, match('M6', start, field, { teamIds: teams })];
  const result = planReflow(input);
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges.find((change) => change.matchId === 'M6')?.after.start).toBe(time(expectedStart));
  expect(result.placementChanges.some((change) => change.matchId === 'M5')).toBe(false);
});

test('a protected dependent makes an incompatible repair fail without a partial change', () => {
  const input = bracket();
  input.matches = input.matches.map((entry) => entry.id === 'M4' ? { ...entry, isProtected: true } : entry);
  const result = planReflow(input);
  expect(result.status).toBe('INFEASIBLE');
  expect(result.placementChanges).toEqual([]);
});

test('early results pull only their dependent chain to the earliest feasible time', () => {
  const input = bracket();
  input.now = time(15);
  input.changedMatchIds = ['M1', 'M2'];
  input.matches = input.matches.map((entry) => entry.isProtected ? { ...entry, actualEnd: time(15) } : entry);
  const result = planReflow(input);
  expect(result.placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([
    ['M3', time(20)], ['M4', time(50)],
  ]);
});

test('a search limit is not reported as infeasibility and exposes no partial change', () => {
  const result = planReflow({ ...bracket(), maxStates: 1 });
  expect(result.status).toBe('SEARCH_LIMIT');
  expect(result.placementChanges).toEqual([]);
});

test('joint Team-duty repair swaps assignments before changing either published time', () => {
  const result = planReflow({
    now: time(30), fieldPolicy: 'KEEP_ASSIGNED_FIELDS', changedMatchIds: ['M3'],
    matches: [
      match('M3', 40, 'F1', { staffing: duty('falcon', ['pine']) }),
      match('M5', 40, 'F2', { staffing: duty('pine', ['pine', 'falcon']) }),
    ],
  });
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges.map((change) => [change.matchId, change.after.teamOfficialId])).toEqual([
    ['M3', 'pine'], ['M5', 'falcon'],
  ]);
});

test('required staffing can move a Match earlier when its published time cannot be retained', () => {
  const result = planReflow({ now: time(30), changedMatchIds: ['M3'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS',
    matches: [
      match('M1', 60, 'F1', { isProtected: true, teamIds: ['pine'] }),
      match('M3', 60, 'F2', { staffing: duty('pine', ['pine']) }),
    ],
  });
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges.map((change) => change.after.start)).toEqual([time(30)]);
});

test('joint named-official repair preserves position eligibility and avoids a time change', () => {
  const official = (id: string): ReflowOfficialCandidate => ({
    userId: id, eventOfficialId: `eo-${id}`, holderType: 'OFFICIAL', fieldIds: [], teamIds: [],
  });
  const staffing = (incumbent: string, candidates: string[]): ReflowStaffing => ({
    ...duty(null, []), isTeamDutyRequired: false,
    officialSlots: [{ positionId: 'referee', slotIndex: 0, candidates: candidates.map(official) }],
    assignments: { teamOfficialId: null, officialAssignments: [{
      positionId: 'referee', slotIndex: 0, holderType: 'OFFICIAL', userId: incumbent,
      eventOfficialId: `eo-${incumbent}`, checkedIn: true, hasConflict: false,
    }] },
  });
  const result = planReflow({
    now: time(30), changedMatchIds: ['M3'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS',
    matches: [
      match('M3', 40, 'F1', { staffing: staffing('dana', ['lee']) }),
      match('M5', 40, 'F2', { staffing: staffing('lee', ['lee', 'dana']) }),
    ],
  });
  expect(result.status).toBe('CHANGED');
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges.map((change) => [change.matchId, change.after.officialAssignments[0]?.userId])).toEqual([
    ['M3', 'lee'], ['M5', 'dana'],
  ]);
  expect(result.assignmentChanges.every((change) => change.after.officialAssignments[0]?.checkedIn === false)).toBe(true);
});

test.each(['FULL_COVERAGE_REQUIRED', 'BEST_AVAILABLE_COVERAGE'] as const)(
  '%s moves for missing Team Duty only when coverage is required', (priority) => {
    const result = planReflow({
      now: time(50), changedMatchIds: ['M1'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS',
      matches: [
        match('M1', 0, 'F1', { isProtected: true, actualEnd: time(50), teamIds: ['pine', 'metro'] }),
        match('M3', 40, 'F2', { staffing: { ...duty('pine', ['pine']), priority } }),
      ],
    });
    expect(result.status).toBe('CHANGED');
    if (priority === 'FULL_COVERAGE_REQUIRED') {
      expect(result.placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([['M3', time(55)]]);
      expect(result.assignmentChanges).toEqual([]);
    } else {
      expect(result.placementChanges).toEqual([]);
      expect(result.assignmentChanges[0]?.after.teamOfficialId).toBeNull();
      expect(result.warnings).toEqual([expect.objectContaining({ code: 'UNRESOLVED_TEAM_DUTY', matchIds: ['M3'] })]);
    }
  },
);

test('dependency order controls repair even when the Match numbers and input order differ', () => {
  const input = bracket();
  input.matches = [...input.matches].reverse().map((entry) => entry.id === 'M3' ? { ...entry, order: 10 } : entry);
  expect(planReflow(input).placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([
    ['M3', time(40)], ['M4', time(70)],
  ]);
});

test('a repair respects the configured Phase Division order', () => {
  const input = bracket();
  input.matches = [...input.matches, match('M6', 85, 'F3', { batch: 1 })];
  expect(planReflow(input).placementChanges.find((change) => change.matchId === 'M6')?.after.start).toBe(time(95));
});

test.each(['KEEP_ASSIGNED_FIELDS', 'ALLOW_ELIGIBLE_FIELD_CHANGES'] as const)(
  '%s enforces the selected Resource policy', (fieldPolicy) => {
    const input = bracket();
    input.fieldPolicy = fieldPolicy;
    input.matches = input.matches.map((entry) => entry.id === 'M3'
      ? { ...entry, windows: [{ start: time(0), end: time(240), fieldId: 'F3' }] } : entry);
    const result = planReflow(input);
    if (fieldPolicy === 'KEEP_ASSIGNED_FIELDS') {
      expect(result.status).toBe('INFEASIBLE');
      expect(result.placementChanges).toEqual([]);
    } else {
      expect(result.placementChanges[0]?.after).toEqual({ start: time(40), end: time(65), fieldId: 'F3' });
    }
  },
);

test('an on-time result retains every published placement and assignment', () => {
  const input = bracket();
  input.now = time(25);
  input.matches = input.matches.map((entry) => entry.id === 'M1' ? { ...entry, actualEnd: time(25) } : entry);
  const result = planReflow(input);
  expect(result.status).toBe('NO_OP');
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges).toEqual([]);
});

test('equivalent assignment object key order does not create a Schedule write', () => {
  const result = planReflow({
    now: time(20), changedMatchIds: ['M3'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS',
    matches: [match('M3', 30, 'F1', { staffing: {
      ...duty(null, []), isTeamDutyRequired: false,
      officialSlots: [{ positionId: 'referee', slotIndex: 0, candidates: [{
        userId: 'lee', eventOfficialId: 'eo-lee', holderType: 'OFFICIAL', fieldIds: [], teamIds: [],
      }] }],
      assignments: { teamOfficialId: null, officialAssignments: [{
        checkedIn: true, hasConflict: false, userId: 'lee', eventOfficialId: 'eo-lee',
        holderType: 'OFFICIAL', positionId: 'referee', slotIndex: 0,
      }] },
    } })],
  });
  expect(result.status).toBe('NO_OP');
  expect(result.assignmentChanges).toEqual([]);
});

test('an early result does not pull a Match whose other dependency still controls its start', () => {
  const input = bracket();
  input.now = time(25);
  input.matches = input.matches.map((entry) => entry.id === 'M1' ? { ...entry, actualEnd: time(15) }
    : entry.id === 'M3' ? { ...entry, placement: { fieldId: 'F1', start: time(40), end: time(65) } }
      : entry.id === 'M4' ? { ...entry, placement: { fieldId: 'F1', start: time(70), end: time(95) } } : entry);
  expect(planReflow(input).placementChanges).toEqual([]);
});

test.each(['duplicate', 'unknown-change', 'unknown-dependency', 'invalid-time'])(
  'rejects %s input before searching', (invalid) => {
    const input = bracket();
    if (invalid === 'duplicate') input.matches = [...input.matches, input.matches[0]!];
    if (invalid === 'unknown-change') input.changedMatchIds = ['absent'];
    if (invalid === 'unknown-dependency') input.matches = input.matches.map((entry) =>
      entry.id === 'M3' ? { ...entry, dependencyIds: ['absent'] } : entry);
    if (invalid === 'invalid-time') input.now = Number.NaN;
    expect(() => planReflow(input)).toThrow(/Reflow input/);
  },
);

test.each(['FULL_COVERAGE_REQUIRED', 'BEST_AVAILABLE_COVERAGE'] as const)(
  '%s reserves unassigned playing slots before it allocates fluid Team Duty', (priority) => {
    const result = planReflow({
      now: time(50), changedMatchIds: ['M1'], fieldPolicy: 'KEEP_ASSIGNED_FIELDS',
      matches: [
        match('M1', 0, 'F1', { isProtected: true, actualEnd: time(50), teamIds: ['harbor', 'summit'] }),
        match('M3', 40, 'F2', {
          playingTeamSlots: [['harbor', 'summit', 'pine', 'falcon'], ['harbor', 'summit', 'pine', 'falcon']],
          staffing: { ...duty('pine', ['pine']), priority },
        }),
      ],
    });
    expect(result.status).toBe('CHANGED');
    if (priority === 'FULL_COVERAGE_REQUIRED') {
      expect(result.placementChanges.map((change) => change.after.start)).toEqual([time(55)]);
    } else {
      expect(result.placementChanges).toEqual([]);
      expect(result.assignmentChanges[0]?.after.teamOfficialId).toBeNull();
    }
  },
);
