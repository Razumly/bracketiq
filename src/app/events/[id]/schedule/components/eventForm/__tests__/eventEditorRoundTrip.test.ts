import {
  editorDraftToLegacyEvent,
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
});
