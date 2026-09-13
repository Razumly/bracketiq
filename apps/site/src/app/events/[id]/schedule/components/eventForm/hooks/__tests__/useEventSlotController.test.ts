import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { eventService } from '@/lib/eventService';
import type { Event, Field, TimeSlot } from '@/types';

import type { SlotDivisionLookup } from '../../divisionForm';
import type { EventFormValues } from '../../formTypes';
import { useEventSlotController } from '../useEventSlotController';

jest.mock('@/lib/eventService', () => ({
    eventService: {
        getFieldSchedulingConflicts: jest.fn(),
    },
}));

let clientIdSequence = 0;
jest.mock('@/lib/clientId', () => ({
    createClientId: jest.fn(() => `slot_new_${++clientIdSequence}`),
}));

const mockedGetFieldSchedulingConflicts = eventService.getFieldSchedulingConflicts as jest.MockedFunction<
    typeof eventService.getFieldSchedulingConflicts
>;

const SLOT_DIVISION_KEYS = ['open'];
const SLOT_DIVISION_LOOKUP: SlotDivisionLookup = {
    keys: SLOT_DIVISION_KEYS,
    options: [{ value: 'open', label: 'Open' }],
    valueToId: new Map([['open', 'open']]),
};
const FIELD = { $id: 'field_1', name: 'Court 1' } as Field;
const RESOURCE_LABELS = { singular: 'Court', plural: 'Courts' } as const;
const EMPTY_TIME_SLOTS: TimeSlot[] = [];

const buildSlot = (overrides: Partial<LeagueSlotForm> = {}): LeagueSlotForm => ({
    key: 'slot_1',
    scheduledFieldId: FIELD.$id,
    scheduledFieldIds: [FIELD.$id],
    dayOfWeek: 0,
    daysOfWeek: [0],
    divisions: SLOT_DIVISION_KEYS,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 20 * 60,
    repeating: true,
    conflicts: [],
    checking: false,
    error: undefined,
    ...overrides,
});

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'LEAGUE',
    parentEvent: undefined,
    start: '2026-07-20T09:00:00',
    end: '2026-08-31T21:00:00',
    timeZone: 'America/Los_Angeles',
    singleDivision: true,
    leagueSlots: [buildSlot()],
    fields: [FIELD],
    leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: false,
        usesSets: false,
        restTimeMinutes: 0,
    },
    playoffData: {} as EventFormValues['playoffData'],
    tournamentData: {} as EventFormValues['tournamentData'],
    ...overrides,
} as EventFormValues);

const buildEditingEvent = (): Event => ({
    $id: 'event_1',
    eventType: 'LEAGUE',
    start: '2026-07-20T09:00:00',
    end: '2026-08-31T21:00:00',
} as Event);

const buildServerFieldConflict = () => ({
    slotKey: 'slot_1',
    fieldId: FIELD.$id,
    kind: 'EVENT_TIME_SLOT',
    start: '2026-07-20T18:30:00.000Z',
    end: '2026-07-20T19:30:00.000Z',
    source: {
        id: 'blocking_slot_1',
        eventId: 'event_blocking',
        parentId: 'event_blocking',
        kind: 'EVENT_TIME_SLOT',
        eventType: 'LEAGUE',
        eventStart: '2026-07-20T09:00:00.000Z',
        eventEnd: '2026-08-31T21:00:00.000Z',
        eventTimeZone: 'America/Los_Angeles',
        noFixedEndDateTime: false,
        repeating: true,
        startDate: '2026-07-20T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        timeZone: 'America/Los_Angeles',
        startTimeMinutes: 18 * 60 + 30,
        endTimeMinutes: 19 * 60 + 30,
        daysOfWeek: [0],
        scheduledFieldIds: [FIELD.$id],
    },
});

type HarnessProps = {
    eventData: EventFormValues;
    eventSupportsScheduleSlots?: boolean;
    hasImmutableTimeSlots?: boolean;
    immutableTimeSlots?: TimeSlot[];
    isEditMode?: boolean;
    rentalLockedSlotsForDraft?: TimeSlot[];
};

const useSlotHarness = ({
    eventData,
    eventSupportsScheduleSlots = true,
    hasImmutableTimeSlots = false,
    immutableTimeSlots = EMPTY_TIME_SLOTS,
    isEditMode = true,
    rentalLockedSlotsForDraft = EMPTY_TIME_SLOTS,
}: HarnessProps) => {
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const isDirty = form.formState.isDirty;
    const controller = useEventSlotController({
        activeEditingEvent: isEditMode ? buildEditingEvent() : null,
        clearErrors: form.clearErrors,
        eventEnd: formValues.end,
        eventId: formValues.$id,
        eventStart: formValues.start,
        eventSupportsScheduleSlots,
        eventTimeZone: formValues.timeZone,
        isAutomatedScheduling: formValues.isAutomatedScheduling,
        eventType: formValues.eventType,
        fields: formValues.fields,
        getValues: form.getValues,
        hasExternalRentalField: false,
        hasImmutableTimeSlots,
        immutableFields: [],
        immutableTimeSlots,
        isEditMode,
        leagueSlots: formValues.leagueSlots,
        parentEvent: formValues.parentEvent,
        rentalLockedSlotsForDraft,
        resolvedOrganizationId: 'org_1',
        resourceLabels: RESOURCE_LABELS,
        setLeagueData: jest.fn(),
        setPlayoffData: jest.fn(),
        setValue: form.setValue as unknown as (
            name: string,
            value: unknown,
            options?: { shouldDirty?: boolean; shouldValidate?: boolean },
        ) => void,
        singleDivision: formValues.singleDivision,
        slotDivisionKeys: SLOT_DIVISION_KEYS,
        slotDivisionLookup: SLOT_DIVISION_LOOKUP,
    });
    return { ...controller, ...form, formValues, isDirty };
};

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
};

describe('useEventSlotController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clientIdSequence = 0;
        mockedGetFieldSchedulingConflicts.mockResolvedValue({ conflicts: [] });
    });

    it('normalizes add, update, and remove commands through the React Hook Form slot field', async () => {
        const eventData = buildEventData({
            leagueSlots: [buildSlot({
                scheduledFieldId: undefined,
                scheduledFieldIds: [],
                dayOfWeek: undefined,
                daysOfWeek: [],
            })],
        });
        const { result } = renderHook(() => useSlotHarness({ eventData }));
        act(() => result.current.handleAddSlot());
        await waitFor(() => expect(result.current.formValues.leagueSlots).toHaveLength(2));
        expect(result.current.formValues.leagueSlots[1]).toEqual(expect.objectContaining({
            key: 'slot_new_1',
            divisions: ['open'],
            conflicts: [],
            checking: false,
        }));

        act(() => result.current.handleUpdateSlot(1, {
            scheduledFieldIds: [FIELD.$id, FIELD.$id],
            daysOfWeek: [2, 2],
            startTimeMinutes: 10 * 60,
            endTimeMinutes: 11 * 60,
        }));
        await waitFor(() => expect(result.current.formValues.leagueSlots[1]).toEqual(expect.objectContaining({
            scheduledFieldId: FIELD.$id,
            scheduledFieldIds: [FIELD.$id],
            dayOfWeek: 2,
            daysOfWeek: [2],
            startTimeMinutes: 10 * 60,
            endTimeMinutes: 11 * 60,
        })));

        act(() => result.current.handleRemoveSlot(0));
        await waitFor(() => expect(result.current.formValues.leagueSlots).toHaveLength(1));
        expect(result.current.formValues.leagueSlots[0].key).toBe('slot_new_1');
        expect(result.current.isDirty).toBe(true);
    });

    it('creates a timezone-owned repeating slot from the first Weekly Event selection', async () => {
        const placeholder = buildSlot({
            scheduledFieldId: undefined,
            scheduledFieldIds: [],
            dayOfWeek: undefined,
            daysOfWeek: [],
            startDate: undefined,
            endDate: undefined,
            startTimeMinutes: undefined,
            endTimeMinutes: undefined,
        });
        const { result } = renderHook(() => useSlotHarness({
            eventData: buildEventData({
                eventType: 'WEEKLY_EVENT',
                start: '2026-07-20T08:00:00',
                leagueSlots: [placeholder],
            }),
        }));

        act(() => result.current.handleCreateCalendarSelection({
            start: new Date('2026-07-20T16:00:00.000Z'),
            end: new Date('2026-07-20T17:00:00.000Z'),
            resourceId: FIELD.$id,
        }));

        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            repeating: true,
            scheduledFieldIds: [FIELD.$id],
            startDate: '2026-07-20T09:00:00',
            endDate: undefined,
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 10 * 60,
            dayOfWeek: 0,
            daysOfWeek: [0],
            timeZone: 'America/Los_Angeles',
        })));
    });
    it('uses an unscheduled competition calendar selection as an Event boundary only', async () => {
        const { result } = renderHook(() => useSlotHarness({
            eventData: buildEventData({
                eventType: 'TOURNAMENT',
                isAutomatedScheduling: false,
                leagueSlots: [],
                noFixedEndDateTime: true,
            }),
        }));

        await waitFor(() => expect(result.current.formValues.leagueSlots).toHaveLength(0));
        act(() => result.current.handleCreateCalendarSelection({
            start: new Date('2026-07-20T16:00:00.000Z'),
            end: new Date('2026-07-20T17:00:00.000Z'),
            resourceId: '',
        }));

        await waitFor(() => expect(result.current.formValues.start).toBe('2026-07-20T09:00:00'));
        expect(result.current.formValues.end).toBe('2026-07-20T10:00:00');
        expect(result.current.formValues.noFixedEndDateTime).toBe(false);
        expect(result.current.formValues.leagueSlots).toHaveLength(0);
    });
    it('clears one-time date overrides when switching a slot to repeating', async () => {
        const { result } = renderHook(() => useSlotHarness({
            eventData: buildEventData({
                leagueSlots: [buildSlot({
                    repeating: false,
                    startDate: '2026-07-20T18:00:00',
                    endDate: '2026-07-20T20:00:00',
                })],
            }),
        }));

        act(() => result.current.handleUpdateSlot(0, { repeating: true }));

        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            repeating: true,
            startDate: undefined,
            endDate: undefined,
            startTimeMinutes: 18 * 60,
            endTimeMinutes: 20 * 60,
        })));
    });


    it('keeps calendar slots independent from Event boundary edits', async () => {
        const eventData = buildEventData({
            leagueSlots: [buildSlot()],
        });
        const { result } = renderHook(() => useSlotHarness({ eventData }));

        act(() => result.current.setValue('start', '2026-07-21T10:30:00'));
        await waitFor(() => expect(result.current.formValues.start).toBe('2026-07-21T10:30:00'));
        expect(result.current.formValues.leagueSlots[0].startDate).toBeUndefined();
    });

    it('moves a repeating calendar entry by local day without replacing its slot', async () => {
        const { result } = renderHook(() => useSlotHarness({ eventData: buildEventData() }));

        act(() => result.current.handleMoveCalendarSlot(
            { slotIndex: 0, resourceId: FIELD.$id, occurrenceDate: '2026-07-20' },
            {
                resourceId: FIELD.$id,
                start: new Date(2026, 6, 21, 10, 0),
                end: new Date(2026, 6, 21, 12, 0),
            },
        ));

        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            scheduledFieldIds: [FIELD.$id],
            daysOfWeek: [1],
            dayOfWeek: 1,
            startTimeMinutes: 10 * 60,
            endTimeMinutes: 12 * 60,
        })));
    });

    it('resizes a calendar entry while preserving its Resource assignment', async () => {
        const { result } = renderHook(() => useSlotHarness({ eventData: buildEventData() }));

        act(() => result.current.handleResizeCalendarSlot(
            { slotIndex: 0, resourceId: FIELD.$id, occurrenceDate: '2026-07-20' },
            {
                resourceId: FIELD.$id,
                start: new Date(2026, 6, 20, 18, 0),
                end: new Date(2026, 6, 20, 21, 0),
            },
        ));

        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            scheduledFieldIds: [FIELD.$id],
            startTimeMinutes: 18 * 60,
            endTimeMinutes: 21 * 60,
        })));
    });
    it('preserves a calendar selection when derived Event timing changes the boundary', async () => {
        const eventData = buildEventData({
            leagueSlots: [],
        });
        const { result } = renderHook(() => useSlotHarness({
            eventData,
            isEditMode: false,
        }));

        await waitFor(() => expect(result.current.formValues.leagueSlots).toHaveLength(1));
        act(() => result.current.handleCreateCalendarSelection({
            start: new Date('2026-07-20T16:00:00.000Z'),
            end: new Date('2026-07-20T17:00:00.000Z'),
            resourceId: FIELD.$id,
        }));
        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            scheduledFieldIds: [FIELD.$id],
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 10 * 60,
        })));

        act(() => result.current.setValue('start', '2026-07-21T10:30:00'));
        await waitFor(() => expect(result.current.formValues.start).toBe('2026-07-21T10:30:00'));
        expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            scheduledFieldIds: [FIELD.$id],
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 10 * 60,
        }));
    });

    it('does not replace immutable rental slots', async () => {
        const immutableSlot = {
            ...buildSlot({ key: 'rental-slot' }),
            $id: 'rental-slot',
            sourceType: 'RENTAL_BOOKING',
            rentalLocked: true,
        } as unknown as TimeSlot;
        const eventData = buildEventData({ leagueSlots: [buildSlot({ key: 'rental-slot' })] });
        const { result } = renderHook(() => useSlotHarness({
            eventData,
            hasImmutableTimeSlots: true,
            immutableTimeSlots: [immutableSlot],
        }));

        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            key: 'rental-slot',
            repeating: true,
            rentalLocked: true,
        })));
    });

    it('applies a successful external-conflict response and auto-resolves the slot', async () => {
        mockedGetFieldSchedulingConflicts.mockResolvedValue({
            conflicts: [buildServerFieldConflict()],
        });
        const { result } = renderHook(() => useSlotHarness({ eventData: buildEventData() }));

        await waitFor(() => expect(result.current.formValues.leagueSlots[0].conflicts).toHaveLength(1));
        expect(result.current.formValues.leagueSlots[0].checking).toBe(false);
        expect(result.current.leagueWarning).toMatch(/Timeslot court conflicts are warnings/i);

        act(() => result.current.handleAutoResolveSlotConflict(0));
        await waitFor(() =>
            expect(result.current.formValues.leagueSlots[0].startTimeMinutes).toBeGreaterThanOrEqual(19 * 60 + 30),
        );
        expect(result.current.formValues.leagueSlots[0].startTimeMinutes).toBe(19 * 60 + 30);
        expect(result.current.formValues.leagueSlots[0].endTimeMinutes).toBeGreaterThan(
            result.current.formValues.leagueSlots[0].startTimeMinutes ?? 0,
        );
    });

    it('clears pending conflict metadata when the external lookup fails', async () => {
        const warningSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockedGetFieldSchedulingConflicts.mockRejectedValue(new Error('Conflict lookup failed'));
        const { result } = renderHook(() => useSlotHarness({ eventData: buildEventData() }));

        await waitFor(() => expect(warningSpy).toHaveBeenCalledWith(
            'Failed to load event scheduling conflicts:',
            expect.objectContaining({ message: 'Conflict lookup failed' }),
        ));
        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            conflicts: [],
            checking: false,
        })));
        expect(result.current.leagueWarning).toBeNull();
        warningSpy.mockRestore();
    });

    it('replaces rental-seeded slots when the draft switches back to editable scheduling', async () => {
        const lockedRentalSlot = {
            $id: 'rental_slot_1',
            scheduledFieldId: FIELD.$id,
            scheduledFieldIds: [FIELD.$id],
            dayOfWeek: 0,
            daysOfWeek: [0],
            startTimeMinutes: 18 * 60,
            endTimeMinutes: 20 * 60,
            startDate: '2026-07-20T09:00:00',
            endDate: '2026-08-31T21:00:00',
            repeating: true,
            sourceType: 'RENTAL_BOOKING',
            rentalLocked: true,
        } as TimeSlot;
        const initialProps: HarnessProps = {
            eventData: buildEventData(),
            eventSupportsScheduleSlots: false,
            hasImmutableTimeSlots: true,
            immutableTimeSlots: [lockedRentalSlot],
            rentalLockedSlotsForDraft: [lockedRentalSlot],
        };
        const { result, rerender } = renderHook(
            (props: HarnessProps) => useSlotHarness(props),
            { initialProps },
        );

        await waitFor(() => expect(result.current.formValues.leagueSlots).toEqual([
            expect.objectContaining({
                $id: 'rental_slot_1',
                scheduledFieldIds: [FIELD.$id],
                rentalLocked: true,
            }),
        ]));

        rerender({
            ...initialProps,
            eventSupportsScheduleSlots: true,
            hasImmutableTimeSlots: false,
            immutableTimeSlots: EMPTY_TIME_SLOTS,
        });
        await waitFor(() => expect(result.current.formValues.leagueSlots).toEqual([
            expect.objectContaining({
                $id: undefined,
                scheduledFieldIds: [],
                divisions: ['open'],
                rentalLocked: false,
            }),
        ]));
    });

    it('ignores a stale conflict response after the event schedule changes', async () => {
        const firstRequest = createDeferred<{ conflicts: any[] }>();
        const secondRequest = createDeferred<{ conflicts: any[] }>();
        mockedGetFieldSchedulingConflicts
            .mockReturnValueOnce(firstRequest.promise)
            .mockReturnValueOnce(secondRequest.promise);
        const { result } = renderHook(() => useSlotHarness({ eventData: buildEventData() }));

        await waitFor(() => expect(mockedGetFieldSchedulingConflicts).toHaveBeenCalledTimes(1));
        act(() => result.current.setValue('start', '2026-07-27T09:00:00'));
        await waitFor(() => expect(mockedGetFieldSchedulingConflicts).toHaveBeenCalledTimes(2));

        await act(async () => {
            secondRequest.resolve({ conflicts: [] });
            await secondRequest.promise;
        });
        await waitFor(() => expect(result.current.formValues.leagueSlots[0]).toEqual(expect.objectContaining({
            conflicts: [],
            checking: false,
        })));

        await act(async () => {
            firstRequest.resolve({ conflicts: [buildServerFieldConflict()] });
            await firstRequest.promise;
        });
        expect(result.current.formValues.leagueSlots[0].conflicts).toEqual([]);
        expect(result.current.leagueWarning).toBeNull();
    });
});
