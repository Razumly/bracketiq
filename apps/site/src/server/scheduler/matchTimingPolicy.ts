export type MatchTimingPolicyInput = {
  scoringModel?: string | null;
  usesSets?: boolean | null;
  segmentCount?: number | null;
  setsPerMatch?: number | null;
  segmentLengthMinutes?: number | null;
  setDurationMinutes?: number | null;
  matchDurationMinutes?: number | null;
  segmentBreakMinutes?: number | null;
  breakLengthMinutes?: number | null;
  restTimeMinutes?: number | null;
};

export type MatchTimingPolicy = {
  durationMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
  source: 'SEGMENTS' | 'MATCH_DURATION' | 'DEFAULT';
};

const positiveInt = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.trunc(parsed));
};

const nonNegativeInt = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.max(0, Math.trunc(parsed));
};

/** Resolve one canonical match duration from editable timing inputs. */
export const resolveMatchTimingPolicy = (
  input: MatchTimingPolicyInput,
): MatchTimingPolicy => {
  const segmentCount = positiveInt(input.segmentCount ?? input.setsPerMatch);
  const segmentLengthMinutes = positiveInt(input.segmentLengthMinutes ?? input.setDurationMinutes);
  const usesSegments = input.usesSets === true
    || String(input.scoringModel ?? '').trim().toUpperCase() === 'SETS'
    || Boolean(segmentCount && segmentLengthMinutes);
  const matchDurationMinutes = positiveInt(input.matchDurationMinutes);
  const segmentBreakMinutes = nonNegativeInt(input.segmentBreakMinutes);
  const durationMinutes = usesSegments && segmentCount && segmentLengthMinutes
    ? segmentCount * segmentLengthMinutes + Math.max(segmentCount - 1, 0) * segmentBreakMinutes
    : matchDurationMinutes ?? 60;
  const source = usesSegments && segmentCount && segmentLengthMinutes
    ? 'SEGMENTS'
    : matchDurationMinutes
      ? 'MATCH_DURATION'
      : 'DEFAULT';
  const breakMinutes = nonNegativeInt(input.breakLengthMinutes ?? input.restTimeMinutes);
  return {
    durationMinutes,
    breakMinutes,
    totalMinutes: durationMinutes + breakMinutes,
    source,
  };
};

export const calculateMatchDurationMinutes = (input: MatchTimingPolicyInput): number => (
  resolveMatchTimingPolicy(input).durationMinutes
);
