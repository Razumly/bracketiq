import { z } from "zod";
import {
  normalizeAutomatedSchedulingForEventType,
} from "@/lib/automatedScheduling";
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
    isSystemGenerated: optionalBoolean,
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
    "isSystemGenerated",
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

const normalizeEditorScheduleWireInput = (input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const record = input as Record<string, unknown>;
  const { automatedScheduling, ...withoutLegacyKey } = record;
  if (Object.prototype.hasOwnProperty.call(record, "isAutomatedScheduling")) {
    return withoutLegacyKey;
  }
  if (automatedScheduling !== undefined) {
    return {
      ...withoutLegacyKey,
      isAutomatedScheduling: automatedScheduling,
    };
  }
  return withoutLegacyKey;
};

const scheduleFixedSchema = z
  .object({
    mode: z.literal("FIXED_END"),
    endConstraint: isoDateTime,
    isAutomatedScheduling: z.boolean().default(true),
  })
  .strict();

const scheduleGeneratedSchema = z
  .object({
    mode: z.literal("GENERATED_END"),
    endConstraint: z.null(),
    generatedScheduleEnd: optionalDateLike,
    isAutomatedScheduling: z.boolean().default(true),
  })
  .strict();

const editorScheduleShapeSchema = z.discriminatedUnion("mode", [
  scheduleFixedSchema,
  scheduleGeneratedSchema,
]);

export const editorScheduleSchema = z.preprocess(
  normalizeEditorScheduleWireInput,
  editorScheduleShapeSchema,
);

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

/**
 * Existing-Event schedule maintenance is deliberately separate from the
 * create-event proposal protocol.  The operation identity belongs to one
 * user action; retries carry that same identity and proposal revision.
 */
export const eventEditorMaintenanceOperationSchema = z.enum([
  "BUILD",
  "COMPLETE",
  "REBUILD",
]);

export const eventEditorScheduleStateSchema = z
  .object({
    sourceType: z.string().nullable(),
    matchCount: z.number().int().nonnegative(),
    matchDemand: eventEditorMatchDemandSchema.optional(),
    availableMaintenanceOperations: z.array(eventEditorMaintenanceOperationSchema),
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
    placementState: z.enum(["PLACED", "UNPLACED"]),
    phase: z.string().nullable(),
    sourceDivisionId: nullableId,
    phaseDivisionId: nullableId,
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
    restrictingFactor: z.enum([
      "RESOURCE",
      "PLAYING_TEAM",
      "TEAM_DUTY",
      "NAMED_OFFICIAL_POSITION",
      "DIVISION_ORDER",
      "UNKNOWN",
    ]).optional(),
  })
  .strict();

export const eventEditorUnscheduledMatchSchema = z
  .object({
    id,
    matchId: z.number().int().nullable(),
    phaseDivisionId: id,
    phase: z.string().trim().min(1),
    sourceDivisionId: nullableId,
  })
  .strict();

export const eventEditorAffectedCompetitionPhaseSchema = z
  .object({
    id,
    name: z.string().trim().min(1),
    phase: z.string().trim().min(1),
    sourceDivisionId: nullableId,
  })
  .strict();

type PartialScheduleOutcomeForValidation = {
  matchCount: number;
  placedMatchCount: number;
  unplacedMatchCount: number;
  matches: z.infer<typeof editorMatchProjectionSchema>[];
  unscheduledMatches: z.infer<typeof eventEditorUnscheduledMatchSchema>[];
  affectedCompetitionPhases: z.infer<
    typeof eventEditorAffectedCompetitionPhaseSchema
  >[];
};

const validatePartialScheduleCounts = (
  outcome: PartialScheduleOutcomeForValidation,
  context: z.RefinementCtx,
): z.infer<typeof editorMatchProjectionSchema>[] => {
  if (outcome.matchCount !== outcome.matches.length) {
    context.addIssue({
      code: "custom",
      path: ["matchCount"],
      message: "matchCount must describe the complete Match Graph.",
    });
  }

  const placedMatches = outcome.matches.filter(
    (match) => match.placementState === "PLACED",
  );
  const unplacedMatches = outcome.matches.filter(
    (match) => match.placementState === "UNPLACED",
  );
  if (outcome.placedMatchCount !== placedMatches.length) {
    context.addIssue({
      code: "custom",
      path: ["placedMatchCount"],
      message: "placedMatchCount must describe the complete Match Graph.",
    });
  }
  if (outcome.unplacedMatchCount !== unplacedMatches.length) {
    context.addIssue({
      code: "custom",
      path: ["unplacedMatchCount"],
      message: "unplacedMatchCount must describe the complete Match Graph.",
    });
  }
  if (
    outcome.placedMatchCount + outcome.unplacedMatchCount
    !== outcome.matchCount
  ) {
    context.addIssue({
      code: "custom",
      path: ["unplacedMatchCount"],
      message: "placed and unplaced counts must equal matchCount.",
    });
  }

  return unplacedMatches;
};

const validatePartialUnscheduledMatches = (
  outcome: PartialScheduleOutcomeForValidation,
  unplacedMatches: z.infer<typeof editorMatchProjectionSchema>[],
  context: z.RefinementCtx,
): void => {
  const unscheduledIds = outcome.unscheduledMatches.map((match) => match.id);
  if (new Set(unscheduledIds).size !== unscheduledIds.length) {
    context.addIssue({
      code: "custom",
      path: ["unscheduledMatches"],
      message: "unscheduledMatches must not contain duplicate Match IDs.",
    });
  }
  if (
    unscheduledIds.length !== unplacedMatches.length
    || unscheduledIds.some((matchId, index) => matchId !== unplacedMatches[index]?.id)
  ) {
    context.addIssue({
      code: "custom",
      path: ["unscheduledMatches"],
      message: "unscheduledMatches must contain exactly the UNPLACED nodes in graph order.",
    });
  }

  const matchesById = new Map(
    outcome.matches.map((match) => [match.id, match]),
  );
  outcome.unscheduledMatches.forEach((unscheduledMatch, index) => {
    const graphMatch = matchesById.get(unscheduledMatch.id);
    if (!graphMatch) {
      context.addIssue({
        code: "custom",
        path: ["unscheduledMatches", index, "id"],
        message: "unscheduledMatches contains an unknown Match ID.",
      });
      return;
    }
    if (graphMatch.placementState !== "UNPLACED") {
      context.addIssue({
        code: "custom",
        path: ["unscheduledMatches", index, "id"],
        message: "unscheduledMatches may contain only UNPLACED nodes.",
      });
    }
    if (
      unscheduledMatch.matchId !== graphMatch.matchId
      || unscheduledMatch.phaseDivisionId !== graphMatch.phaseDivisionId
      || unscheduledMatch.phase !== graphMatch.phase
      || unscheduledMatch.sourceDivisionId !== graphMatch.sourceDivisionId
    ) {
      context.addIssue({
        code: "custom",
        path: ["unscheduledMatches", index],
        message: "unscheduledMatches identity must match its graph node.",
      });
    }
  });
};

const validatePartialAffectedCompetitionPhases = (
  outcome: PartialScheduleOutcomeForValidation,
  unplacedMatches: z.infer<typeof editorMatchProjectionSchema>[],
  context: z.RefinementCtx,
): void => {
  const expectedPhaseIds = Array.from(
    new Set(
      unplacedMatches
        .map((match) => match.phaseDivisionId)
        .filter((phaseId): phaseId is string => Boolean(phaseId)),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const phaseIds = outcome.affectedCompetitionPhases.map((phase) => phase.id);
  if (new Set(phaseIds).size !== phaseIds.length) {
    context.addIssue({
      code: "custom",
      path: ["affectedCompetitionPhases"],
      message: "affectedCompetitionPhases must not contain duplicate phase IDs.",
    });
  }
  if (
    phaseIds.length !== expectedPhaseIds.length
    || phaseIds.some((phaseId, index) => phaseId !== expectedPhaseIds[index])
  ) {
    context.addIssue({
      code: "custom",
      path: ["affectedCompetitionPhases"],
      message: "affectedCompetitionPhases must describe exactly the phases containing UNPLACED nodes.",
    });
  }
};

export const eventEditorPartialScheduleOutcomeSchema = z
  .object({
    status: z.literal("PARTIAL"),
    isComplete: z.literal(false),
    matchCount: z.number().int().positive(),
    placedMatchCount: z.number().int().nonnegative(),
    unplacedMatchCount: z.number().int().positive(),
    matches: z.array(editorMatchProjectionSchema),
    unscheduledMatches: z.array(eventEditorUnscheduledMatchSchema),
    affectedCompetitionPhases: z.array(
      eventEditorAffectedCompetitionPhaseSchema,
    ),
    warnings: z.array(eventEditorScheduleWarningSchema),
  })
  .strict()
  .superRefine((outcome, context) => {
    const unplacedMatches = validatePartialScheduleCounts(outcome, context);
    validatePartialUnscheduledMatches(outcome, unplacedMatches, context);
    validatePartialAffectedCompetitionPhases(outcome, unplacedMatches, context);
  });

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
        mode: z.literal("RECONCILE"),
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
      matches: z.array(editorMatchProjectionSchema).optional(),
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
  eventEditorPartialScheduleOutcomeSchema,
]);
export const eventEditorRevisionBindingSchema = z
  .object({
    editorRevision: id,
    staffRevision: z.string().nullable(),
    scheduleRevision: id,
    fieldRevisions: z.record(z.string(), id),
    timeSlotRevisions: z.record(z.string(), id),
    rentalBookingRevision: id.nullable(),
    rentalBookingRevisions: z.record(z.string(), id),
    rentalBookingItemRevisions: z.record(z.string(), id),
    availabilityRevision: id,
  })
  .strict();

export type EventEditorRevisionBinding = z.infer<
  typeof eventEditorRevisionBindingSchema
>;


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
    revisionBinding: eventEditorRevisionBindingSchema.nullish(),
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
const legacySaveEventEditorCommandSchema = saveEventEditorCommandSchema.extend({
  scheduleTransition: z
    .object({
      mode: z.literal("BUILD_IF_MISSING"),
      expectedScheduleRevision: id,
    })
    .strict(),
});

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
    hasScheduleProposalSupport: z.boolean().optional(),
  })
  .strict();

const proposalGraphUserSchema = z
  .object({
    id,
    firstName: z.string(),
    lastName: z.string(),
    userName: z.string(),
  })
  .strict();

const proposalGraphPlayerRegistrationSchema = z
  .object({
    id,
    teamId: nullableId,
    userId: id,
    status: z.string(),
    jerseyNumber: z.string().nullable(),
    position: z.string().nullable(),
    isCaptain: z.boolean(),
  })
  .strict();

const proposalGraphTeamSchema = z
  .object({
    id,
    captainId: z.string().nullable(),
    division: nullableId,
    kind: z.string().nullable(),
    name: z.string(),
    playerIds: z.array(id),
    players: z.array(proposalGraphUserSchema),
    playerRegistrations: z.array(proposalGraphPlayerRegistrationSchema),
  })
  .strict();

const proposalGraphFieldSchema = z
  .object({
    id,
    organizationId: nullableId,
    divisions: z.array(id),
    name: z.string(),
  })
  .strict();

const proposalGraphTimeSlotSchema = z
  .object({
    id,
    dayOfWeek: integer.nonnegative().max(6),
    daysOfWeek: z.array(integer.nonnegative().max(6)),
    startDate: isoDateTime.optional(),
    endDate: isoDateTime.nullable(),
    repeating: z.boolean(),
    startTimeMinutes: integer.nonnegative(),
    endTimeMinutes: integer.nonnegative(),
    price: z.number().nullable(),
    scheduledFieldId: nullableId,
    scheduledFieldIds: z.array(id),
    divisions: z.array(id),
  })
  .strict();

const proposalGraphOfficialPositionSchema = z
  .object({
    id,
    name: z.string(),
    count: integer.nonnegative(),
    order: integer.nonnegative(),
  })
  .strict();

const proposalGraphEventOfficialSchema = z
  .object({
    id,
    userId: id,
    positionIds: z.array(id),
    fieldIds: z.array(id),
    isActive: z.boolean(),
  })
  .strict();

const proposalGraphDivisionPhaseSettingsSchema = z
  .object({
    matchRulesOverride: z.unknown().nullable().optional(),
    autoCreatePointMatchIncidents: z.boolean().optional(),
    segmentLengthMinutes: integer.nonnegative().nullable().optional(),
    segmentBreakMinutes: integer.nonnegative().nullable().optional(),
    doTeamsOfficiate: z.boolean().optional(),
    officialPositions: z.array(proposalGraphOfficialPositionSchema).optional(),
  })
  .strict();

const proposalGraphPlayoffConfigSchema = z
  .object({
    doubleElimination: z.boolean(),
    winnerSetCount: integer.nonnegative(),
    loserSetCount: integer.nonnegative(),
    winnerBracketPointsToVictory: z.array(z.number()),
    loserBracketPointsToVictory: z.array(z.number()),
    prize: z.string(),
    fieldCount: integer.nonnegative(),
    restTimeMinutes: integer.nonnegative(),
    matchDurationMinutes: integer.nonnegative().nullable().optional(),
    setDurationMinutes: integer.nonnegative().nullable().optional(),
  })
  .strict();

const proposalGraphLeagueConfigSchema = z
  .object({
    gamesPerOpponent: integer.nonnegative().optional(),
    includePlayoffs: z.boolean().optional(),
    playoffTeamCount: integer.nonnegative().optional(),
    usesSets: z.boolean().optional(),
    matchDurationMinutes: integer.nonnegative().nullable().optional(),
    setDurationMinutes: integer.nonnegative().nullable().optional(),
    setsPerMatch: integer.nonnegative().optional(),
    pointsToVictory: z.array(z.number()).optional(),
    restTimeMinutes: integer.nonnegative().optional(),
  })
  .strict();

const proposalGraphDivisionSchema = z
  .object({
    id,
    name: z.string(),
    kind: z.string(),
    role: z.string(),
    phase: z.string().nullable(),
    sourceDivisionId: nullableId,
    isSystemGenerated: z.boolean(),
    phaseSettings: z.record(
      z.string(),
      proposalGraphDivisionPhaseSettingsSchema,
    ),
    teamIds: z.array(id),
    playoffTeamCount: integer.nonnegative().nullable(),
    playoffPlacementDivisionIds: z.array(id),
    standingsOverrides: z.record(z.string(), z.number()).nullable(),
    standingsConfirmedAt: isoDateTime.nullable(),
    standingsConfirmedBy: nullableId,
    playoffConfig: proposalGraphPlayoffConfigSchema.nullable(),
    leagueConfig: proposalGraphLeagueConfigSchema.nullable(),
  })
  .strict();

const proposalGraphSegmentSchema = z
  .object({
    id,
    eventId: nullableId.optional(),
    matchId: id,
    sequence: integer.nonnegative(),
    status: z.string(),
    scores: z.record(z.string(), z.number()),
    winnerEventTeamId: nullableId.optional(),
    startedAt: isoDateTime.nullable().optional(),
    endedAt: isoDateTime.nullable().optional(),
    resultType: z.string().nullable().optional(),
    statusReason: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: isoDateTime.nullable().optional(),
    updatedAt: isoDateTime.nullable().optional(),
  })
  .strict();

const proposalGraphIncidentSchema = z
  .object({
    id,
    eventId: nullableId.optional(),
    matchId: id,
    segmentId: nullableId.optional(),
    eventTeamId: nullableId.optional(),
    eventRegistrationId: nullableId.optional(),
    participantUserId: nullableId.optional(),
    officialUserId: nullableId.optional(),
    incidentType: z.string(),
    sequence: integer.nonnegative(),
    minute: integer.nonnegative().nullable().optional(),
    clock: z.string().nullable().optional(),
    clockSeconds: integer.nonnegative().nullable().optional(),
    linkedPointDelta: z.number().nullable().optional(),
    note: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: isoDateTime.nullable().optional(),
    updatedAt: isoDateTime.nullable().optional(),
  })
  .strict();

const proposalGraphOfficialAssignmentSchema = z
  .object({
    positionId: id,
    slotIndex: integer.nonnegative(),
    holderType: z.string(),
    userId: nullableId,
    eventOfficialId: nullableId,
    checkedIn: z.boolean(),
    hasConflict: z.boolean(),
  })
  .strict();

const eventEditorProposalGraphMatchSchema = z
  .object({
    id,
    matchId: z.number().int().nullable(),
    eventId: id,
    start: isoDateTime.nullable(),
    end: isoDateTime.nullable(),
    locked: z.boolean(),
    placementState: z.enum(["PLACED", "UNPLACED"]),
    phase: z.string().nullable(),
    sourceDivisionId: nullableId,
    phaseDivisionId: nullableId,
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
    segments: z.array(proposalGraphSegmentSchema),
    incidents: z.array(proposalGraphIncidentSchema),
    officialIds: z.array(proposalGraphOfficialAssignmentSchema),
    officialAssignments: z.array(proposalGraphOfficialAssignmentSchema),
    teamOfficialId: nullableId,
    teamOfficialSeed: z.null(),
    matchRulesSnapshot: z.unknown().nullable(),
    resolvedMatchRules: z.unknown().nullable(),
    team1Points: z.array(z.number()),
    team2Points: z.array(z.number()),
    losersBracket: z.boolean(),
    winnerNextMatchId: nullableId,
    loserNextMatchId: nullableId,
    previousLeftId: nullableId,
    previousRightId: nullableId,
    side: z.string().nullable(),
    officialCheckedIn: z.boolean(),
    team1: proposalGraphTeamSchema.nullable(),
    team2: proposalGraphTeamSchema.nullable(),
    teamOfficial: proposalGraphTeamSchema.nullable(),
    official: proposalGraphUserSchema.nullable(),
    field: proposalGraphFieldSchema.nullable(),
  })
  .strict();

const eventEditorProposalGraphEventSchema = z
  .object({
    id,
    name: z.string(),
    description: z.string(),
    start: isoDateTime,
    end: isoDateTime,
    location: z.string(),
    coordinates: z.array(z.number()).nullable(),
    price: z.number().nullable(),
    minAge: z.number().int().nullable(),
    maxAge: z.number().int().nullable(),
    rating: z.number().nullable(),
    imageId: z.string().nullable(),
    hostId: z.string().nullable(),
    noFixedEndDateTime: z.boolean(),
    scheduleEndConstraint: isoDateTime.nullable(),
    generatedScheduleEnd: isoDateTime.nullable(),
    state: z.string(),
    maxParticipants: z.number().int(),
    teamSizeLimit: z.number().int().nullable(),
    restTimeMinutes: z.number().int().nullable(),
    teamSignup: z.boolean(),
    singleDivision: z.boolean(),
    waitListIds: z.array(id),
    freeAgentIds: z.array(id),
    teamIds: z.array(id),
    userIds: z.array(id),
    fieldIds: z.array(id),
    timeSlotIds: z.array(id),
    officialIds: z.array(id),
    officialSchedulingMode: z.string(),
    staffingPriority: z.string(),
    officialPositions: z.array(proposalGraphOfficialPositionSchema),
    eventOfficials: z.array(proposalGraphEventOfficialSchema),
    matchRulesOverride: z.unknown().nullable(),
    autoCreatePointMatchIncidents: z.boolean(),
    resolvedMatchRules: z.unknown().nullable(),
    cancellationRefundHours: z.number().int().nullable(),
    registrationCutoffHours: z.number().int().nullable(),
    seedColor: z.number().int().nullable(),
    eventType: z.string(),
    sportIds: z.array(id),
    leagueScoringConfigId: nullableId,
    organizationId: nullableId,
    requiredTemplateIds: z.array(id),
    allowPaymentPlans: z.boolean(),
    installmentCount: z.number().int(),
    installmentDueDates: z.array(isoDateTime),
    installmentDueRelativeDays: z.array(z.number().int()),
    installmentAmounts: z.array(z.number()),
    allowTeamSplitDefault: z.boolean(),
    splitLeaguePlayoffDivisions: z.boolean(),
    divisions: z.array(id),
    divisionDetails: z.array(proposalGraphDivisionSchema),
    playoffDivisionDetails: z.array(proposalGraphDivisionSchema),
    fields: z.array(proposalGraphFieldSchema),
    teams: z.array(proposalGraphTeamSchema),
    timeSlots: z.array(proposalGraphTimeSlotSchema),
    officials: z.array(proposalGraphUserSchema),
    doubleElimination: z.boolean().optional(),
    winnerSetCount: z.number().int().nullable().optional(),
    loserSetCount: z.number().int().nullable().optional(),
    winnerBracketPointsToVictory: z.array(z.number()).optional(),
    loserBracketPointsToVictory: z.array(z.number()).optional(),
    prize: z.string().nullable().optional(),
    fieldCount: z.number().int().nullable().optional(),
    matches: z.array(eventEditorProposalGraphMatchSchema).optional(),
    usesSets: z.boolean().optional(),
    matchDurationMinutes: z.number().int().nullable().optional(),
    setDurationMinutes: z.number().int().nullable().optional(),
    setsPerMatch: z.number().int().nullable().optional(),
    doTeamsOfficiate: z.boolean().optional(),
    teamOfficialsMaySwap: z.boolean().optional(),
    teamCheckInMode: z.string().optional(),
    teamCheckInOpenMinutesBefore: z.number().int().optional(),
    allowMatchRosterEdits: z.boolean().optional(),
    allowTemporaryMatchPlayers: z.boolean().optional(),
    gamesPerOpponent: z.number().int().optional(),
    includePlayoffs: z.boolean().optional(),
    playoffTeamCount: z.number().int().optional(),
    pointsToVictory: z.array(z.number()).optional(),
  })
  .strict();

export const eventEditorCreateProposalGraphSchema = z
  .object({
    event: eventEditorProposalGraphEventSchema,
    matches: z.array(eventEditorProposalGraphMatchSchema),
  })
  .strict();

export const eventEditorMaintenanceRequestSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    eventId: id,
    operation: eventEditorMaintenanceOperationSchema,
    operationId: id,
    expectedRevisions: eventEditorRevisionBindingSchema.optional(),
    participantCount: z.number().int().positive().optional(),
    includePlaceholderTeams: z.boolean().optional(),
  })
  .strict();

const maintenanceUnscheduledMatchSchema = z
  .object({
    id,
    matchId: z.number().int().nullable(),
    phaseDivisionId: id,
    phase: z.string(),
    sourceDivisionId: nullableId,
  })
  .strict();

const maintenanceAffectedPhaseSchema = z
  .object({
    id,
    name: z.string(),
    phase: z.string(),
    sourceDivisionId: nullableId,
  })
  .strict();

export const eventEditorMaintenanceScheduleOutcomeSchema =
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("COMPLETE"),
        isComplete: z.literal(true),
        matchCount: z.number().int().positive(),
        placedMatchCount: z.number().int().nonnegative(),
        unplacedMatchCount: z.literal(0),
        matches: z.array(editorMatchProjectionSchema),
        unscheduledMatches: z.array(z.never()),
        affectedCompetitionPhases: z.array(z.never()),
        warnings: z.array(eventEditorScheduleWarningSchema),
      })
      .strict(),
    z
      .object({
        status: z.literal("INCOMPLETE"),
        isComplete: z.literal(false),
        matchCount: z.number().int().positive(),
        placedMatchCount: z.number().int().nonnegative(),
        unplacedMatchCount: z.number().int().positive(),
        matches: z.array(editorMatchProjectionSchema),
        unscheduledMatches: z.array(maintenanceUnscheduledMatchSchema),
        affectedCompetitionPhases: z.array(maintenanceAffectedPhaseSchema),
        warnings: z.array(eventEditorScheduleWarningSchema),
      })
      .strict(),
  ]);

export const eventEditorMaintenanceProposalSchema = z
  .object({
    status: z.literal("PROPOSED"),
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    eventId: id,
    operation: eventEditorMaintenanceOperationSchema,
    operationId: id,
    proposalRevision: id,
    revisionBinding: eventEditorRevisionBindingSchema,
    graph: eventEditorCreateProposalGraphSchema,
    protectedMatchIds: z.array(id),
    scheduleOutcome: eventEditorMaintenanceScheduleOutcomeSchema,
  })
  .strict();

export const eventEditorAcceptMaintenanceProposalSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    eventId: id,
    operation: eventEditorMaintenanceOperationSchema,
    operationId: id,
    proposalRevision: id,
    acceptanceOperationId: id,
  })
  .strict();

export const eventEditorRejectMaintenanceProposalSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    eventId: id,
    operation: eventEditorMaintenanceOperationSchema,
    operationId: id,
    proposalRevision: id,
  })
  .strict();

export const eventEditorMaintenanceAcceptedResultSchema =
  eventEditorMaintenanceProposalSchema
    .omit({ status: true })
    .extend({
      status: z.literal("ACCEPTED"),
      acceptanceOperationId: id,
    })
    .strict();

export const eventEditorMaintenanceRejectedResultSchema = z
  .object({
    status: z.literal("REJECTED"),
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    eventId: id,
    operation: eventEditorMaintenanceOperationSchema,
    operationId: id,
    proposalRevision: id,
  })
  .strict();

export const eventEditorMaintenanceResponseSchema = z.discriminatedUnion(
  "status",
  [
    eventEditorMaintenanceProposalSchema,
    eventEditorMaintenanceAcceptedResultSchema,
    eventEditorMaintenanceRejectedResultSchema,
  ],
);

export type EventEditorMaintenanceOperation = z.infer<
  typeof eventEditorMaintenanceOperationSchema
>;
export type EventEditorMaintenanceRequest = z.infer<
  typeof eventEditorMaintenanceRequestSchema
>;
export type EventEditorMaintenanceScheduleOutcome = z.infer<
  typeof eventEditorMaintenanceScheduleOutcomeSchema
>;
export type EventEditorMaintenanceProposal = z.infer<
  typeof eventEditorMaintenanceProposalSchema
>;
export type EventEditorAcceptMaintenanceProposal = z.infer<
  typeof eventEditorAcceptMaintenanceProposalSchema
>;
export type EventEditorRejectMaintenanceProposal = z.infer<
  typeof eventEditorRejectMaintenanceProposalSchema
>;
export type EventEditorMaintenanceAcceptedResult = z.infer<
  typeof eventEditorMaintenanceAcceptedResultSchema
>;
export type EventEditorMaintenanceRejectedResult = z.infer<
  typeof eventEditorMaintenanceRejectedResultSchema
>;
export type EventEditorMaintenanceResponse = z.infer<
  typeof eventEditorMaintenanceResponseSchema
>;

export const eventEditorSaveResultSchema = z
  .object({
    status: z.literal("SAVED"),
    snapshot: eventEditorSnapshotSchema,
    questionIdMap: z.record(z.string(), id),
    staffEmailDelivery: z.enum(["QUEUED", "FAILED", "NOT_REQUESTED"]),
    scheduleOutcome: eventEditorScheduleOutcomeSchema,
    graph: eventEditorCreateProposalGraphSchema.optional(),
    acceptanceOperationId: id.optional(),
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
export const eventEditorCreateProposalScheduleOutcomeSchema =
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("BUILT"),
        matchCount: z.number().int().positive(),
        matches: z.array(editorMatchProjectionSchema),
        warnings: z.array(eventEditorScheduleWarningSchema),
      })
      .strict(),
    eventEditorPartialScheduleOutcomeSchema,
  ]);

export const eventEditorCreateProposalSchema = z
  .object({
    status: z.literal("PROPOSED"),
    createOperationId: id,
    eventId: id,
    proposalRevision: id,
    expectedRevisions: eventEditorExpectedCreateRevisionsSchema,
    completion: eventEditorCreateCompletionSchema,
    snapshot: eventEditorSnapshotSchema,
    revisionBinding: eventEditorRevisionBindingSchema,
    scheduleOutcome: eventEditorCreateProposalScheduleOutcomeSchema,
    graph: eventEditorCreateProposalGraphSchema,
  })
  .strict();
export const eventEditorProposalReferenceSchema = z
  .object({
    contractVersion: z.literal(EVENT_EDITOR_CONTRACT_VERSION),
    createOperationId: id,
    proposalRevision: id,
  })
  .strict();

export const eventEditorAcceptProposalCommandSchema =
  eventEditorProposalReferenceSchema.extend({
    draft: eventEditorDraftSchema,
  });

export const eventEditorAcceptPartialProposalCommandSchema =
  eventEditorProposalReferenceSchema.extend({
    acceptanceMode: z.literal("PARTIAL"),
    acceptanceOperationId: id,
    draft: eventEditorDraftSchema,
  });

export const eventEditorAcceptProposalResultSchema =
  eventEditorCreateResultSchema;

export const eventEditorAcceptPartialProposalResultSchema =
  eventEditorCreateResultSchema
    .extend({
      acceptanceOperationId: id,
      scheduleOutcome: eventEditorPartialScheduleOutcomeSchema,
    })
    .strict();

export const eventEditorRejectProposalCommandSchema =
  eventEditorProposalReferenceSchema;
export const eventEditorCreateResponseSchema = z.discriminatedUnion("status", [
  eventEditorCreateResultSchema,
  eventEditorCreateProposalSchema,
]);
export type EventEditorUnscheduledMatch = z.infer<
  typeof eventEditorUnscheduledMatchSchema
>;
export type EventEditorAffectedCompetitionPhase = z.infer<
  typeof eventEditorAffectedCompetitionPhaseSchema
>;

export type EventEditorCreateProposalScheduleOutcome = z.infer<
  typeof eventEditorCreateProposalScheduleOutcomeSchema
>;
export type EventEditorCreateProposalGraph = z.infer<
  typeof eventEditorCreateProposalGraphSchema
>;
export type EventEditorCreateProposal = z.infer<
  typeof eventEditorCreateProposalSchema
>;
export type EventEditorProposalReference = z.infer<
  typeof eventEditorProposalReferenceSchema
>;
export type EventEditorAcceptProposalCommand = z.infer<
  typeof eventEditorAcceptProposalCommandSchema
>;
export type EventEditorAcceptPartialProposalCommand = z.infer<
  typeof eventEditorAcceptPartialProposalCommandSchema
>;
export type EventEditorAcceptProposalResult = z.infer<
  typeof eventEditorAcceptProposalResultSchema
>;
export type EventEditorAcceptPartialProposalResult = z.infer<
  typeof eventEditorAcceptPartialProposalResultSchema
>;
export type EventEditorRejectProposalCommand = z.infer<
  typeof eventEditorRejectProposalCommandSchema
>;
export type EventEditorCreateResponse = z.infer<
  typeof eventEditorCreateResponseSchema
>;


export const eventEditorErrorSchema = z
  .object({
    error: z.string(),
    code: z.enum([
      "INVALID_EDITOR_COMMAND",
      "EDITOR_REVISION_CONFLICT",
      "STAFF_REVISION_CONFLICT",
      "INVALID_EDITOR_INPUT",
      "INVALID_EVENT_REGISTRATION_UNIT",
      "INVALID_EVENT_REGISTRATION_DIVISION",
      "EVENT_REGISTRATION_CAPACITY_EXCEEDED",
      "EVENT_REGISTRATION_STRUCTURE_LOCKED",
      "EDITOR_PERMISSION_DENIED",
      "EDITOR_IMMUTABLE_FIELD",
      "EDITOR_NOT_FOUND",
      "EDITOR_CAPABILITY_REQUIRED",
      "EDITOR_SAVE_FAILED",
      "CREATE_OPERATION_PAYLOAD_MISMATCH",
      "CREATE_OPERATION_CONFLICT",
      "EDITOR_SCHEDULE_INTENT_REQUIRED",
      "EDITOR_SCHEDULE_REVISION_CONFLICT",
      "EDITOR_PROTECTED_MATCH_HISTORY",
      "EDITOR_SCHEDULE_UNSUPPORTED",
      "EDITOR_SCHEDULE_INPUT_INVALID",
      "EDITOR_SCHEDULE_FAILED",
      "EDITOR_PROPOSAL_INVALID",
      "EDITOR_PROPOSAL_STALE",
      "EDITOR_PROPOSAL_NOT_FOUND",
      "EDITOR_MAINTENANCE_INVALID",
      "EDITOR_MAINTENANCE_NOT_FOUND",
      "EDITOR_MAINTENANCE_REJECTED",
      "EDITOR_MAINTENANCE_STALE",
      "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT",
      "EDITOR_MAINTENANCE_UNAUTHORIZED",
      "INVALID_TIME_SLOT",
    ]),
    field: z.string().nullable().optional(),
    editorRevision: z.string().nullable().optional(),
    staffRevision: z.string().nullable().optional(),
    scheduleRevision: z.string().nullable().optional(),
    slotIds: z.array(id).optional(),
    occurrenceDate: z.string().nullable().optional(),
    createOperationId: id.optional(),
    divisionId: z.string().nullable().optional(),
    matchCount: z.number().optional(),
    capacity: z.number().optional(),
    participantCount: z.number().optional(),
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

const normalizeEditorDraftScheduling = (
  draft: EventEditorDraft,
): EventEditorDraft => ({
  ...draft,
  schedule: {
    ...draft.schedule,
    isAutomatedScheduling: normalizeAutomatedSchedulingForEventType(
      draft.basics.eventType,
      draft.schedule.isAutomatedScheduling,
    ),
  },
});

const normalizeEditorSnapshotScheduling = (
  snapshot: EventEditorSnapshot,
): EventEditorSnapshot => ({
  ...snapshot,
  draft: normalizeEditorDraftScheduling(snapshot.draft),
});

export const parseEventEditorSnapshot = (
  input: unknown,
): EventEditorSnapshot =>
  normalizeEditorSnapshotScheduling(eventEditorSnapshotSchema.parse(input));
export const parseSaveEventEditorCommand = (
  input: unknown,
): SaveEventEditorCommand => {
  const transition = isUnknownRecord(input)
    ? input.scheduleTransition
    : null;
  if (
    isUnknownRecord(input)
    && input.contractVersion === EVENT_EDITOR_CONTRACT_VERSION
    && isUnknownRecord(transition)
    && transition.mode === "BUILD_IF_MISSING"
  ) {
    const legacyCommand = legacySaveEventEditorCommandSchema.parse(input);
    return saveEventEditorCommandSchema.parse({
      ...legacyCommand,
      draft: normalizeEditorDraftScheduling(legacyCommand.draft),
      scheduleTransition: { mode: "PRESERVE" },
    });
  }
  const command = saveEventEditorCommandSchema.parse(input);
  return {
    ...command,
    draft: normalizeEditorDraftScheduling(command.draft),
  };
};
export const parseCreateEventEditorCommand = (
  input: unknown,
): CreateEventEditorCommand => {
  const command = createEventEditorCommandSchema.parse(input);
  return {
    ...command,
    draft: normalizeEditorDraftScheduling(command.draft),
  };
};
export const parseEventEditorCreateResult = (
  input: unknown,
): EventEditorCreateResult => {
  const result = eventEditorCreateResultSchema.parse(input);
  return {
    ...result,
    snapshot: normalizeEditorSnapshotScheduling(result.snapshot),
  };
};
export const parseEventEditorCreateProposal = (
  input: unknown,
): EventEditorCreateProposal => {
  const proposal = eventEditorCreateProposalSchema.parse(input);
  return {
    ...proposal,
    snapshot: normalizeEditorSnapshotScheduling(proposal.snapshot),
  };
};
export const parseEventEditorCreateResponse = (
  input: unknown,
): EventEditorCreateResponse => {
  const response = eventEditorCreateResponseSchema.parse(input);
  return response.status === "PROPOSED"
    ? parseEventEditorCreateProposal(response)
    : {
        ...response,
        snapshot: normalizeEditorSnapshotScheduling(response.snapshot),
      };
};
export const parseEventEditorAcceptProposalCommand = (
  input: unknown,
): EventEditorAcceptProposalCommand =>
  eventEditorAcceptProposalCommandSchema.parse(input);
export const parseEventEditorAcceptPartialProposalCommand = (
  input: unknown,
): EventEditorAcceptPartialProposalCommand =>
  eventEditorAcceptPartialProposalCommandSchema.parse(input);
export const parseEventEditorRejectProposalCommand = (
  input: unknown,
): EventEditorRejectProposalCommand =>
  eventEditorRejectProposalCommandSchema.parse(input);
export const parseEventEditorMaintenanceRequest = (
  input: unknown,
): EventEditorMaintenanceRequest =>
  eventEditorMaintenanceRequestSchema.parse(input);
export const parseEventEditorAcceptMaintenanceProposal = (
  input: unknown,
): EventEditorAcceptMaintenanceProposal =>
  eventEditorAcceptMaintenanceProposalSchema.parse(input);
export const parseEventEditorRejectMaintenanceProposal = (
  input: unknown,
): EventEditorRejectMaintenanceProposal =>
  eventEditorRejectMaintenanceProposalSchema.parse(input);
export const parseEventEditorMaintenanceResponse = (
  input: unknown,
): EventEditorMaintenanceResponse =>
  eventEditorMaintenanceResponseSchema.parse(input);
