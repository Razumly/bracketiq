import {
  createEventEditorCommandSchema,
} from '@/contracts/eventEditor';
import type { Event } from '@/types';
import type { EventFormValues } from '../formTypes';
import {
  editorDraftToLegacyEvent,
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
      contractVersion: 2,
      createOperationId: 'create-operation-fixture',
      draft: eventFormValuesToEditorDraft(event as unknown as EventFormValues),
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
      fields: [{ id: 'field_1', name: 'Court', divisions: [], facility: {} }],
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
      contractVersion: 2,
      createOperationId: 'create-operation-hydrated',
      draft: eventFormValuesToEditorDraft(event as unknown as EventFormValues),
    });
    expect(parsed.draft.basics.tags[0]).not.toHaveProperty('organization');
    expect(parsed.draft.registration.payment.manualPaymentLinks[0]).not.toHaveProperty('event');
    expect(parsed.draft.resources.fields[0]).not.toHaveProperty('divisions');
    expect(parsed.draft.resources.fields[0]).not.toHaveProperty('facility');
    expect(parsed.draft.resources.timeSlots[0]).not.toHaveProperty('matches');
    expect(parsed.draft.staff.officialPositions[0]).not.toHaveProperty('event');
    expect(parsed.draft.staff.eventOfficials[0]).not.toHaveProperty('user');
    expect(parsed.draft.staff.pendingInvites[0]).not.toHaveProperty('organization');
  });
});
