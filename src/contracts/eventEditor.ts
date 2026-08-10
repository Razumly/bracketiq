import { z } from 'zod';

export const EVENT_EDITOR_CONTRACT_VERSION = 1 as const;

const id = z.string().trim().min(1);
const nullableId = id.nullable();
const isoDateTime = z.string().trim().min(1);
const cents = z.number().int().nonnegative();
const integer = z.number().int();
const unknownRecord = z.record(z.string(), z.unknown());
const optionalString = z.string().nullable().optional();
const optionalDateLike = z.union([z.string(), z.date()]).nullable().optional();
const optionalNumber = z.number().finite().nullable().optional();
const optionalBoolean = z.boolean().nullable().optional();

const editorFieldSchema = z.object({
  id: id.optional(),
  $id: id.optional(),
  name: z.string().optional(),
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lat: optionalNumber,
  long: optionalNumber,
  heading: optionalNumber,
  inUse: optionalBoolean,
  rentalSlotIds: z.array(id).optional(),
  sportIds: z.array(id).optional(),
  createdBy: optionalString,
  archivedAt: optionalString,
  archivedByUserId: optionalString,
  archiveReason: optionalString,
  organizationId: optionalString,
  facilityId: optionalString,
  latitude: optionalNumber,
  longitude: optionalNumber,
}).strict();

const editorTimeSlotSchema = z.object({
  id: id.optional(),
  $id: id.optional(),
  eventId: optionalString,
  archivedAt: optionalString,
  archivedByUserId: optionalString,
  archiveReason: optionalString,
  dayOfWeek: z.number().int().nonnegative().optional(),
  daysOfWeek: z.array(z.number().int().nonnegative()).optional(),
  startTimeMinutes: z.number().int().nonnegative().optional(),
  endTimeMinutes: z.number().int().nonnegative().optional(),
  startDate: optionalString,
  endDate: optionalString,
  start: optionalString,
  end: optionalString,
  timeZone: z.string().optional(),
  scheduledFieldId: optionalString,
  scheduledFieldIds: z.array(id).optional(),
  fieldId: optionalString,
  fieldIds: z.array(id).optional(),
  division: optionalString,
  divisions: z.array(id).optional(),
  divisionKeys: z.array(id).optional(),
  requiredTemplateIds: z.array(id).optional(),
  hostRequiredTemplateIds: z.array(id).optional(),
  repeating: optionalBoolean,
  price: optionalNumber,
  taxHandling: z.string().optional(),
  sourceType: optionalString,
  rentalBookingId: optionalString,
  rentalBookingItemId: optionalString,
  rentalLocked: optionalBoolean,
}).strict();

const divisionDetailSchema = z.object({
  id,
  sourceDivisionId: optionalString,
  key: z.string(),
  name: z.string(),
  kind: z.enum(['LEAGUE', 'PLAYOFF']),
  poolPlay: optionalBoolean,
  divisionTypeId: z.string(),
  skillDivisionTypeId: z.string(),
  ageDivisionTypeId: z.string(),
  divisionTypeName: z.string(),
  ratingType: z.string(),
  gender: z.string().optional(),
  price: optionalNumber,
  maxParticipants: optionalNumber,
  playoffTeamCount: optionalNumber,
  poolCount: optionalNumber,
  poolTeamCount: optionalNumber,
  phaseSettings: unknownRecord.optional(),
  playoffPlacementDivisionIds: z.array(id).optional(),
  standingsOverrides: z.record(z.string(), z.number()).nullable().optional(),
  playoffConfig: unknownRecord.nullable().optional(),
  gamesPerOpponent: optionalNumber,
  restTimeMinutes: optionalNumber,
  usesSets: optionalBoolean,
  matchDurationMinutes: optionalNumber,
  setDurationMinutes: optionalNumber,
  setsPerMatch: optionalNumber,
  pointsToVictory: z.array(z.number().int()).optional(),
  standingsConfirmedAt: optionalString,
  standingsConfirmedBy: optionalString,
  allowPaymentPlans: optionalBoolean,
  installmentCount: optionalNumber,
  installmentDueDates: z.array(z.string()).optional(),
  installmentDueRelativeDays: z.array(z.number().int()).optional(),
  installmentAmounts: z.array(cents).optional(),
  ageCutoffDate: optionalString,
  ageCutoffLabel: optionalString,
  ageCutoffSource: optionalString,
  fieldIds: z.array(id),
  teamIds: z.array(id).optional(),
}).strict();

const officialPositionSchema = z.object({
  id,
  name: z.string(),
  count: z.number().int().nonnegative(),
  order: z.number().int().nonnegative(),
}).strict();

const eventOfficialSchema = z.object({
  id: id.optional(),
  userId: id,
  positionIds: z.array(id),
  fieldIds: z.array(id),
  isActive: z.boolean(),
}).strict();

const staffInviteSchema = z.object({
  id: id.optional(),
  createdAt: optionalDateLike,
  updatedAt: optionalDateLike,
  sentAt: optionalDateLike,
  email: z.string().email(),
  firstName: optionalString,
  lastName: optionalString,
  roles: z.array(z.enum(['OFFICIAL', 'ASSISTANT_HOST'])).optional(),
  staffTypes: z.array(z.string()).optional(),
  resolvedUserId: optionalString,
  userId: optionalString,
  type: z.string().optional(),
  status: z.string().optional(),
  eventId: optionalString,
  organizationId: optionalString,
  teamId: optionalString,
  createdBy: optionalString,
}).strict();

const questionBase = z.object({
  prompt: z.string().trim().min(1).max(500),
  answerType: z.enum(['TEXT', 'LONG_TEXT']),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
}).strict();

const manualPaymentLinkSchema = z.object({
  id: id.optional(),
  provider: z.string().optional(),
  label: z.string().optional(),
  url: z.string().url().optional(),
}).strict();

const editorTagSchema = z.object({
  id: id.optional(),
  $id: id.optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
}).strict();

export const existingRegistrationQuestionSchema = questionBase.extend({
  id,
}).strict();

export const newRegistrationQuestionSchema = questionBase.extend({
  clientId: id,
}).strict();

export const registrationQuestionInputSchema = z.union([
  existingRegistrationQuestionSchema,
  newRegistrationQuestionSchema,
]);

const scheduleFixedSchema = z.object({
  mode: z.literal('FIXED_END'),
  endConstraint: isoDateTime,
}).strict();

const scheduleGeneratedSchema = z.object({
  mode: z.literal('GENERATED_END'),
  endConstraint: z.null(),
  generatedScheduleEnd: optionalDateLike,
}).strict();

export const editorScheduleSchema = z.discriminatedUnion('mode', [
  scheduleFixedSchema,
  scheduleGeneratedSchema,
]);

export const editorPaymentSchema = z.object({
  mode: z.enum(['FREE', 'ONLINE', 'MANUAL']),
  priceCents: cents,
  taxHandling: z.string().trim().min(1),
  organizerManualTaxRateBps: z.number().int().nonnegative(),
  manualPaymentInstructions: z.string().nullable(),
  manualPaymentLinks: z.array(manualPaymentLinkSchema),
  allowPaymentPlans: z.boolean(),
  installmentCount: z.number().int().nonnegative().nullable(),
  installmentDueDates: z.array(isoDateTime),
  installmentDueRelativeDays: z.array(integer),
  installmentAmounts: z.array(cents),
}).strict();

export const editorBasicsSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  eventType: z.string().trim().min(1),
  sportIds: z.array(id),
  start: isoDateTime,
  timeZone: z.string().trim().min(1),
  location: z.string(),
  address: z.string(),
  coordinates: z.tuple([z.number(), z.number()]),
  affiliateUrl: z.string(),
  parentEvent: nullableId,
  organizationId: nullableId,
  hostId: nullableId,
  state: z.string().trim().min(1),
  imageId: nullableId,
  tags: z.array(editorTagSchema),
}).strict();

export const editorParticipationSchema = z.object({
  teamSignup: z.boolean(),
  singleDivision: z.boolean(),
  registrationByDivisionType: z.boolean(),
  teamSizeLimit: z.number().int().positive().nullable(),
  maxParticipants: z.number().int().positive().nullable(),
  minAge: z.number().int().nonnegative().nullable(),
  maxAge: z.number().int().nonnegative().nullable(),
  cancellationRefundHours: z.number().int().nonnegative().nullable(),
  registrationCutoffHours: z.number().int().nonnegative(),
  allowTeamSplitDefault: z.boolean(),
  waitListIds: z.array(id),
  freeAgentIds: z.array(id),
}).strict();

export const editorCompetitionSchema = z.object({
  divisionIds: z.array(id),
  divisionDetails: z.array(divisionDetailSchema),
  playoffDivisionDetails: z.array(divisionDetailSchema),
  divisionFieldIds: z.record(z.string(), z.array(id)),
  winnerSetCount: z.number().int().positive().nullable(),
  loserSetCount: z.number().int().positive().nullable(),
  doubleElimination: z.boolean(),
  includePlayoffs: z.boolean(),
  splitLeaguePlayoffDivisions: z.boolean(),
  playoffTeamCount: z.number().int().positive().nullable(),
  pointsToVictory: z.array(integer),
  winnerBracketPointsToVictory: z.array(integer),
  loserBracketPointsToVictory: z.array(integer),
  usesSets: z.boolean(),
  setsPerMatch: z.number().int().positive().nullable(),
  setDurationMinutes: z.number().positive().nullable(),
  restTimeMinutes: z.number().nonnegative().nullable(),
  matchDurationMinutes: optionalNumber,
  gamesPerOpponent: z.number().int().positive().nullable(),
  matchRulesOverride: unknownRecord.nullable(),
  leagueScoringConfig: unknownRecord.nullable(),
}).strict();

export const editorResourcesSchema = z.object({
  fieldIds: z.array(id),
  fields: z.array(editorFieldSchema),
  timeSlotIds: z.array(id),
  timeSlots: z.array(editorTimeSlotSchema),
  requiredTemplateIds: z.array(id),
  immutableFieldIds: z.array(id),
  rentalBookingId: nullableId,
  rentalBookingItemId: nullableId,
}).strict();

export const editorStaffSchema = z.object({
  officialSchedulingMode: z.enum(['SCHEDULE', 'STAFFING', 'TEAM_STAFFING']),
  teamOfficialsMaySwap: z.boolean(),
  teamCheckInMode: z.enum(['OFF', 'EVENT', 'MATCH']),
  teamCheckInOpenMinutesBefore: z.number().int().nonnegative(),
  allowMatchRosterEdits: z.boolean(),
  allowTemporaryMatchPlayers: z.boolean(),
  autoCreatePointMatchIncidents: z.boolean(),
  officialIds: z.array(id),
  officialPositions: z.array(officialPositionSchema),
  eventOfficials: z.array(eventOfficialSchema),
  assistantHostIds: z.array(id),
  pendingInvites: z.array(staffInviteSchema),
}).strict();

export const eventEditorDraftSchema = z.object({
  basics: editorBasicsSchema,
  participation: editorParticipationSchema,
  registration: z.object({
    payment: editorPaymentSchema,
    questions: z.array(registrationQuestionInputSchema),
    requiredDocumentIds: z.array(id),
  }).strict(),
  competition: editorCompetitionSchema,
  schedule: editorScheduleSchema,
  resources: editorResourcesSchema,
  staff: editorStaffSchema,
}).strict();
export const eventEditorBootstrapDraftSchema = eventEditorDraftSchema.extend({
  basics: editorBasicsSchema.extend({
    name: z.string(),
  }),
}).strict();

export const editorCapabilitiesSchema = z.object({
  canUseOnlinePayments: z.boolean(),
  canManageStaff: z.boolean(),
  canEdit: z.boolean(),
  supportsTeamStaffing: z.boolean(),
}).strict();

export const editorCatalogsSchema = z.object({
  sports: z.array(unknownRecord),
  organizations: z.array(unknownRecord),
  fields: z.array(unknownRecord),
  templates: z.array(unknownRecord),
}).strict();

export const eventEditorSnapshotSchema = z.object({
  contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
  draft: eventEditorBootstrapDraftSchema,
  mode: z.enum(['CREATE', 'EDIT']),
  eventId: nullableId,
  editorRevision: id,
  staffRevision: z.string().nullable(),
  capabilities: editorCapabilitiesSchema,
  catalogs: editorCatalogsSchema,
  immutable: z.object({
    fieldNames: z.array(z.string()),
    rental: z.boolean(),
    template: z.boolean(),
  }).strict(),
}).strict();

export const eventEditorBootstrapQuerySchema = z.object({
  organizationId: id.nullish(),
  eventType: z.string().trim().min(1).nullish(),
  sportId: id.nullish(),
  parentEventId: id.nullish(),
  templateId: id.nullish(),
  rentalBookingId: id.nullish(),
}).strict();

export const saveEventEditorCommandSchema = z.object({
  contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
  editorRevision: id,
  staffRevision: z.string().nullable(),
  draft: eventEditorDraftSchema,
}).strict();

export const createEventEditorCommandSchema = z.object({
  contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
  draft: eventEditorDraftSchema,
}).strict();

export const eventEditorSaveResultSchema = z.object({
  status: z.literal('SAVED'),
  snapshot: eventEditorSnapshotSchema,
  questionIdMap: z.record(z.string(), id),
  staffEmailDelivery: z.enum(['QUEUED', 'FAILED', 'NOT_REQUESTED']),
}).strict();

export const eventEditorErrorSchema = z.object({
  error: z.string(),
  code: z.enum([
    'INVALID_EDITOR_COMMAND',
    'EDITOR_REVISION_CONFLICT',
    'STAFF_REVISION_CONFLICT',
    'INVALID_EDITOR_INPUT',
    'EDITOR_PERMISSION_DENIED',
    'EDITOR_IMMUTABLE_FIELD',
    'EDITOR_CAPABILITY_REQUIRED',
    'EDITOR_NOT_FOUND',
    'EDITOR_SAVE_FAILED',
  ]),
  editorRevision: z.string().nullable().optional(),
  staffRevision: z.string().nullable().optional(),
  details: z.unknown().optional(),
}).strict();

export type EventEditorBootstrapQuery = z.infer<typeof eventEditorBootstrapQuerySchema>;
export type EventEditorSnapshot = z.infer<typeof eventEditorSnapshotSchema>;
export type EventEditorDraft = z.infer<typeof eventEditorDraftSchema>;
export type EventEditorBootstrapDraft = z.infer<typeof eventEditorBootstrapDraftSchema>;
export type SaveEventEditorCommand = z.infer<typeof saveEventEditorCommandSchema>;
export type CreateEventEditorCommand = z.infer<typeof createEventEditorCommandSchema>;
export type EventEditorSaveResult = z.infer<typeof eventEditorSaveResultSchema>;
export type EventEditorError = z.infer<typeof eventEditorErrorSchema>;
export type RegistrationQuestionInput = z.infer<typeof registrationQuestionInputSchema>;

export const parseEventEditorSnapshot = (input: unknown): EventEditorSnapshot => eventEditorSnapshotSchema.parse(input);
export const parseSaveEventEditorCommand = (input: unknown): SaveEventEditorCommand => saveEventEditorCommandSchema.parse(input);
export const parseCreateEventEditorCommand = (input: unknown): CreateEventEditorCommand => createEventEditorCommandSchema.parse(input);
