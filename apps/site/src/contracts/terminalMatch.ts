import { z } from 'zod';
import { eventEditorCreateProposalGraphSchema } from './eventEditor';
import { scheduleReflowResultSchema } from './scheduleReflow';

export const TERMINAL_MATCH_CONTRACT_VERSION = 1;
const id = z.string().trim().min(1);

export const terminalMatchResultSchema = z.object({
  contractVersion: z.literal(TERMINAL_MATCH_CONTRACT_VERSION),
  operationId: id, eventId: id, matchId: id,
  status: z.enum(['CHANGED', 'NO_OP', 'REPLAYED']),
  event: z.object({ id, end: z.string().datetime(), generatedScheduleEnd: z.string().datetime().nullable() }).strict(),
  matches: eventEditorCreateProposalGraphSchema.shape.matches,
  affectedMatchIds: z.array(id), protectedMatchIds: z.array(id),
  placementChanges: scheduleReflowResultSchema.shape.placementChanges,
  assignmentChanges: scheduleReflowResultSchema.shape.assignmentChanges,
  warnings: scheduleReflowResultSchema.shape.warnings,
  exploredStates: z.number().int().nonnegative(),
}).strict();

export type TerminalMatchResult = z.infer<typeof terminalMatchResultSchema>;
