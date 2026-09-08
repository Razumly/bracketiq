import { buildEventFormSchema } from '../schema';

const buildValues = (eventType: 'LEAGUE' | 'TOURNAMENT') => {
  const division = {
    id: 'division-1',
    key: 'division-1',
    name: 'Open',
    divisionTypeId: 'division-type-1',
    divisionTypeName: 'Open',
    ratingType: 'AGE',
    gender: 'C',
    skillDivisionTypeId: 'skill-open',
    skillDivisionTypeName: 'Open',
    ageDivisionTypeId: 'age-open',
    ageDivisionTypeName: 'Adult',
    price: 0,
    maxParticipants: 8,
    phaseSettings: {},
  };
  const tournamentConfig = {
    doubleElimination: false,
    winnerSetCount: 1,
    loserSetCount: 1,
    winnerBracketPointsToVictory: [],
    loserBracketPointsToVictory: [],
    prize: '',
    fieldCount: 0,
    restTimeMinutes: 0,
  };

  return {
    $id: 'create-event',
    name: 'Test Event',
    description: '',
    isAffiliateEvent: false,
    affiliateUrl: '',
    registrationPaymentMode: 'ONLINE',
    manualPaymentLinks: [],
    manualPaymentInstructions: '',
    tags: [],
    location: 'Test Venue',
    address: '',
    coordinates: [45.5, -122.6],
    start: '2026-09-01T16:00:00.000Z',
    end: '',
    timeZone: 'UTC',
    state: 'DRAFT',
    eventType,
    parentEvent: null,
    sportIds: ['sport-1'],
    sportConfig: null,
    price: 0,
    minAge: 0,
    maxAge: 18,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    maxParticipants: 8,
    teamSizeLimit: 1,
    teamSignup: false,
    singleDivision: false,
    splitLeaguePlayoffDivisions: false,
    registrationByDivisionType: false,
    divisions: ['division-1'],
    divisionDetails: [division],
    playoffDivisionDetails: [],
    divisionFieldIds: {},
    selectedFieldIds: [],
    cancellationRefundHours: null,
    registrationCutoffHours: 0,
    organizationId: 'organization-1',
    taxHandling: 'INHERIT_ORG',
    organizerManualTaxRateBps: 0,
    requiredTemplateIds: [],
    hostId: 'host-1',
    noFixedEndDateTime: false,
    isAutomatedScheduling: false,
    imageId: '',
    seedColor: 0,
    waitList: [],
    freeAgents: [],
    players: [],
    teams: [],
    officials: [],
    officialIds: [],
    staffingPriority: 'BEST_AVAILABLE_COVERAGE',
    officialPositions: [],
    eventOfficials: [],
    pendingStaffInvites: [],
    assistantHostIds: [],
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    teamCheckInMode: 'OFF',
    teamCheckInOpenMinutesBefore: 60,
    allowMatchRosterEdits: false,
    allowTemporaryMatchPlayers: false,
    matchRulesOverride: null,
    autoCreatePointMatchIncidents: false,
    leagueScoringConfig: null,
    leagueSlots: [],
    leagueData: {
      gamesPerOpponent: 1,
      includePlayoffs: false,
    },
    playoffData: tournamentConfig,
    tournamentData: tournamentConfig,
    fields: [],
    fieldCount: 0,
    joinAsParticipant: false,
  };
};

describe('event form scheduling validation', () => {
  it('accepts a next-day end derived from an overnight clock range', () => {
    const result = buildEventFormSchema({ allowMissingEventImage: true }).safeParse({
      ...buildValues('LEAGUE'),
      start: '2035-06-11T00:00:00Z',
      end: '2035-06-12T12:00:00Z',
      isAutomatedScheduling: true,
      fields: [{ $id: 'field-1', name: 'Court', divisions: ['division-1'] }],
      selectedFieldIds: ['field-1'],
      divisionFieldIds: { 'division-1': ['field-1'] },
      leagueSlots: [{
        key: 'overnight', repeating: false,
        startDate: '2035-06-11T22:00:00', endDate: '2035-06-11T02:00:00',
        startTimeMinutes: 1320, endTimeMinutes: 120, timeZone: 'UTC',
        scheduledFieldId: 'field-1', scheduledFieldIds: ['field-1'],
        divisions: ['division-1'], daysOfWeek: [0], dayOfWeek: 0,
      }],
    });
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it.each(['LEAGUE', 'TOURNAMENT'] as const)(
    'requires Planned End when %s Automated Scheduling is off',
    (eventType) => {
      const result = buildEventFormSchema({
        allowMissingEventImage: true,
      }).safeParse(buildValues(eventType));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: ['end'],
          message: 'Planned End is required when Automated Scheduling is off.',
        }),
      ]));
    },
  );

  it('accepts a finite Planned End for an intentionally unscheduled League', () => {
    const result = buildEventFormSchema({
      allowMissingEventImage: true,
    }).safeParse({
      ...buildValues('LEAGUE'),
      end: '2026-09-01T18:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});
