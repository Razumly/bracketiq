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

const durationOrNull = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const positiveNumberOrNull = (value: unknown): number | null => {
  const normalized = numberOrNull(value);
  return normalized !== null && normalized > 0 ? normalized : null;
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
  const rawRoles = stringArray(value.roles ?? value.staffTypes);
  const roles = Array.from(new Set(
    rawRoles
      .map((role) => role === 'HOST' ? 'ASSISTANT_HOST' : role)
      .filter((role): role is 'OFFICIAL' | 'ASSISTANT_HOST' => (
        role === 'OFFICIAL' || role === 'ASSISTANT_HOST'
      )),
  ));
  return {
    ...value,
    ...(inviteId ? { id: inviteId } : {}),
    roles,
  };
};
const normalizePendingInvitesForEvent = (
  value: unknown,
  isTryoutEvent: boolean,
): Record<string, unknown>[] => {
  const pendingInvites = objectArray(value).map(normalizePendingInvite);
  if (!isTryoutEvent) return pendingInvites;
  return pendingInvites
    .map((invite) => ({
      ...invite,
      roles: stringArray(invite.roles).filter((role) => role === 'ASSISTANT_HOST'),
    }))
    .filter((invite) => (invite.roles as string[]).length > 0);
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
  const scheduleInputs = () => {
    const isBracketEvent = normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT';
    const isTryoutEvent = normalizedEventType === 'TRYOUT';
    const isWeeklyChildEvent = normalizedEventType === 'WEEKLY_EVENT'
      && Boolean(nullableString(event.parentEvent));
    const isAutomatedScheduling = normalizeAutomatedSchedulingForEventType(
      normalizedEventType,
      event.isAutomatedScheduling ?? event.automatedScheduling,
    );
    const start = asIsoDateTime(event.start, new Date(0).toISOString());
    const explicitScheduleEndConstraint = asIsoDateTime(event.scheduleEndConstraint, '') || null;
    const explicitGeneratedScheduleEnd = asIsoDateTime(event.generatedScheduleEnd, '') || null;
    const generatedEnd = !isWeeklyChildEvent
      && normalizedEventType !== 'TRYOUT'
      && explicitScheduleEndConstraint === null
      && (explicitGeneratedScheduleEnd !== null || booleanValue(event.noFixedEndDateTime, false));
    return { isBracketEvent, isTryoutEvent, isAutomatedScheduling, start, explicitScheduleEndConstraint, explicitGeneratedScheduleEnd, generatedEnd };
  };
  const { isBracketEvent, isTryoutEvent, isAutomatedScheduling, start, explicitScheduleEndConstraint, explicitGeneratedScheduleEnd, generatedEnd } = scheduleInputs();
  const resourceLabelInputs = () => {
    const sportIds = stringArray(event.sportIds);
    const sportConfig = event.sportConfig && typeof event.sportConfig === 'object'
      ? event.sportConfig as Record<string, unknown>
      : null;
    const hasResourceLabels = typeof sportConfig?.resourceLabelSingular === 'string'
      && typeof sportConfig.resourceLabelPlural === 'string';
    const resourceLabels = sportIds.length === 1 && hasResourceLabels
      ? getSportResourceLabels(sportConfig)
      : GENERIC_RESOURCE_LABELS;
    return { resourceLabels };
  };
  const { resourceLabels } = resourceLabelInputs();
  const resourceInputs = () => {
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
    return { fields, rawFieldIds, timeSlots };
  };
  const { fields, rawFieldIds, timeSlots } = resourceInputs();
  const divisionInputs = () => {
    const rawDivisionDetails = objectArray(event.divisionDetails);
    const regularDivisionDetails = rawDivisionDetails.filter(
      (detail) => stringValue(detail.kind).trim().toUpperCase() !== 'PLAYOFF',
    );
    const includePlayoffs = isBracketEvent && booleanValue(event.includePlayoffs);
    const rawEventPlayoffTeamCount = numberOrNull(event.playoffTeamCount);
    const normalizePlayoffCount = () =>
      isPersistedBracketCountNormalizationEnabled &&
        includePlayoffs &&
        (normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT')
        ? normalizeBracketTeamCount(rawEventPlayoffTeamCount)
        : isBracketEvent ? rawEventPlayoffTeamCount : null;
    const normalizedEventPlayoffTeamCount = normalizePlayoffCount();
    const normalizedEventMaxParticipants =
      isPersistedBracketCountNormalizationEnabled && normalizedEventType === 'TOURNAMENT'
        ? normalizeBracketTeamCount(numberOrNull(event.maxParticipants))
        : numberOrNull(event.maxParticipants);
    const rawTimeSlotIds = stringArray(
      Array.isArray(event.timeSlotIds) && event.timeSlotIds.length > 0
        ? event.timeSlotIds
        : timeSlots.map((slot) => slot.$id ?? slot.id ?? slot.key),
    );
    return { rawDivisionDetails, regularDivisionDetails, includePlayoffs, normalizedEventPlayoffTeamCount, normalizedEventMaxParticipants, rawTimeSlotIds };
  };
  const { rawDivisionDetails, regularDivisionDetails, includePlayoffs, normalizedEventPlayoffTeamCount, normalizedEventMaxParticipants, rawTimeSlotIds } = divisionInputs();
  const staffInputs = () => {
    const eventId = nullableString(event.$id) ?? nullableString(event.id);
    const explicitStaffingPriority = stringValue(event.staffingPriority).trim().toUpperCase();
    const hasExplicitStaffingPriority = isStaffingPriority(explicitStaffingPriority);
    const legacyOfficialSchedulingMode = normalizeOfficialSchedulingMode(event.officialSchedulingMode);
    const staffingPriority = normalizeStaffingPriority(
      explicitStaffingPriority,
      legacyOfficialSchedulingMode,
    );
    const doTeamsOfficiate = isTryoutEvent
      ? false
      : booleanValue(event.doTeamsOfficiate)
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
    const officialIds = isTryoutEvent ? [] : normalizedOfficialIds;
    const normalizedEventOfficials = isTryoutEvent ? [] : eventOfficials;
    return { eventId, staffingPriority, doTeamsOfficiate, officialIds, normalizedEventOfficials };
  };
  const { eventId, staffingPriority, doTeamsOfficiate, officialIds, normalizedEventOfficials } = staffInputs();
  const timingInputs = () => {
    const rawMatchRulesOverride = isBracketEvent
      && event.matchRulesOverride && typeof event.matchRulesOverride === 'object'
      ? event.matchRulesOverride as Record<string, unknown>
      : {};
    const usesSets = isBracketEvent && booleanValue(event.usesSets);
    const shouldCalculateMatchDuration = usesSets
      || rawMatchRulesOverride.segmentCount !== undefined
      || rawMatchRulesOverride.segmentLengthMinutes !== undefined;
    const calculateDuration = () => shouldCalculateMatchDuration
      ? calculateTimedMatchDurationMinutes({
        segmentCount: numberOrNull(rawMatchRulesOverride.segmentCount) ?? numberOrNull(event.setsPerMatch),
        segmentLengthMinutes: numberOrNull(rawMatchRulesOverride.segmentLengthMinutes) ?? numberOrNull(event.setDurationMinutes),
        segmentBreakMinutes: numberOrNull(rawMatchRulesOverride.segmentBreakMinutes),
      })
      : null;
    const calculatedMatchDurationMinutes = calculateDuration();
    const matchDurationMinutes = isBracketEvent
      ? calculatedMatchDurationMinutes ?? durationOrNull(event.matchDurationMinutes)
      : null;


    return { rawMatchRulesOverride, usesSets, matchDurationMinutes };
  };
  const { rawMatchRulesOverride, usesSets, matchDurationMinutes } = timingInputs();
  const buildBasics = () => ({
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
  });
  const buildParticipation = () => ({
    teamSignup: normalizedEventType === 'TRYOUT' ? false : booleanValue(event.teamSignup),
    singleDivision: normalizedEventType === 'TRYOUT' ? false : booleanValue(event.singleDivision),
    registrationByDivisionType: booleanValue(event.registrationByDivisionType),
    teamSizeLimit: normalizedEventType === 'TRYOUT' ? null : positiveNumberOrNull(event.teamSizeLimit),
    maxParticipants: normalizedEventMaxParticipants,
    minAge: numberOrNull(event.minAge),
    maxAge: numberOrNull(event.maxAge),
    cancellationRefundHours: numberOrNull(event.cancellationRefundHours),
    registrationCutoffHours: numberOrNull(event.registrationCutoffHours) ?? 0,
    allowTeamSplitDefault: isBracketEvent && booleanValue(event.allowTeamSplitDefault),
    waitListIds: stringArray(event.waitListIds),
    freeAgentIds: stringArray(event.freeAgentIds),
  });
  const buildRegistration = () => ({
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
  });
  const bracketNumber = (field: string) => isBracketEvent ? numberOrNull(event[field]) : null;
  const bracketDuration = (field: string) => isBracketEvent && typeof event[field] === 'number' ? event[field] : null;
  const bracketPoints = (field: string) => isBracketEvent && Array.isArray(event[field]) ? event[field].map(Number).filter(Number.isFinite) : [];
  const divisionFieldMapping = () => (isBracketEvent
    ? Object.fromEntries(
      Object.entries(event.divisionFieldIds && typeof event.divisionFieldIds === 'object' ? event.divisionFieldIds : {})
        .map(([key, value]) => [key, stringArray(value)]),
    )
    : {});
  const buildCompetition = () => ({
    divisionIds: stringArray(event.divisions),
    divisionDetails: rawDivisionDetails,
    playoffDivisionDetails: isBracketEvent ? objectArray(event.playoffDivisionDetails) : [],
    divisionFieldIds: divisionFieldMapping(),
    winnerSetCount: bracketNumber('winnerSetCount'),
    loserSetCount: bracketNumber('loserSetCount'),
    doubleElimination: isBracketEvent && booleanValue(event.doubleElimination),
    includePlayoffs,
    splitLeaguePlayoffDivisions: isBracketEvent
      && normalizedEventType === 'LEAGUE'
      && booleanValue(event.splitLeaguePlayoffDivisions),
    playoffTeamCount: normalizedEventPlayoffTeamCount,
    pointsToVictory: bracketPoints('pointsToVictory'),
    winnerBracketPointsToVictory: bracketPoints('winnerBracketPointsToVictory'),
    loserBracketPointsToVictory: bracketPoints('loserBracketPointsToVictory'),
    usesSets,
    setsPerMatch: bracketNumber('setsPerMatch'),
    setDurationMinutes: bracketDuration('setDurationMinutes'),
    restTimeMinutes: bracketDuration('restTimeMinutes'),
    matchDurationMinutes,
    gamesPerOpponent: bracketNumber('gamesPerOpponent'),
    matchRulesOverride: Object.keys(rawMatchRulesOverride).length ? { ...rawMatchRulesOverride } : null,
    leagueScoringConfig: isBracketEvent
      && event.leagueScoringConfig && typeof event.leagueScoringConfig === 'object'
      ? { ...(event.leagueScoringConfig as Record<string, unknown>) }
      : null,
  });
  const buildSchedule = () => (generatedEnd
    ? {
      mode: 'GENERATED_END',
      endConstraint: null,
      generatedScheduleEnd: normalizedEventType === 'WEEKLY_EVENT'
        ? null
        : explicitGeneratedScheduleEnd ?? (asIsoDateTime(event.end, '') || null),
      isAutomatedScheduling,
    }
    : {
      mode: 'FIXED_END',
      endConstraint: explicitScheduleEndConstraint ?? asIsoDateTime(event.end, start),
      isAutomatedScheduling,
    });
  const buildResources = () => ({
    fieldIds: rawFieldIds.length > 0 ? rawFieldIds : fields.map((field) => String(field.$id ?? '')).filter(Boolean),
    fields,
    timeSlotIds: rawTimeSlotIds,
    timeSlots,
    requiredTemplateIds: stringArray(event.requiredTemplateIds),
    immutableFieldIds: stringArray(event.immutableFieldIds),
    sourceTemplateId: nullableString(event.sourceTemplateId),
    rentalBookingId: nullableString(event.rentalBookingId),
    rentalBookingItemId: nullableString(event.rentalBookingItemId),
  });
  const checkInMode = () => (isTryoutEvent
    ? 'OFF'
    : ['EVENT', 'MATCH'].includes(stringValue(event.teamCheckInMode).toUpperCase())
      ? stringValue(event.teamCheckInMode).toUpperCase() as 'EVENT' | 'MATCH'
      : 'OFF');
  const buildStaff = () => ({
    staffingPriority: isTryoutEvent
      ? 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED'
      : staffingPriority,
    doTeamsOfficiate,
    teamOfficialsMaySwap: isTryoutEvent ? false : booleanValue(event.teamOfficialsMaySwap),
    teamCheckInMode: checkInMode(),
    teamCheckInOpenMinutesBefore: isTryoutEvent
      ? 60
      : Math.max(0, numberOrNull(event.teamCheckInOpenMinutesBefore) ?? 60),
    allowMatchRosterEdits: isTryoutEvent ? false : booleanValue(event.allowMatchRosterEdits),
    allowTemporaryMatchPlayers: isTryoutEvent ? false : booleanValue(event.allowTemporaryMatchPlayers),
    autoCreatePointMatchIncidents: isTryoutEvent ? false : booleanValue(event.autoCreatePointMatchIncidents),
    officialIds,
    officialPositions: isTryoutEvent ? [] : objectArray(event.officialPositions),
    eventOfficials: normalizedEventOfficials,
    assistantHostIds: stringArray(event.assistantHostIds),
    pendingInvites: normalizePendingInvitesForEvent(
      event.pendingStaffInvites ?? event.staffInvites,
      isTryoutEvent,
    ),
  });

  const draft = {
    basics: buildBasics(),
    participation: buildParticipation(),
    registration: buildRegistration(),
    competition: buildCompetition(),
    schedule: buildSchedule(),
    resources: buildResources(),
    staff: buildStaff(),
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
      : basics.eventType === 'WEEKLY_EVENT'
        ? null
        : schedule.generatedScheduleEnd ?? (base.end as string | null | undefined) ?? null,
    noFixedEndDateTime: schedule.mode === 'GENERATED_END',
    isAutomatedScheduling: schedule.isAutomatedScheduling,
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
  const normalizedEventType = basics.eventType.trim().toUpperCase();
  const isBracketEvent = normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT';
  const isTryoutEvent = normalizedEventType === 'TRYOUT';
  const normalizedParticipation = normalizedEventType === 'TRYOUT'
    ? {
      ...participation,
      teamSignup: false,
      singleDivision: false,
      teamSizeLimit: null,
      allowTeamSplitDefault: false,
    }
    : participation;
  const normalizedCompetition = isBracketEvent
    ? competition
    : {
      ...competition,
      playoffDivisionDetails: [],
      divisionFieldIds: {},
      winnerSetCount: null,
      loserSetCount: null,
      doubleElimination: false,
      includePlayoffs: false,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: null,
      pointsToVictory: [],
      winnerBracketPointsToVictory: [],
      loserBracketPointsToVictory: [],
      usesSets: false,
      setsPerMatch: null,
      setDurationMinutes: null,
      restTimeMinutes: null,
      matchDurationMinutes: null,
      gamesPerOpponent: null,
      matchRulesOverride: null,
      leagueScoringConfig: null,
    };
  const divisionDetailsForSave = () => {
    const playoffDivisionIds = new Set(normalizedCompetition.playoffDivisionDetails.map((detail) => detail.id));
    const hasTournamentBracketProxy = normalizedEventType === 'TOURNAMENT'
      && normalizedCompetition.includePlayoffs
      && normalizedCompetition.divisionDetails.some(
        (detail) => detail.kind === 'LEAGUE' && playoffDivisionIds.has(detail.id),
      );
    return hasTournamentBracketProxy
      ? normalizedCompetition.divisionDetails.filter(
        (detail) => !(detail.kind === 'LEAGUE' && playoffDivisionIds.has(detail.id)),
      )
      : normalizedCompetition.divisionDetails;
  };
  const serializedDivisionDetails = divisionDetailsForSave();
  const normalizedStaff = isTryoutEvent
    ? {
      ...staff,
      staffingPriority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED' as const,
      doTeamsOfficiate: false,
      teamOfficialsMaySwap: false,
      teamCheckInMode: 'OFF' as const,
      teamCheckInOpenMinutesBefore: 60,
      allowMatchRosterEdits: false,
      allowTemporaryMatchPlayers: false,
      autoCreatePointMatchIncidents: false,
      officialIds: [],
      officialPositions: [],
      eventOfficials: [],
      pendingInvites: normalizePendingInvitesForEvent(staff.pendingInvites, true),
    }
    : staff;
  const scheduleProjection = () => ({
    end: schedule.mode === 'FIXED_END' ? schedule.endConstraint : (
      normalizedEventType === 'WEEKLY_EVENT' ? null : schedule.generatedScheduleEnd
    ),
    scheduleEndConstraint: schedule.mode === 'FIXED_END' ? schedule.endConstraint : null,
    generatedScheduleEnd: schedule.mode === 'GENERATED_END' && normalizedEventType !== 'WEEKLY_EVENT'
      ? schedule.generatedScheduleEnd
      : null,
    noFixedEndDateTime: normalizedEventType === 'TRYOUT' ? false : schedule.mode === 'GENERATED_END',
  });
  return {
    ...(eventId ? { id: eventId, $id: eventId } : {}),
    ...basics,
    ...normalizedParticipation,
    registrationPaymentMode: registration.payment.mode === 'FREE' ? 'ONLINE' : registration.payment.mode,
    price: registration.payment.priceCents,
    ...registration.payment,
    registrationQuestions: registration.questions,
    requiredDocumentIds: registration.requiredDocumentIds,
    divisions: normalizedCompetition.divisionIds,
    ...normalizedCompetition,
    divisionDetails: serializedDivisionDetails,
    ...scheduleProjection(),
    isAutomatedScheduling: normalizeAutomatedSchedulingForEventType(
      normalizedEventType,
      schedule.isAutomatedScheduling,
    ),
    ...normalizedStaff,
    fieldIds: resources.fieldIds,
    fields: resources.fields,
    timeSlotIds: resources.timeSlotIds,
    timeSlots: resources.timeSlots,
    requiredTemplateIds: resources.requiredTemplateIds,
    rentalBookingId: resources.rentalBookingId,
    immutableFieldIds: resources.immutableFieldIds,
    sourceTemplateId: resources.sourceTemplateId ?? null,
    rentalBookingItemId: resources.rentalBookingItemId,
    pendingStaffInvites: normalizedStaff.pendingInvites,
    staffInvites: normalizedStaff.pendingInvites,
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
    availableMaintenanceOperations: [],
    revision: 'new',
    hasProtectedHistory: false,
  },
});
