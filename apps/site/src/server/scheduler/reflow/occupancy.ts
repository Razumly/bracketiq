import type { ReflowMatch, ReflowPlacement } from './types';

/** A running Match occupies its Resources at least until the snapshot time. */
export const occupiedPlacement = (match: ReflowMatch, placement: ReflowPlacement): ReflowPlacement => ({
  ...placement, end: match.actualEnd ?? match.occupiedUntil ?? placement.end,
});
