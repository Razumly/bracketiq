import type { Prisma } from '@/generated/prisma/client';
import { loadEventScheduleState } from '@/server/events/eventEditorSnapshot';
import { loadEventProtectedHistory } from '@/server/events/eventProtectedHistory';
import { loadFieldBlockerCatalog } from '@/server/repositories/fieldSchedulingConflicts';
import { loadLockedScheduleEvent } from '../../eventScheduleMaintenance';
import { Division, Match, PlayingField, Team, Tournament } from '../../types';
import { reflowEventSchedule } from '../eventReflow';

jest.mock('@/server/events/eventEditorSnapshot', () => ({ loadEventScheduleState: jest.fn() }));
jest.mock('@/server/events/eventProtectedHistory', () => ({ loadEventProtectedHistory: jest.fn() }));
jest.mock('@/server/repositories/fieldSchedulingConflicts', () => ({
  loadFieldBlockerCatalog: jest.fn(), materializeFieldBlockerCatalog: () => [],
}));
jest.mock('../../eventScheduleMaintenance', () => ({
  ...jest.requireActual('../../eventScheduleMaintenance'), loadLockedScheduleEvent: jest.fn(),
}));

const at = (minute: number) => new Date(Date.UTC(2026, 8, 4, 9, minute));
function setup() {
  const division = new Division('open', 'Open');
  const field = new PlayingField({ id: 'court', name: 'Court', divisions: [division] });
  const teams = Object.fromEntries(['Harbor', 'Summit', 'Pine'].map((id) => [id, new Team({ id, name: id, captainId: `captain-${id}`, division })]));
  const first = new Match({ id: 'first', matchId: 1, start: at(0), end: at(25), actualEnd: at(35),
    division, field, bufferMs: 300_000, eventId: 'event', team1: teams.Harbor, team2: teams.Summit });
  const next = new Match({ id: 'next', matchId: 2, start: at(30), end: at(55), previousLeftMatch: first,
    division, field, bufferMs: 300_000, eventId: 'event', team1: teams.Harbor, team2: teams.Pine });
  const event = new Tournament({ id: 'event', name: 'Harbor Cup', start: at(0), end: at(180),
    maxParticipants: 8, teamSignup: true, hostId: 'host', fields: { court: field },
    eventType: 'TOURNAMENT', noFixedEndDateTime: false, scheduleEndConstraint: at(180),
    divisions: [division], teams, matches: { first, next } });
  division.phase = 'BRACKET';
  division.phaseSettings = { BRACKET: { doTeamsOfficiate: false } };
  const tx = { matches: { update: jest.fn().mockResolvedValue({}) }, events: { update: jest.fn() } };
  jest.mocked(loadLockedScheduleEvent).mockResolvedValue({ event, persistedEvent: { id: event.id }, automatedScheduling: true });
  jest.mocked(loadEventScheduleState).mockResolvedValue({ revision: 'revision-1' } as Awaited<ReturnType<typeof loadEventScheduleState>>);
  jest.mocked(loadEventProtectedHistory).mockResolvedValue({ protectedMatchIds: new Set(['first']), checkIns: [] } as unknown as Awaited<ReturnType<typeof loadEventProtectedHistory>>);
  jest.mocked(loadFieldBlockerCatalog).mockResolvedValue({ lowerBound: at(0), intervalsByFieldId: new Map(), recurringByFieldId: new Map() });
  const request = { contractVersion: 1 as const, eventId: 'event', changedMatchIds: ['first'],
    expectedScheduleRevision: 'revision-1', fieldPolicy: 'KEEP_ASSIGNED_FIELDS' as const };
  const run = () => reflowEventSchedule({ tx: tx as unknown as Prisma.TransactionClient,
    actor: { userId: 'host', isAdmin: false }, request, now: at(35) });
  return { event, first, next, tx, request, run };
}

beforeEach(() => jest.resetAllMocks());

it('rejects direct Reflow when Automated Scheduling is disabled', async () => {
  const { run, event, tx } = setup();
  jest.mocked(loadLockedScheduleEvent).mockResolvedValue({
    event, persistedEvent: { id: event.id }, automatedScheduling: false,
  });
  await expect(run()).rejects.toMatchObject({ code: 'EDITOR_MAINTENANCE_INVALID' });
  expect(tx.matches.update).not.toHaveBeenCalled();
  expect(tx.events.update).not.toHaveBeenCalled();
});

it('saves only the changed placement and returns the complete canonical graph', async () => {
  const { run, tx } = setup();
  jest.mocked(loadEventScheduleState).mockResolvedValueOnce({ revision: 'revision-1' } as Awaited<ReturnType<typeof loadEventScheduleState>>)
    .mockResolvedValueOnce({ revision: 'revision-2' } as Awaited<ReturnType<typeof loadEventScheduleState>>);
  const result = await run();
  expect(result.status).toBe('CHANGED');
  expect(result.scheduleRevision).toBe('revision-2');
  expect(result.graph?.matches.map((match) => match.id)).toEqual(['first', 'next']);
  expect(tx.matches.update).toHaveBeenCalledTimes(1);
  expect(tx.matches.update).toHaveBeenCalledWith({ where: { id: 'next' }, data: {
    start: at(40), end: at(65), fieldId: 'court', updatedAt: at(35),
  } });
  expect(tx.events.update).not.toHaveBeenCalled();
});

it.each(['STALE', 'NO_OP', 'INFEASIBLE'] as const)('does not write a %s result', async (status) => {
  const { run, tx, request, first, next } = setup();
  if (status === 'STALE') request.expectedScheduleRevision = 'old';
  if (status === 'NO_OP') first.actualEnd = at(25);
  if (status === 'INFEASIBLE') next.locked = true;
  const result = await run();
  expect(result.status).toBe(status);
  expect(result.graph).toBeNull();
  expect(result.placementChanges).toEqual([]);
  expect(result.assignmentChanges).toEqual([]);
  expect(tx.matches.update).not.toHaveBeenCalled();
  expect(tx.events.update).not.toHaveBeenCalled();
});

it('propagates a save failure to the caller-owned transaction', async () => {
  const { run, tx } = setup();
  tx.matches.update.mockRejectedValueOnce(new Error('write failed'));
  await expect(run()).rejects.toThrow('write failed');
});

it('sets the generated end in the same transaction when the latest Match moves', async () => {
  const { run, event, tx } = setup();
  event.noFixedEndDateTime = true;
  event.end = at(55);
  const result = await run();
  expect(result.graph?.event.end).toBe(at(65).toISOString());
  expect(tx.events.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ end: at(65), generatedScheduleEnd: at(65) }),
  }));
});

it('preserves the generated end when an earlier Match moves', async () => {
  const { run, event, next, tx } = setup();
  event.noFixedEndDateTime = true;
  event.matches.later = new Match({ ...next, id: 'later', matchId: 3,
    previousLeftMatch: null, start: at(100), end: at(125), locked: true });
  const result = await run();
  expect(result.status).toBe('CHANGED');
  expect(tx.events.update).not.toHaveBeenCalled();
  expect(result.graph?.event.end).toBe(at(180).toISOString());
});
