import { legacyEventToEditorDraft } from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import { eventEditorFixtures } from '@/test/eventEditor/fixtures';

import {
    clearCreateEventDraft,
    createEventDraftStorageKey,
    readCreateEventDraft,
    writeCreateEventDraft,
} from '../createEventDraftStorage';

type MemoryStorage = {
    values: Map<string, string>;
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

const createMemoryStorage = (): MemoryStorage => {
    const values = new Map<string, string>();
    return {
        values,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
};

describe('create event draft storage', () => {
    it('round-trips a draft and clears it after completion', () => {
        const storage = createMemoryStorage();
        const key = createEventDraftStorageKey({ userId: 'user_1', eventId: 'new' });
        const draft = legacyEventToEditorDraft(eventEditorFixtures[0].event);

        writeCreateEventDraft(storage, key, draft, 1_000);

        expect(readCreateEventDraft(storage, key, 1_000)).toEqual(draft);
        clearCreateEventDraft(storage, key);
        expect(readCreateEventDraft(storage, key, 1_000)).toBeNull();
    });

    it('does not restore a draft older than one day', () => {
        const storage = createMemoryStorage();
        const key = createEventDraftStorageKey({ userId: 'user_1', eventId: 'new' });
        const draft = legacyEventToEditorDraft(eventEditorFixtures[0].event);

        writeCreateEventDraft(storage, key, draft, 1_000);

        expect(readCreateEventDraft(storage, key, 1_000 + 24 * 60 * 60 * 1000 + 1)).toBeNull();
        expect(storage.values.has(key)).toBe(false);
    });
});
