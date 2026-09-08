export const compareRanges = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  Math.max(startA.getTime(), startB.getTime()) < Math.min(endA.getTime(), endB.getTime());

export type PublicRentalInterval = {
  start: Date;
  end: Date;
};

export const mergePublicRentalIntervals = (intervals: PublicRentalInterval[]): PublicRentalInterval[] => {
  const sorted = [...intervals]
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: PublicRentalInterval[] = [];

  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (!last || interval.start.getTime() > last.end.getTime()) {
      merged.push({
        start: new Date(interval.start.getTime()),
        end: new Date(interval.end.getTime()),
      });
      return;
    }
    if (interval.end.getTime() > last.end.getTime()) {
      last.end = new Date(interval.end.getTime());
    }
  });

  return merged;
};

export const subtractIntervals = (
  base: PublicRentalInterval,
  blockers: PublicRentalInterval[],
): PublicRentalInterval[] => {
  const overlaps = mergePublicRentalIntervals(
    blockers.flatMap((blocker) => {
      if (!compareRanges(base.start, base.end, blocker.start, blocker.end)) {
        return [];
      }
      const start = new Date(Math.max(base.start.getTime(), blocker.start.getTime()));
      const end = new Date(Math.min(base.end.getTime(), blocker.end.getTime()));
      return end.getTime() > start.getTime() ? [{ start, end }] : [];
    }),
  );

  if (!overlaps.length) {
    return [{ start: new Date(base.start.getTime()), end: new Date(base.end.getTime()) }];
  }

  const gaps: PublicRentalInterval[] = [];
  let cursor = new Date(base.start.getTime());
  overlaps.forEach((overlap) => {
    if (overlap.start.getTime() > cursor.getTime()) {
      gaps.push({
        start: new Date(cursor.getTime()),
        end: new Date(overlap.start.getTime()),
      });
    }
    if (overlap.end.getTime() > cursor.getTime()) {
      cursor = new Date(overlap.end.getTime());
    }
  });

  if (cursor.getTime() < base.end.getTime()) {
    gaps.push({
      start: new Date(cursor.getTime()),
      end: new Date(base.end.getTime()),
    });
  }

  return gaps;
};
