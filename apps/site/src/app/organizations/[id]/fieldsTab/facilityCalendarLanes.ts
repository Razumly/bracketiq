type CalendarInterval = { id: string; start: Date; end: Date };

/** Put simultaneous entries on separate rows within one resource. */
export function facilityCalendarLanes(events: readonly CalendarInterval[]) {
  const laneEnds: number[] = [];
  const laneById = new Map<string, number>();
  const ordered = [...events].sort((left, right) =>
    left.start.getTime() - right.start.getTime()
    || left.end.getTime() - right.end.getTime()
    || left.id.localeCompare(right.id));
  for (const event of ordered) {
    const available = laneEnds.findIndex((end) => end <= event.start.getTime());
    const lane = available < 0 ? laneEnds.length : available;
    laneEnds[lane] = event.end.getTime();
    laneById.set(event.id, lane);
  }
  return { laneById, count: Math.max(1, laneEnds.length) };
}
