import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';

type DropPointOptions = {
  rangeStart: Date;
  rangeEnd: Date;
  minTime: Date;
  maxTime: Date;
  stepMinutes: number;
  durationMs: number;
};

export function calendarResourceRowAtPoint(rows: HTMLElement[], clientY: number, timeline: Pick<DOMRect, 'top' | 'height'>) {
  const measuredRows = rows.filter((row) => row.getBoundingClientRect().height > 0);
  if (measuredRows.length) {
    return measuredRows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY >= rect.top && clientY < rect.bottom;
    });
  }
  const height = timeline.height || rows.length * 72;
  const index = Math.floor((clientY - timeline.top) / (height / rows.length));
  return rows[index];
}

function visibleMinute(value: string | undefined, fallback: Date) {
  if (value === undefined) return fallback.getHours() * 60 + fallback.getMinutes();
  return Number(value);
}

function timelineBoundsAtPoint(shell: HTMLElement, clientX: number) {
  const timeline = shell.querySelector<HTMLElement>('[data-calendar-timeline]');
  if (!timeline) return null;
  const rect = timeline.getBoundingClientRect();
  const width = rect.width || 1000;
  if (clientX < rect.left || clientX > rect.left + width) return null;
  return { rect, width };
}

function isVisibleTimelineDrop(shell: HTMLElement, row: HTMLElement, clientX: number, clientY: number) {
  const viewport = shell.querySelector<HTMLElement>('.facility-resource-calendar__viewport')?.getBoundingClientRect();
  if (!viewport?.width) return true;
  const label = row.querySelector<HTMLElement>('.facility-resource-calendar__resource-label')?.getBoundingClientRect();
  const left = Math.max(viewport.left, label?.right ?? viewport.left);
  return clientX >= left && clientX <= viewport.right && clientY >= viewport.top && clientY < viewport.bottom;
}

// Keep external creation drops on the same visible scale as calendar entries.
export function resolveFacilityCalendarDropPoint(
  shell: HTMLElement | null,
  clientX: number,
  clientY: number,
  options: DropPointOptions,
) {
  if (!shell) return null;
  const bounds = timelineBoundsAtPoint(shell, clientX);
  if (!bounds) return null;
  const { rect, width } = bounds;
  const rows = Array.from(shell.querySelectorAll<HTMLElement>('[data-resource-row]'));
  const row = calendarResourceRowAtPoint(rows, clientY, rect);
  if (!row?.dataset.resourceId) return null;
  if (!isVisibleTimelineDrop(shell, row, clientX, clientY)) return null;

  const scale = shell.querySelector<HTMLElement>('[data-calendar-min-minutes]')?.dataset ?? {};
  const minMinutes = visibleMinute(scale.calendarMinMinutes, options.minTime);
  const maxMinutes = visibleMinute(scale.calendarMaxMinutes, options.maxTime);
  const dayMinutes = Math.max(options.stepMinutes, maxMinutes - minMinutes);
  const dayCount = differenceInCalendarDays(options.rangeEnd, options.rangeStart) + 1;
  const axisMinutes = ((clientX - rect.left) / width) * dayMinutes * dayCount;
  const snappedMinutes = Math.floor(axisMinutes / options.stepMinutes) * options.stepMinutes;
  const dayIndex = Math.min(dayCount - 1, Math.floor(snappedMinutes / dayMinutes));
  const latestStart = Math.max(minMinutes, maxMinutes - Math.ceil(options.durationMs / 60000));
  const minutes = Math.min(latestStart, minMinutes + snappedMinutes - dayIndex * dayMinutes);
  const start = startOfDay(addDays(options.rangeStart, dayIndex));
  start.setMinutes(minutes);
  return { resourceId: row.dataset.resourceId, start, end: new Date(start.getTime() + options.durationMs) };
}
