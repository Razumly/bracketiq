import { z } from "zod";
import {
  normalizeOfficialSchedulingMode,
  normalizeStaffingPriority,
  STAFFING_PRIORITIES,
} from "@/server/officials/config";

export const EVENT_EDITOR_CONTRACT_VERSION = 3 as const;

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

const editorFieldSchema = z
  .object({
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
  })
  .strict();

const editorTimeSlotSchema = z
  .object({
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
  })
  .strict();

const divisionDetailSchema = z
  .object({
    id,
    sourceDivisionId: optionalString,
    key: z.string(),
    name: z.string(),
    kind: z.enum(["LEAGUE", "PLAYOFF"]),
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
  })
  .strict();

const officialPositionSchema = z
  .object({
    id,
    name: z.string(),
    count: z.number().int().nonnegative(),
    order: z.number().int().nonnegative(),
  })
  .strict();

const eventOfficialSchema = z
  .object({
    id: id.optional(),
    userId: id,
    positionIds: z.array(id),
    fieldIds: z.array(id),
    isActive: z.boolean(),
  })
  .strict();

const staffInviteSchema = z
  .object({
    id: id.optional(),
    createdAt: optionalDateLike,
    updatedAt: optionalDateLike,
    sentAt: optionalDateLike,
    email: z.string().email(),
    firstName: optionalString,
    lastName: optionalString,
    roles: z.array(z.enum(["OFFICIAL", "ASSISTANT_HOST"])).optional(),
    staffTypes: z.array(z.string()).optional(),
    resolvedUserId: optionalString,
    userId: optionalString,
    type: z.string().optional(),
    status: z.string().optional(),
    eventId: optionalString,
    organizationId: optionalString,
    teamId: optionalString,
    createdBy: optionalString,
  })
  .strict();

const questionBase = z
  .object({
    prompt: z.string().trim().min(1).max(500),
    answerType: z.enum(["TEXT", "LONG_TEXT"]),
    required: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

const manualPaymentLinkSchema = z
  .object({
    id: id.optional(),
    provider: z.string().optional(),
    label: z.string().optional(),
    url: z.string().url().optional(),
  })
  .strict();

const editorTagSchema = z
  .object({
    id: id.optional(),
    $id: id.optional(),
    slug: z.string().optional(),
    name: z.string().optional(),
    label: z.string().optional(),
  })
  .strict();
const editorNestedRecordKeys = {
  fields: [
    "id",
    "$id",
    "name",
    "location",
    "address",
    "lat",
    "long",
    "heading",
    "inUse",
    "rentalSlotIds",
    "sportIds",
    "createdBy",
    "archivedAt",
    "archivedByUserId",
    "archiveReason",
    "organizationId",
    "facilityId",
    "latitude",
    "longitude",
  ],
  timeSlots: [
    "id",
    "$id",
    "eventId",
    "archivedAt",
    "archivedByUserId",
    "archiveReason",
    "dayOfWeek",
    "daysOfWeek",
    "startTimeMinutes",
    "endTimeMinutes",
    "startDate",
    "endDate",
    "start",
    "end",
    "timeZone",
    "scheduledFieldId",
    "scheduledFieldIds",
    "fieldId",
    "fieldIds",
    "division",
    "divisions",
    "divisionKeys",
    "requiredTemplateIds",
    "hostRequiredTemplateIds",
    "repeating",
    "price",
    "taxHandling",
    "sourceType",
    "rentalBookingId",
    "rentalBookingItemId",
    "rentalLocked",
  ],
  divisions: [
    "id",
    "sourceDivisionId",
    "key",
    "name",
    "kind",
    "poolPlay",
    "divisionTypeId",
    "skillDivisionTypeId",
    "ageDivisionTypeId",
    "divisionTypeName",
    "ratingType",
    "gender",
    "price",
    "maxParticipants",
    "playoffTeamCount",
    "poolCount",
    "poolTeamCount",
    "phaseSettings",
    "playoffPlacementDivisionIds",
    "standingsOverrides",
    "playoffConfig",
    "gamesPerOpponent",
    "restTimeMinutes",
    "usesSets",
    "matchDurationMinutes",
    "setDurationMinutes",
    "setsPerMatch",
    "pointsToVictory",
    "standingsConfirmedAt",
    "standingsConfirmedBy",
    "allowPaymentPlans",
    "installmentCount",
    "installmentDueDates",
    "installmentDueRelativeDays",
    "installmentAmounts",
    "ageCutoffDate",
    "ageCutoffLabel",
    "ageCutoffSource",
    "fieldIds",
    "teamIds",
  ],
  tags: ["id", "$id", "slug", "name", "label"],
  manualPaymentLinks: ["id", "provider", "label", "url"],
  officialPositions: ["id", "name", "count", "order"],
  eventOfficials: ["id", "userId", "positionIds", "fieldIds", "isActive"],
  pendingInvites: [
    "id",
    "createdAt",
    "updatedAt",
    "sentAt",
    "email",
    "firstName",
    "lastName",
    "roles",
    "staffTypes",
    "resolvedUserId",
    "userId",
    "type",
    "status",
    "eventId",
    "organizationId",
    "teamId",
    "createdBy",
  ],
  questions: [
    "id",
    "clientId",
    "prompt",
    "answerType",
    "required",
    "sortOrder",
  ],
} as const;

type UnknownRecord = Record<string, unknown>;

const isUnknownRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const projectNestedRecords = (
  value: unknown,
  keys: readonly string[],
): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!isUnknownRecord(entry)) return entry;
    return Object.fromEntries(
      keys
        .filter((key) => Object.prototype.hasOwnProperty.call(entry, key))
        .map((key) => [key, entry[key]]),
    );
  });
};

const nestedIdentifier = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (!isUnknownRecord(value)) {
    return null;
  }
  for (const key of ["$id", "id"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
};

const projectFieldRecords = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!isUnknownRecord(entry)) return entry;
    const projected = projectNestedRecords(
      [entry],
      editorNestedRecordKeys.fields,
    );
    const field =
      Array.isArray(projected) && isUnknownRecord(projected[0])
        ? projected[0]
        : {};
    const organizationId =
      nestedIdentifier(entry.organizationId) ??
      nestedIdentifier(entry.organization);
    const facilityId =
      nestedIdentifier(entry.facilityId) ?? nestedIdentifier(entry.facility);
    return {
      ...field,
      ...(organizationId ? { organizationId } : {}),
      ...(facilityId ? { facilityId } : {}),
    };
  });
};

/**
 * Removes hydrated UI and relation properties from strict nested editor rows.
 * Open JSON records stay untouched and strict command objects stay strict.
 */
export const projectEventEditorDraftNestedInput = (input: unknown): unknown => {
  if (!isUnknownRecord(input)) return input;
  const basics = isUnknownRecord(input.basics)
    ? {
        ...input.basics,
        tags: projectNestedRecords(
          input.basics.tags,
          editorNestedRecordKeys.tags,
        ),
      }
    : input.basics;
  const registration = isUnknownRecord(input.registration)
    ? {
        ...input.registration,
        questions: projectNestedRecords(
          input.registration.questions,
          editorNestedRecordKeys.questions,
        ),
        payment: isUnknownRecord(input.registration.payment)
          ? {
              ...input.registration.payment,
              manualPaymentLinks: projectNestedRecords(
                input.registration.payment.manualPaymentLinks,
                editorNestedRecordKeys.manualPaymentLinks,
              ),
            }
          : input.registration.payment,
      }
    : input.registration;
  const competition = isUnknownRecord(input.competition)
    ? {
        ...input.competition,
        divisionDetails: projectNestedRecords(
          input.competition.divisionDetails,
          editorNestedRecordKeys.divisions,
        ),
        playoffDivisionDetails: projectNestedRecords(
          input.competition.playoffDivisionDetails,
          editorNestedRecordKeys.divisions,
        ),
      }
    : input.competition;
  const resources = isUnknownRecord(input.resources)
    ? {
        ...input.resources,
        fields: projectFieldRecords(input.resources.fields),
        timeSlots: projectNestedRecords(
          input.resources.timeSlots,
          editorNestedRecordKeys.timeSlots,
        ),
      }
    : input.resources;
  const staff = isUnknownRecord(input.staff)
    ? {
        ...input.staff,
        officialPositions: projectNestedRecords(
          input.staff.officialPositions,
          editorNestedRecordKeys.officialPositions,
        ),
        eventOfficials: projectNestedRecords(
          input.staff.eventOfficials,
          editorNestedRecordKeys.eventOfficials,
        ),
        pendingInvites: projectNestedRecords(
          input.staff.pendingInvites,
          editorNestedRecordKeys.pendingInvites,
        ),
      }
    : input.staff;
  return { ...input, basics, registration, competition, resources, staff };
};

export const existingRegistrationQuestionSchema = questionBase
  .extend({
    id,
  })
  .strict();

export const newRegistrationQuestionSchema = questionBase
  .extend({
    clientId: id,
  })
  .strict();

export const registrationQuestionInputSchema = z.union([
  existingRegistrationQuestionSchema,
  newRegistrationQuestionSchema,
]);

const scheduleFixedSchema = z
  .object({
    mode: z.literal("FIXED_END"),
    endConstraint: isoDateTime,
  })
  .strict();

const scheduleGeneratedSchema = z
  .object({
    mode: z.literal("GENERATED_END"),
    endConstraint: z.null(),
    generatedScheduleEnd: optionalDateLike,
  })
  .strict();

export const editorScheduleSchema = z.discriminatedUnion("mode", [
  scheduleFixedSchema,
  scheduleGeneratedSchema,
]);

export const editorPaymentSchema = z
  .object({
    mode: z.enum(["FREE", "ONLINE", "MANUAL"]),
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
  })
  .strict();

export const editorBasicsSchema = z
  .object({
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
  })
  .strict();

export const editorParticipationSchema = z
  .object({
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
  })
  .strict();

export const editorCompetitionSchema = z
  .object({
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
  })
  .strict();

export const editorResourcesSchema = z
  .object({
    fieldIds: z.array(id),
    fields: z.array(editorFieldSchema),
    timeSlotIds: z.array(id),
    timeSlots: z.array(editorTimeSlotSchema),
    requiredTemplateIds: z.array(id),
    immutableFieldIds: z.array(id),
    rentalBookingId: nullableId,
    rentalBookingItemId: nullableId,
  })
  .strict();

const editorStaffSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return input;
    }
    const record = input as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, "officialSchedulingMode")) {
      return input;
    }
    const legacyMode = normalizeOfficialSchedulingMode(record.officialSchedulingMode);
    const normalized = { ...record };
    delete normalized.officialSchedulingMode;
    normalized.staffingPriority = normalizeStaffingPriority(
      record.staffingPriority,
      legacyMode,
    );
    if (typeof record.doTeamsOfficiate !== "boolean") {
      normalized.doTeamsOfficiate = legacyMode === "TEAM_STAFFING";
    }
    return normalized;
  },
  z
    .object({
      staffingPriority: z.enum(STAFFING_PRIORITIES),
      doTeamsOfficiate: z.boolean(),
      teamOfficialsMaySwap: z.boolean(),
      teamCheckInMode: z.enum(["OFF", "EVENT", "MATCH"]),
      teamCheckInOpenMinutesBefore: z.number().int().nonnegative(),
      allowMatchRosterEdits: z.boolean(),
      allowTemporaryMatchPlayers: z.boolean(),
      autoCreatePointMatchIncidents: z.boolean(),
      officialIds: z.array(id),
      officialPositions: z.array(officialPositionSchema),
      eventOfficials: z.array(eventOfficialSchema),
      assistantHostIds: z.array(id),
      pendingInvites: z.array(staffInviteSchema),
    })
    .strict(),
);

export const eventEditorDraftSchema = z
  .object({
    basics: editorBasicsSchema,
    participation: editorParticipationSchema,
    registration: z
      .object({
        payment: editorPaymentSchema,
        questions: z.array(registrationQuestionInputSchema),
        requiredDocumentIds: z.array(id),
      })
      .strict(),
    competition: editorCompetitionSchema,
    schedule: editorScheduleSchema,
    resources: editorResourcesSchema,
    staff: editorStaffSchema,
  })
  .strict();
export const eventEditorBootstrapDraftSchema = eventEditorDraftSchema
  .extend({
    basics: editorBasicsSchema.extend({
      name: z.string(),
    }),
  })
  .strict();

export const editorCapabilitiesSchema = z
  .object({
    canUseOnlinePayments: z.boolean(),
    canManageStaff: z.boolean(),
    canEdit: z.boolean(),
    canDelegateHost: z.boolean(),
    readOnly: z.boolean(),
    readOnlyReason: z
      .enum([
        "AUTHENTICATION_REQUIRED",
        "MANAGEMENT_AUTHORITY_UNVERIFIED",
        "NOT_AUTHORIZED",
      ])
      .nullable(),
    managementAuthority: z
      .object({
        type: z.literal("ORGANIZATION"),
        organizationId: id,
        ownerUserId: id,
      })
      .strict()
      .nullable(),
    eventHostId: nullableId,
    viewerIsEventHost: z.boolean(),
    supportsTeamStaffing: z.boolean(),
  })
  .strict();

export const editorCatalogsSchema = z
  .object({
    sports: z.array(unknownRecord),
    organizations: z.array(unknownRecord),
    fields: z.array(unknownRecord),
    templates: z.array(unknownRecord),
  })
  .strict();

const eventEditorMatchDemandSchema = z
  .object({
    total: z.number().int().nonnegative(),
    byDivision: z.record(z.string(), z.number().int().nonnegative()),
    byPhase: z.record(z.string(), z.number().int().nonnegative()),
    placed: z.number().int().nonnegative(),
    unplaced: z.number().int().nonnegative(),
  })
  .strict();

export const eventEditorScheduleStateSchema = z
  .object({
    sourceType: z.string().nullable(),
    matchCount: z.number().int().nonnegative(),
    matchDemand: eventEditorMatchDemandSchema.optional(),
    revision: id,
    hasProtectedHistory: z.boolean(),
  })
  .strict();

const editorMatchProjectionSchema = z
  .object({
    id,
    matchId: z.number().int().nullable(),
    eventId: id,
    start: isoDateTime.nullable(),
    end: isoDateTime.nullable(),
    locked: z.boolean(),
    division: nullableId,
    fieldId: nullableId,
    team1Id: nullableId,
    team2Id: nullableId,
    team1Seed: z.number().int().nullable(),
    team2Seed: z.number().int().nullable(),
    status: z.string().nullable(),
    resultStatus: z.string().nullable(),
    resultType: z.string().nullable(),
    actualStart: isoDateTime.nullable(),
    actualEnd: isoDateTime.nullable(),
    statusReason: z.string().nullable(),
    winnerEventTeamId: nullableId,
    matchRulesSnapshot: unknownRecord.nullable(),
    resolvedMatchRules: unknownRecord.nullable(),
    segments: z.array(unknownRecord),
    incidents: z.array(unknownRecord),
    officialId: nullableId,
    officialIds: z.array(unknownRecord),
    teamOfficialId: nullableId,
    team1Points: z.array(z.number()),
    team2Points: z.array(z.number()),
    losersBracket: z.boolean(),
    winnerNextMatchId: nullableId,
    loserNextMatchId: nullableId,
    previousLeftId: nullableId,
    previousRightId: nullableId,
    side: z.string().nullable(),
    officialCheckedIn: z.boolean(),
  })
  .strict();

export const eventEditorScheduleWarningSchema = z
  .object({
    code: id,
    message: z.string().trim().min(1),
    matchIds: z.array(id).optional(),
  })
  .strict();

export const eventEditorCreateCompletionSchema = z
  .object({
    mode: z.enum(["CREATE_ONLY", "CREATE_AND_BUILD_SCHEDULE"]),
  })
  .strict();

export const eventEditorSaveScheduleTransitionSchema = z.discriminatedUnion(
  "mode",
  [
    z
      .object({
        mode: z.literal("PRESERVE"),
      })
      .strict(),
    z
      .object({
        mode: z.enum(["BUILD_IF_MISSING", "RECONCILE"]),
        expectedScheduleRevision: id,
      })
      .strict(),
  ],
);

export const eventEditorScheduleOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("NOT_REQUESTED"),
      matchCount: z.number().int().nonnegative(),
      warnings: z.array(z.never()),
    })
    .strict(),
  z
    .object({
      status: z.enum(["BUILT", "REBUILT"]),
      matchCount: z.number().int().positive(),
      matches: z.array(editorMatchProjectionSchema),
      warnings: z.array(eventEditorScheduleWarningSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal("DELETED"),
      matchCount: z.literal(0),
      matches: z.array(z.never()),
      warnings: z.array(z.never()),
    })
    .strict(),
]);

export const eventEditorSnapshotSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    draft: eventEditorBootstrapDraftSchema,
    mode: z.enum(["CREATE", "EDIT"]),
    eventId: nullableId,
    editorRevision: id,
    staffRevision: z.string().nullable(),
    capabilities: editorCapabilitiesSchema,
    catalogs: editorCatalogsSchema,
    immutable: z
      .object({
        fieldNames: z.array(z.string()),
        rental: z.boolean(),
        template: z.boolean(),
      })
      .strict(),
    scheduleState: eventEditorScheduleStateSchema,
  })
  .strict();
export const eventEditorCreateBootstrapSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    createOperationId: id,
    snapshot: eventEditorSnapshotSchema,
  })
  .strict();

export type EventEditorScheduleState = z.infer<
  typeof eventEditorScheduleStateSchema
>;
export type EventEditorMatchProjection = z.infer<
  typeof editorMatchProjectionSchema
>;
export type EventEditorScheduleWarning = z.infer<
  typeof eventEditorScheduleWarningSchema
>;
export type EventEditorCreateCompletion = z.infer<
  typeof eventEditorCreateCompletionSchema
>;
export type EventEditorSaveScheduleTransition = z.infer<
  typeof eventEditorSaveScheduleTransitionSchema
>;
export type EventEditorScheduleOutcome = z.infer<
  typeof eventEditorScheduleOutcomeSchema
>;
export type EventEditorCreateBootstrap = z.infer<
  typeof eventEditorCreateBootstrapSchema
>;
export const eventEditorBootstrapQuerySchema = z
  .object({
    organizationId: id.nullish(),
    eventType: z.string().trim().min(1).nullish(),
    sportId: id.nullish(),
    parentEventId: id.nullish(),
    templateId: id.nullish(),
    rentalBookingId: id.nullish(),
    start: isoDateTime.nullish(),
  })
  .strict();

export const saveEventEditorCommandSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    editorRevision: id,
    staffRevision: z.string().nullable(),
    draft: eventEditorDraftSchema,
    scheduleTransition: eventEditorSaveScheduleTransitionSchema,
  })
  .strict();

export const eventEditorExpectedCreateRevisionsSchema = z
  .object({
    editorRevision: id,
    staffRevision: z.string().nullable(),
    scheduleRevision: id,
  })
  .strict();

export const createEventEditorCommandSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    createOperationId: id,
    expectedRevisions: eventEditorExpectedCreateRevisionsSchema,
    draft: eventEditorDraftSchema,
    completion: eventEditorCreateCompletionSchema,
  })
  .strict();

export const eventEditorSaveResultSchema = z
  .object({
    status: z.literal("SAVED"),
    snapshot: eventEditorSnapshotSchema,
    questionIdMap: z.record(z.string(), id),
    staffEmailDelivery: z.enum(["QUEUED", "FAILED", "NOT_REQUESTED"]),
    scheduleOutcome: eventEditorScheduleOutcomeSchema,
  })
  .strict();

export const eventEditorCreateResultSchema = eventEditorSaveResultSchema
  .extend({
    createOperationId: id,
    editorRevision: id,
    staffRevision: z.string().nullable(),
    scheduleRevision: id,
  })
  .strict();

export const eventEditorErrorSchema = z
  .object({
    error: z.string(),
    code: z.enum([
      "INVALID_EDITOR_COMMAND",
      "EDITOR_REVISION_CONFLICT",
      "STAFF_REVISION_CONFLICT",
      "INVALID_EDITOR_INPUT",
      "EDITOR_PERMISSION_DENIED",
      "EDITOR_IMMUTABLE_FIELD",
      "EDITOR_CAPABILITY_REQUIRED",
      "EDITOR_NOT_FOUND",
      "EDITOR_SAVE_FAILED",
      "CREATE_OPERATION_PAYLOAD_MISMATCH",
      "CREATE_OPERATION_CONFLICT",
      "EDITOR_SCHEDULE_INTENT_REQUIRED",
      "EDITOR_SCHEDULE_REVISION_CONFLICT",
      "EDITOR_PROTECTED_MATCH_HISTORY",
      "EDITOR_SCHEDULE_UNSUPPORTED",
      "EDITOR_SCHEDULE_INPUT_INVALID",
      "EDITOR_SCHEDULE_FAILED",
      "INVALID_TIME_SLOT",
    ]),
    field: z.string().nullable().optional(),
    editorRevision: z.string().nullable().optional(),
    staffRevision: z.string().nullable().optional(),
    scheduleRevision: z.string().nullable().optional(),
    slotIds: z.array(id).optional(),
    createOperationId: id.optional(),
    requestId: id.optional(),
    details: z.unknown().optional(),
  })
  .strict();

export type EventEditorBootstrapQuery = z.infer<
  typeof eventEditorBootstrapQuerySchema
>;
export type EventEditorSnapshot = z.infer<typeof eventEditorSnapshotSchema>;
export type EventEditorDraft = z.infer<typeof eventEditorDraftSchema>;
export type EventEditorBootstrapDraft = z.infer<
  typeof eventEditorBootstrapDraftSchema
>;
export type SaveEventEditorCommand = z.infer<
  typeof saveEventEditorCommandSchema
>;
export type CreateEventEditorCommand = z.infer<
  typeof createEventEditorCommandSchema
>;
export type EventEditorExpectedCreateRevisions = z.infer<
  typeof eventEditorExpectedCreateRevisionsSchema
>;
export type EventEditorSaveResult = z.infer<typeof eventEditorSaveResultSchema>;
export type EventEditorCreateResult = z.infer<
  typeof eventEditorCreateResultSchema
>;
export type EventEditorError = z.infer<typeof eventEditorErrorSchema>;
export type RegistrationQuestionInput = z.infer<
  typeof registrationQuestionInputSchema
>;

export const parseEventEditorSnapshot = (input: unknown): EventEditorSnapshot =>
  eventEditorSnapshotSchema.parse(input);
export const parseSaveEventEditorCommand = (
  input: unknown,
): SaveEventEditorCommand => saveEventEditorCommandSchema.parse(input);
export const parseCreateEventEditorCommand = (
  input: unknown,
): CreateEventEditorCommand => createEventEditorCommandSchema.parse(input);
export const parseEventEditorCreateResult = (
  input: unknown,
): EventEditorCreateResult => eventEditorCreateResultSchema.parse(input);
