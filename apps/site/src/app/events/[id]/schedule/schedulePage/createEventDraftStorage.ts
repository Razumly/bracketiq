import { z } from 'zod';

import {
    eventEditorDraftSchema,
    type EventEditorDraft,
} from '@/contracts/eventEditor';

const STORAGE_PREFIX = 'bracketiq:create-event-draft:v1';
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

type CreateEventDraftStorageKeyInput = {
    userId: string;
    eventId?: string | null;
    organizationId?: string | null;
    rentalBookingId?: string | null;
};

const storedCreateEventDraftSchema = z.object({
    draft: eventEditorDraftSchema,
    savedAt: z.number(),
}).strict();
type StoredCreateEventDraft = z.infer<typeof storedCreateEventDraftSchema>;
export const createEventDraftStorageKey = ({
    userId,
    eventId,
    organizationId,
    rentalBookingId,
}: CreateEventDraftStorageKeyInput): string => [
    STORAGE_PREFIX,
    userId,
    eventId ?? 'new',
    organizationId ?? 'personal',
    rentalBookingId ?? 'none',
].map((value) => encodeURIComponent(value)).join(':');

export const readCreateEventDraft = (
    storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined,
    key: string,
    now = Date.now(),
): EventEditorDraft | null => {
    if (!storage) return null;
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const parsed = storedCreateEventDraftSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            storage.removeItem(key);
            return null;
        }
        if (now - parsed.data.savedAt > MAX_DRAFT_AGE_MS) {
            storage.removeItem(key);
            return null;
        }
        return parsed.data.draft;
    } catch {
        return null;
    }
};

export const writeCreateEventDraft = (
    storage: Pick<Storage, 'setItem'> | undefined,
    key: string,
    draft: EventEditorDraft,
    now = Date.now(),
): void => {
    if (!storage) return;
    try {
        const value: StoredCreateEventDraft = { draft, savedAt: now };
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be unavailable in private browsing or when full.
    }
};

export const clearCreateEventDraft = (
    storage: Pick<Storage, 'removeItem'> | undefined,
    key: string,
): void => {
    if (!storage) return;
    try {
        storage.removeItem(key);
    } catch {
        // Storage can be unavailable in private browsing.
    }
};
