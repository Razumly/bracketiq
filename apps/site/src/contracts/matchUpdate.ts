import { z } from "zod";

const scoreMapSchema = z.record(z.string(), z.number());
const clientOperationFields = {
  clientOperationId: z.string().optional(),
  clientDeviceId: z.string().optional(),
  clientCreatedAt: z.string().optional(),
  clientSequence: z.number().int().nonnegative().optional(),
  sourceDevice: z.string().optional(),
} as const;
export const lifecycleSchema = z.object({
  status: z.string().nullable().optional(),
  resultStatus: z.string().nullable().optional(),
  resultType: z.string().nullable().optional(),
  actualStart: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  statusReason: z.string().nullable().optional(),
  winnerEventTeamId: z.string().nullable().optional(),
}).optional();
export const segmentOperationSchema = z.object({
  id: z.string().optional(),
  sequence: z.number().int().positive(),
  status: z.string().optional(),
  scores: scoreMapSchema.optional(),
  winnerEventTeamId: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  resultType: z.string().nullable().optional(),
  statusReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  clockStoppedAt: z.string().nullable().optional(),
  clockStoppedDurationSeconds: z.number().int().nonnegative().optional(),
  ...clientOperationFields,
});
export const incidentOperationSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  id: z.string().optional(),
  segmentId: z.string().nullable().optional(),
  eventTeamId: z.string().nullable().optional(),
  eventRegistrationId: z.string().nullable().optional(),
  participantUserId: z.string().nullable().optional(),
  officialUserId: z.string().nullable().optional(),
  incidentType: z.string().optional(),
  sequence: z.number().int().positive().optional(),
  minute: z.number().int().nullable().optional(),
  clock: z.string().nullable().optional(),
  clockSeconds: z.number().int().nullable().optional(),
  linkedPointDelta: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  ...clientOperationFields,
});
export const officialCheckInSchema = z.object({
  positionId: z.string().optional(),
  slotIndex: z.number().int().nonnegative().optional(),
  userId: z.string().optional(),
  checkedIn: z.boolean(),
}).optional();
const matchPolicySchema = z.object({
  scoringModel: z.enum(['SETS', 'PERIODS', 'INNINGS', 'POINTS_ONLY']).nullable().optional(),
  segmentCount: z.number().int().positive().nullable().optional(),
  setPointTargets: z.array(z.number().int().positive()).nullable().optional(),
  matchDurationMinutes: z.number().int().positive().nullable().optional(),
  setDurationMinutes: z.number().int().positive().nullable().optional(),
  timekeeping: z.record(z.string(), z.unknown()).nullable().optional(),
}).optional();
const matchRulesSnapshotSchema = z.record(z.string(), z.unknown()).nullable().optional();
export const matchActionSchema = z.object({
  action: z.enum(['FORFEIT', 'CANCEL', 'NO_CONTEST', 'SUSPEND', 'RESUME']),
  forfeitingEventTeamId: z.string().nullable().optional(),
  winnerEventTeamId: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
}).optional();

const matchUpdateSchema = z.object({
  terminalContractVersion: z.literal(1).optional(),
  start: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  end: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  locked: z.boolean().optional(),
  team1Points: z.array(z.number()).optional(),
  team2Points: z.array(z.number()).optional(),
  lifecycle: lifecycleSchema,
  segmentOperations: z.array(segmentOperationSchema).optional(),
  incidentOperations: z.array(incidentOperationSchema).optional(),
  officialCheckIn: officialCheckInSchema,
  team1Id: z.string().nullable().optional(),
  team2Id: z.string().nullable().optional(),
  officialId: z.string().nullable().optional(),
  officialIds: z.any().optional(),
  teamOfficialId: z.string().nullable().optional(),
  fieldId: z.string().nullable().optional(),
  previousLeftId: z.string().nullable().optional(),
  previousRightId: z.string().nullable().optional(),
  winnerNextMatchId: z.string().nullable().optional(),
  loserNextMatchId: z.string().nullable().optional(),
  side: z.string().nullable().optional(),
  officialCheckedIn: z.boolean().optional(),
  matchId: z.number().int().nullable().optional(),
  finalize: z.boolean().optional(),
  time: z.string().datetime({ offset: true }).optional(),
  matchPolicy: matchPolicySchema,
  matchRulesSnapshot: matchRulesSnapshotSchema,
  matchAction: matchActionSchema,
  ...clientOperationFields,
});

export type TerminalMatchAction = 'COMPLETE' | 'FORFEIT' | 'CANCEL' | 'NO_CONTEST';

const upperCaseToken = (value: string | null | undefined): string => value?.toUpperCase() ?? '';

const lifecycleTerminalAction = (lifecycle: z.infer<typeof lifecycleSchema>): TerminalMatchAction | null => {
  const state = lifecycle ?? {};
  const status = upperCaseToken(state.status);
  const resultType = upperCaseToken(state.resultType);
  const resultStatus = upperCaseToken(state.resultStatus);
  if (resultType === 'NO_CONTEST' || resultStatus === 'NO_CONTEST') return 'NO_CONTEST';
  if (status === 'CANCELLED') return 'CANCEL';
  if (resultType === 'FORFEIT') return 'FORFEIT';
  if (['COMPLETE', 'COMPLETED'].includes(status) || resultStatus === 'FINAL') return 'COMPLETE';
  return null;
};

export function terminalActionOf(update: z.infer<typeof matchUpdateSchema>): TerminalMatchAction | null {
  const action = update.matchAction?.action;
  if (action === 'FORFEIT' || action === 'CANCEL' || action === 'NO_CONTEST') return action;
  return lifecycleTerminalAction(update.lifecycle) ?? (update.finalize ? 'COMPLETE' : null);
}

export const updateSchema = matchUpdateSchema.superRefine((update, ctx) => {
  if (terminalActionOf(update) && !update.clientOperationId?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['clientOperationId'],
      message: 'A terminal operation needs a terminal action and a stable client operation ID.' });
  }
  if (update.terminalContractVersion && !terminalActionOf(update)) {
    ctx.addIssue({ code: 'custom', path: ['terminalContractVersion'],
      message: 'The terminal contract version is valid only for a terminal action.' });
  }
  if (update.finalize && update.matchAction) {
    ctx.addIssue({ code: 'custom', path: ['matchAction'], message: 'Send one terminal action per operation.' });
  }
});
