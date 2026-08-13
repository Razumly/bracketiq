import {
  createEventEditorCommandSchema,
} from '@/contracts/eventEditor';
import type { Event, UserData } from '@/types';
import type { EventFormValues } from '../formTypes';
import { buildEventDraft } from '../buildEventDraft';
import {
  editorDraftToLegacyEvent,
  editorSnapshotToFormValues,
  emptyEditorSnapshot,
  eventFormValuesToEditorDraft,
  legacyEventToEditorDraft,
} from '../editorContractAdapters';
import { eventEditorFixtures } from '@/test/eventEditor/fixtures';

describe('event editor draft round trips', () => {
  it.each(eventEditorFixtures)('preserves editable values for $name', ({ event }) => {
    const initialDraft = legacyEventToEditorDraft(event);
    const persistedProjection = editorDraftToLegacyEvent(initialDraft, event.$id ?? event.id);
    const roundTrippedDraft = legacyEventToEditorDraft(persistedProjection as typeof event);

    expect(roundTrippedDraft).toEqual(initialDraft);
  });
  it('preserves OFF official scheduling mode through the editor adapter', () => {
    const sourceEvent = eventEditorFixtures[0].event;
    const event = {
      ...sourceEvent,
      officialSchedulingMode: 'OFF',
      officialIds: [],
      officialPositions: [],
      eventOfficials: [],
    } as unknown as Event;

    const draft = legacyEventToEditorDraft(event);

    expect(draft.staff.officialSchedulingMode).toBe('OFF');
    expect(editorDraftToLegacyEvent(draft).officialSchedulingMode).toBe('OFF');
  });

  it('does not derive an event playoff count from the first multi-division league', () => {
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

    expect(draft.competition.playoffTeamCount).toBeNull();
    expect(draft.competition.divisionDetails.map((detail) => detail.playoffTeamCount)).toEqual([8, 4]);
    expect(editorDraftToLegacyEvent(draft).playoffTeamCount).toBeNull();
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
      leagueData: { includePlayoffs: true } as EventFormValues['leagueData'],
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

    expect(builtDraft.playoffDivisionDetails?.[0]).toMatchObject({
      skillDivisionTypeId: 'skill_open',
      ageDivisionTypeId: 'age_open',
      fieldIds: ['field_fixture'],
    });

    const parsed = createEventEditorCommandSchema.parse({
      contractVersion: 3,
      createOperationId: 'create-operation-playoff-fields',
      draft: eventFormValuesToEditorDraft(builtDraft as EventFormValues),
      completion: { mode: 'CREATE_AND_BUILD_SCHEDULE' },
    });
    expect(parsed.draft.competition.playoffDivisionDetails[0]).toMatchObject({
      skillDivisionTypeId: 'skill_open',
      ageDivisionTypeId: 'age_open',
      fieldIds: ['field_fixture'],
    });
  });
});
