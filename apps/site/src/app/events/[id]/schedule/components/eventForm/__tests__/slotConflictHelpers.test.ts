import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { slotCanCheckExternalConflicts } from '../slotConflictHelpers';

const buildOvernightSlot = (): LeagueSlotForm => ({
  key: 'slot-overnight',
  scheduledFieldIds: ['field-1'],
  divisions: ['OPEN'],
  daysOfWeek: [0],
  startDate: '2026-03-01T05:00:00.000Z',
  endDate: '2026-03-10T04:00:00.000Z',
  timeZone: 'America/New_York',
  startTimeMinutes: 22 * 60,
  endTimeMinutes: 2 * 60,
  repeating: true,
  conflicts: [],
  checking: false,
});

describe('slot conflict helpers', () => {
  it('allows external conflict checks for overnight repeating slots', () => {
    expect(slotCanCheckExternalConflicts(buildOvernightSlot(), {
      eventId: 'event-1',
      eventStart: '2026-03-01T00:00:00.000Z',
      eventEnd: '2026-03-10T00:00:00.000Z',
    })).toBe(true);
  });
});
