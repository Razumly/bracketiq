import { calculateTimedMatchDurationMinutes } from '@/lib/divisionPhaseSettings';
import { normalizeBracketTeamCount } from '@/lib/divisionTypes';
import { normalizeAutomatedSchedulingForEventType } from '@/lib/automatedScheduling';
import { GENERIC_RESOURCE_LABELS, getSportResourceLabels } from '@/lib/sportResourceLabels';
import type { Event, EventOfficial, EventOfficialPosition, Field, TimeSlot } from '@/types';
import {
  isStaffingPriority,
  normalizeOfficialSchedulingMode,
  normalizeStaffingPriority,
} from '@/server/officials/config';
import type { EventFormValues } from './formTypes';
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  projectEventEditorDraftNestedInput,
  type EventEditorDraft,
  type EventEditorSnapshot,
  type RegistrationQuestionInput,
} from '@/contracts/eventEditor';

const stringValue = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

const nullableString = (value: unknown): string | null => {
  const normalized = stringValue(value).trim();
  return normalized || null;
};

const stringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean)
    : []
);

const numberArray = (value: unknown): number[] => (
  Array.isArray(value)
    ? value.map((entry) => typeof entry === 'number' ? entry : Number(entry)).filter(Number.isFinite)
    : []
);

const numberOrNull = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
};

const booleanValue = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const objectArray = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({ ...entry }))
    : []
);


const asIsoDateTime = (value: unknown, fallback: string): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const stringified = stringValue(value).trim();
  return stringified || fallback;
};

const normalizeQuestion = (value: unknown, index: number): RegistrationQuestionInput | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const prompt = stringValue(row.prompt).trim();
  if (!prompt) return null;
  const answerType = row.answerType === 'LONG_TEXT' ? 'LONG_TEXT' : 'TEXT';
  const base = {
    prompt,
    answerType,
    required: booleanValue(row.required),
    sortOrder: numberOrNull(row.sortOrder) ?? index,
  } as const;
  const id = nullableString(row.id);
  if (id) return { ...base, id };
  const clientId = nullableString(row.clientId);
  return clientId ? { ...base, clientId } : { ...base, clientId: `question-client-${index + 1}` };
};

const normalizePendingInvite = (value: Record<string, unknown>): Record<string, unknown> => {
  const inviteId = nullableString(value.id) ?? nullableString(value.$id);
  return {
    ...value,
    ...(inviteId ? { id: inviteId } : {}),
    roles: stringArray(value.roles ?? value.staffTypes),
  };
};

const normalizeQuestions = (value: unknown): RegistrationQuestionInput[] => (
  objectArray(value).map(normalizeQuestion).filter((entry): entry is RegistrationQuestionInput => Boolean(entry))
);

const paymentMode = (event: Record<string, unknown>): 'FREE' | 'ONLINE' | 'MANUAL' => {
  const explicit = stringValue(event.registrationPaymentMode).toUpperCase();
  if (explicit === 'MANUAL') return 'MANUAL';
  if (explicit === 'FREE') return 'FREE';
  return Number(event.price ?? 0) > 0 ? 'ONLINE' : 'FREE';
};
const draftFromRecord = (
  event: Record<string, unknown>,
  questions: unknown = event.registrationQuestions,
  isPersistedBracketCountNormalizationEnabled = false,
): EventEditorDraft => {
  const normalizedEventType = stringValue(event.eventType, 'EVENT').trim().toUpperCase();
  const automatedScheduling = normalizeAutomatedSchedulingForEventType(
    normalizedEventType,
    event.automatedScheduling,
  );
  const start = asIsoDateTime(event.start, new Date(0).toISOString());
  const explicitScheduleEndConstraint = nullableString(event.scheduleEndConstraint);
  const explicitGeneratedScheduleEnd = nullableString(event.generatedScheduleEnd);
  const generatedEnd = explicitScheduleEndConstraint
    ? false
    : explicitGeneratedScheduleEnd !== null || booleanValue(event.noFixedEndDateTime, false);
  const sportIds = stringArray(event.sportIds);
  const sportConfig = event.sportConfig && typeof event.sportConfig === 'object'
    ? event.sportConfig as Record<string, unknown>
    : null;
  const hasResourceLabels = typeof sportConfig?.resourceLabelSingular === 'string'
    && typeof sportConfig.resourceLabelPlural === 'string';
  const resourceLabels = sportIds.length === 1 && hasResourceLabels
    ? getSportResourceLabels(sportConfig)
    : GENERIC_RESOURCE_LABELS;
  const rawFields = objectArray(event.fields);
  const rawFieldIds = stringArray(
    Array.isArray(event.fieldIds) && event.fieldIds.length > 0 ? event.fieldIds : event.selectedFieldIds,
  );
  const fieldCount = Math.max(0, numberOrNull(event.fieldCount) ?? 0);
  const fields = rawFields.length > 0
    ? rawFields
    : rawFieldIds.length > 0 || nullableString(event.organizationId)
      ? []
      : Array.from({ length: fieldCount }, (_, index) => ({
        $id: `field-client-${index + 1}`,
        name: `${resourceLabels.singular} ${index + 1}`,
      }));
  const timeSlots = objectArray(Array.isArray(event.timeSlots) && event.timeSlots.length > 0 ? event.timeSlots : event.leagueSlots);
  const rawDivisionDetails = objectArray(event.divisionDetails);
  const regularDivisionDetails = rawDivisionDetails.filter(
    (detail) => stringValue(detail.kind).trim().toUpperCase() !== 'PLAYOFF',
  );
  const includePlayoffs = booleanValue(event.includePlayoffs);
  const rawEventPlayoffTeamCount = numberOrNull(event.playoffTeamCount);
  const normalizedEventPlayoffTeamCount =
    isPersistedBracketCountNormalizationEnabled &&
    includePlayoffs &&
    (normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT')
      ? normalizeBracketTeamCount(rawEventPlayoffTeamCount)
      : rawEventPlayoffTeamCount;
  const normalizedEventMaxParticipants =
    isPersistedBracketCountNormalizationEnabled && normalizedEventType === 'TOURNAMENT'
      ? normalizeBracketTeamCount(numberOrNull(event.maxParticipants))
      : numberOrNull(event.maxParticipants);
  const rawTimeSlotIds = stringArray(
    Array.isArray(event.timeSlotIds) && event.timeSlotIds.length > 0
      ? event.timeSlotIds
      : timeSlots.map((slot) => slot.$id ?? slot.id ?? slot.key),
  );
  const eventId = nullableString(event.$id) ?? nullableString(event.id);
  const explicitStaffingPriority = stringValue(event.staffingPriority).trim().toUpperCase();
  const hasExplicitStaffingPriority = isStaffingPriority(explicitStaffingPriority);
  const legacyOfficialSchedulingMode = normalizeOfficialSchedulingMode(event.officialSchedulingMode);
  const staffingPriority = normalizeStaffingPriority(
    explicitStaffingPriority,
    legacyOfficialSchedulingMode,
  );
  const doTeamsOfficiate = booleanValue(event.doTeamsOfficiate)
    || (!hasExplicitStaffingPriority && legacyOfficialSchedulingMode === 'TEAM_STAFFING');
  const normalizedOfficialIds = stringArray(event.officialIds);
  const eventOfficials = objectArray(event.eventOfficials).length > 0
    ? objectArray(event.eventOfficials)
    : normalizedOfficialIds.map((userId) => ({
      id: `event-official-${userId}`,
      userId,
      positionIds: [],
      fieldIds: [],
      isActive: true,
    }));
  const rawMatchRulesOverride = event.matchRulesOverride && typeof event.matchRulesOverride === 'object'
    ? event.matchRulesOverride as Record<string, unknown>
    : {};
  const usesSets = booleanValue(event.usesSets);
  const shouldCalculateMatchDuration = usesSets
    || rawMatchRulesOverride.segmentCount !== undefined
    || rawMatchRulesOverride.segmentLengthMinutes !== undefined;
  const calculatedMatchDurationMinutes = shouldCalculateMatchDuration
    ? calculateTimedMatchDurationMinutes({
      segmentCount: numberOrNull(rawMatchRulesOverride.segmentCount) ?? numberOrNull(event.setsPerMatch),
      segmentLengthMinutes: numberOrNull(rawMatchRulesOverride.segmentLengthMinutes) ?? numberOrNull(event.setDurationMinutes),
      segmentBreakMinutes: numberOrNull(rawMatchRulesOverride.segmentBreakMinutes),
    })
    : null;
  const matchDurationMinutes = calculatedMatchDurationMinutes
    ?? numberOrNull(event.matchDurationMinutes);


  const draft = {
    basics: {
      name: stringValue(event.name),
      description: stringValue(event.description),
      eventType: normalizedEventType,
      sportIds: stringArray(event.sportIds),
      start,
      timeZone: stringValue(event.timeZone, 'UTC'),
      location: stringValue(event.location),
      address: stringValue(event.address),
      coordinates: Array.isArray(event.coordinates) && event.coordinates.length === 2
        ? [Number(event.coordinates[0]) || 0, Number(event.coordinates[1]) || 0]
        : [0, 0],
      affiliateUrl: stringValue(event.affiliateUrl),
      parentEvent: nullableString(event.parentEvent),
      organizationId: nullableString(event.organizationId),
      hostId: nullableString(event.hostId),
      state: stringValue(event.state, 'UNPUBLISHED'),
      imageId: nullableString(event.imageId),
      tags: objectArray(event.tags),
    },
    participation: {
      teamSignup: booleanValue(event.teamSignup),
      singleDivision: booleanValue(event.singleDivision),
      registrationByDivisionType: booleanValue(event.registrationByDivisionType),
      teamSizeLimit: numberOrNull(event.teamSizeLimit),
      maxParticipants: normalizedEventMaxParticipants,
      minAge: numberOrNull(event.minAge),
      maxAge: numberOrNull(event.maxAge),
      cancellationRefundHours: numberOrNull(event.cancellationRefundHours),
      registrationCutoffHours: numberOrNull(event.registrationCutoffHours) ?? 0,
      allowTeamSplitDefault: booleanValue(event.allowTeamSplitDefault),
      waitListIds: stringArray(event.waitListIds),
      freeAgentIds: stringArray(event.freeAgentIds),
    },
    registration: {
      payment: {
        mode: paymentMode(event),
        priceCents: Math.max(0, numberOrNull(event.price) ?? 0),
        taxHandling: stringValue(event.taxHandling, 'INHERIT_ORG'),
        organizerManualTaxRateBps: Math.max(0, numberOrNull(event.organizerManualTaxRateBps) ?? 0),
        manualPaymentLinks: objectArray(event.manualPaymentLinks),
        manualPaymentInstructions: event.manualPaymentInstructions == null ? null : stringValue(event.manualPaymentInstructions),
        allowPaymentPlans: booleanValue(event.allowPaymentPlans),
        installmentCount: numberOrNull(event.installmentCount),
        installmentDueDates: stringArray(event.installmentDueDates),
        installmentDueRelativeDays: numberArray(event.installmentDueRelativeDays),
        installmentAmounts: numberArray(event.installmentAmounts).map((amount) => Math.max(0, amount)),
      },
      questions: normalizeQuestions(questions),
      requiredDocumentIds: stringArray(event.requiredDocumentIds),
    },
    competition: {
      divisionIds: stringArray(event.divisions),
      divisionDetails: rawDivisionDetails,
      playoffDivisionDetails: objectArray(event.playoffDivisionDetails),
      divisionFieldIds: Object.fromEntries(
        Object.entries(event.divisionFieldIds && typeof event.divisionFieldIds === 'object' ? event.divisionFieldIds : {})
          .map(([key, value]) => [key, stringArray(value)]),
      ),
      winnerSetCount: numberOrNull(event.winnerSetCount),
      loserSetCount: numberOrNull(event.loserSetCount),
      doubleElimination: booleanValue(event.doubleElimination),
      includePlayoffs,
      splitLeaguePlayoffDivisions: booleanValue(event.splitLeaguePlayoffDivisions),
      playoffTeamCount: normalizedEventPlayoffTeamCount,
      pointsToVictory: Array.isArray(event.pointsToVictory) ? event.pointsToVictory.map(Number).filter(Number.isFinite) : [],
      winnerBracketPointsToVictory: Array.isArray(event.winnerBracketPointsToVictory) ? event.winnerBracketPointsToVictory.map(Number).filter(Number.isFinite) : [],
      loserBracketPointsToVictory: Array.isArray(event.loserBracketPointsToVictory) ? event.loserBracketPointsToVictory.map(Number).filter(Number.isFinite) : [],
      usesSets,
      setsPerMatch: numberOrNull(event.setsPerMatch),
      setDurationMinutes: typeof event.setDurationMinutes === 'number' ? event.setDurationMinutes : null,
      restTimeMinutes: typeof event.restTimeMinutes === 'number' ? event.restTimeMinutes : null,
      matchDurationMinutes,
      gamesPerOpponent: numberOrNull(event.gamesPerOpponent),
      matchRulesOverride: Object.keys(rawMatchRulesOverride).length ? { ...rawMatchRulesOverride } : null,
      leagueScoringConfig: event.leagueScoringConfig && typeof event.leagueScoringConfig === 'object' ? { ...(event.leagueScoringConfig as Record<string, unknown>) } : null,
    },
    schedule: generatedEnd
      ? {
        mode: 'GENERATED_END',
        endConstraint: null,
        generatedScheduleEnd: explicitGeneratedScheduleEnd ?? nullableString(event.end),
        automatedScheduling,
      }
      : {
        mode: 'FIXED_END',
        endConstraint: explicitScheduleEndConstraint ?? asIsoDateTime(event.end, start),
        automatedScheduling,
      },
    resources: {
      fieldIds: rawFieldIds.length > 0 ? rawFieldIds : fields.map((field) => String(field.$id ?? '')).filter(Boolean),
      fields,
      timeSlotIds: rawTimeSlotIds,
      timeSlots,
      requiredTemplateIds: stringArray(event.requiredTemplateIds),
      immutableFieldIds: stringArray(event.immutableFieldIds),
      rentalBookingId: nullableString(event.rentalBookingId),
      rentalBookingItemId: nullableString(event.rentalBookingItemId),
    },
    staff: {
      staffingPriority,
      doTeamsOfficiate,
      teamOfficialsMaySwap: booleanValue(event.teamOfficialsMaySwap),
      teamCheckInMode: ['EVENT', 'MATCH'].includes(stringValue(event.teamCheckInMode).toUpperCase())
        ? stringValue(event.teamCheckInMode).toUpperCase() as 'EVENT' | 'MATCH'
        : 'OFF',
      teamCheckInOpenMinutesBefore: Math.max(0, numberOrNull(event.teamCheckInOpenMinutesBefore) ?? 60),
      allowMatchRosterEdits: booleanValue(event.allowMatchRosterEdits),
      allowTemporaryMatchPlayers: booleanValue(event.allowTemporaryMatchPlayers),
      autoCreatePointMatchIncidents: booleanValue(event.autoCreatePointMatchIncidents),
      officialIds: normalizedOfficialIds,
      officialPositions: objectArray(event.officialPositions),
      eventOfficials,
      assistantHostIds: stringArray(event.assistantHostIds),
      pendingInvites: objectArray(event.pendingStaffInvites ?? event.staffInvites).map(normalizePendingInvite),
    },
  };
  return projectEventEditorDraftNestedInput(draft) as EventEditorDraft;
};

export const legacyEventToEditorDraft = (event: Event, questions?: unknown): EventEditorDraft => (
  draftFromRecord(event as unknown as Record<string, unknown>, questions, true)
);

export const eventFormValuesToEditorDraft = (values: EventFormValues, questions?: unknown): EventEditorDraft => (
  draftFromRecord(values as unknown as Record<string, unknown>, questions)
);

export const editorSnapshotToFormValues = (
  snapshot: EventEditorSnapshot,
  base: Partial<EventFormValues> = {},
): EventFormValues => {
  const { basics, participation, registration, competition, schedule, resources, staff } = snapshot.draft;
  const legacy: Record<string, unknown> = {
    ...base,
    $id: snapshot.eventId ?? '',
    ...basics,
    ...participation,
    registrationPaymentMode: registration.payment.mode === 'FREE' ? 'ONLINE' : registration.payment.mode,
    price: registration.payment.priceCents,
    taxHandling: registration.payment.taxHandling,
    organizerManualTaxRateBps: registration.payment.organizerManualTaxRateBps,
    manualPaymentInstructions: registration.payment.manualPaymentInstructions,
    manualPaymentLinks: registration.payment.manualPaymentLinks,
    allowPaymentPlans: registration.payment.allowPaymentPlans,
    installmentCount: registration.payment.installmentCount,
    installmentDueDates: registration.payment.installmentDueDates,
    installmentDueRelativeDays: registration.payment.installmentDueRelativeDays,
    installmentAmounts: registration.payment.installmentAmounts,
    registrationQuestions: registration.questions,
    requiredDocumentIds: registration.requiredDocumentIds,
    end: schedule.mode === 'FIXED_END'
      ? schedule.endConstraint
      : schedule.generatedScheduleEnd ?? (base.end as string | null | undefined) ?? null,
    noFixedEndDateTime: schedule.mode === 'GENERATED_END',
    automatedScheduling: schedule.automatedScheduling,
    divisions: competition.divisionIds,
    ...competition,
    ...resources,
    fields: resources.fields as unknown as Field[],
    timeSlots: resources.timeSlots as unknown as TimeSlot[],
    fieldCount: resources.fieldIds.length,
    ...staff,
    officialPositions: staff.officialPositions as unknown as EventOfficialPosition[],
    eventOfficials: staff.eventOfficials as unknown as EventOfficial[],
    pendingStaffInvites: staff.pendingInvites,
    staffInvites: staff.pendingInvites,
    leagueSlots: [],
    leagueData: {},
    playoffData: {},
    tournamentData: {},
    joinAsParticipant: false,
    players: [],
    teams: [],
    officials: [],
    waitList: participation.waitListIds,
    freeAgents: participation.freeAgentIds,
    imageId: basics.imageId ?? '',
  };
  return legacy as EventFormValues;
};

export const editorDraftToLegacyEvent = (draft: EventEditorDraft, eventId?: string | null): Record<string, unknown> => {
  const { basics, participation, registration, competition, schedule, resources, staff } = draft;
  const playoffDivisionIds = new Set(competition.playoffDivisionDetails.map((detail) => detail.id));
  const hasTournamentBracketProxy = basics.eventType.trim().toUpperCase() === 'TOURNAMENT'
    && competition.includePlayoffs
    && competition.divisionDetails.some(
      (detail) => detail.kind === 'LEAGUE' && playoffDivisionIds.has(detail.id),
    );
  const serializedDivisionDetails = hasTournamentBracketProxy
    ? competition.divisionDetails.filter(
      (detail) => !(detail.kind === 'LEAGUE' && playoffDivisionIds.has(detail.id)),
    )
    : competition.divisionDetails;
  return {
    ...(eventId ? { id: eventId, $id: eventId } : {}),
    ...basics,
    ...participation,
    registrationPaymentMode: registration.payment.mode === 'FREE' ? 'ONLINE' : registration.payment.mode,
    price: registration.payment.priceCents,
    ...registration.payment,
    registrationQuestions: registration.questions,
    requiredDocumentIds: registration.requiredDocumentIds,
    divisions: competition.divisionIds,
    ...competition,
    divisionDetails: serializedDivisionDetails,
    end: schedule.mode === 'FIXED_END' ? schedule.endConstraint : schedule.generatedScheduleEnd ?? null,
    scheduleEndConstraint: schedule.mode === 'FIXED_END' ? schedule.endConstraint : null,
    generatedScheduleEnd: schedule.mode === 'GENERATED_END' ? schedule.generatedScheduleEnd : null,
    noFixedEndDateTime: schedule.mode === 'GENERATED_END',
    automatedScheduling: schedule.automatedScheduling,
    fieldIds: resources.fieldIds,
    fields: resources.fields,
    timeSlotIds: resources.timeSlotIds,
    timeSlots: resources.timeSlots,
    requiredTemplateIds: resources.requiredTemplateIds,
    rentalBookingId: resources.rentalBookingId,
    immutableFieldIds: resources.immutableFieldIds,
    rentalBookingItemId: resources.rentalBookingItemId,
    ...staff,
    pendingStaffInvites: staff.pendingInvites,
    staffInvites: staff.pendingInvites,
  };
};

export const editorSnapshotFingerprint = (snapshot: EventEditorSnapshot): string => {
  const { editorRevision: _editorRevision, staffRevision: _staffRevision, ...stable } = snapshot;
  return JSON.stringify(stable);
};

export const emptyEditorSnapshot = (draft: EventEditorDraft, mode: 'CREATE' | 'EDIT' = 'CREATE'): EventEditorSnapshot => ({
  contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
  mode,
  eventId: null,
  editorRevision: 'new',
  staffRevision: null,
  draft,
  capabilities: {
    canUseOnlinePayments: false,
    canManageStaff: false,
    canEdit: true,
    canDelegateHost: false,
    readOnly: false,
    readOnlyReason: null,
    managementAuthority: null,
    eventHostId: draft.basics.hostId ?? null,
    viewerIsEventHost: false,
    supportsTeamStaffing: false,
  },
  catalogs: { sports: [], organizations: [], fields: [], templates: [] },
  immutable: { fieldNames: [], rental: false, template: false },
  scheduleState: {
    sourceType: null,
    matchCount: 0,
    revision: 'new',
    hasProtectedHistory: false,
  },
});
