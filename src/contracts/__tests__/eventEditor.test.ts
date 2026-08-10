import {
  createEventEditorCommandSchema,
  eventEditorCreateBootstrapSchema,
  eventEditorDraftSchema,
  eventEditorSnapshotSchema,
  saveEventEditorCommandSchema,
  type EventEditorSnapshot,
} from '@/contracts/eventEditor';
import { editorSnapshotToFormValues, legacyEventToEditorDraft } from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import type { Event } from '@/types';

const draft = {
  basics: {
    name: 'Spring event',
    description: '',
    eventType: 'EVENT',
    sportIds: ['sport_1'],
    start: '2026-09-01T10:00:00.000Z',
    timeZone: 'UTC',
    location: 'Main court',
    address: '',
    coordinates: [0, 0] as [number, number],
    affiliateUrl: '',
    parentEvent: null,
    organizationId: 'org_1',
    hostId: 'user_1',
    state: 'UNPUBLISHED',
    imageId: null,
    tags: [],
  },
  participation: {
    teamSignup: false,
    singleDivision: true,
    registrationByDivisionType: false,
    teamSizeLimit: 2,
    maxParticipants: null,
    minAge: null,
    maxAge: null,
    cancellationRefundHours: null,
    registrationCutoffHours: 0,
    allowTeamSplitDefault: false,
    waitListIds: [],
    freeAgentIds: [],
  },
  registration: {
    payment: {
      mode: 'ONLINE' as const,
      priceCents: 7500,
      taxHandling: 'INHERIT_ORG',
      organizerManualTaxRateBps: 0,
      manualPaymentLinks: [],
      manualPaymentInstructions: null,
      allowPaymentPlans: false,
      installmentCount: null,
      installmentDueDates: [],
      installmentDueRelativeDays: [],
      installmentAmounts: [],
    },
    questions: [{ clientId: 'question-client-1', prompt: 'T-shirt size?', answerType: 'TEXT' as const, required: false, sortOrder: 0 }],
    requiredDocumentIds: [],
  },
  competition: {
    divisionIds: [],
    divisionDetails: [],
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
  },
  schedule: { mode: 'GENERATED_END' as const, endConstraint: null },
  resources: {
    fieldIds: [],
    fields: [],
    timeSlotIds: [],
    timeSlots: [],
    requiredTemplateIds: [],
    immutableFieldIds: [],
    rentalBookingId: null,
    rentalBookingItemId: null,
  },
  staff: {
    officialSchedulingMode: 'SCHEDULE' as const,
    teamOfficialsMaySwap: false,
    teamCheckInMode: 'OFF' as const,
    teamCheckInOpenMinutesBefore: 60,
    allowMatchRosterEdits: false,
    allowTemporaryMatchPlayers: false,
    autoCreatePointMatchIncidents: false,
    officialIds: [],
    officialPositions: [],
    eventOfficials: [],
    assistantHostIds: [],
    pendingInvites: [],
  },
};

describe('event editor contracts', () => {
  it('accepts a complete command and preserves new question identity', () => {
    const parsed = createEventEditorCommandSchema.parse({
      contractVersion: 2,
      createOperationId: 'create-operation-1',
      draft,
    });
    expect(parsed.draft.registration.questions[0]).toEqual(expect.objectContaining({ clientId: 'question-client-1' }));
  });
  it('requires the bootstrap operation identity and preserves the selected start', () => {
    const parsed = eventEditorCreateBootstrapSchema.parse({
      contractVersion: 2,
      createOperationId: 'create-operation-1',
      snapshot: {
        contractVersion: 2,
        mode: 'CREATE',
        eventId: null,
        editorRevision: 'new',
        staffRevision: null,
        draft,
        capabilities: {
          canUseOnlinePayments: true,
          canManageStaff: true,
          canEdit: true,
          supportsTeamStaffing: false,
        },
        catalogs: { sports: [], organizations: [], fields: [], templates: [] },
        immutable: { fieldNames: [], rental: false, template: false },
      },
    });
    expect(parsed.createOperationId).toBe('create-operation-1');
    expect(parsed.snapshot.draft.basics.start).toBe(draft.basics.start);
    expect(() => eventEditorCreateBootstrapSchema.parse({
      ...parsed,
      createOperationId: undefined,
    })).toThrow();
  });

  it('rejects hydrated or computed values at the command boundary', () => {
    expect(() => eventEditorDraftSchema.parse({ ...draft, matches: [] })).toThrow();
    expect(() => saveEventEditorCommandSchema.parse({
      contractVersion: 2,
      editorRevision: 'rev_1',
      staffRevision: null,
      draft: { ...draft, attendees: [] },
    })).toThrow();
  });

  it('requires an end constraint only for fixed-end scheduling', () => {
    expect(eventEditorDraftSchema.parse({ ...draft, schedule: { mode: 'FIXED_END', endConstraint: '2026-09-01T18:00:00.000Z' } }).schedule.mode).toBe('FIXED_END');
    expect(() => eventEditorDraftSchema.parse({ ...draft, schedule: { mode: 'FIXED_END', endConstraint: null } })).toThrow();
    expect(() => eventEditorSnapshotSchema.parse({
      contractVersion: 2,
      mode: 'CREATE',
      eventId: null,
      editorRevision: 'new',
      staffRevision: null,
      draft,
      capabilities: {},
      catalogs: {},
      immutable: {},
    })).toThrow();
  });
  it.each([
    ['FREE', 0],
    ['ONLINE', 7500],
    ['MANUAL', 0],
  ] as const)('round-trips %s payment mode without fabrication', (mode, priceCents) => {
    const snapshot = {
      contractVersion: 2,
      mode: 'EDIT',
      eventId: 'event_1',
      editorRevision: 'rev_1',
      staffRevision: null,
      draft: {
        ...draft,
        registration: {
          ...draft.registration,
          payment: {
            ...draft.registration.payment,
            mode,
            priceCents,
          },
        },
      },
      capabilities: {
        canUseOnlinePayments: true,
        canManageStaff: true,
        canEdit: true,
        supportsTeamStaffing: false,
      },
      catalogs: { sports: [], organizations: [], fields: [], templates: [] },
      immutable: { fieldNames: [], rental: false, template: false },
    } as EventEditorSnapshot;
    const formValues = editorSnapshotToFormValues(snapshot);
    const roundTrip = legacyEventToEditorDraft(formValues as unknown as Event).registration.payment;
    expect(roundTrip.mode).toBe(mode);
    expect(roundTrip.priceCents).toBe(priceCents);
  });

  it('derives segmented match duration from editable timing rules', () => {
    const event = {
      name: 'Timed event',
      eventType: 'LEAGUE',
      start: '2026-09-01T10:00:00.000Z',
      matchDurationMinutes: 60,
      usesSets: false,
      matchRulesOverride: {
        segmentCount: 2,
        segmentLengthMinutes: 15,
        segmentBreakMinutes: 5,
      },
    } as unknown as Event;
    expect(legacyEventToEditorDraft(event).competition.matchDurationMinutes).toBe(35);
  });
});
