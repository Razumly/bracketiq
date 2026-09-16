import { z } from 'zod';
import { eventEditorCreateProposalGraphSchema } from './eventEditor';

export const SCHEDULE_REFLOW_CONTRACT_VERSION = 1;
const id = z.string().trim().min(1).max(200);
const ids = z.array(id).refine((values) => new Set(values).size === values.length, 'IDs must be unique.');
const placement = z.object({ start: z.string().datetime(), end: z.string().datetime(), fieldId: id }).strict();
const assignment = z.object({
  positionId: id, slotIndex: z.number().int().nonnegative(), holderType: z.enum(['OFFICIAL', 'PLAYER']),
  userId: id.nullable(), eventOfficialId: id.nullable(), checkedIn: z.boolean(), hasConflict: z.boolean(),
}).strict();
const assignments = z.object({ teamOfficialId: id.nullable(), officialAssignments: z.array(assignment) }).strict();

export const scheduleReflowRequestSchema = z.object({
  contractVersion: z.literal(SCHEDULE_REFLOW_CONTRACT_VERSION), eventId: id,
  changedMatchIds: ids.refine((values) => values.length > 0 && values.length <= 2_048, 'Supply 1 to 2048 Match IDs.'),
  expectedScheduleRevision: id,
  fieldPolicy: z.enum(['KEEP_ASSIGNED_FIELDS', 'ALLOW_ELIGIBLE_FIELD_CHANGES']),
}).strict();

export const scheduleReflowResultSchema = z.object({
  contractVersion: z.literal(SCHEDULE_REFLOW_CONTRACT_VERSION), eventId: id,
  status: z.enum(['CHANGED', 'NO_OP', 'INFEASIBLE', 'SEARCH_LIMIT', 'STALE']),
  scheduleRevision: id, affectedMatchIds: ids, protectedMatchIds: ids,
  placementChanges: z.array(z.object({ matchId: id, before: placement, after: placement }).strict()),
  assignmentChanges: z.array(z.object({ matchId: id, before: assignments, after: assignments }).strict()),
  warnings: z.array(z.object({ code: id, matchIds: ids, message: z.string().min(1) }).strict()),
  exploredStates: z.number().int().nonnegative(), graph: eventEditorCreateProposalGraphSchema.nullable(),
}).strict().superRefine((result, context) => {
  const hasChanges = result.placementChanges.length + result.assignmentChanges.length > 0;
  if ((result.status === 'CHANGED') !== hasChanges || (result.status === 'CHANGED') !== (result.graph !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only CHANGED can contain changes and a graph.' });
  }
  if (result.graph && (result.graph.event.id !== result.eventId
    || result.graph.matches.some((match) => match.eventId !== result.eventId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The graph must belong to the requested Event.' });
  }
});

export type ScheduleReflowRequest = z.infer<typeof scheduleReflowRequestSchema>;
export type ScheduleReflowResult = z.infer<typeof scheduleReflowResultSchema>;
