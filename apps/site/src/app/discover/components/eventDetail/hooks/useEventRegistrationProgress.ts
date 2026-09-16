import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { isApiRequestError } from '@/lib/apiClient';
import { eventRegistrationDraftService } from '@/lib/eventRegistrationDraftService';
import type { EventRegistrationDraftPatch, EventRegistrationDraftState } from '@/lib/contracts/eventRegistrationDraft';

export type RegistrationProgressPatch = EventRegistrationDraftPatch & { holdExpiresAt?: string | null };

type UseEventRegistrationProgressArgs = {
    userId?: string | null;
    eventId?: string | null;
    slotId?: string | null;
    occurrenceDate?: string | null;
    answers: Record<string, string>;
    selectedTeamId: string;
    selectedDivisionId: string;
    selectedDivisionTypeKey: string;
    registrationId?: string | null;
    setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
    setSelectedTeamId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionTypeKey: Dispatch<SetStateAction<string>>;
};

export function useEventRegistrationProgress({
    userId, eventId, slotId, occurrenceDate,
    setAnswers, setSelectedTeamId, setSelectedDivisionId, setSelectedDivisionTypeKey,
}: UseEventRegistrationProgressArgs) {
    const progressKey = useMemo(() => JSON.stringify([userId, eventId, slotId, occurrenceDate]),
        [userId, eventId, slotId, occurrenceDate]);
    const activeKey = useRef(progressKey);
    activeKey.current = progressKey;
    const stored = useRef<{ key: string; state: EventRegistrationDraftState } | null>(null);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const readVersion = useRef(0);
    const saveVersion = useRef(0);
    const [state, setState] = useState<EventRegistrationDraftState | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);

    const apply = useCallback((next: EventRegistrationDraftState, hydrate = true) => {
        stored.current = { key: progressKey, state: next };
        setState(next);
        setHoldExpiresAt(next.draft?.holdExpiresAt ?? null);
        if (hydrate) {
            setAnswers(next.draft?.answers ?? {});
            setSelectedTeamId(next.selectedTeamId ?? '');
            setSelectedDivisionId(next.draft?.selectedDivisionId ?? '');
            setSelectedDivisionTypeKey(next.draft?.selectedDivisionTypeKey ?? '');
        }
        return next;
    }, [progressKey, setAnswers, setSelectedTeamId, setSelectedDivisionId, setSelectedDivisionTypeKey]);

    const reload = useCallback(async () => {
        if (!userId || !eventId) { setLoading(false); return null; }
        const version = ++readVersion.current;
        setLoading(true);
        setError(null);
        try {
            await queue.current;
            if (activeKey.current !== progressKey || version !== readVersion.current) return null;
            const next = await eventRegistrationDraftService.get(eventId, { slotId, occurrenceDate });
            if (activeKey.current !== progressKey || version !== readVersion.current) return null;
            return apply(next);
        } catch (failure) {
            if (activeKey.current === progressKey) setError(failure instanceof Error ? failure.message : 'Could not load registration progress.');
            return null;
        } finally {
            if (activeKey.current === progressKey) setLoading(false);
        }
    }, [userId, eventId, slotId, occurrenceDate, progressKey, apply]);

    useEffect(() => {
        activeKey.current = progressKey;
        stored.current = null;
        saveVersion.current += 1;
        setState(null);
        setError(null);
        setSaving(false);
        setAnswers({});
        setSelectedTeamId('');
        setSelectedDivisionId('');
        setSelectedDivisionTypeKey('');
        setHoldExpiresAt(null);
        void reload();
        return () => { activeKey.current = ''; };
    }, [reload, progressKey, setAnswers, setSelectedTeamId, setSelectedDivisionId, setSelectedDivisionTypeKey]);

    const save = useCallback((input: RegistrationProgressPatch = {}): Promise<EventRegistrationDraftState | null> => {
        const version = saveVersion.current;
        const operation = async () => {
            if (!userId || !eventId || activeKey.current !== progressKey || version !== saveVersion.current) return null;
            readVersion.current += 1;
            setSaving(true);
            setError(null);
            try {
                const current = stored.current?.key === progressKey ? stored.current.state : null;
                if (!current) throw new Error('Load registration progress before saving.');
                const { holdExpiresAt: ignoredHold, ...patch } = input;
                void ignoredHold;
                const next = await eventRegistrationDraftService.save(eventId, {
                    version: 1, baseRevision: current.draft?.revision ?? 0, slotId, occurrenceDate, patch,
                });
                if (activeKey.current !== progressKey) return null;
                return apply(next, false);
            } catch (failure) {
                if (activeKey.current !== progressKey) return null;
                saveVersion.current += 1;
                if (isApiRequestError(failure) && failure.data && typeof failure.data === 'object' && 'state' in failure.data) {
                    const current = failure.data.state as EventRegistrationDraftState | undefined;
                    if (current?.version === 1) apply(current);
                }
                setError(failure instanceof Error ? failure.message : 'Could not save registration progress.');
                return null;
            } finally {
                if (activeKey.current === progressKey) setSaving(false);
            }
        };
        const pending = queue.current.then(operation, operation);
        queue.current = pending;
        return pending;
    }, [userId, eventId, progressKey, slotId, occurrenceDate, apply]);

    const clear = useCallback(async () => {
        await queue.current;
        if (!userId || !eventId || activeKey.current !== progressKey) return;
        try {
            await eventRegistrationDraftService.clear(eventId, { slotId, occurrenceDate });
            if (activeKey.current === progressKey) await reload();
        } catch (failure) {
            if (activeKey.current === progressKey) setError(failure instanceof Error ? failure.message : 'Could not clear completed registration progress.');
        }
    }, [userId, eventId, progressKey, slotId, occurrenceDate, reload]);

    return { progressKey, state, loading, saving, error, holdExpiresAt, setHoldExpiresAt, save, clear, reload };
}
