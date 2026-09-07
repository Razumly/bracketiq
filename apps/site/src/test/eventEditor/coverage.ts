import { z } from 'zod';
import * as contract from '@/contracts/eventEditor';

type Schema = z.core.$ZodType;

// Draft leaves have one classification shared by all command envelopes.
export const commandSchemas = {
  draft: contract.eventEditorDraftSchema,
  create: contract.createEventEditorCommandSchema,
  save: contract.saveEventEditorCommandSchema,
  accept: contract.eventEditorAcceptProposalCommandSchema,
  acceptPartial: contract.eventEditorAcceptPartialProposalCommandSchema,
  reject: contract.eventEditorRejectProposalCommandSchema,
  maintenance: contract.eventEditorMaintenanceRequestSchema,
  acceptMaintenance: contract.eventEditorAcceptMaintenanceProposalSchema,
  rejectMaintenance: contract.eventEditorRejectMaintenanceProposalSchema,
};

export const operationSchemas: Record<string, z.ZodType> = {
  ...commandSchemas,
};

export const resultSchemas: Record<string, z.ZodType> = {
  saved: contract.eventEditorSaveResultSchema,
  error: contract.eventEditorErrorSchema,
  schedule: contract.eventEditorScheduleOutcomeSchema,
  maintenanceRejected: contract.eventEditorMaintenanceRejectedResultSchema,
  created: contract.eventEditorCreateResultSchema,
  createProposal: contract.eventEditorCreateProposalSchema,
  maintenanceProposal: contract.eventEditorMaintenanceProposalSchema,
  maintenanceAccepted: contract.eventEditorMaintenanceAcceptedResultSchema,
  partialAccepted: contract.eventEditorAcceptPartialProposalResultSchema,
};

export const protocolSchemas = z.object({
  commands: z.object(commandSchemas),
  results: z.object(resultSchemas),
  snapshot: contract.eventEditorSnapshotSchema,
  createResponse: contract.eventEditorCreateResponseSchema,
  maintenanceResponse: contract.eventEditorMaintenanceResponseSchema,
});

type FieldClassification = {
  path: string;
  classification?: string;
  reason?: string;
  mobileOwner?: string;
};

const assertClassifications = (entries: readonly FieldClassification[]): void => {
  const categories = new Set(['covered', 'derived', 'immutable', 'server-owned', 'conditional', 'intentionally-excluded']);
  entries.forEach((entry) => {
    if (!categories.has(entry.classification ?? '') || !entry.reason?.trim() || !entry.mobileOwner?.startsWith('apps/mobile/composeApp/')) {
      throw new Error(`Missing classification, reason, or mobile owner: ${entry.path}`);
    }
  });
};

export const valuesAtPath = (value: unknown, path: string): unknown[] => {
  const tokens = path.match(/\[\d*\]|[^.[\]]+/g) ?? [];
  return tokens.reduce<unknown[]>((values, token) => values.flatMap((entry): unknown[] => {
    if (token === '[]') return Array.isArray(entry) ? entry : [];
    if (token === '*') return entry && typeof entry === 'object' ? Object.values(entry) : [];
    if (entry === null || typeof entry !== 'object') return [];
    const key = token.startsWith('[') ? token.slice(1, -1) : token;
    return Object.prototype.hasOwnProperty.call(entry, key) ? [(entry as Record<string, unknown>)[key]] : [];
  }), [value]);
};

const wrappedSchema = (schema: Schema): Schema | undefined => {
  if (schema instanceof z.ZodPipe) {
    return schema.in instanceof z.ZodTransform ? schema.out : schema.in;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return schema.unwrap();
  }
  return undefined;
};

const collectionLeaves = (schema: Schema, path: string): string[] | undefined => {
  if (schema instanceof z.ZodArray) return schemaLeaves(schema.element, `${path}[]`);
  if (schema instanceof z.ZodRecord) return schemaLeaves(schema.valueType, `${path}.*`);
  if (schema instanceof z.ZodTuple) {
    return schema.def.items.flatMap((item, index) => schemaLeaves(item, `${path}[${index}]`));
  }
  return undefined;
};

export const schemaLeaves = (schema: Schema, path: string): string[] => {
  const wrapped = wrappedSchema(schema);
  if (wrapped) return schemaLeaves(wrapped, path);
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, value]) => schemaLeaves(value as Schema, `${path}.${key}`)).sort();
  }
  if (schema instanceof z.ZodUnion) {
    return [...new Set(schema.options.flatMap((option) => schemaLeaves(option, path)))].sort();
  }
  return collectionLeaves(schema, path) ?? [path];
};

export const assertFieldInventory = (
  schemas: Record<string, z.ZodType>,
  entries: readonly FieldClassification[],
): void => {
  const actual = new Set(Object.entries(schemas).flatMap(([name, schema]) => schemaLeaves(schema, name)));
  const declared = new Set(entries.map(({ path }) => path));
  const draftOwners = ['create', 'save', 'accept', 'acceptPartial'].filter((name) => Object.prototype.hasOwnProperty.call(schemas, name));
  const expected = new Set(entries.flatMap(({ path }) => path.startsWith('draft.')
    ? [path, ...draftOwners.map((name) => `${name}.${path}`)]
    : [path]));
  const added = [...actual].filter((path) => !expected.has(path));
  const removed = [...expected].filter((path) => !actual.has(path));
  if (added.length || removed.length || declared.size !== entries.length) {
    throw new Error(`Unclassified fields: ${added.join(', ')}. Removed fields: ${removed.join(', ')}. Duplicate entries: ${entries.length - declared.size}.`);
  }
  assertClassifications(entries);
};
