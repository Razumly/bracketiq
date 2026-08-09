import { createLeagueScoringConfig, createSport } from '@/types/defaults';
import { formatEventDateTimeForForm } from '@/app/events/[id]/schedule/components/eventForm/dateHelpers';
import type {
    Division,
    Event,
    Field,
    LeagueConfig,
    Organization,
    RegistrationQuestionDraft,
    Sport,
    Team,
    TimeSlot,
    TournamentConfig,
    UserData,
} from '@/types';
import type { PendingStaffInvite } from '@/app/events/[id]/schedule/components/eventForm/staffInvites';

export type EventWithEditorQuestions = Event & {
    registrationQuestions?: RegistrationQuestionDraft[];
    pendingStaffInvites?: PendingStaffInvite[];
};

export type EventEditorFixture = {
    name: string;
    event: EventWithEditorQuestions;
    currentUser: UserData;
    organization: Organization | null;
    organizationOfficialsById: Map<string, UserData>;
    resolvedOrganizationFields: Field[];
    sportsById: Map<string, Sport>;
    hasStripeAccount: boolean;
    isOrganizationHostedEvent: boolean;
    isOrganizationManagedEvent: boolean;
    organizationHostedEventId: string;
    fieldsReferencedInSlots: Field[];
    rentalLockedSlotsForDraft: TimeSlot[];
    selectedRentedFieldIds: string[];
    shouldManageLocalFields: boolean;
    expected: EventEditorExpectedProjection;
};

export type EventEditorExpectedProjection = {
    form: Record<string, unknown>;
    stored: Record<string, unknown>;
    draft: Record<string, unknown>;
    configs: {
        leagueData: LeagueConfig;
        playoffData: TournamentConfig;
        tournamentData: TournamentConfig;
    };
};

const START = '2026-08-10T17:00:00.000Z';
const END = '2026-08-10T19:00:00.000Z';
const TIME_ZONE = 'America/Los_Angeles';

const SOCCER = createSport({
    $id: 'sport-soccer',
    name: 'Soccer',
    officialPositionTemplates: [{ name: 'Referee', count: 1 }],
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
});

const VOLLEYBALL = createSport({
    $id: 'sport-volleyball',
    name: 'Volleyball',
    officialPositionTemplates: [{ name: 'First referee', count: 1 }, { name: 'Second referee', count: 1 }],
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
});

const makeUser = (id: string, firstName: string, lastName: string): UserData => ({
    $id: id,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    teamIds: [],
    friendIds: [],
    friendRequestIds: [],
    friendRequestSentIds: [],
    followingIds: [],
    blockedUserIds: [],
    hiddenEventIds: [],
    userName: `${firstName}.${lastName}`.toLowerCase(),
    uploadedImages: [],
    fullName: `${firstName} ${lastName}`,
    avatarUrl: '',
});

const HOST = makeUser('user-host', 'Jordan', 'Lee');
const ASSISTANT_HOST = makeUser('user-assistant', 'Morgan', 'Patel');
const OFFICIAL = makeUser('user-official', 'Taylor', 'Nguyen');
const PLAYER = makeUser('user-player', 'Casey', 'Rivera');

const makeOrganization = (id: string, name: string): Organization => ({
    $id: id,
    name,
    ownerId: HOST.$id,
    hasStripeAccount: true,
    staffMembers: [
        { $id: `${id}-staff-host`, organizationId: id, userId: HOST.$id, types: ['HOST'] },
        { $id: `${id}-staff-assistant`, organizationId: id, userId: ASSISTANT_HOST.$id, types: ['HOST'] },
        { $id: `${id}-staff-official`, organizationId: id, userId: OFFICIAL.$id, types: ['OFFICIAL'] },
    ],
    staffInvites: [],
});

const CLUB = makeOrganization('org-river-city', 'River City Sports Club');
const RENTAL_FACILITY = makeOrganization('org-cascade-facility', 'Cascade Athletic Center');

const makeField = (
    id: string,
    name: string,
    options: { organizationId?: string; facilityId?: string; location?: string } = {},
): Field => ({
    $id: id,
    name,
    location: options.location ?? 'River City Sports Club, Portland, OR',
    lat: 45.5231,
    long: -122.6765,
    facilityId: options.facilityId,
    sportIds: [SOCCER.$id, VOLLEYBALL.$id],
    $createdAt: `2026-07-01T00:00:0${id.length}.000Z`,
    ...(options.organizationId
        ? {
            organizationId: options.organizationId,
            organization: { $id: options.organizationId, name: options.organizationId === CLUB.$id ? CLUB.name : RENTAL_FACILITY.name },
        }
        : {}),
} as Field);

const LOCAL_FIELD = makeField('field-local-1', 'Court 1', { facilityId: 'facility-river-city' });
const LOCAL_FIELD_2 = makeField('field-local-2', 'Court 2', { facilityId: 'facility-river-city' });
const CLUB_FIELD = makeField('field-club-1', 'Main Court', { organizationId: CLUB.$id, facilityId: 'facility-river-city' });
const RENTAL_FIELD = makeField('field-rental-1', 'North Turf', {
    organizationId: RENTAL_FACILITY.$id,
    facilityId: 'facility-cascade',
    location: 'Cascade Athletic Center, Gresham, OR',
});

const makeDivision = (
    id: string,
    name: string,
    overrides: Partial<Division> = {},
): Division => ({
    id,
        key: id,
        name,
        kind: 'LEAGUE',
        sportId: SOCCER.$id,
        divisionTypeId: 'skill_open_age_18plus',
        divisionTypeName: 'CoEd Open 18+',
    skillDivisionTypeId: 'open',
    skillDivisionTypeName: 'Open',
    ageDivisionTypeId: '18plus',
    ageDivisionTypeName: '18+',
    ratingType: 'SKILL',
    gender: 'C',
    price: 0,
    maxParticipants: 8,
        playoffTeamCount: undefined,
        poolCount: undefined,
        poolTeamCount: undefined,
        phaseSettings: {},
        playoffPlacementDivisionIds: [],
        gamesPerOpponent: 1,
        restTimeMinutes: 0,
        usesSets: false,
        matchDurationMinutes: 60,
        setDurationMinutes: undefined,
        setsPerMatch: undefined,
        pointsToVictory: undefined,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentAmounts: [],
    installmentDueDates: [],
    installmentDueRelativeDays: [],
        fieldIds: [],
        ...(typeof (overrides.playoffTeamCount) === 'number'
            ? {
                playoffConfig: {
                    doubleElimination: false,
                    winnerSetCount: 1,
                    loserSetCount: 1,
                    winnerBracketPointsToVictory: [21],
                    loserBracketPointsToVictory: [21],
                    prize: '',
                    fieldCount: 1,
                    restTimeMinutes: overrides.restTimeMinutes ?? 0,
                    usesSets: overrides.usesSets ?? false,
                    matchDurationMinutes: overrides.matchDurationMinutes ?? 60,
                    setDurationMinutes: overrides.setDurationMinutes,
                },
            }
            : {}),
        ...overrides,
    });

const makeTeam = (id: string, divisionId: string, name: string): Team => ({
    $id: id,
    name,
    division: divisionId,
    sport: SOCCER.$id,
    playerIds: [PLAYER.$id],
    captainId: PLAYER.$id,
    pending: [],
    teamSize: 1,
    currentSize: 1,
    isFull: false,
    avatarUrl: '',
});

const makeSlot = (
    id: string,
    fieldIds: string[],
    divisions: string[],
    overrides: Partial<TimeSlot> = {},
): TimeSlot => ({
    $id: id,
    dayOfWeek: 0,
    daysOfWeek: [0, 2],
    divisions,
    startDate: START,
    endDate: END,
    timeZone: TIME_ZONE,
    startTimeMinutes: 600,
    endTimeMinutes: 720,
    repeating: true,
    scheduledFieldId: fieldIds[0],
    scheduledFieldIds: fieldIds,
    price: 0,
    requiredTemplateIds: [],
    hostRequiredTemplateIds: [],
    sourceType: null,
    rentalBookingId: null,
    rentalBookingItemId: null,
    rentalLocked: false,
    ...overrides,
});

const baseEvent = (
    overrides: Partial<Event> & {
        registrationQuestions?: RegistrationQuestionDraft[];
        pendingStaffInvites?: PendingStaffInvite[];
    } = {},
): EventWithEditorQuestions => ({
    $id: 'event-base',
    name: 'Community Sports Event',
    description: 'A realistic stored event used by the editor round-trip characterization.',
    start: START,
    end: END,
    timeZone: TIME_ZONE,
    location: 'River City Sports Club',
    address: '1200 SE Morrison St, Portland, OR 97214',
    coordinates: [-122.656, 45.512],
    price: 0,
    registrationPaymentMode: 'ONLINE',
    manualPaymentLinks: [],
    manualPaymentInstructions: null,
    taxHandling: 'INHERIT_ORG',
    organizerManualTaxRateBps: 0,
    hostId: HOST.$id,
    assistantHostIds: [],
    noFixedEndDateTime: false,
    state: 'PUBLISHED',
    maxParticipants: 8,
    teamSizeLimit: 4,
    teamSignup: false,
    singleDivision: false,
    waitListIds: [],
    freeAgentIds: [],
    cancellationRefundHours: null,
    registrationCutoffHours: 2,
    seedColor: 0,
    imageId: null,
    eventType: 'EVENT',
    sport: SOCCER,
    sportIds: [SOCCER.$id],
    divisions: [],
    divisionDetails: [],
    playoffDivisionDetails: [],
    divisionFieldIds: {},
    fieldIds: [LOCAL_FIELD.$id],
    fields: [LOCAL_FIELD],
    timeSlots: [],
    teams: [],
    players: [],
    officials: [],
    officialIds: [],
    officialSchedulingMode: 'OFF',
    officialPositions: [{ id: 'position-referee', name: 'Referee', count: 1, order: 0 }],
    eventOfficials: [],
    leagueScoringConfig: createLeagueScoringConfig(),
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    registrationByDivisionType: false,
    splitLeaguePlayoffDivisions: false,
    requiredTemplateIds: [],
    allowMatchRosterEdits: false,
    allowTemporaryMatchPlayers: false,
    teamCheckInMode: 'OFF',
    teamCheckInOpenMinutesBefore: 60,
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    matchRulesOverride: null,
    autoCreatePointMatchIncidents: false,
    attendees: 0,
    $createdAt: '2026-07-01T00:00:00.000Z',
    $updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
});

const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
    doubleElimination: false,
    winnerSetCount: 1,
    loserSetCount: 1,
    winnerBracketPointsToVictory: [21],
    loserBracketPointsToVictory: [21],
    prize: '',
    fieldCount: 1,
    restTimeMinutes: 0,
    usesSets: false,
    matchDurationMinutes: undefined,
    setDurationMinutes: undefined,
};

const normalizeExpectedTournamentConfig = (event: Event): TournamentConfig => {
    const doubleElimination = Boolean(event.doubleElimination);
    const winnerSetCount = Number.isFinite(event.winnerSetCount) && Number(event.winnerSetCount) >= 1
        ? Math.trunc(Number(event.winnerSetCount))
        : 1;
    const loserSetCount = Number.isFinite(event.loserSetCount) && Number(event.loserSetCount) >= 1
        ? Math.trunc(Number(event.loserSetCount))
        : 1;
    const normalizePoints = (values: number[] | undefined, count: number): number[] => {
        const points = Array.isArray(values) ? values.slice(0, count) : [];
        while (points.length < count) points.push(21);
        return points;
    };
    const normalizeDuration = (value: number | null | undefined): number | undefined => (
        typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined
    );

    return {
        doubleElimination,
        winnerSetCount,
        loserSetCount,
        winnerBracketPointsToVictory: normalizePoints(event.winnerBracketPointsToVictory, winnerSetCount),
        loserBracketPointsToVictory: normalizePoints(
            event.loserBracketPointsToVictory,
            doubleElimination ? loserSetCount : 1,
        ),
        prize: event.prize ?? '',
        fieldCount: event.fieldCount ?? event.fields?.length ?? 1,
        restTimeMinutes: event.restTimeMinutes ?? 0,
        usesSets: Boolean(event.usesSets),
        matchDurationMinutes: normalizeDuration(event.matchDurationMinutes),
        setDurationMinutes: normalizeDuration(event.setDurationMinutes),
    };
};

const normalizeExpectedLeagueData = (event: Event): LeagueConfig => {
    const sportRequiresSets = Boolean(event.sport?.usePointsPerSetWin);
    const defaultData: LeagueConfig = {
        gamesPerOpponent: 1,
        includePlayoffs: false,
        playoffTeamCount: undefined,
        usesSets: sportRequiresSets,
        matchDurationMinutes: sportRequiresSets ? undefined : 60,
        restTimeMinutes: 0,
        setDurationMinutes: sportRequiresSets ? 20 : undefined,
        setsPerMatch: sportRequiresSets ? 1 : undefined,
        pointsToVictory: sportRequiresSets ? [21] : undefined,
    };
    if (event.eventType !== 'LEAGUE' && event.eventType !== 'TOURNAMENT') {
        return defaultData;
    }

    const eventSource = event.leagueConfig ?? {
        gamesPerOpponent: event.gamesPerOpponent,
        includePlayoffs: event.includePlayoffs,
        playoffTeamCount: event.playoffTeamCount,
        usesSets: event.usesSets,
        matchDurationMinutes: event.matchDurationMinutes,
        restTimeMinutes: event.restTimeMinutes,
        setDurationMinutes: event.setDurationMinutes,
        setsPerMatch: event.setsPerMatch,
        pointsToVictory: event.pointsToVictory,
    };
    const detail = event.eventType === 'LEAGUE'
        ? event.divisionDetails?.find((entry) => typeof entry.gamesPerOpponent === 'number')
        : undefined;
    const hasDetailValue = (key: keyof Division): boolean => Boolean(
        detail && Object.prototype.hasOwnProperty.call(detail, key),
    );
    const source = detail
        ? {
            ...eventSource,
            gamesPerOpponent: detail.gamesPerOpponent ?? eventSource.gamesPerOpponent,
            usesSets: detail.usesSets ?? eventSource.usesSets,
            matchDurationMinutes: hasDetailValue('matchDurationMinutes')
                ? detail.matchDurationMinutes
                : eventSource.matchDurationMinutes,
            restTimeMinutes: detail.restTimeMinutes ?? eventSource.restTimeMinutes,
            setDurationMinutes: hasDetailValue('setDurationMinutes')
                ? detail.setDurationMinutes
                : eventSource.setDurationMinutes,
            setsPerMatch: detail.setsPerMatch ?? eventSource.setsPerMatch,
            pointsToVictory: Array.isArray(detail.pointsToVictory) && detail.pointsToVictory.length
                ? detail.pointsToVictory
                : eventSource.pointsToVictory,
        }
        : eventSource;
    const includePlayoffs = Boolean(
        event.includePlayoffsOrPools
        ?? event.leagueConfig?.includePlayoffs
        ?? event.includePlayoffs,
    );
    const gamesPerOpponent = Number.isFinite(Number(source.gamesPerOpponent))
        ? Math.max(1, Math.trunc(Number(source.gamesPerOpponent)))
        : 1;
    const playoffTeamCount = Number.isFinite(Number(source.playoffTeamCount ?? event.playoffTeamCount))
        ? Math.trunc(Number(source.playoffTeamCount ?? event.playoffTeamCount))
        : undefined;
    const restTimeMinutes = Number.isFinite(Number(source.restTimeMinutes))
        ? Math.max(0, Math.trunc(Number(source.restTimeMinutes)))
        : 0;

    if (!sportRequiresSets) {
        return {
            gamesPerOpponent,
            includePlayoffs,
            playoffTeamCount,
            usesSets: false,
            matchDurationMinutes: typeof source.matchDurationMinutes === 'number'
                ? Math.max(0, Math.trunc(source.matchDurationMinutes))
                : detail ? undefined : 60,
            restTimeMinutes,
            setDurationMinutes: undefined,
            setsPerMatch: undefined,
            pointsToVictory: undefined,
        };
    }

    const setsPerMatch = [1, 3, 5].includes(Math.trunc(Number(source.setsPerMatch)))
        ? Math.trunc(Number(source.setsPerMatch))
        : 1;
    const pointsToVictory = Array.isArray(source.pointsToVictory)
        ? source.pointsToVictory.slice(0, setsPerMatch).map((value) => Math.max(1, Math.trunc(Number(value))))
        : [];
    while (pointsToVictory.length < setsPerMatch) pointsToVictory.push(21);
    return {
        gamesPerOpponent,
        includePlayoffs,
        playoffTeamCount,
        usesSets: true,
        matchDurationMinutes: typeof source.matchDurationMinutes === 'number'
            ? Math.max(0, Math.trunc(source.matchDurationMinutes))
            : undefined,
        restTimeMinutes,
        setDurationMinutes: typeof source.setDurationMinutes === 'number'
            ? Math.max(0, Math.trunc(source.setDurationMinutes))
            : undefined,
        setsPerMatch,
        pointsToVictory,
    };
};

const buildExpectedConfigs = (event: Event): EventEditorExpectedProjection['configs'] => {
    const tournamentData = event.eventType === 'TOURNAMENT'
        ? normalizeExpectedTournamentConfig(event)
        : { ...DEFAULT_TOURNAMENT_CONFIG };
    const hasLegacyPlayoffValues = [
        event.doubleElimination,
        event.winnerSetCount,
        event.loserSetCount,
        event.winnerBracketPointsToVictory,
        event.loserBracketPointsToVictory,
        event.prize,
        event.fieldCount,
        event.restTimeMinutes,
        event.usesSets,
        event.matchDurationMinutes,
        event.setDurationMinutes,
    ].some((value) => value !== undefined && value !== null);
    const playoffData = event.includePlayoffs && hasLegacyPlayoffValues
        ? normalizeExpectedTournamentConfig(event)
        : { ...DEFAULT_TOURNAMENT_CONFIG };
    return {
        leagueData: normalizeExpectedLeagueData(event),
        playoffData,
        tournamentData,
    };
};

const buildExpectedProjection = (event: EventWithEditorQuestions): EventEditorExpectedProjection => {
    const timeZone = event.timeZone ?? 'UTC';
    const divisionIds = Array.isArray(event.divisions)
        ? event.divisions.map((division) => (
            typeof division === 'string' ? division : division.id
        ))
        : [];
    const stored = {
        $id: event.$id,
        name: event.name,
        description: event.description,
        affiliateUrl: event.affiliateUrl ?? '',
        registrationPaymentMode: event.registrationPaymentMode ?? 'ONLINE',
        manualPaymentLinks: event.manualPaymentLinks ?? [],
        manualPaymentInstructions: event.manualPaymentInstructions ?? null,
        tags: event.tags ?? [],
        location: event.location,
        address: event.address ?? '',
        coordinates: event.coordinates,
        start: event.start,
        end: event.end,
        timeZone,
        state: event.state,
        eventType: event.eventType,
        parentEvent: event.parentEvent ?? undefined,
        sportIds: event.sportIds,
        sportConfig: event.sport,
        price: event.price,
        taxHandling: event.taxHandling ?? 'INHERIT_ORG',
        organizerManualTaxRateBps: event.organizerManualTaxRateBps ?? 0,
        minAge: event.minAge,
        maxAge: event.maxAge,
        allowPaymentPlans: event.allowPaymentPlans ?? false,
        installmentCount: event.installmentCount ?? 0,
        installmentDueDates: event.installmentDueDates ?? [],
        installmentDueRelativeDays: event.installmentDueRelativeDays ?? [],
        installmentAmounts: event.installmentAmounts ?? [],
        allowTeamSplitDefault: event.allowTeamSplitDefault ?? false,
        maxParticipants: event.maxParticipants,
        teamSizeLimit: event.teamSizeLimit,
        teamSignup: event.teamSignup,
        singleDivision: event.singleDivision,
        splitLeaguePlayoffDivisions: event.splitLeaguePlayoffDivisions ?? false,
        registrationByDivisionType: event.registrationByDivisionType ?? false,
        organizationId: event.organizationId ?? undefined,
        divisions: divisionIds,
        divisionDetails: event.divisionDetails ?? [],
        playoffDivisionDetails: event.playoffDivisionDetails ?? [],
        divisionFieldIds: event.divisionFieldIds ?? {},
        selectedFieldIds: event.fieldIds ?? [],
        cancellationRefundHours: event.cancellationRefundHours,
        registrationCutoffHours: event.registrationCutoffHours ?? 2,
        requiredTemplateIds: event.requiredTemplateIds ?? [],
        hostId: event.hostId ?? undefined,
        noFixedEndDateTime: event.noFixedEndDateTime ?? false,
        imageId: event.imageId,
        seedColor: event.seedColor,
        waitList: event.waitListIds,
        freeAgents: event.freeAgentIds,
        players: event.players ?? [],
        teams: event.teams ?? [],
        officials: event.officials ?? [],
        officialIds: event.officialIds ?? [],
        officialSchedulingMode: event.officialSchedulingMode ?? 'OFF',
        officialPositions: event.officialPositions ?? [],
        eventOfficials: event.eventOfficials ?? [],
        pendingStaffInvites: event.pendingStaffInvites ?? [],
        assistantHostIds: event.assistantHostIds ?? [],
        doTeamsOfficiate: event.doTeamsOfficiate ?? false,
        teamOfficialsMaySwap: event.teamOfficialsMaySwap ?? false,
        teamCheckInMode: event.teamCheckInMode ?? 'OFF',
        teamCheckInOpenMinutesBefore: event.teamCheckInOpenMinutesBefore ?? 60,
        allowMatchRosterEdits: event.allowMatchRosterEdits ?? false,
        allowTemporaryMatchPlayers: event.allowTemporaryMatchPlayers ?? false,
        matchRulesOverride: event.matchRulesOverride ?? null,
        autoCreatePointMatchIncidents: event.autoCreatePointMatchIncidents ?? false,
        leagueScoringConfig: event.leagueScoringConfig ?? createLeagueScoringConfig(),
        fields: event.fields ?? [],
        fieldIds: event.fieldIds ?? [],
        timeSlots: event.timeSlots ?? [],
        includePlayoffs: event.includePlayoffs ?? false,
        includePlayoffsOrPools: event.includePlayoffsOrPools ?? false,
        gamesPerOpponent: event.gamesPerOpponent,
        usesSets: event.usesSets,
        matchDurationMinutes: event.matchDurationMinutes,
        setDurationMinutes: event.setDurationMinutes,
        setsPerMatch: event.setsPerMatch,
        pointsToVictory: event.pointsToVictory,
        restTimeMinutes: event.restTimeMinutes,
        doubleElimination: event.doubleElimination,
        winnerSetCount: event.winnerSetCount,
        loserSetCount: event.loserSetCount,
        winnerBracketPointsToVictory: event.winnerBracketPointsToVictory,
        loserBracketPointsToVictory: event.loserBracketPointsToVictory,
        prize: event.prize,
        fieldCount: event.fieldCount,
        leagueConfig: event.leagueConfig,
    };

    return {
        stored,
        draft: {
            ...stored,
            waitListIds: event.waitListIds,
            freeAgentIds: event.freeAgentIds,
        },
        form: {
            ...stored,
            isAffiliateEvent: Boolean(stored.affiliateUrl) || event.eventType === 'AFFILIATE',
            manualPaymentInstructions: event.manualPaymentInstructions ?? '',
            start: formatEventDateTimeForForm(event.start, timeZone) || event.start,
            end: event.end ? formatEventDateTimeForForm(event.end, timeZone) || event.end : '',
            imageId: event.imageId ?? '',
            // The editor intentionally drops legacy match-rule keys that are
            // not part of the current form contract.
            matchRulesOverride: event.matchRulesOverride
                ? {
                    scoringModel: event.matchRulesOverride.scoringModel,
                    segmentLabel: event.matchRulesOverride.segmentLabel,
                }
                : null,
            parentEvent: event.parentEvent || undefined,
            organizationId: event.organizationId || undefined,
            hostId: event.hostId || undefined,
        },
        configs: buildExpectedConfigs(event),
    };
};

const fixture = (
    event: EventWithEditorQuestions,
    options: Partial<Omit<EventEditorFixture, 'name' | 'event'>> = {},
): EventEditorFixture => {
    const defaults: EventEditorFixture = {
        name: event.name,
        event,
        currentUser: HOST,
        organization: null,
        organizationOfficialsById: new Map(),
        resolvedOrganizationFields: [],
        sportsById: new Map([
            [SOCCER.$id, SOCCER],
            [VOLLEYBALL.$id, VOLLEYBALL],
        ]),
        hasStripeAccount: false,
        isOrganizationHostedEvent: false,
        isOrganizationManagedEvent: false,
        organizationHostedEventId: '',
        fieldsReferencedInSlots: [],
        rentalLockedSlotsForDraft: [],
        selectedRentedFieldIds: [],
        shouldManageLocalFields: true,
        expected: buildExpectedProjection(event),
    };
    return { ...defaults, ...options, expected: buildExpectedProjection(event) };
};

const singleLeagueDivision = makeDivision('league-open', 'Open Division', {
    sportId: VOLLEYBALL.$id,
    price: 4_500,
    maxParticipants: 8,
    gamesPerOpponent: 2,
    usesSets: true,
    matchDurationMinutes: undefined,
    setDurationMinutes: 20,
    setsPerMatch: 3,
    pointsToVictory: [25, 25, 15],
    restTimeMinutes: 10,
    playoffTeamCount: 4,
    allowPaymentPlans: true,
    installmentCount: 2,
    installmentAmounts: [2_250, 2_250],
    installmentDueDates: ['2026-08-01T17:00:00.000Z', '2026-09-01T17:00:00.000Z'],
    fieldIds: [LOCAL_FIELD.$id],
});

const playoffConfig = {
    doubleElimination: true,
    winnerSetCount: 1,
    loserSetCount: 1,
    winnerBracketPointsToVictory: [5],
    loserBracketPointsToVictory: [5],
    prize: 'River City Cup',
    fieldCount: 2,
    restTimeMinutes: 15,
    usesSets: false,
    matchDurationMinutes: 35,
    setDurationMinutes: undefined,
};

const singleDivisionLeague = fixture(baseEvent({
    $id: 'event-single-division-league',
    name: 'River City Monday League',
    eventType: 'LEAGUE',
    sport: VOLLEYBALL,
    sportIds: [VOLLEYBALL.$id],
    teamSignup: true,
    singleDivision: true,
    maxParticipants: 8,
    teamSizeLimit: 5,
    price: 4_500,
    allowPaymentPlans: true,
    installmentCount: 2,
    installmentAmounts: [2_250, 2_250],
    installmentDueDates: ['2026-08-01T17:00:00.000Z', '2026-09-01T17:00:00.000Z'],
    end: null,
    noFixedEndDateTime: true,
    divisions: [singleLeagueDivision.id],
    divisionDetails: [singleLeagueDivision],
    divisionFieldIds: { [singleLeagueDivision.id]: [LOCAL_FIELD.$id] },
    fieldIds: [LOCAL_FIELD.$id],
    fields: [LOCAL_FIELD],
    timeSlots: [makeSlot('slot-single-league', [LOCAL_FIELD.$id], [singleLeagueDivision.id])],
    includePlayoffs: true,
    includePlayoffsOrPools: true,
    playoffTeamCount: 4,
    leagueConfig: {
        gamesPerOpponent: 2,
        includePlayoffs: true,
        playoffTeamCount: 4,
        usesSets: true,
        matchDurationMinutes: undefined,
        restTimeMinutes: 10,
        setDurationMinutes: 20,
        setsPerMatch: 3,
        pointsToVictory: [25, 25, 15],
    },
    setsPerMatch: 3,
    pointsToVictory: [25, 25, 15],
    ...playoffConfig,
}), {
    hasStripeAccount: true,
    fieldsReferencedInSlots: [LOCAL_FIELD],
});

const multiLeagueDivisionA = makeDivision('league-premier', 'Premier Division', {
    price: 6_500,
    maxParticipants: 12,
    gamesPerOpponent: 2,
    matchDurationMinutes: 50,
    restTimeMinutes: 10,
    playoffTeamCount: 4,
    fieldIds: [LOCAL_FIELD.$id],
});
const multiLeagueDivisionB = makeDivision('league-recreation', 'Recreation Division', {
    price: 3_500,
    maxParticipants: 8,
    gamesPerOpponent: 1,
    matchDurationMinutes: 40,
    restTimeMinutes: 5,
    playoffTeamCount: 2,
    fieldIds: [LOCAL_FIELD_2.$id],
});

const multiDivisionLeague = fixture(baseEvent({
    $id: 'event-multi-division-league',
    name: 'River City Fall League',
    eventType: 'LEAGUE',
    teamSignup: true,
    singleDivision: false,
    maxParticipants: 12,
    teamSizeLimit: 5,
    divisions: [multiLeagueDivisionA.id, multiLeagueDivisionB.id],
    divisionDetails: [multiLeagueDivisionA, multiLeagueDivisionB],
    divisionFieldIds: {
        [multiLeagueDivisionA.id]: [LOCAL_FIELD.$id],
        [multiLeagueDivisionB.id]: [LOCAL_FIELD_2.$id],
    },
    fieldIds: [LOCAL_FIELD.$id, LOCAL_FIELD_2.$id],
    fields: [LOCAL_FIELD, LOCAL_FIELD_2],
    timeSlots: [
        makeSlot('slot-multi-premier', [LOCAL_FIELD.$id], [multiLeagueDivisionA.id]),
        makeSlot('slot-multi-recreation', [LOCAL_FIELD_2.$id], [multiLeagueDivisionB.id], { startTimeMinutes: 750, endTimeMinutes: 870 }),
    ],
    includePlayoffs: true,
    includePlayoffsOrPools: true,
    splitLeaguePlayoffDivisions: false,
    playoffTeamCount: undefined,
    leagueConfig: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        usesSets: false,
        matchDurationMinutes: 45,
        restTimeMinutes: 5,
    },
}), {
    hasStripeAccount: true,
    fieldsReferencedInSlots: [LOCAL_FIELD, LOCAL_FIELD_2],
});

const tournamentDivision = makeDivision('tournament-open', 'Open Cup', {
    kind: 'PLAYOFF',
    price: 8_500,
    maxParticipants: 8,
    poolCount: 2,
    poolTeamCount: 4,
    playoffTeamCount: 4,
    playoffPlacementDivisionIds: [],
    phaseSettings: {
        POOL: { segmentLengthMinutes: 25, segmentBreakMinutes: 5 },
        PLAYOFF: { segmentLengthMinutes: 35, segmentBreakMinutes: 10 },
    },
    playoffConfig,
});

const tournamentWithPools = fixture(baseEvent({
    $id: 'event-tournament-pools',
    name: 'River City Cup Tournament',
    eventType: 'TOURNAMENT',
    teamSignup: true,
    singleDivision: false,
    maxParticipants: 8,
    teamSizeLimit: 5,
    price: 8_500,
    divisions: [tournamentDivision.id],
    divisionDetails: [makeDivision(tournamentDivision.id, tournamentDivision.name, { ...tournamentDivision, kind: 'LEAGUE' })],
    playoffDivisionDetails: [tournamentDivision],
    divisionFieldIds: { [tournamentDivision.id]: [LOCAL_FIELD.$id, LOCAL_FIELD_2.$id] },
    fieldIds: [LOCAL_FIELD.$id, LOCAL_FIELD_2.$id],
    fields: [LOCAL_FIELD, LOCAL_FIELD_2],
    timeSlots: [makeSlot('slot-tournament-pool', [LOCAL_FIELD.$id, LOCAL_FIELD_2.$id], [tournamentDivision.id])],
    includePlayoffs: true,
    includePlayoffsOrPools: true,
    doubleElimination: true,
    winnerSetCount: 1,
    loserSetCount: 1,
    winnerBracketPointsToVictory: [5],
    loserBracketPointsToVictory: [5],
    prize: 'River City Cup',
    fieldCount: 2,
    restTimeMinutes: 15,
    leagueConfig: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        usesSets: false,
        matchDurationMinutes: 35,
        restTimeMinutes: 15,
    },
}), {
    hasStripeAccount: true,
    fieldsReferencedInSlots: [LOCAL_FIELD, LOCAL_FIELD_2],
});

const weeklyEvent = fixture(baseEvent({
    $id: 'event-weekly-pickup',
    name: 'Wednesday Community Pickup',
    eventType: 'WEEKLY_EVENT',
    teamSignup: false,
    singleDivision: true,
    maxParticipants: 16,
    teamSizeLimit: 1,
    price: 1_200,
    allowPaymentPlans: true,
    installmentCount: 2,
    installmentAmounts: [600, 600],
    installmentDueDates: [],
    installmentDueRelativeDays: [0, 7],
    divisions: ['weekly-open'],
    divisionDetails: [makeDivision('weekly-open', 'Open Pickup', {
        price: 1_200,
        maxParticipants: 16,
        allowPaymentPlans: true,
        installmentCount: 2,
        installmentAmounts: [600, 600],
        installmentDueRelativeDays: [0, 7],
    })],
    divisionFieldIds: { 'weekly-open': [LOCAL_FIELD.$id] },
    fieldIds: [LOCAL_FIELD.$id],
    fields: [LOCAL_FIELD],
    timeSlots: [makeSlot('slot-weekly-pickup', [LOCAL_FIELD.$id], ['weekly-open'], {
        daysOfWeek: [2, 4],
        dayOfWeek: 2,
        startTimeMinutes: 1_080,
        endTimeMinutes: 1_200,
    })],
    noFixedEndDateTime: false,
}), {
    hasStripeAccount: true,
    fieldsReferencedInSlots: [LOCAL_FIELD],
});

const organizationHostedPaidEvent = fixture(baseEvent({
    $id: 'event-organization-paid',
    name: 'River City Skills Clinic',
    eventType: 'EVENT',
    organizationId: CLUB.$id,
    location: CLUB.name,
    address: '1200 SE Morrison St, Portland, OR 97214',
    price: 7_500,
    taxHandling: 'ORGANIZER_MANUAL_TAX',
    organizerManualTaxRateBps: 825,
    cancellationRefundHours: 24,
    registrationCutoffHours: 6,
    fieldIds: [CLUB_FIELD.$id],
    fields: [CLUB_FIELD],
    requiredTemplateIds: ['template-waiver-2026'],
}), {
    organization: CLUB,
    resolvedOrganizationFields: [CLUB_FIELD],
    hasStripeAccount: true,
    isOrganizationHostedEvent: true,
    isOrganizationManagedEvent: true,
    organizationHostedEventId: CLUB.$id,
    fieldsReferencedInSlots: [],
    shouldManageLocalFields: false,
});

const rentalSlot = makeSlot('slot-rental-booking', [RENTAL_FIELD.$id], ['rental-open'], {
    sourceType: 'RENTAL_BOOKING',
    rentalBookingId: 'rental-booking-1',
    rentalBookingItemId: 'rental-item-1',
    rentalLocked: true,
    price: 18_000,
    scheduledFieldId: RENTAL_FIELD.$id,
    scheduledFieldIds: [RENTAL_FIELD.$id],
});

const rentalBackedEvent = fixture(baseEvent({
    $id: 'event-rental-backed',
    name: 'Cascade Indoor Soccer Rental Event',
    eventType: 'LEAGUE',
    organizationId: CLUB.$id,
    teamSignup: true,
    singleDivision: true,
    maxParticipants: 8,
    teamSizeLimit: 5,
    price: 5_000,
    divisions: ['rental-open'],
    divisionDetails: [makeDivision('rental-open', 'Rental Open', { price: 5_000, maxParticipants: 8, fieldIds: [RENTAL_FIELD.$id] })],
    divisionFieldIds: { 'rental-open': [RENTAL_FIELD.$id] },
    fieldIds: [RENTAL_FIELD.$id],
    fields: [RENTAL_FIELD],
    timeSlots: [rentalSlot],
    sourceType: 'RENTAL_BOOKING',
    rentalBookingId: rentalSlot.rentalBookingId,
    rentalBookingItemId: rentalSlot.rentalBookingItemId,
}), {
    organization: CLUB,
    resolvedOrganizationFields: [CLUB_FIELD],
    hasStripeAccount: true,
    isOrganizationHostedEvent: true,
    isOrganizationManagedEvent: true,
    organizationHostedEventId: CLUB.$id,
    fieldsReferencedInSlots: [RENTAL_FIELD],
    rentalLockedSlotsForDraft: [],
    selectedRentedFieldIds: [RENTAL_FIELD.$id],
    shouldManageLocalFields: false,
});

const teamStaffedEvent = fixture(baseEvent({
    $id: 'event-team-staffed',
    name: 'Community League with Team Officiating',
    eventType: 'LEAGUE',
    teamSignup: true,
    singleDivision: true,
    maxParticipants: 8,
    teamSizeLimit: 5,
    divisions: ['team-staffed-open'],
    divisionDetails: [makeDivision('team-staffed-open', 'Team Staffed Open', { maxParticipants: 8, fieldIds: [LOCAL_FIELD.$id] })],
    divisionFieldIds: { 'team-staffed-open': [LOCAL_FIELD.$id] },
    fieldIds: [LOCAL_FIELD.$id],
    fields: [LOCAL_FIELD],
    teams: [makeTeam('team-river', 'team-staffed-open', 'River City United')],
    officials: [OFFICIAL],
    officialIds: [OFFICIAL.$id],
    officialSchedulingMode: 'TEAM_STAFFING',
    officialPositions: [{ id: 'position-referee', name: 'Referee', count: 1, order: 0 }],
    eventOfficials: [{ id: 'event-official-1', userId: OFFICIAL.$id, positionIds: ['position-referee'], fieldIds: [LOCAL_FIELD.$id], isActive: true }],
    assistantHostIds: [ASSISTANT_HOST.$id],
    doTeamsOfficiate: true,
    teamOfficialsMaySwap: true,
    teamCheckInMode: 'MATCH',
    teamCheckInOpenMinutesBefore: 45,
    allowMatchRosterEdits: true,
    allowTemporaryMatchPlayers: true,
    matchRulesOverride: { scoringModel: 'POINTS_ONLY', segmentCount: 2, segmentLabel: 'Half' },
    autoCreatePointMatchIncidents: true,
    pendingStaffInvites: [{
        firstName: 'Alex',
        lastName: 'Brown',
        email: 'alex.brown@example.test',
        roles: ['ASSISTANT_HOST'],
    }],
    timeSlots: [makeSlot('slot-team-staffed', [LOCAL_FIELD.$id], ['team-staffed-open'])],
    leagueConfig: {
        gamesPerOpponent: 1,
        includePlayoffs: false,
        usesSets: false,
        matchDurationMinutes: 45,
        restTimeMinutes: 0,
    },
}), {
    hasStripeAccount: true,
    fieldsReferencedInSlots: [LOCAL_FIELD],
    organizationOfficialsById: new Map([[OFFICIAL.$id, OFFICIAL]]),
});

const questionsAndDocumentsEvent = fixture(baseEvent({
    $id: 'event-questions-documents',
    name: 'Youth Tournament Registration Requirements',
    eventType: 'TOURNAMENT',
    teamSignup: true,
    singleDivision: true,
    maxParticipants: 8,
    teamSizeLimit: 5,
    divisions: ['youth-open'],
    divisionDetails: [makeDivision('youth-open', 'Youth Open', { maxParticipants: 8, fieldIds: [LOCAL_FIELD.$id] })],
    divisionFieldIds: { 'youth-open': [LOCAL_FIELD.$id] },
    fieldIds: [LOCAL_FIELD.$id],
    fields: [LOCAL_FIELD],
    requiredTemplateIds: ['template-medical-release', 'template-parent-consent'],
    registrationQuestions: [
        { id: 'question-experience', prompt: 'What is your playing experience?', answerType: 'TEXT', required: true, sortOrder: 0 },
        { id: 'question-accommodation', prompt: 'Do you need an accessibility accommodation?', answerType: 'LONG_TEXT', required: false, sortOrder: 1 },
    ],
    timeSlots: [makeSlot('slot-youth-open', [LOCAL_FIELD.$id], ['youth-open'])],
}), {
    hasStripeAccount: true,
    fieldsReferencedInSlots: [LOCAL_FIELD],
});

const simpleEvent = fixture(baseEvent({
    $id: 'event-simple',
    name: 'Saturday Open Gym',
    description: '',
    price: 0,
    maxParticipants: null as unknown as number,
    teamSizeLimit: null as unknown as number,
    imageId: null,
    fieldIds: [LOCAL_FIELD.$id],
    fields: [LOCAL_FIELD],
    tags: [],
    requiredTemplateIds: [],
}), {
    hasStripeAccount: false,
    fieldsReferencedInSlots: [],
});

export const eventEditorFixtures: EventEditorFixture[] = [
    simpleEvent,
    singleDivisionLeague,
    multiDivisionLeague,
    tournamentWithPools,
    weeklyEvent,
    organizationHostedPaidEvent,
    rentalBackedEvent,
    teamStaffedEvent,
    questionsAndDocumentsEvent,
];

export const eventEditorFixtureByName = new Map(
    eventEditorFixtures.map((entry) => [entry.name, entry]),
);
