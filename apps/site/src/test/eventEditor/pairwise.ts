type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);

export const mergeFixturePatch = (value: unknown, patch: unknown): unknown => {
  if (!isRecord(value) || !isRecord(patch)) return patch;
  return Object.fromEntries([...new Set([...Object.keys(value), ...Object.keys(patch)])].map((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return [key, value[key]];
    // A schedule patch supplies the complete discriminated union branch.
    return [key, key === 'schedule' ? patch[key] : mergeFixturePatch(value[key], patch[key])];
  }));
};

export const rowPairs = (row: Record<string, string>): string[] => {
  const keys = Object.keys(row).sort();
  return keys.flatMap((key, index) => keys.slice(index + 1).map((other) => `${key}=${row[key]}|${other}=${row[other]}`));
};

const isFeasibleRow = (row: Record<string, string>): boolean => {
  if (['EVENT', 'TRYOUT'].includes(row.eventType) && row.endPolicy !== 'FIXED_END') return false;
  if (['EVENT', 'WEEKLY_EVENT', 'TRYOUT'].includes(row.eventType) && row.phase !== 'TIMED') return false;
  return row.eventType !== 'TRYOUT'
    || (row.authority !== 'PERSONAL' && row.staffing === 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED');
};

export const feasiblePairs = (factors: Record<string, readonly string[]>): string[] => {
  const candidates = Object.entries(factors).reduce<Record<string, string>[]>((rows, [key, values]) =>
    rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value }))), [{}]);
  return [...new Set(candidates.filter(isFeasibleRow).flatMap(rowPairs))];
};
