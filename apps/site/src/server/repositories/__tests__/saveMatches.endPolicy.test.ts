/** @jest-environment node */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { saveMatches } from '../events';

const at = (hour: number) => new Date(Date.UTC(2026, 8, 10, hour));
const setup = () => {
  const event = { id: 'event', eventType: 'TOURNAMENT', start: at(9), end: at(12),
    scheduleEndConstraint: at(12), noFixedEndDateTime: false, automatedScheduling: true };
  const match = { id: 'match', eventId: 'event', start: at(10), end: at(11),
    field: { id: 'court' }, placementState: 'PLACED', division: { id: 'open' } };
  const client = {
    events: { findUnique: jest.fn().mockResolvedValue(event), update: jest.fn() },
    matches: { findMany: jest.fn().mockResolvedValue([{ id: 'match', start: at(10), end: at(11), fieldId: 'court' }]),
      upsert: jest.fn().mockResolvedValue({}) },
  };
  return { event, match, client };
};

it('rejects the complete manual save when a Match is outside the Event bounds', async () => {
  const { match, client } = setup();
  const error = await saveMatches('event', [match, { ...match, id: 'later', start: at(13), end: at(14) }], client)
    .then(() => null, (failure: unknown) => failure);
  expect(error).toBeInstanceOf(Response);
  expect(await (error as Response).json()).toMatchObject({ code: 'MATCH_OUTSIDE_EVENT_BOUNDS', matchIds: ['later'] });
  expect(client.matches.upsert).not.toHaveBeenCalled();
  expect(client.events.update).not.toHaveBeenCalled();
});

it.each([false, true])('preserves the Event end for an accepted manual move with generated policy %s', async (generated) => {
  const { event, match, client } = setup();
  event.noFixedEndDateTime = generated;
  await saveMatches('event', [{ ...match, start: at(11), end: at(12) }], client);
  expect(client.matches.upsert).toHaveBeenCalledTimes(1);
  expect(client.events.update).not.toHaveBeenCalled();
  expect(event.end).toEqual(at(12));
});

it.each([
  [true, true, true], [true, false, false], [false, true, false],
])('uses an approved schedule end only with generated policy %s and automation %s', async (generated, automated, accepted) => {
  const { event, match, client } = setup();
  event.noFixedEndDateTime = generated;
  event.automatedScheduling = automated;
  const operation = saveMatches('event', [{ ...match, end: at(14) }], client, { approvedScheduleEnd: at(14) });
  if (accepted) await expect(operation).resolves.toBeUndefined();
  else await expect(operation).rejects.toBeInstanceOf(Response);
  expect(client.matches.upsert).toHaveBeenCalledTimes(accepted ? 1 : 0);
});

it('allows score edits on an unchanged placement without altering Event bounds', async () => {
  const { event, match, client } = setup();
  event.end = at(10);
  await saveMatches('event', [match], client);
  expect(client.matches.upsert).toHaveBeenCalledTimes(1);
  expect(client.events.update).not.toHaveBeenCalled();
});
