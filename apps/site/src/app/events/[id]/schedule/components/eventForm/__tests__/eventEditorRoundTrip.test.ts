import {
  createEventEditorCommandSchema,
} from '@/contracts/eventEditor';
import type { Event, UserData } from '@/types';
import type { EventFormValues } from '../formTypes';
import { buildEventDraft } from '../buildEventDraft';
import { buildDefaultLeagueData } from '../configDefaults';
import { buildEventFormDefaultValues } from '../defaultValues';
import {
  editorDraftToLegacyEvent,
  editorSnapshotToFormValues,
  emptyEditorSnapshot,
  eventFormValuesToEditorDraft,
  legacyEventToEditorDraft,
} from '../editorContractAdapters';
import { eventEditorFixtures } from '@/test/eventEditor/fixtures';

const expectedCreateRevisions = {
  editorRevision: 'new',
  staffRevision: null,
  scheduleRevision: 'new',
};

describe('event editor draft round trips', () => {
  it.each(eventEditorFixtures)('preserves editable values for $name', ({ event }) => {
    const initialDraft = legacyEventToEditorDraft(event);
    const persistedProjection = editorDraftToLegacyEvent(initialDraft, event.$id ?? event.id);
    const roundTrippedDraft = legacyEventToEditorDraft(persistedProjection as typeof event);

    expect(roundTrippedDraft).toEqual(initialDraft);
  });
  it.each([
    ['STAFFING', 'OFFICIAL_COVERAGE_REQUIRED'],
    ['TEAM_STAFFING', 'TEAM_COVERAGE_REQUIRED'],
    ['SCHEDULE', 'BEST_AVAILABLE_COVERAGE'],
    ['OFF', 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED'],
  ] as const)('maps legacy %s to canonical Staffing Priority', (legacyMode, staffingPriority) => {
    const sourceEvent = eventEditorFixtures[0].event;
    const event = {
      ...sourceEvent,
      staffingPriority: undefined,
      officialSchedulingMode: legacyMode,
      officialIds: [],
      officialPositions: [],
      eventOfficials: [],
    } as unknown as Event;

    const draft = legacyEventToEditorDraft(event);
    const persistedProjection = editorDraftToLegacyEvent(draft);

    expect(draft.staff.staffingPriority).toBe(staffingPriority);
    expect(persistedProjection.staffingPriority).toBe(staffingPriority);
    expect(persistedProjection).not.toHaveProperty('officialSchedulingMode');
  });
  it.each([true, false] as const)(
    'preserves Tournament Automated Scheduling=%s through the editor command seam',
    (automatedScheduling) => {
      const fixture = eventEditorFixtures.find(
        ({ name }) => name === 'tournament with pools and playoffs',
      )!.event;
      const event = {
        ...fixture,
        automatedScheduling,
      } as unknown as Event;

      const draft = legacyEventToEditorDraft(event);
      expect(draft.basics.eventType).toBe('TOURNAMENT');
      expect(draft.schedule.mode).toBe('FIXED_END');
      expect(draft.schedule.automatedScheduling).toBe(automatedScheduling);

      const projected = editorDraftToLegacyEvent(draft);
      expect(projected.automatedScheduling).toBe(automatedScheduling);

      const visibleFormValues = editorSnapshotToFormValues(
        emptyEditorSnapshot(draft, 'CREATE'),
      );
      expect(visibleFormValues.automatedScheduling).toBe(automatedScheduling);
      const formDraft = eventFormValuesToEditorDraft(visibleFormValues);
      expect(formDraft.schedule.automatedScheduling).toBe(automatedScheduling);

      const parsed = createEventEditorCommandSchema.parse({
        contractVersion: 3,
        createOperationId: `create-operation-tournament-automation-${automatedScheduling}`,
        expectedRevisions: expectedCreateRevisions,
        draft: formDraft,
        completion: {
          mode: automatedScheduling
            ? 'CREATE_AND_BUILD_SCHEDULE'
            : 'CREATE_ONLY',
        },
      });
      expect(parsed.draft.schedule.automatedScheduling).toBe(automatedScheduling);
      expect(parsed.completion.mode).toBe(
        automatedScheduling ? 'CREATE_AND_BUILD_SCHEDULE' : 'CREATE_ONLY',
      );
    },
  );
  it('keeps an explicitly disabled Tournament scheduler in the built draft and command', () => {
    const fixture = eventEditorFixtures.find(
      ({ name }) => name === 'tournament with pools and playoffs',
    )!.event;
    const sourceEvent = {
      ...fixture,
      affiliateUrl: '',
      automatedScheduling: false,
    } as unknown as Event;
    const formValues = editorSnapshotToFormValues(
      emptyEditorSnapshot(legacyEventToEditorDraft(sourceEvent), 'CREATE'),
    );

    const builtDraft = buildEventDraft({
      activeEditingEvent: null,
      currentUser: { $id: sourceEvent.hostId } as UserData,
      fieldCount: formValues.fieldCount,
      fields: formValues.fields,
      fieldsReferencedInSlots: [],
      hasImmutableTimeSlots: false,
      hasRestrictedImmutableFields: false,
      hasStripeAccount: false,
      immutableFields: [],
      immutableTimeSlots: [],
      isEditMode: false,
      isOrganizationHostedEvent: false,
      isOrganizationManagedEvent: false,
      joinAsParticipant: false,
      organizationHostedEventId: '',
      organizationOfficialsById: new Map(),
      previousEventFieldLocation: formValues.location,
      rentalLockedSlotsForDraft: [],
      resolvedOrganization: null,
      selectedRentedFieldIds: [],
      shouldManageLocalFields: false,
      shouldProvisionFields: false,
      source: formValues,
      sportsById: new Map(),
    });

    expect(builtDraft.automatedScheduling).toBe(false);
    const commandDraft = eventFormValuesToEditorDraft(builtDraft as EventFormValues);
    expect(commandDraft.schedule.automatedScheduling).toBe(false);
    expect(editorDraftToLegacyEvent(commandDraft).automatedScheduling).toBe(false);
  });

  it('preserves an explicit event playoff count for a multi-division league', () => {
    const fixture = eventEditorFixtures.find(({ name }) => name === 'multi-division league')!.event;
    const event = {
      ...fixture,
      includePlayoffs: true,
      playoffTeamCount: 8,
      divisionDetails: fixture.divisionDetails.map((detail, index) => ({
        ...detail,
        playoffTeamCount: index === 0 ? 8 : 4,
      })),
    } as unknown as Event;

    const draft = legacyEventToEditorDraft(event);

    expect(draft.competition.playoffTeamCount).toBe(8);
    expect(draft.competition.divisionDetails.map((detail) => detail.playoffTeamCount)).toEqual([8, 4]);
    expect(editorDraftToLegacyEvent(draft).playoffTeamCount).toBe(8);
  });

  it('defaults a missing multi-division event count without changing division counts', () => {
    const fixture = eventEditorFixtures.find(({ name }) => name === 'multi-division league')!.event;
    const event = {
      ...fixture,
      includePlayoffs: true,
      playoffTeamCount: undefined,
      divisionDetails: fixture.divisionDetails.map((detail, index) => ({
        ...detail,
        playoffTeamCount: index === 0 ? 8 : 4,
      })),
    } as unknown as Event;

    const draft = legacyEventToEditorDraft(event);

    expect(draft.competition.playoffTeamCount).toBe(3);
    expect(draft.competition.divisionDetails.map((detail) => detail.playoffTeamCount)).toEqual([8, 4]);
  });
  it('preserves an enabled explicit legacy playoff count for validation', () => {
    const fixture = eventEditorFixtures.find(({ name }) => name === 'multi-division league')!.event;
    const event = {
      ...fixture,
      includePlayoffs: true,
      playoffTeamCount: 2,
      leagueConfig: {
        ...fixture.leagueConfig,
        includePlayoffs: true,
        playoffTeamCount: 2,
      },
    } as unknown as Event;

    const config = buildDefaultLeagueData({
      base: {
        eventType: 'LEAGUE',
        sportIds: [],
      },
      activeEditingEvent: event,
      defaultDivisionDetails: [],
      sportsById: new Map(),
    });

    expect(config.playoffTeamCount).toBe(2);

    const draft = legacyEventToEditorDraft({
      ...event,
      divisionDetails: fixture.divisionDetails.map((detail) => ({
        ...detail,
        playoffTeamCount: undefined,
      })),
    } as unknown as Event);
    expect(draft.competition.playoffTeamCount).toBe(2);
  });

  it('preserves persisted tournament capacities below three on load', () => {
    const fixture = eventEditorFixtures.find(
      ({ name }) => name === 'tournament with pools and playoffs',
    )!.event;
    const event = {
      ...fixture,
      maxParticipants: 2,
      divisionDetails: fixture.divisionDetails.map((detail) => ({
        ...detail,
        maxParticipants: 2,
      })),
      playoffDivisionDetails: fixture.playoffDivisionDetails.map((detail) => ({
        ...detail,
        maxParticipants: 2,
      })),
    } as unknown as Event;

    const values = buildEventFormDefaultValues({
      activeEditingEvent: event,
      applyImmutableDefaults: (state) => state,
      hasImmutableFields: false,
      immutableFields: [],
      isCreateMode: false,
      resolvedOrganizationFields: [],
      resolvedOrganizationId: '',
      sportsById: new Map(),
    });

    expect(values.maxParticipants).toBe(2);
    expect(values.divisionDetails.map((detail) => detail.maxParticipants)).toEqual(
      expect.arrayContaining([2]),
    );
  });

  it('defaults missing enabled division bracket counts and preserves explicit counts on load', () => {
    const fixture = eventEditorFixtures.find(({ name }) => name === 'multi-division league')!.event;
    const event = {
      ...fixture,
      includePlayoffs: true,
      playoffTeamCount: undefined,
      leagueConfig: {
        ...fixture.leagueConfig,
        includePlayoffs: true,
        playoffTeamCount: undefined,
      },
      divisionDetails: fixture.divisionDetails.map((detail, index) => ({
        ...detail,
        playoffTeamCount: index === 0 ? undefined : 5,
      })),
    } as unknown as Event;

    const values = buildEventFormDefaultValues({
      activeEditingEvent: event,
      applyImmutableDefaults: (state) => state,
      hasImmutableFields: false,
      immutableFields: [],
      isCreateMode: false,
      resolvedOrganizationFields: [],
      resolvedOrganizationId: '',
      sportsById: new Map(),
    });

    expect(values.leagueData.playoffTeamCount).toBe(3);
    expect(values.divisionDetails.map((detail) => detail.playoffTeamCount)).toEqual([3, 5]);
  });


  it('projects hydrated division metadata before strict command parsing', () => {
    const sourceEvent = eventEditorFixtures.find(({ name }) => name === 'tournament with pools and playoffs')!.event;
    const hydratedDetails = (details: unknown) => (
      (Array.isArray(details) ? details : []).map((detail) => ({
        ...(detail as Record<string, unknown>),
        skillDivisionTypeName: 'Open',
        ageDivisionTypeName: 'All Ages',
        sportId: 'sport_fixture',
      }))
    );
    const event = {
      ...sourceEvent,
      divisionDetails: hydratedDetails(sourceEvent.divisionDetails),
      playoffDivisionDetails: hydratedDetails(sourceEvent.playoffDivisionDetails),
    } as unknown as Event;
    const parsed = createEventEditorCommandSchema.parse({
      contractVersion: 3,
      createOperationId: 'create-operation-fixture',
      expectedRevisions: expectedCreateRevisions,
      draft: eventFormValuesToEditorDraft(event as unknown as EventFormValues),
      completion: { mode: 'CREATE_AND_BUILD_SCHEDULE' },
    });

    expect(parsed.draft.competition.divisionDetails[0]).not.toHaveProperty('skillDivisionTypeName');
    expect(parsed.draft.competition.divisionDetails[0]).not.toHaveProperty('ageDivisionTypeName');
    expect(parsed.draft.competition.playoffDivisionDetails[0]).not.toHaveProperty('sportId');
  });

  it('projects every hydrated strict nested row before command parsing', () => {
    const sourceEvent = eventEditorFixtures.find(({ name }) => name === 'tournament with pools and playoffs')!.event;
    const event = {
      ...sourceEvent,
      tags: [{ $id: 'tag_1', slug: 'tag', name: 'Tag', organization: {} }],
      manualPaymentLinks: [{ id: 'payment_1', provider: 'stripe', url: 'https://example.com', event: {} }],
      fields: [{ id: 'field_1', name: 'Court', divisions: [], facility: {}, organization: 'rental_org_1' }],
      timeSlots: [{ id: 'slot_1', start: sourceEvent.start, matches: [], facility: {} }],
      officialPositions: [{ id: 'position_1', name: 'Referee', count: 1, order: 0, event: {} }],
      eventOfficials: [{
        id: 'official_1',
        userId: 'user_1',
        positionIds: [],
        fieldIds: [],
        isActive: true,
        user: {},
      }],
      pendingStaffInvites: [{
        email: 'official@example.com',
        firstName: 'Official',
        lastName: 'One',
        roles: ['OFFICIAL'],
        organization: {},
      }],
    } as unknown as Event;

    const parsed = createEventEditorCommandSchema.parse({
      contractVersion: 3,
      createOperationId: 'create-operation-hydrated',
      expectedRevisions: expectedCreateRevisions,
      draft: eventFormValuesToEditorDraft(event as unknown as EventFormValues),
      completion: { mode: 'CREATE_AND_BUILD_SCHEDULE' },
    });
    expect(parsed.draft.basics.tags[0]).not.toHaveProperty('organization');
    expect(parsed.draft.registration.payment.manualPaymentLinks[0]).not.toHaveProperty('event');
    expect(parsed.draft.resources.fields[0]).not.toHaveProperty('divisions');
    expect(parsed.draft.resources.fields[0]).not.toHaveProperty('facility');
    expect(parsed.draft.resources.fields[0]).toHaveProperty('organizationId', 'rental_org_1');
    expect(parsed.draft.resources.timeSlots[0]).not.toHaveProperty('matches');
    expect(parsed.draft.staff.officialPositions[0]).not.toHaveProperty('event');
    expect(parsed.draft.staff.eventOfficials[0]).not.toHaveProperty('user');
    expect(parsed.draft.staff.pendingInvites[0]).not.toHaveProperty('organization');
  });
  it('preserves normalized playoff identity and fields in the built event draft', () => {
    const sourceEvent = eventEditorFixtures.find(({ name }) => name === 'tournament with pools and playoffs')!.event;
    const formValues = {
      ...editorSnapshotToFormValues(
        emptyEditorSnapshot(legacyEventToEditorDraft(sourceEvent), 'EDIT'),
      ),
      leagueData: {
        includePlayoffs: true,
        playoffTeamCount: undefined,
      } as EventFormValues['leagueData'],
      divisionDetails: editorSnapshotToFormValues(
        emptyEditorSnapshot(legacyEventToEditorDraft(sourceEvent), 'EDIT'),
      ).divisionDetails.map((detail) => ({
        ...detail,
        playoffTeamCount: undefined,
      })),
    };
    const builtDraft = buildEventDraft({
      activeEditingEvent: sourceEvent,
      currentUser: { $id: sourceEvent.hostId } as UserData,
      fieldCount: formValues.fieldCount,
      fields: formValues.fields,
      fieldsReferencedInSlots: [],
      hasImmutableTimeSlots: false,
      hasRestrictedImmutableFields: false,
      hasStripeAccount: false,
      immutableFields: [],
      immutableTimeSlots: [],
      isEditMode: true,
      isOrganizationHostedEvent: false,
      isOrganizationManagedEvent: false,
      joinAsParticipant: false,
      organizationHostedEventId: '',
      organizationOfficialsById: new Map(),
      previousEventFieldLocation: sourceEvent.location,
      rentalLockedSlotsForDraft: [],
      resolvedOrganization: null,
      selectedRentedFieldIds: [],
      shouldManageLocalFields: false,
      shouldProvisionFields: false,
      source: formValues,
      sportsById: new Map(),
    });

    expect(builtDraft.playoffTeamCount).toBe(3);
    expect(builtDraft.divisionDetails?.map((detail) => detail.playoffTeamCount))
      .toEqual(expect.arrayContaining([3]));

    expect(builtDraft.playoffDivisionDetails?.[0]).toMatchObject({
      skillDivisionTypeId: 'skill_open',
      ageDivisionTypeId: 'age_open',
      fieldIds: ['field_fixture'],
      playoffTeamCount: 3,
    });

    const parsed = createEventEditorCommandSchema.parse({
      contractVersion: 3,
      createOperationId: 'create-operation-playoff-fields',
      expectedRevisions: expectedCreateRevisions,
      draft: eventFormValuesToEditorDraft(builtDraft as EventFormValues),
      completion: { mode: 'CREATE_AND_BUILD_SCHEDULE' },
    });
    expect(parsed.draft.competition.playoffDivisionDetails[0]).toMatchObject({
      skillDivisionTypeId: 'skill_open',
      ageDivisionTypeId: 'age_open',
      fieldIds: ['field_fixture'],
    });
    expect(parsed.draft.competition.playoffTeamCount).toBe(3);
  });
  it('carries normalized captured staff invitations into non-affiliate commands only', () => {
    const sourceEvent = eventEditorFixtures[0].event;
    const formValues: EventFormValues = {
      ...editorSnapshotToFormValues(
        emptyEditorSnapshot(legacyEventToEditorDraft(sourceEvent), 'CREATE'),
      ),
      pendingStaffInvites: [{
        firstName: ' Casey ',
        lastName: ' Ref ',
        email: ' CASEY@EXAMPLE.COM ',
        roles: ['OFFICIAL', 'OFFICIAL'],
      }],
    };
    const build = (source: EventFormValues) => buildEventDraft({
      activeEditingEvent: null,
      currentUser: { $id: sourceEvent.hostId } as UserData,
      fieldCount: source.fieldCount,
      fields: source.fields,
      fieldsReferencedInSlots: [],
      hasImmutableTimeSlots: false,
      hasRestrictedImmutableFields: false,
      hasStripeAccount: false,
      immutableFields: [],
      immutableTimeSlots: [],
      isEditMode: false,
      isOrganizationHostedEvent: false,
      isOrganizationManagedEvent: false,
      joinAsParticipant: false,
      organizationHostedEventId: '',
      organizationOfficialsById: new Map(),
      previousEventFieldLocation: source.location,
      rentalLockedSlotsForDraft: [],
      resolvedOrganization: null,
      selectedRentedFieldIds: [],
      shouldManageLocalFields: false,
      shouldProvisionFields: false,
      source,
      sportsById: new Map(),
    });

    const builtDraft = build(formValues);
    expect(builtDraft.pendingStaffInvites).toEqual([{
      firstName: 'Casey',
      lastName: 'Ref',
      email: 'casey@example.com',
      roles: ['OFFICIAL'],
    }]);
    expect(eventFormValuesToEditorDraft(builtDraft as EventFormValues).staff.pendingInvites)
      .toEqual(builtDraft.pendingStaffInvites);

    const affiliateDraft = build({
      ...formValues,
      isAffiliateEvent: true,
      eventType: 'AFFILIATE',
      affiliateUrl: 'https://example.com/external-event',
    });
    expect(affiliateDraft.pendingStaffInvites).toEqual([]);
  });
});
