import {
  createEventEditorCommandSchema,
  eventEditorAcceptPartialProposalCommandSchema,
  eventEditorAcceptPartialProposalResultSchema,
  eventEditorAcceptProposalCommandSchema,
  eventEditorAcceptProposalResultSchema,
  eventEditorCreateBootstrapSchema,
  eventEditorCreateResultSchema,
  eventEditorDraftSchema,
  eventEditorSnapshotSchema,
  eventEditorErrorSchema,
  parseSaveEventEditorCommand,
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
    staffingPriority: 'BEST_AVAILABLE_COVERAGE' as const,
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
    assistantHostIds: [],
    pendingInvites: [],
  },
};
const createOnlyCompletion = { mode: 'CREATE_ONLY' as const };
const expectedCreateRevisions = {
  editorRevision: 'new',
  staffRevision: null,
  scheduleRevision: 'new',
};
const newScheduleState = {
  sourceType: null,
  matchCount: 0,
  availableMaintenanceOperations: [],
  revision: 'new',
  hasProtectedHistory: false,
};
const revisionBinding = {
  editorRevision: 'binding-editor-revision',
  staffRevision: 'binding-staff-revision',
  scheduleRevision: 'binding-schedule-revision',
  fieldRevisions: { field_1: 'field-revision' },
  timeSlotRevisions: { slot_1: 'slot-revision' },
  rentalBookingRevision: 'booking-revision',
  rentalBookingRevisions: { booking_1: 'booking-revision' },
  rentalBookingItemRevisions: { item_1: 'item-revision' },
  availabilityRevision: 'availability-revision',
};


describe('event editor contracts', () => {
  it('accepts a complete command and preserves new question identity', () => {
    const parsed = createEventEditorCommandSchema.parse({
      contractVersion: 3,
      createOperationId: 'create-operation-1',
      expectedRevisions: expectedCreateRevisions,
      draft,
      completion: createOnlyCompletion,
    });
    expect(parsed.draft.registration.questions[0]).toEqual(expect.objectContaining({ clientId: 'question-client-1' }));
  });
  it('requires the reviewed draft when accepting a schedule proposal', () => {
    const parsed = eventEditorAcceptProposalCommandSchema.safeParse({
      contractVersion: 3,
      createOperationId: 'proposal-operation-1',
      proposalRevision: 'proposal-revision-1',
    });

    expect(parsed.success).toBe(false);
  });
  it('requires a fresh identity for explicit partial proposal acceptance', () => {
    const full = eventEditorAcceptProposalCommandSchema.safeParse({
      contractVersion: 3,
      createOperationId: 'proposal-operation-1',
      proposalRevision: 'proposal-revision-1',
      acceptanceMode: 'PARTIAL',
      acceptanceOperationId: 'acceptance-operation-1',
      draft,
    });
    const partial = eventEditorAcceptPartialProposalCommandSchema.parse({
      contractVersion: 3,
      createOperationId: 'proposal-operation-1',
      proposalRevision: 'proposal-revision-1',
      acceptanceMode: 'PARTIAL',
      acceptanceOperationId: 'acceptance-operation-1',
      draft,
    });

    expect(full.success).toBe(false);
    expect(partial.acceptanceOperationId).toBe('acceptance-operation-1');
  });

  it('maps a version-3 legacy same-type BUILD_IF_MISSING Save to PRESERVE', () => {
    const parsed = parseSaveEventEditorCommand({
      contractVersion: 3,
      editorRevision: 'revision_1',
      staffRevision: null,
      draft: {
        ...draft,
        basics: {
          ...draft.basics,
          eventType: 'LEAGUE',
        },
        competition: {
          ...draft.competition,
          includePlayoffs: true,
          playoffTeamCount: 3,
        },
      },
      scheduleTransition: {
        mode: 'BUILD_IF_MISSING',
        expectedScheduleRevision: 'schedule_revision_1',
      },
    });

    expect(parsed.scheduleTransition).toEqual({ mode: 'PRESERVE' });
  });


  it('accepts each canonical Staffing Priority without a legacy mode field', () => {
    const priorities = [
      'FULL_COVERAGE_REQUIRED',
      'TEAM_COVERAGE_REQUIRED',
      'OFFICIAL_COVERAGE_REQUIRED',
      'BEST_AVAILABLE_COVERAGE',
      'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
    ] as const;

    for (const staffingPriority of priorities) {
      const parsed = createEventEditorCommandSchema.parse({
        contractVersion: 3,
        createOperationId: `create-operation-${staffingPriority}`,
        expectedRevisions: expectedCreateRevisions,
        draft: {
          ...draft,
          staff: {
            ...draft.staff,
            staffingPriority,
          },
        },
        completion: createOnlyCompletion,
      });
      expect(parsed.draft.staff.staffingPriority).toBe(staffingPriority);
      expect('officialSchedulingMode' in parsed.draft.staff).toBe(false);
    }
  });


  it('requires the bootstrap operation identity and preserves the selected start', () => {
    const parsed = eventEditorCreateBootstrapSchema.parse({
      contractVersion: 3,
      createOperationId: 'create-operation-1',
      snapshot: {
        contractVersion: 3,
        mode: 'CREATE',
        eventId: null,
        editorRevision: 'new',
        staffRevision: null,
        draft,
        capabilities: {
          canUseOnlinePayments: true,
          canManageStaff: true,
          canEdit: true,
          canDelegateHost: true,
          readOnly: false,
          readOnlyReason: null,
          eventHostId: 'host_1',
          viewerIsEventHost: true,
          supportsTeamStaffing: false,
          managementAuthority: null,
        },
        catalogs: { sports: [], organizations: [], fields: [], templates: [] },
        immutable: { fieldNames: [], rental: false, template: false },
        scheduleState: newScheduleState,
      },
    });
    expect(parsed.createOperationId).toBe('create-operation-1');
    expect(parsed.snapshot.revisionBinding).toBeUndefined();
    expect(parsed.snapshot.draft.basics.start).toBe(draft.basics.start);
    expect(() => eventEditorCreateBootstrapSchema.parse({
      ...parsed,
      createOperationId: undefined,
    })).toThrow();
  });
  it('preserves a complete maintenance revision binding on an edit snapshot', () => {
    const parsed = eventEditorSnapshotSchema.parse({
      contractVersion: 3,
      mode: 'EDIT',
      eventId: 'event_1',
      editorRevision: revisionBinding.editorRevision,
      staffRevision: revisionBinding.staffRevision,
      draft,
      capabilities: {
        canUseOnlinePayments: true,
        canManageStaff: true,
        canEdit: true,
        canDelegateHost: true,
        readOnly: false,
        readOnlyReason: null,
        managementAuthority: null,
        eventHostId: 'host_1',
        viewerIsEventHost: true,
        supportsTeamStaffing: true,
      },
      catalogs: { sports: [], organizations: [], fields: [], templates: [] },
      immutable: { fieldNames: [], rental: false, template: false },
      scheduleState: {
        ...newScheduleState,
        matchCount: 1,
        revision: revisionBinding.scheduleRevision,
      },
      revisionBinding,
    });

    expect(parsed.revisionBinding).toEqual(revisionBinding);
  });

  it('rejects hydrated or computed values at the command boundary', () => {
    expect(() => eventEditorDraftSchema.parse({ ...draft, matches: [] })).toThrow();
    expect(() => saveEventEditorCommandSchema.parse({
      contractVersion: 3,
      editorRevision: 'rev_1',
      staffRevision: null,
      draft: { ...draft, attendees: [] },
    })).toThrow();
  });

  it('requires an end constraint only for fixed-end scheduling', () => {
    expect(eventEditorDraftSchema.parse({
      ...draft,
      schedule: { mode: 'FIXED_END', endConstraint: '2026-09-01T18:00:00.000Z' },
    }).schedule.mode).toBe('FIXED_END');
    expect(() => eventEditorDraftSchema.parse({
      ...draft,
      schedule: { mode: 'FIXED_END', endConstraint: null },
    })).toThrow();
    expect(() => eventEditorSnapshotSchema.parse({
      contractVersion: 3,
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
      contractVersion: 3,
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
        canDelegateHost: true,
        readOnly: false,
        readOnlyReason: null,
        managementAuthority: null,
        eventHostId: 'host_1',
        viewerIsEventHost: true,
        supportsTeamStaffing: false,
      },
      catalogs: { sports: [], organizations: [], fields: [], templates: [] },
      immutable: { fieldNames: [], rental: false, template: false },
      scheduleState: { ...newScheduleState, revision: 'rev_1' },
    } as EventEditorSnapshot;
    const formValues = editorSnapshotToFormValues(snapshot);
    const roundTrip = legacyEventToEditorDraft(formValues as unknown as Event).registration.payment;
    expect(roundTrip.mode).toBe(mode);
    expect(roundTrip.priceCents).toBe(priceCents);
  });
  it('normalizes a non-positive stored team size for an individual event', () => {
    const event = {
      eventType: 'EVENT',
      teamSignup: false,
      teamSizeLimit: 0,
    } as unknown as Event;

    expect(legacyEventToEditorDraft(event).participation.teamSizeLimit).toBeNull();
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
  it('validates full and partial acceptance result identities', () => {
    const parsed = eventEditorCreateResultSchema.parse({
      status: 'SAVED',
      createOperationId: 'create-operation-1',
      editorRevision: 'editor-revision-2',
      staffRevision: 'staff-revision-2',
      scheduleRevision: 'schedule-revision-2',
      snapshot: {
        contractVersion: 3,
        mode: 'EDIT',
        eventId: 'event-1',
        editorRevision: 'editor-revision-2',
        staffRevision: 'staff-revision-2',
        draft,
        capabilities: {
          canUseOnlinePayments: true,
          canManageStaff: true,
          canEdit: true,
          canDelegateHost: true,
          readOnly: false,
          readOnlyReason: null,
          managementAuthority: null,
          eventHostId: 'host_1',
          viewerIsEventHost: true,
          supportsTeamStaffing: false,
        },
        catalogs: { sports: [], organizations: [], fields: [], templates: [] },
        immutable: { fieldNames: [], rental: false, template: false },
        scheduleState: {
          ...newScheduleState,
          revision: 'schedule-revision-2',
        },
      },
      questionIdMap: {},
      staffEmailDelivery: 'NOT_REQUESTED',
      scheduleOutcome: {
        status: 'NOT_REQUESTED',
        matchCount: 0,
        warnings: [],
      },
    });

    expect(parsed).toEqual(expect.objectContaining({
      createOperationId: 'create-operation-1',
      editorRevision: parsed.snapshot.editorRevision,
      staffRevision: parsed.snapshot.staffRevision,
      scheduleRevision: parsed.snapshot.scheduleState.revision,
    }));
    const fullAccepted = eventEditorAcceptProposalResultSchema.parse(parsed);
    expect(fullAccepted).toEqual(parsed);
    expect(fullAccepted).not.toHaveProperty('acceptanceOperationId');

    const partialMatch = {
      id: 'match-projection-1',
      matchId: 1,
      eventId: 'event-1',
      start: null,
      end: null,
      locked: false,
      placementState: 'UNPLACED' as const,
      phase: 'LEAGUE',
      sourceDivisionId: null,
      phaseDivisionId: 'phase-division-1',
      division: null,
      fieldId: null,
      team1Id: null,
      team2Id: null,
      team1Seed: null,
      team2Seed: null,
      status: null,
      resultStatus: null,
      resultType: null,
      actualStart: null,
      actualEnd: null,
      statusReason: null,
      winnerEventTeamId: null,
      matchRulesSnapshot: null,
      resolvedMatchRules: null,
      segments: [],
      incidents: [],
      officialId: null,
      officialIds: [],
      teamOfficialId: null,
      team1Points: [],
      team2Points: [],
      losersBracket: false,
      winnerNextMatchId: null,
      loserNextMatchId: null,
      previousLeftId: null,
      previousRightId: null,
      side: null,
      officialCheckedIn: false,
    };
    const partialAccepted =
      eventEditorAcceptPartialProposalResultSchema.parse({
        ...parsed,
        acceptanceOperationId: 'acceptance-operation-1',
        scheduleOutcome: {
          status: 'PARTIAL',
          isComplete: false,
          matchCount: 1,
          placedMatchCount: 0,
          unplacedMatchCount: 1,
          matches: [partialMatch],
          unscheduledMatches: [{
            id: partialMatch.id,
            matchId: partialMatch.matchId,
            phaseDivisionId: partialMatch.phaseDivisionId,
            phase: partialMatch.phase,
            sourceDivisionId: partialMatch.sourceDivisionId,
          }],
          affectedCompetitionPhases: [{
            id: partialMatch.phaseDivisionId,
            name: 'League',
            phase: partialMatch.phase,
            sourceDivisionId: partialMatch.sourceDivisionId,
          }],
          warnings: [],
        },
      });
    expect(partialAccepted.acceptanceOperationId).toBe('acceptance-operation-1');

    const { acceptanceOperationId: _acceptanceOperationId, ...withoutIdentity } =
      partialAccepted;
    expect(() =>
      eventEditorAcceptPartialProposalResultSchema.parse(withoutIdentity),
    ).toThrow();
  });
  it('accepts typed stale-revision and authority failures with canonical revisions', () => {
    const stale = eventEditorErrorSchema.parse({
      error: 'Event editor data changed. Reload and try again.',
      code: 'EDITOR_REVISION_CONFLICT',
      editorRevision: 'editor-current',
      staffRevision: 'staff-current',
      scheduleRevision: 'schedule-current',
    });
    const authority = eventEditorErrorSchema.parse({
      error: 'You do not have permission to create this Event.',
      code: 'EDITOR_PERMISSION_DENIED',
    });

    expect(stale).toEqual(expect.objectContaining({
      editorRevision: 'editor-current',
      staffRevision: 'staff-current',
      scheduleRevision: 'schedule-current',
    }));
    expect(authority.code).toBe('EDITOR_PERMISSION_DENIED');
  });
  it('accepts typed Time Slot input failures with actionable slot evidence', () => {
    const parsed = eventEditorErrorSchema.parse({
      error: 'The selected Time Slots overlap.',
      code: 'INVALID_TIME_SLOT',
      slotIds: ['slot_1', 'slot_2'],
    });

    expect(parsed.slotIds).toEqual(['slot_1', 'slot_2']);
  });
  it('accepts registration capacity and division diagnostics', () => {
    const capacity = eventEditorErrorSchema.parse({
      error: 'This event has reached its registration capacity of 8.',
      code: 'EVENT_REGISTRATION_CAPACITY_EXCEEDED',
      capacity: 8,
      participantCount: 8,
    });
    const division = eventEditorErrorSchema.parse({
      error: 'Select exactly one Entry Division for this participant.',
      code: 'INVALID_EVENT_REGISTRATION_DIVISION',
      divisionId: null,
      matchCount: 0,
    });

    expect(capacity).toEqual(expect.objectContaining({
      capacity: 8,
      participantCount: 8,
    }));
    expect(division).toEqual(expect.objectContaining({
      divisionId: null,
      matchCount: 0,
    }));
  });
  it('accepts a diagnostic save failure with a request reference', () => {
    const parsed = eventEditorErrorSchema.parse({
      error: 'Unable to save event editor configuration. Database write failed. Reference: request-1.',
      code: 'EDITOR_SAVE_FAILED',
      details: 'Database write failed.',
      requestId: 'request-1',
    });

    expect(parsed.requestId).toBe('request-1');
    expect(parsed.details).toBe('Database write failed.');
  });
});
