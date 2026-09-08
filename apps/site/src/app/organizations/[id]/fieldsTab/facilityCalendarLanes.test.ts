import { facilityCalendarLanes } from './facilityCalendarLanes';

const entry = (id: string, start: number, end: number) => ({ id, start: new Date(start), end: new Date(end) });

it('separates simultaneous entries and reuses a lane after its interval ends', () => {
  const events = [entry('late', 30, 40), entry('long', 0, 30), entry('nested', 10, 20), entry('same', 10, 20)];
  const result = facilityCalendarLanes(events);
  expect(result.count).toBe(3);
  expect(result.laneById.get('long')).toBe(0);
  expect(result.laneById.get('nested')).toBe(1);
  expect(result.laneById.get('same')).toBe(2);
  expect(result.laneById.get('late')).toBe(0);
  expect(facilityCalendarLanes([...events].reverse())).toEqual(result);
  expect(events[0].id).toBe('late');
});

it('retains one empty resource row', () => {
  expect(facilityCalendarLanes([]).count).toBe(1);
});
