import { z } from 'zod';

export const registrationDraftStepSchema = z.enum([
  'team', 'players', 'review', 'questions', 'signing', 'billing', 'checkout',
]);
const optionalId = z.string().trim().min(1).max(200).nullable();

export const registrationDraftScopeSchema = z.object({
  slotId: optionalId.optional(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const registrationDraftPatchSchema = z.object({
  selectedTeamId: optionalId.optional(),
  selectedDivisionId: optionalId.optional(),
  selectedDivisionTypeKey: optionalId.optional(),
  answers: z.record(z.string().max(200), z.string().max(10000)).refine(
    (answers) => Object.keys(answers).length <= 100, 'Too many answers.',
  ).optional(),
  step: registrationDraftStepSchema.optional(),
  completedSteps: z.array(registrationDraftStepSchema).max(7).optional(),
  registrationId: optionalId.optional(),
  teamCreationId: optionalId.optional(),
}).strict();

export const registrationDraftSaveSchema = registrationDraftScopeSchema.extend({
  version: z.literal(1),
  baseRevision: z.number().int().nonnegative(),
  patch: registrationDraftPatchSchema,
}).strict();

export const eventRegistrationScopeSchema = registrationDraftScopeSchema.extend({
  eventId: z.string().trim().min(1).max(200),
}).strict();
export type EventRegistrationScope = z.infer<typeof eventRegistrationScopeSchema>;

export const eventTeamCreationContextSchema = registrationDraftScopeSchema.extend({
  eventId: z.string().trim().min(1).max(200),
  baseRevision: z.number().int().nonnegative(),
}).strict();
export type EventTeamCreationContext = z.infer<typeof eventTeamCreationContextSchema>;

export type EventRegistrationDraftStep = z.infer<typeof registrationDraftStepSchema>;
export type EventRegistrationDraftPatch = z.infer<typeof registrationDraftPatchSchema>;
export type EventRegistrationDraftScope = z.infer<typeof registrationDraftScopeSchema>;
export type EventRegistrationDraftSave = z.infer<typeof registrationDraftSaveSchema>;

export type EventRegistrationDraft = {
  id: string;
  eventId: string;
  slotId: string | null;
  occurrenceDate: string | null;
  revision: number;
  selectedTeamId: string | null;
  selectedDivisionId: string | null;
  selectedDivisionTypeKey: string | null;
  answers: Record<string, string>;
  step: EventRegistrationDraftStep;
  completedSteps: EventRegistrationDraftStep[];
  registrationId: string | null;
  holdExpiresAt: string | null;
  teamCreationId: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type EventRegistrationDraftState = {
  version: 1;
  draft: EventRegistrationDraft | null;
  eligibleTeams: Array<{ id: string; name: string; sport: string | null }>;
  selectedTeamId: string | null;
  selectionSource: 'draft' | 'remembered' | 'sole' | null;
  available: boolean;
  unavailableReason: string | null;
  invalidations: string[];
};
