import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const nonEmptyStringSchema = z.string().min(1);

export type AffiliateSportsCatalogRow = {
  id: string;
  name: string;
};

export type AffiliateSportsCatalogSnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  sha256: string;
  sports: AffiliateSportsCatalogRow[];
};

export const affiliateSportsCatalogRowSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
}).strict();

export const compareAffiliateCatalogCodeUnits = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const sortAffiliateSportsCatalogRows = (
  rows: readonly AffiliateSportsCatalogRow[],
): AffiliateSportsCatalogRow[] => [...rows].sort((left, right) => (
  compareAffiliateCatalogCodeUnits(left.name, right.name)
  || compareAffiliateCatalogCodeUnits(left.id, right.id)
));

const assertUnpadded = (value: string, field: string, index: number): void => {
  if (value.trim().length === 0) {
    throw new Error(`Affiliate sports catalog row ${index} has a blank ${field}.`);
  }
  if (value !== value.trim()) {
    throw new Error(`Affiliate sports catalog row ${index} has a padded ${field}.`);
  }
};

const parseAndValidateRows = (
  rows: readonly AffiliateSportsCatalogRow[],
): AffiliateSportsCatalogRow[] => {
  if (rows.length === 0) {
    throw new Error('Affiliate sports catalog must not be empty.');
  }

  const parsed = rows.map((row, index) => {
    const candidate = affiliateSportsCatalogRowSchema.safeParse(row);
    if (!candidate.success) {
      throw new Error(`Invalid affiliate sports catalog row ${index}: ${candidate.error.message}`);
    }
    assertUnpadded(candidate.data.id, 'id', index);
    assertUnpadded(candidate.data.name, 'name', index);
    return candidate.data;
  });

  const ids = new Set<string>();
  const names = new Set<string>();
  const foldedNames = new Set<string>();
  parsed.forEach((row, index) => {
    if (ids.has(row.id)) {
      throw new Error(`Affiliate sports catalog contains duplicate id ${row.id}.`);
    }
    if (names.has(row.name)) {
      throw new Error(`Affiliate sports catalog contains duplicate exact name ${row.name}.`);
    }
    const foldedName = row.name.toLowerCase();
    if (foldedNames.has(foldedName)) {
      throw new Error(`Affiliate sports catalog contains a case-folded name collision for ${row.name}.`);
    }
    ids.add(row.id);
    names.add(row.name);
    foldedNames.add(foldedName);
    if (!row.id || !row.name) {
      throw new Error(`Affiliate sports catalog row ${index} is incomplete.`);
    }
  });

  return sortAffiliateSportsCatalogRows(parsed);
};

const catalogHashPayload = (sports: readonly AffiliateSportsCatalogRow[]) => ({
  schemaVersion: 1 as const,
  sports: sports.map(({ id, name }) => ({ id, name })),
});

export const affiliateSportsCatalogSha256 = (
  sports: readonly AffiliateSportsCatalogRow[],
): string => {
  const validatedSports = parseAndValidateRows(sports);
  return createHash('sha256')
    .update(JSON.stringify(catalogHashPayload(validatedSports)))
    .digest('hex');
};

const snapshotHash = (snapshot: Pick<AffiliateSportsCatalogSnapshot, 'sports'>): string => (
  affiliateSportsCatalogSha256(snapshot.sports)
);

export const affiliateSportsCatalogSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string().datetime({ offset: true }),
  sha256: sha256Schema,
  sports: z.array(affiliateSportsCatalogRowSchema).min(1),
}).strict().superRefine((snapshot, context) => {
  try {
    const rows = parseAndValidateRows(snapshot.sports);
    const expectedHash = snapshotHash({ sports: rows });
    if (snapshot.sha256.toLowerCase() !== expectedHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sha256'],
        message: 'Affiliate sports catalog snapshot hash does not match its sports.',
      });
    }
    if (JSON.stringify(rows) !== JSON.stringify(snapshot.sports)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sports'],
        message: 'Affiliate sports catalog sports must be sorted by name then id.',
      });
    }
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sports'],
      message: error instanceof Error ? error.message : 'Invalid affiliate sports catalog.',
    });
  }
});

export const buildAffiliateSportsCatalogSnapshot = (
  rows: readonly AffiliateSportsCatalogRow[],
  capturedAt: string,
): AffiliateSportsCatalogSnapshot => {
  const parsedRows = parseAndValidateRows(rows);
  const snapshot = {
    schemaVersion: 1 as const,
    capturedAt,
    sha256: affiliateSportsCatalogSha256(parsedRows),
    sports: parsedRows,
  };
  return affiliateSportsCatalogSnapshotSchema.parse(snapshot);
};

type SportsCatalogQueryable = {
  sports: {
    findMany: (args: { select: { id: true; name: true } }) => Promise<readonly AffiliateSportsCatalogRow[]>;
  };
};

export const loadAffiliateSportsCatalogSnapshot = async (
  queryable: SportsCatalogQueryable,
  capturedAt = new Date().toISOString(),
): Promise<AffiliateSportsCatalogSnapshot> => {
  const rows = await queryable.sports.findMany({ select: { id: true, name: true } });
  return buildAffiliateSportsCatalogSnapshot(rows, capturedAt);
};

export const assertAffiliateSportsCatalogSnapshot = (
  snapshot: unknown,
): AffiliateSportsCatalogSnapshot => affiliateSportsCatalogSnapshotSchema.parse(snapshot);

export type AffiliateSportsCatalogName = AffiliateSportsCatalogRow['name'];
