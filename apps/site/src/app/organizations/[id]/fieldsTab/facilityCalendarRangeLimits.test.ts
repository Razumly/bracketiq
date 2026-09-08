import { isWithinOneLocalDay, limitCalendarInteraction } from './facilityCalendarRangeLimits';

describe('calendar time-slot limits', () => {
  it('keeps a move on the left of hidden hours until it reaches the next day', () => {
    expect(limitCalendarInteraction(new Date(2030, 5, 10, 19), new Date(2030, 5, 10, 23), 'move', 480, 1200))
      .toEqual({ start: new Date(2030, 5, 10, 16), end: new Date(2030, 5, 10, 20) });
    expect(limitCalendarInteraction(new Date(2030, 5, 11, 8), new Date(2030, 5, 11, 12), 'move', 480, 1200))
      .toEqual({ start: new Date(2030, 5, 11, 8), end: new Date(2030, 5, 11, 12) });
  });

  it('allows overnight windows on a continuous midnight timeline', () => {
    const start = new Date(2030, 5, 10, 22);
    const end = new Date(2030, 5, 11, 2);
    expect(limitCalendarInteraction(start, end, 'move', 0, 1440)).toEqual({ start, end });
    expect(isWithinOneLocalDay(start, new Date(2030, 5, 11, 23))).toBe(false);
  });

  it('limits each resize to one local day', () => {
    expect(limitCalendarInteraction(new Date(2030, 5, 10, 9), new Date(2030, 5, 12, 12), 'resize-end', 0, 1440))
      .toEqual({ start: new Date(2030, 5, 10, 9), end: new Date(2030, 5, 11, 9) });
    expect(limitCalendarInteraction(new Date(2030, 5, 9, 9), new Date(2030, 5, 11, 12), 'resize-start', 0, 1440))
      .toEqual({ start: new Date(2030, 5, 10, 12), end: new Date(2030, 5, 11, 12) });
  });
});
