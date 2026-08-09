import { formatEventDateTimeForForm } from '../dateHelpers';
import { buildEventDraft } from '../buildEventDraft';
import { buildEventFormDefaultValues } from '../defaultValues';
import type { EventFormState, EventFormValues } from '../formTypes';
import { mapEventToFormState } from '../eventStateMapping';
import { normalizeFieldIds, normalizeSlotFieldIds, normalizeWeekdays } from '../slotForm';
import { eventEditorFixtures, type EventEditorFixture } from '@/test/eventEditor/eventEditorFixtures';

const FORM_STATE_KEYS: Array<keyof EventFormState> = [
    '$id',
    'name',
    'description',
    'isAffiliateEvent',
    'affiliateUrl',
    'registrationPaymentMode',
    'manualPaymentLinks',
    'manualPaymentInstructions',
    'tags',
    'location',
    'address',
    'coordinates',
    'start',
    'end',
    'timeZone',
    'state',
    'eventType',
    'parentEvent',
    'sportIds',
    'sportConfig',
    'price',
    'taxHandling',
    'organizerManualTaxRateBps',
    'minAge',
    'maxAge',
    'allowPaymentPlans',
    'installmentCount',
    'installmentDueDates',
    'installmentDueRelativeDays',
    'installmentAmounts',
    'allowTeamSplitDefault',
    'maxParticipants',
    'teamSizeLimit',
    'teamSignup',
    'singleDivision',
    'splitLeaguePlayoffDivisions',
    'registrationByDivisionType',
    'organizationId',
    'divisions',
    'cancellationRefundHours',
    'registrationCutoffHours',
    'requiredTemplateIds',
    'hostId',
    'noFixedEndDateTime',
    'imageId',
    'seedColor',
    'waitList',
    'freeAgents',
    'players',
    'teams',
    'officials',
    'officialIds',
    'officialSchedulingMode',
    'officialPositions',
    'eventOfficials',
    'pendingStaffInvites',
    'assistantHostIds',
    'doTeamsOfficiate',
    'teamOfficialsMaySwap',
    'teamCheckInMode',
    'teamCheckInOpenMinutesBefore',
    'allowMatchRosterEdits',
    'allowTemporaryMatchPlayers',
    'matchRulesOverride',
    'autoCreatePointMatchIncidents',
    'leagueScoringConfig',
];

const pick = <T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> => (
    Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>
);

const pickExpected = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => (
    Object.fromEntries(keys.map((key) => [key, value[key]]))
);

const EDITABLE_DIVISION_KEYS = [
    'id',
    'key',
    'kind',
    'name',
    'divisionTypeId',
    'divisionTypeName',
    'ratingType',
    'gender',
    'skillDivisionTypeId',
    'skillDivisionTypeName',
    'ageDivisionTypeId',
    'ageDivisionTypeName',
    'sportId',
    'price',
    'maxParticipants',
    'playoffTeamCount',
    'poolCount',
    'poolTeamCount',
    'phaseSettings',
    'playoffPlacementDivisionIds',
    'allowPaymentPlans',
    'installmentCount',
    'installmentAmounts',
    'installmentDueDates',
    'installmentDueRelativeDays',
    'fieldIds',
    'gamesPerOpponent',
    'restTimeMinutes',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
    'setsPerMatch',
    'pointsToVictory',
];

const projectDivisionEditableValues = (
    value: Record<string, unknown>,
    includeLeagueRules = true,
): Record<string, unknown> => pickExpected(
    value,
    includeLeagueRules
        ? EDITABLE_DIVISION_KEYS
        : EDITABLE_DIVISION_KEYS.filter((key) => ![
            'playoffPlacementDivisionIds',
            'gamesPerOpponent',
            'restTimeMinutes',
            'usesSets',
            'matchDurationMinutes',
            'setDurationMinutes',
            'setsPerMatch',
            'pointsToVictory',
        ].includes(key)),
);

const projectTournamentConfig = (value: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (!value) return undefined;
    return pickExpected(value, [
        'doubleElimination',
        'winnerSetCount',
        'loserSetCount',
        'winnerBracketPointsToVictory',
        'loserBracketPointsToVictory',
        'prize',
        'fieldCount',
        'restTimeMinutes',
        'usesSets',
        'matchDurationMinutes',
        'setDurationMinutes',
    ]);
};

const projectDivisionCollection = (
    values: unknown,
    includePlayoffConfig: boolean,
    includeLeagueRules = true,
): Array<Record<string, unknown>> => (
    (Array.isArray(values) ? values : []).map((value) => {
        const division = value as Record<string, unknown>;
        return {
            ...projectDivisionEditableValues(division, includeLeagueRules),
            ...(includePlayoffConfig
                ? { playoffConfig: projectTournamentConfig(division.playoffConfig as Record<string, unknown> | undefined) }
                : {}),
        };
    })
);

const projectDraftPlayoffDivisionCollection = (
    values: unknown,
    includePlayoffConfig: boolean,
): Array<Record<string, unknown>> => (
    (Array.isArray(values) ? values : []).map((value) => {
        const division = value as Record<string, unknown>;
        return {
            ...pickExpected(division, [
                'id',
                'key',
                'kind',
                'name',
                'divisionTypeId',
                'divisionTypeName',
                'ratingType',
                'gender',
                'sportId',
                'price',
                'maxParticipants',
                'playoffTeamCount',
                'poolCount',
                'poolTeamCount',
                'phaseSettings',
                'allowPaymentPlans',
                'installmentCount',
                'installmentAmounts',
                'installmentDueDates',
                'installmentDueRelativeDays',
            ]),
            ...(includePlayoffConfig
                ? { playoffConfig: projectTournamentConfig(division.playoffConfig as Record<string, unknown> | undefined) }
                : {}),
        };
    })
);

const DRAFT_BASE_KEYS = [
    '$id',
    'hostId',
    'name',
    'description',
    'affiliateUrl',
    'tags',
    'location',
    'address',
    'start',
    'end',
    'timeZone',
    'eventType',
    'parentEvent',
    'noFixedEndDateTime',
    'state',
    'sportIds',
    'price',
    'registrationPaymentMode',
    'manualPaymentLinks',
    'manualPaymentInstructions',
    'taxHandling',
    'organizerManualTaxRateBps',
    'minAge',
    'maxAge',
    'allowPaymentPlans',
    'installmentCount',
    'installmentAmounts',
    'installmentDueDates',
    'allowTeamSplitDefault',
    'maxParticipants',
    'teamSizeLimit',
    'teamSignup',
    'singleDivision',
    'splitLeaguePlayoffDivisions',
    'registrationByDivisionType',
    'divisions',
    'cancellationRefundHours',
    'registrationCutoffHours',
    'requiredTemplateIds',
    'imageId',
    'seedColor',
    'waitListIds',
    'freeAgentIds',
    'players',
    'teams',
    'officials',
    'officialIds',
    'officialSchedulingMode',
    'officialPositions',
    'eventOfficials',
    'assistantHostIds',
    'doTeamsOfficiate',
    'teamOfficialsMaySwap',
    'teamCheckInMode',
    'teamCheckInOpenMinutesBefore',
    'allowMatchRosterEdits',
    'allowTemporaryMatchPlayers',
    'matchRulesOverride',
    'autoCreatePointMatchIncidents',
    'coordinates',
    'organizationId',
    'leagueScoringConfig',
];

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const buildExpectedDraftBase = (fixture: EventEditorFixture): Record<string, unknown> => {
    const source = fixture.expected.draft;
    const affiliateUrl = typeof source.affiliateUrl === 'string' ? source.affiliateUrl.trim() : '';
    const isAffiliateEvent = affiliateUrl.length > 0;
    const registrationPaymentMode = source.registrationPaymentMode === 'MANUAL' ? 'MANUAL' : 'ONLINE';
    const manualPaymentEnabled = registrationPaymentMode === 'MANUAL';
    const pricingEnabled = fixture.hasStripeAccount || manualPaymentEnabled || isAffiliateEvent;
    const allowPaymentPlans = !isAffiliateEvent && pricingEnabled && !manualPaymentEnabled
        ? Boolean(source.allowPaymentPlans)
        : false;
    const installmentAmounts = allowPaymentPlans ? toArray<number>(source.installmentAmounts) : [];
    const price = pricingEnabled
        ? (allowPaymentPlans
            ? installmentAmounts.reduce((total, amount) => total + amount, 0)
            : Number(source.price ?? 0))
        : 0;
    const eventType = source.eventType === 'AFFILIATE' ? 'EVENT' : source.eventType;
    const timeZone = String(source.timeZone ?? 'UTC');
    const normalizedOfficials = isAffiliateEvent ? [] : toArray(source.officials);
    const normalizedOfficialIds = isAffiliateEvent ? [] : toArray<string>(source.officialIds);
    const normalizedEventOfficials = isAffiliateEvent ? [] : toArray(source.eventOfficials);
    const normalizedAssistantHostIds = isAffiliateEvent ? [] : toArray<string>(source.assistantHostIds);
    const usesStandingsScoring = source.eventType === 'LEAGUE'
        || (source.eventType === 'TOURNAMENT' && Boolean(source.includePlayoffsOrPools));

    return {
        $id: source.$id,
        hostId: source.hostId || fixture.currentUser.$id,
        name: String(source.name ?? '').trim(),
        description: source.description,
        affiliateUrl: isAffiliateEvent ? affiliateUrl : '',
        tags: toArray(source.tags),
        location: source.location,
        address: String(source.address ?? '').trim() || undefined,
        start: formatEventDateTimeForForm(String(source.start), timeZone) || source.start,
        end: source.end
            ? (formatEventDateTimeForForm(String(source.end), timeZone) || source.end)
            : null,
        timeZone,
        eventType,
        parentEvent: source.parentEvent || undefined,
        noFixedEndDateTime: !isAffiliateEvent && eventType !== 'WEEKLY_EVENT'
            ? Boolean(source.noFixedEndDateTime)
            : false,
        state: source.state,
        sportIds: toArray<string>(source.sportIds),
        price,
        registrationPaymentMode,
        manualPaymentLinks: manualPaymentEnabled ? toArray(source.manualPaymentLinks) : [],
        manualPaymentInstructions: manualPaymentEnabled ? source.manualPaymentInstructions ?? null : null,
        taxHandling: isAffiliateEvent ? 'INHERIT_ORG' : source.taxHandling,
        organizerManualTaxRateBps: isAffiliateEvent ? 0 : source.organizerManualTaxRateBps,
        minAge: source.minAge,
        maxAge: source.maxAge == null ? undefined : source.maxAge,
        allowPaymentPlans,
        installmentCount: allowPaymentPlans
            ? (Number(source.installmentCount) || installmentAmounts.length || 0)
            : undefined,
        installmentAmounts,
        installmentDueDates: allowPaymentPlans ? toArray(source.installmentDueDates) : [],
        allowTeamSplitDefault: isAffiliateEvent ? false : Boolean(source.allowTeamSplitDefault),
        maxParticipants: source.maxParticipants == null ? undefined : source.maxParticipants,
        teamSizeLimit: source.teamSizeLimit == null ? undefined : source.teamSizeLimit,
        teamSignup: isAffiliateEvent ? false : Boolean(source.teamSignup),
        singleDivision: Boolean(source.singleDivision),
        splitLeaguePlayoffDivisions: isAffiliateEvent ? false : Boolean(source.splitLeaguePlayoffDivisions),
        registrationByDivisionType: isAffiliateEvent ? false : Boolean(source.registrationByDivisionType),
        divisions: toArray<string>(source.divisions),
        cancellationRefundHours: manualPaymentEnabled ? null : source.cancellationRefundHours,
        registrationCutoffHours: source.registrationCutoffHours,
        requiredTemplateIds: isAffiliateEvent ? [] : toArray(source.requiredTemplateIds),
        // Nullable stored image ids use the editor's empty-string form value.
        imageId: source.imageId ?? '',
        seedColor: source.seedColor,
        waitListIds: toArray(source.waitList),
        freeAgentIds: toArray(source.freeAgents),
        players: toArray(source.players),
        teams: toArray(source.teams),
        officials: normalizedOfficials,
        officialIds: normalizedOfficialIds,
        officialSchedulingMode: isAffiliateEvent ? 'OFF' : source.officialSchedulingMode,
        officialPositions: isAffiliateEvent ? [] : toArray(source.officialPositions),
        eventOfficials: normalizedEventOfficials,
        assistantHostIds: normalizedAssistantHostIds,
        doTeamsOfficiate: isAffiliateEvent ? false : Boolean(source.doTeamsOfficiate),
        teamOfficialsMaySwap: isAffiliateEvent || !source.doTeamsOfficiate
            ? false
            : Boolean(source.teamOfficialsMaySwap),
        teamCheckInMode: isAffiliateEvent || !source.teamSignup ? 'OFF' : source.teamCheckInMode,
        teamCheckInOpenMinutesBefore: Number.isFinite(Number(source.teamCheckInOpenMinutesBefore))
            ? Math.max(0, Math.trunc(Number(source.teamCheckInOpenMinutesBefore)))
            : 60,
        allowMatchRosterEdits: isAffiliateEvent || !source.teamSignup
            ? false
            : Boolean(source.allowMatchRosterEdits),
        allowTemporaryMatchPlayers: isAffiliateEvent || !source.teamSignup || !source.allowMatchRosterEdits
            ? false
            : Boolean(source.allowTemporaryMatchPlayers),
        // The editor removes the legacy segmentCount key before draft build.
        matchRulesOverride: isAffiliateEvent
            ? null
            : source.matchRulesOverride
                ? {
                    scoringModel: (source.matchRulesOverride as Record<string, unknown>).scoringModel,
                    segmentLabel: (source.matchRulesOverride as Record<string, unknown>).segmentLabel,
                }
                : null,
        autoCreatePointMatchIncidents: isAffiliateEvent ? false : Boolean(source.autoCreatePointMatchIncidents),
        coordinates: source.coordinates,
        organizationId: source.organizationId || fixture.organizationHostedEventId || undefined,
        leagueScoringConfig: usesStandingsScoring ? source.leagueScoringConfig : undefined,
    };
};

const normalizeBoundaryForForm = (
    value: string | undefined | null,
    event: EventEditorFixture['event'],
): string | undefined => {
    if (!value) return undefined;
    const normalized = formatEventDateTimeForForm(value, event.timeZone ?? 'UTC');
    const eventStart = formatEventDateTimeForForm(event.start, event.timeZone ?? 'UTC');
    const eventEnd = formatEventDateTimeForForm(event.end, event.timeZone ?? 'UTC');
    return normalized === eventStart || normalized === eventEnd ? undefined : normalized;
};

const assertDefaultSlotRoundTrip = (
    fixture: EventEditorFixture,
    defaults: EventFormValues,
): void => {
    const sourceSlots = fixture.event.timeSlots ?? [];
    if (sourceSlots.length === 0) {
        expect(defaults.leagueSlots).toEqual([
            expect.objectContaining({
                scheduledFieldIds: [],
                daysOfWeek: [],
                repeating: true,
            }),
        ]);
        return;
    }

    expect(defaults.leagueSlots).toHaveLength(sourceSlots.length);
    sourceSlots.forEach((sourceSlot) => {
        const formSlot = defaults.leagueSlots.find((candidate) => candidate.$id === sourceSlot.$id);
        expect(formSlot).toBeDefined();
        expect(formSlot).toEqual(expect.objectContaining({
            $id: sourceSlot.$id,
            scheduledFieldIds: normalizeSlotFieldIds(sourceSlot),
            daysOfWeek: normalizeWeekdays(sourceSlot),
            dayOfWeek: normalizeWeekdays(sourceSlot)[0],
            divisions: sourceSlot.divisions ?? [],
            startDate: normalizeBoundaryForForm(sourceSlot.startDate, fixture.event),
            endDate: normalizeBoundaryForForm(sourceSlot.endDate, fixture.event),
            timeZone: sourceSlot.timeZone ?? fixture.event.timeZone,
            startTimeMinutes: sourceSlot.startTimeMinutes,
            endTimeMinutes: sourceSlot.endTimeMinutes,
            price: sourceSlot.price,
            sourceType: sourceSlot.sourceType ?? undefined,
            rentalBookingId: sourceSlot.rentalBookingId ?? undefined,
            rentalBookingItemId: sourceSlot.rentalBookingItemId ?? undefined,
            rentalLocked: Boolean(sourceSlot.rentalLocked),
            requiredTemplateIds: normalizeFieldIds(sourceSlot.requiredTemplateIds),
            hostRequiredTemplateIds: normalizeFieldIds(sourceSlot.hostRequiredTemplateIds),
            repeating: sourceSlot.repeating,
        }));
    });
};

const assertDraftSlotRoundTrip = (
    fixture: EventEditorFixture,
    draft: Partial<EventFormValues & { timeSlots: EventEditorFixture['event']['timeSlots'] }>,
): void => {
    const sourceSlots = fixture.event.timeSlots ?? [];
    if (sourceSlots.length === 0) {
        return;
    }

    expect(draft.timeSlots).toHaveLength(sourceSlots.length);
    sourceSlots.forEach((sourceSlot) => {
        const draftSlot = draft.timeSlots?.find((candidate) => candidate.$id === sourceSlot.$id);
        expect(draftSlot).toBeDefined();
        expect(draftSlot).toEqual(expect.objectContaining({
            $id: sourceSlot.$id,
            dayOfWeek: normalizeWeekdays(sourceSlot)[0],
            daysOfWeek: normalizeWeekdays(sourceSlot),
            scheduledFieldId: normalizeSlotFieldIds(sourceSlot)[0],
            scheduledFieldIds: normalizeSlotFieldIds(sourceSlot),
            divisions: fixture.event.singleDivision
                ? (fixture.event.divisions as string[])
                : sourceSlot.divisions ?? [],
            timeZone: sourceSlot.timeZone ?? fixture.event.timeZone,
            startTimeMinutes: sourceSlot.startTimeMinutes,
            endTimeMinutes: sourceSlot.endTimeMinutes,
            repeating: sourceSlot.repeating,
            price: sourceSlot.price,
            requiredTemplateIds: normalizeFieldIds(sourceSlot.requiredTemplateIds),
            hostRequiredTemplateIds: normalizeFieldIds(sourceSlot.hostRequiredTemplateIds),
            sourceType: sourceSlot.sourceType ?? (sourceSlot.rentalLocked ? 'RENTAL_BOOKING' : undefined),
            rentalBookingId: sourceSlot.rentalBookingId ?? undefined,
            rentalBookingItemId: sourceSlot.rentalBookingItemId ?? undefined,
            rentalLocked: Boolean(sourceSlot.rentalLocked),
        }));

        if (sourceSlot.repeating) {
            expect(draftSlot?.startDate).toBe(
                formatEventDateTimeForForm(sourceSlot.startDate ?? fixture.event.start, fixture.event.timeZone ?? 'UTC'),
            );
            expect(draftSlot?.endDate).toBe(
                fixture.event.noFixedEndDateTime
                    ? undefined
                    : formatEventDateTimeForForm(sourceSlot.endDate ?? fixture.event.end, fixture.event.timeZone ?? 'UTC'),
            );
        }
    });
};

const assertFormAndDraftBaseValues = (
    fixture: EventEditorFixture,
    mapped: EventFormState,
    defaults: EventFormValues,
    draft: Partial<ReturnType<typeof buildEventDraft>>,
): void => {
    const expectedForm = fixture.expected.form;
    expect(pick(mapped, FORM_STATE_KEYS)).toEqual(pickExpected(expectedForm, FORM_STATE_KEYS));
    expect(pick(defaults, FORM_STATE_KEYS)).toEqual(pickExpected(expectedForm, FORM_STATE_KEYS));
    expect(defaults.leagueData).toEqual(fixture.expected.configs.leagueData);
    expect(defaults.playoffData).toEqual(fixture.expected.configs.playoffData);
    expect(defaults.tournamentData).toEqual(fixture.expected.configs.tournamentData);
    expect(mapped.divisionFieldIds).toEqual(expectedForm.divisionFieldIds);
    expect(mapped.selectedFieldIds).toEqual(expectedForm.selectedFieldIds);

    const expectedStored = fixture.expected.stored;
    const storedDivisionDetails = Array.isArray(expectedStored.divisionDetails)
        ? expectedStored.divisionDetails
        : [];
    const storedPlayoffDivisionDetails = Array.isArray(expectedStored.playoffDivisionDetails)
        ? expectedStored.playoffDivisionDetails
        : [];
    const hasStoredPlayoffConfig = storedDivisionDetails.some((detail) => (
        Boolean((detail as Record<string, unknown>).playoffConfig)
    ));
    const hasStoredPlayoffDivisionConfig = storedPlayoffDivisionDetails.some((detail) => (
        Boolean((detail as Record<string, unknown>).playoffConfig)
    ));
    expect(projectDivisionCollection(mapped.divisionDetails, hasStoredPlayoffConfig))
        .toEqual(projectDivisionCollection(storedDivisionDetails, hasStoredPlayoffConfig));
    expect(projectDivisionCollection(defaults.divisionDetails, hasStoredPlayoffConfig))
        .toEqual(projectDivisionCollection(storedDivisionDetails, hasStoredPlayoffConfig));
    expect(projectDivisionCollection(mapped.playoffDivisionDetails, hasStoredPlayoffDivisionConfig, false))
        .toEqual(projectDivisionCollection(storedPlayoffDivisionDetails, hasStoredPlayoffDivisionConfig, false));
    expect(projectDivisionCollection(defaults.playoffDivisionDetails, hasStoredPlayoffDivisionConfig, false))
        .toEqual(projectDivisionCollection(storedPlayoffDivisionDetails, hasStoredPlayoffDivisionConfig, false));

    const expectedDraft = buildExpectedDraftBase(fixture);
    expect(pickExpected(draft as unknown as Record<string, unknown>, DRAFT_BASE_KEYS))
        .toEqual(pickExpected(expectedDraft, DRAFT_BASE_KEYS));

    const tournamentPoolPlay = fixture.event.eventType === 'TOURNAMENT'
        && Boolean(expectedStored.includePlayoffsOrPools);
    expect(projectDivisionCollection(
        draft.divisionDetails,
        hasStoredPlayoffConfig,
    )).toEqual(tournamentPoolPlay
        ? []
        : projectDivisionCollection(storedDivisionDetails, hasStoredPlayoffConfig));
    expect(projectDraftPlayoffDivisionCollection(
        draft.playoffDivisionDetails,
        hasStoredPlayoffDivisionConfig,
    )).toEqual(projectDraftPlayoffDivisionCollection(
        storedPlayoffDivisionDetails,
        hasStoredPlayoffDivisionConfig,
    ));

    const expectedDraftFields = fixture.shouldManageLocalFields
        ? (fixture.event.fields ?? [])
            .filter((field) => !(field as FieldWithOrganization).organizationId)
        : undefined;
    expect(draft.fields).toEqual(expectedDraftFields);
    const expectedDraftFieldIds = fixture.shouldManageLocalFields
        ? expectedDraftFields?.map((field) => field.$id) ?? []
        : fixture.isOrganizationManagedEvent
            ? Array.from(new Set([
                ...(fixture.event.fields ?? [])
                    .filter((field) => (field as FieldWithOrganization).organizationId === fixture.organizationHostedEventId)
                    .map((field) => field.$id),
                ...fixture.selectedRentedFieldIds,
            ]))
            : fixture.fieldsReferencedInSlots.map((field) => field.$id);
    expect(draft.fieldIds).toEqual(expectedDraftFieldIds.length ? expectedDraftFieldIds : undefined);

    expect(mapped.pendingStaffInvites).toEqual(expectedStored.pendingStaffInvites);
    expect(defaults.pendingStaffInvites).toEqual(expectedStored.pendingStaffInvites);
    expect(draft).not.toHaveProperty('pendingStaffInvites');

};

type FieldWithOrganization = { organizationId?: string | null };

const assertLeagueConfiguration = (
    fixture: EventEditorFixture,
    draft: Partial<ReturnType<typeof buildEventDraft>>,
): void => {
    const leagueData = fixture.expected.configs.leagueData;
    const playoffData = fixture.expected.configs.playoffData;
    expect(draft.gamesPerOpponent).toBe(leagueData.gamesPerOpponent);
    expect(draft.includePlayoffs).toBe(leagueData.includePlayoffs);
    expect(draft.playoffTeamCount).toBe(
        leagueData.includePlayoffs && fixture.event.singleDivision
            ? leagueData.playoffTeamCount
            : undefined,
    );
    expect(draft.usesSets).toBe(leagueData.usesSets);
    if (leagueData.usesSets) {
        expect(draft.setDurationMinutes).toBe(leagueData.setDurationMinutes);
        expect(draft.setsPerMatch).toBe(leagueData.setsPerMatch);
        expect(draft.pointsToVictory).toEqual(leagueData.pointsToVictory);
    } else {
        expect(draft.matchDurationMinutes).toBe(leagueData.matchDurationMinutes);
    }
    if (leagueData.includePlayoffs) {
        expect(draft.doubleElimination).toBe(playoffData.doubleElimination);
        expect(draft.winnerSetCount).toBe(playoffData.winnerSetCount);
        expect(draft.loserSetCount).toBe(playoffData.loserSetCount);
        expect(draft.winnerBracketPointsToVictory).toEqual(playoffData.winnerBracketPointsToVictory);
        expect(draft.loserBracketPointsToVictory).toEqual(playoffData.loserBracketPointsToVictory);
        // The current league draft projects playoff rest time into the
        // flattened event field. Keep this compatibility boundary explicit.
        expect(draft.restTimeMinutes).toBe(playoffData.restTimeMinutes);
        // Prize and field count remain in playoffData but are not serialized
        // by the current league draft builder.
        expect(draft).not.toHaveProperty('prize');
        expect(draft).not.toHaveProperty('fieldCount');
        if (playoffData.usesSets !== leagueData.usesSets) {
            expect(draft.usesSets).toBe(leagueData.usesSets);
        }
        if (playoffData.matchDurationMinutes !== leagueData.matchDurationMinutes) {
            expect(draft.matchDurationMinutes).toBe(leagueData.matchDurationMinutes);
        }
        if (playoffData.setDurationMinutes !== leagueData.setDurationMinutes) {
            expect(draft.setDurationMinutes).toBe(leagueData.setDurationMinutes);
        }
    }
};

const assertTournamentConfiguration = (
    fixture: EventEditorFixture,
    draft: Partial<ReturnType<typeof buildEventDraft>>,
): void => {
    const tournamentData = fixture.expected.configs.tournamentData;
    expect(draft.doubleElimination).toBe(tournamentData.doubleElimination);
    expect(draft.winnerSetCount).toBe(tournamentData.winnerSetCount);
    expect(draft.loserSetCount).toBe(tournamentData.loserSetCount);
    expect(draft.winnerBracketPointsToVictory).toEqual(tournamentData.winnerBracketPointsToVictory);
    expect(draft.loserBracketPointsToVictory).toEqual(tournamentData.loserBracketPointsToVictory);
    expect(draft.prize).toBe(tournamentData.prize);
    expect(draft.restTimeMinutes).toBe(tournamentData.restTimeMinutes);
    expect(draft.fieldCount).toBe(tournamentData.fieldCount);
    expect(draft.usesSets).toBe(tournamentData.usesSets);
    if (tournamentData.usesSets) {
        expect(draft.setDurationMinutes).toBe(tournamentData.setDurationMinutes);
    } else {
        expect(draft.matchDurationMinutes).toBe(tournamentData.matchDurationMinutes);
    }
};

const buildRoundTrip = (fixture: EventEditorFixture) => {
    const mapped = mapEventToFormState(fixture.event);
    const defaults = buildEventFormDefaultValues({
        activeEditingEvent: fixture.event,
        applyImmutableDefaults: (state) => state,
        hasImmutableFields: false,
        immutableDefaults: {},
        immutableFields: [],
        isCreateMode: false,
        resolvedOrganizationFields: fixture.resolvedOrganizationFields,
        resolvedOrganizationId: fixture.organization?.$id ?? '',
        sportsById: fixture.sportsById,
    });
    const draft = buildEventDraft({
        activeEditingEvent: fixture.event,
        currentUser: fixture.currentUser,
        fieldCount: defaults.fieldCount,
        fields: defaults.fields,
        fieldsReferencedInSlots: fixture.fieldsReferencedInSlots,
        hasImmutableTimeSlots: false,
        hasRestrictedImmutableFields: false,
        hasStripeAccount: fixture.hasStripeAccount,
        immutableFields: [],
        immutableTimeSlots: [],
        isEditMode: true,
        isOrganizationHostedEvent: fixture.isOrganizationHostedEvent,
        isOrganizationManagedEvent: fixture.isOrganizationManagedEvent,
        joinAsParticipant: false,
        organizationHostedEventId: fixture.organizationHostedEventId,
        organizationOfficialsById: fixture.organizationOfficialsById,
        previousEventFieldLocation: fixture.event.location,
        rentalLockedSlotsForDraft: fixture.rentalLockedSlotsForDraft,
        resolvedOrganization: fixture.organization,
        selectedRentedFieldIds: fixture.selectedRentedFieldIds,
        shouldManageLocalFields: fixture.shouldManageLocalFields,
        shouldProvisionFields: false,
        source: defaults,
        sportsById: fixture.sportsById,
    });

    return { mapped, defaults, draft };
};

describe('event editor no-user-change round trips', () => {
    it.each(eventEditorFixtures.map((fixture) => [fixture.name, fixture] as const))(
        'characterizes every editable value for %s',
        (_fixtureName, fixture) => {
        const { mapped, defaults, draft } = buildRoundTrip(fixture);

        assertFormAndDraftBaseValues(fixture, mapped, defaults, draft);
        assertDefaultSlotRoundTrip(fixture, defaults);
        assertDraftSlotRoundTrip(fixture, draft);

        // Organization resources remain selectable form resources while the
        // editable local-field count stays zero.
        expect(defaults.fieldCount).toBe(
            fixture.isOrganizationHostedEvent ? 0 : defaults.fields.length,
        );
        expect(defaults.joinAsParticipant).toBe(false);
        const rentalSelectorIds = (fixture.event.timeSlots ?? [])
            .map((slot) => slot.rentalBookingItemId ? `rental:${slot.rentalBookingItemId}` : null)
            .filter((value): value is string => Boolean(value));
        // Rental selectors are a form-only representation of persisted slot
        // booking items. All other selected resources use the stored ids.
        expect(defaults.selectedFieldIds).toEqual([
            ...(fixture.event.fieldIds ?? []),
            ...rentalSelectorIds,
        ]);
        const storedDivisionFieldIds = fixture.event.divisionFieldIds ?? {};
        if (Object.keys(storedDivisionFieldIds).length > 0) {
            expect(defaults.divisionFieldIds).toEqual(storedDivisionFieldIds);
        } else if ((fixture.event.divisions ?? []).length === 0) {
            expect(defaults.divisionFieldIds).toEqual({
                open: fixture.event.fields?.[0]?.$id ? [fixture.event.fields[0].$id] : [],
            });
        }

        if (fixture.event.eventType === 'LEAGUE') {
            assertLeagueConfiguration(fixture, draft);
        }
        if (fixture.event.eventType === 'TOURNAMENT') {
            assertTournamentConfiguration(fixture, draft);
        }

        if (fixture.event.eventType === 'TOURNAMENT' && fixture.event.includePlayoffsOrPools) {
            const storedPoolDivision = fixture.event.playoffDivisionDetails?.[0];
            const poolDivision = defaults.playoffDivisionDetails[0];
            expect(storedPoolDivision).toBeDefined();
            expect(poolDivision).toEqual(expect.objectContaining({
                poolCount: storedPoolDivision?.poolCount,
                poolTeamCount: storedPoolDivision?.poolTeamCount,
                playoffTeamCount: storedPoolDivision?.playoffTeamCount,
                playoffConfig: expect.objectContaining({
                    doubleElimination: storedPoolDivision?.playoffConfig?.doubleElimination,
                    prize: storedPoolDivision?.playoffConfig?.prize,
                }),
                phaseSettings: storedPoolDivision?.phaseSettings,
            }));
            expect(draft.playoffDivisionDetails).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    id: poolDivision.id,
                    poolCount: storedPoolDivision?.poolCount,
                    poolTeamCount: storedPoolDivision?.poolTeamCount,
                    playoffTeamCount: storedPoolDivision?.playoffTeamCount,
                    phaseSettings: storedPoolDivision?.phaseSettings,
                    playoffConfig: storedPoolDivision?.playoffConfig,
                }),
            ]));
        }

        if (fixture.event.eventType === 'LEAGUE' || (
            fixture.event.eventType === 'TOURNAMENT' && fixture.event.includePlayoffsOrPools
        )) {
            expect(draft.leagueScoringConfig).toEqual(fixture.event.leagueScoringConfig);
        } else {
            expect(draft.leagueScoringConfig).toBeUndefined();
        }
        },
    );

    it('names the nullable scalar compatibility boundary', () => {
        const simple = eventEditorFixtures.find((fixture) => fixture.event.$id === 'event-simple');
        expect(simple).toBeDefined();
        const { defaults, draft } = buildRoundTrip(simple!);

        expect(defaults.imageId).toBe('');
        expect(draft.imageId).toBe('');
        expect(defaults.maxParticipants).toBeNull();
        expect(defaults.teamSizeLimit).toBeNull();
        expect(draft.maxParticipants).toBeUndefined();
        expect(draft.teamSizeLimit).toBeUndefined();
    });

    it('names the legacy division resource representation', () => {
        eventEditorFixtures
            .filter((fixture) => Object.keys(fixture.event.divisionFieldIds ?? {}).length > 0)
            .forEach((fixture) => {
                const { defaults, draft } = buildRoundTrip(fixture);
                expect(defaults.divisionFieldIds).toEqual(expect.objectContaining(fixture.event.divisionFieldIds));
                expect(draft).not.toHaveProperty('divisionFieldIds');
            });
    });

    it('names the default open-division resource mapping for empty division collections', () => {
        const simple = eventEditorFixtures.find((fixture) => fixture.event.$id === 'event-simple');
        expect(simple).toBeDefined();
        const { defaults } = buildRoundTrip(simple!);

        expect(simple?.event.divisions).toEqual([]);
        expect(simple?.event.divisionFieldIds).toEqual({});
        expect(defaults.divisionFieldIds).toEqual({ open: [simple?.event.fields?.[0].$id] });
    });

    it('names the rental selector added beside the persisted rental field', () => {
        const rental = eventEditorFixtures.find((fixture) => fixture.event.$id === 'event-rental-backed');
        expect(rental).toBeDefined();
        const { defaults } = buildRoundTrip(rental!);

        expect(defaults.selectedFieldIds).toEqual([
            rental?.event.fieldIds?.[0],
            'rental:rental-item-1',
        ]);
    });

    it('names the weekly relative-day payment representation', () => {
        const weekly = eventEditorFixtures.find((fixture) => fixture.event.$id === 'event-weekly-pickup');
        expect(weekly).toBeDefined();
        const { defaults, draft } = buildRoundTrip(weekly!);

        expect(defaults.installmentDueRelativeDays).toEqual([0, 7]);
        expect(draft).not.toHaveProperty('installmentDueRelativeDays');
    });

    it('names registration questions as a separate submission stream', () => {
        const fixture = eventEditorFixtures.find((entry) => entry.event.$id === 'event-questions-documents');
        expect(fixture?.event.registrationQuestions).toHaveLength(2);
        expect(fixture?.event.requiredTemplateIds).toEqual([
            'template-medical-release',
            'template-parent-consent',
        ]);

        const { defaults, draft } = buildRoundTrip(fixture!);
        expect(defaults.requiredTemplateIds).toEqual(fixture?.event.requiredTemplateIds);
        expect(draft.requiredTemplateIds).toEqual(fixture?.event.requiredTemplateIds);
        expect(defaults).not.toHaveProperty('registrationQuestions');
        expect(draft).not.toHaveProperty('registrationQuestions');
    });
});
