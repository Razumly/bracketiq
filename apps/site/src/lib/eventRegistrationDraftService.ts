import { apiRequest } from './apiClient';
import type { EventRegistrationDraftSave, EventRegistrationDraftScope, EventRegistrationDraftState } from './contracts/eventRegistrationDraft';

function path(eventId: string, scope: EventRegistrationDraftScope) {
  const query = new URLSearchParams();
  if (scope.slotId) query.set('slotId', scope.slotId);
  if (scope.occurrenceDate) query.set('occurrenceDate', scope.occurrenceDate);
  return `/api/events/${encodeURIComponent(eventId)}/registration-draft${query.size ? `?${query}` : ''}`;
}

function supported(state: EventRegistrationDraftState) {
  if (state.version !== 1) throw new Error('Update the app to continue this registration.');
  return state;
}

export const eventRegistrationDraftService = {
  async get(eventId: string, scope: EventRegistrationDraftScope = {}) {
    return supported(await apiRequest<EventRegistrationDraftState>(path(eventId, scope)));
  },
  async save(eventId: string, input: EventRegistrationDraftSave) {
    return supported(await apiRequest<EventRegistrationDraftState>(path(eventId, {}), { method: 'PATCH', body: input }));
  },
  async clear(eventId: string, scope: EventRegistrationDraftScope = {}) {
    await apiRequest(path(eventId, scope), { method: 'DELETE' });
  },
};
