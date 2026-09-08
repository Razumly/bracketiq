export function atLocalCalendarMinute(day: Date, minutes: number): Date {
  const result = new Date(day);
  result.setHours(0, minutes, 0, 0);
  return result;
}

export function shiftLocalCalendarMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

export function localCalendarDurationMinutes(start: Date, end: Date): number {
  const localTimestamp = (date: Date) => Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  );
  return (localTimestamp(end) - localTimestamp(start)) / 60000;
}

export function shiftLocalDay(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

export function isWithinOneLocalDay(start: Date, end: Date): boolean {
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    && end > start && end <= shiftLocalDay(start, 1);
}

export function limitCalendarInteraction(
  start: Date, end: Date, mode: 'move' | 'resize-start' | 'resize-end',
  minMinutes: number, maxMinutes: number,
): { start: Date; end: Date } | null {
  let nextStart = new Date(start);
  let nextEnd = new Date(end);
  if (mode === 'resize-start' && nextStart < shiftLocalDay(end, -1)) nextStart = shiftLocalDay(end, -1);
  if (mode === 'resize-end' && nextEnd > shiftLocalDay(start, 1)) nextEnd = shiftLocalDay(start, 1);
  if (hasHiddenHours(minMinutes, maxMinutes)) {
    const anchor = mode === 'resize-start' ? end : start;
    const dayStart = new Date(anchor);
    const dayEnd = new Date(anchor);
    dayStart.setHours(0, minMinutes, 0, 0);
    dayEnd.setHours(0, maxMinutes, 0, 0);
    if (mode === 'move') {
      const duration = end.getTime() - start.getTime();
      nextStart = new Date(Math.min(Math.max(start.getTime(), dayStart.getTime()), dayEnd.getTime() - duration));
      nextEnd = new Date(nextStart.getTime() + duration);
      if (nextStart < dayStart) return null;
    } else {
      nextStart = new Date(Math.max(nextStart.getTime(), dayStart.getTime()));
      nextEnd = new Date(Math.min(nextEnd.getTime(), dayEnd.getTime()));
    }
  }
  return isWithinOneLocalDay(nextStart, nextEnd) ? { start: nextStart, end: nextEnd } : null;
}

function hasHiddenHours(minMinutes: number, maxMinutes: number): boolean {
  return minMinutes > 0 || maxMinutes < 1440;
}
