import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ApiRequestError } from '@/lib/apiClient';
import type { EventRegistrationDraftState } from '@/lib/contracts/eventRegistrationDraft';
import { eventRegistrationDraftService } from '@/lib/eventRegistrationDraftService';
import { useEventRegistrationProgress } from '../useEventRegistrationProgress';

jest.mock('@/lib/eventRegistrationDraftService', () => ({
    eventRegistrationDraftService: { get: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));

function useHarness({ account = 'account', event = 'event' } = {}) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');
    const progress = useEventRegistrationProgress({
        userId: account, eventId: event, answers, selectedTeamId, selectedDivisionId,
        selectedDivisionTypeKey, setAnswers, setSelectedTeamId, setSelectedDivisionId, setSelectedDivisionTypeKey,
    });
    return { progress, answers, selectedTeamId };
}

const savedState = (): EventRegistrationDraftState => ({
            version: 1, available: true, unavailableReason: null, invalidations: [],
            eligibleTeams: [{ id: 'saved-team', name: 'Saved Team', sport: 'Volleyball' }],
            selectedTeamId: 'saved-team', selectionSource: 'draft',
            draft: {
                id: 'draft', eventId: 'event', revision: 4, slotId: null, occurrenceDate: null,
                selectedTeamId: 'saved-team', selectedDivisionId: null, selectedDivisionTypeKey: null,
                answers: { travel: 'Bus' }, step: 'signing', completedSteps: ['questions'],
                registrationId: null, holdExpiresAt: null, teamCreationId: null, completedAt: null,
                updatedAt: '2026-09-05T23:00:00Z',
            },
        });

describe('shared Event registration progress', () => {
    beforeEach(() => jest.clearAllMocks());

    it('restores the server draft Team instead of a different remembered default', async () => {
        jest.mocked(eventRegistrationDraftService.get).mockResolvedValue(savedState());
        const { result } = renderHook(useHarness);
        await waitFor(() => expect(result.current.selectedTeamId).toBe('saved-team'));
        expect(result.current.answers).toEqual({ travel: 'Bus' });
    });

    it('serializes step saves with the last server revision', async () => {
        jest.mocked(eventRegistrationDraftService.get).mockResolvedValue(savedState());
        jest.mocked(eventRegistrationDraftService.save).mockImplementation(async (_event, input) => ({
            ...savedState(), draft: { ...savedState().draft!, ...input.patch, revision: input.baseRevision + 1 },
        }));
        const { result } = renderHook(() => useHarness());
        await waitFor(() => expect(result.current.progress.loading).toBe(false));
        await act(async () => {
            await Promise.all([result.current.progress.save({ answers: { travel: 'Train' } }), result.current.progress.save({ step: 'review' })]);
        });
        expect(jest.mocked(eventRegistrationDraftService.save).mock.calls.map(([, input]) => input.baseRevision)).toEqual([4, 5]);
        expect(result.current.progress.state?.draft?.revision).toBe(6);
    });

    it('shows actual saved progress after a conflict and cancels queued stale edits', async () => {
        jest.mocked(eventRegistrationDraftService.get).mockResolvedValue(savedState());
        const current = savedState();
        current.draft = { ...current.draft!, revision: 5, answers: { travel: 'Train from mobile' } };
        jest.mocked(eventRegistrationDraftService.save).mockRejectedValue(new ApiRequestError('Review the saved progress.', 409, { state: current }));
        const { result } = renderHook(() => useHarness());
        await waitFor(() => expect(result.current.progress.loading).toBe(false));
        await act(async () => {
            await Promise.all([result.current.progress.save({ answers: { travel: 'Old edit' } }), result.current.progress.save({ step: 'checkout' })]);
        });
        expect(eventRegistrationDraftService.save).toHaveBeenCalledTimes(1);
        expect(result.current.answers).toEqual({ travel: 'Train from mobile' });
        expect(result.current.progress.error).toBe('Review the saved progress.');
    });

    it('reports an offline read without inventing a local registration draft', async () => {
        jest.mocked(eventRegistrationDraftService.get).mockRejectedValue(new Error('Network unavailable.'));
        const { result } = renderHook(() => useHarness());
        await waitFor(() => expect(result.current.progress.error).toBe('Network unavailable.'));
        expect(result.current.progress.state).toBeNull();
        expect(result.current.selectedTeamId).toBe('');
        await act(async () => { expect(await result.current.progress.save({ step: 'checkout' })).toBeNull(); });
        expect(eventRegistrationDraftService.save).not.toHaveBeenCalled();
    });

    it('clears visible progress when the Account changes', async () => {
        jest.mocked(eventRegistrationDraftService.get).mockResolvedValueOnce(savedState());
        const { result, rerender } = renderHook(useHarness, { initialProps: { account: 'account', event: 'event' } });
        await waitFor(() => expect(result.current.selectedTeamId).toBe('saved-team'));
        jest.mocked(eventRegistrationDraftService.get).mockResolvedValue({ ...savedState(), draft: null, selectedTeamId: null, eligibleTeams: [], selectionSource: null });
        rerender({ account: 'another-account', event: 'event' });
        await waitFor(() => expect(result.current.progress.loading).toBe(false));
        expect(result.current.selectedTeamId).toBe('');
        expect(result.current.answers).toEqual({});
    });
});
