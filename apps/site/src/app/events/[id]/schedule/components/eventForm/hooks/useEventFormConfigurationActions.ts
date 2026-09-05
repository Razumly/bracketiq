import {
    useCallback,
    type SetStateAction,
} from 'react';

import {
    formatLocalDateTime,
    parseLocalDateTime,
} from '@/lib/dateUtils';
import { MIN_BRACKET_TEAM_COUNT } from '@/lib/divisionTypes';
import type {
    Event,
    LeagueConfig,
    LeagueScoringConfig,
    MatchRulesConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import { normalizeNumber } from '../configDefaults';
import { syncEventTypeTagsForEventType } from '../eventTypeTags';
import type { EventFormValues } from '../formTypes';
import { applyLeagueScoringConfigFieldChange } from '../../leagueScoringConfigForm';
import { sanitizeMatchRulesOverrideForEditor } from '../matchRulesHelpers';

type EventFormGetValues = <Key extends keyof EventFormValues>(
    name: Key,
) => EventFormValues[Key];

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventDataSetter = (
    updater: SetStateAction<EventFormValues>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type LeagueDataSetter = (
    updater: SetStateAction<LeagueConfig>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type TournamentDataSetter = (
    updater: SetStateAction<TournamentConfig>,
) => void;

type UseEventFormConfigurationActionsParams = {
    clearLeagueSlotErrors: () => void;
    eventData: EventFormValues;
    getValues: EventFormGetValues;
    leagueData: LeagueConfig;
    selectedSport: Sport | null | undefined;
    setEventData: EventDataSetter;
    setLeagueData: LeagueDataSetter;
    setTournamentData: TournamentDataSetter;
    setValue: EventFormSetValue;
    tournamentData: TournamentConfig;
};

export const useEventFormConfigurationActions = ({
    clearLeagueSlotErrors,
    eventData,
    getValues,
    leagueData,
    selectedSport,
    setEventData,
    setLeagueData,
    setTournamentData,
    setValue,
    tournamentData,
}: UseEventFormConfigurationActionsParams) => {
    const handleLeagueScoringConfigChange = useCallback((
        key: keyof LeagueScoringConfig,
        value: LeagueScoringConfig[keyof LeagueScoringConfig],
    ) => {
        const currentConfig = getValues('leagueScoringConfig') ?? eventData.leagueScoringConfig;
        const nextConfig = applyLeagueScoringConfigFieldChange(
            currentConfig,
            key,
            value,
            (config) => setValue('leagueScoringConfig', config, {
                shouldDirty: true,
                shouldValidate: false,
            }),
        );
        setEventData((previous) => ({
            ...previous,
            leagueScoringConfig: nextConfig,
        }));
    }, [eventData.leagueScoringConfig, getValues, setEventData, setValue]);

    const handleMatchRulesOverrideChange = useCallback((nextValue: MatchRulesConfig | null) => {
        const sanitized = sanitizeMatchRulesOverrideForEditor(nextValue);
        setValue('matchRulesOverride', sanitized, { shouldDirty: true, shouldValidate: false });
        const template = (selectedSport?.matchRulesTemplate ?? null) as MatchRulesConfig | null;
        const templateTimekeeping = template?.timekeeping ?? null;
        const overrideTimekeeping = sanitized?.timekeeping ?? null;
        const timerMode = overrideTimekeeping?.timerMode ?? templateTimekeeping?.timerMode;
        const segmentDuration = normalizeNumber(
            overrideTimekeeping?.segmentDurationMinutes
            ?? templateTimekeeping?.segmentDurationMinutes,
        );
        const segmentCount = normalizeNumber(template?.segmentCount)
            ?? (eventData.eventType === 'TOURNAMENT'
                ? normalizeNumber(tournamentData.winnerSetCount)
                : normalizeNumber(leagueData.setsPerMatch))
            ?? 1;
        if (timerMode !== 'COUNT_UP' || !segmentDuration || segmentCount <= 0) {
            return;
        }
        const totalMatchDuration = Math.max(1, Math.trunc(segmentDuration * segmentCount));
        if (eventData.eventType === 'LEAGUE') {
            setLeagueData((previous) => ({
                ...previous,
                usesSets: false,
                matchDurationMinutes: totalMatchDuration,
                setDurationMinutes: undefined,
            }));
        } else if (eventData.eventType === 'TOURNAMENT') {
            setTournamentData((previous) => ({
                ...previous,
                matchDurationMinutes: totalMatchDuration,
                setDurationMinutes: undefined,
            }));
        }
    }, [
        eventData.eventType,
        leagueData.setsPerMatch,
        selectedSport,
        setLeagueData,
        setTournamentData,
        setValue,
        tournamentData.winnerSetCount,
    ]);

    const handleIncludePlayoffsToggle = useCallback((checked: boolean) => {
        setLeagueData((previous) => ({
            ...previous,
            includePlayoffs: checked,
            playoffTeamCount: checked
                ? previous.playoffTeamCount ?? MIN_BRACKET_TEAM_COUNT
                : undefined,
        }));
        if (checked) {
            const currentDetails = getValues('divisionDetails');
            setValue('divisionDetails', currentDetails.map((detail) => ({
                ...detail,
                playoffTeamCount: detail.playoffTeamCount ?? MIN_BRACKET_TEAM_COUNT,
            })), { shouldDirty: true, shouldValidate: true });
        } else {
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
        }
    }, [getValues, setLeagueData, setValue]);

    const handleEventTypeChange = useCallback((
        nextType: Event['eventType'],
        applyValue: (eventType: Event['eventType']) => void,
    ) => {
        clearLeagueSlotErrors();
        const enforcingTeamSettings = nextType === 'LEAGUE' || nextType === 'TOURNAMENT';
        const enforcingTryoutSettings = nextType === 'TRYOUT';
        const ensureFiniteEndAfterStart = () => {
            const parsedStart = parseLocalDateTime(getValues('start'));
            const parsedEnd = parseLocalDateTime(getValues('end'));
            if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
            }
        };
        const nextIsAutomatedScheduling =
            nextType === 'LEAGUE' || nextType === 'TOURNAMENT' || nextType === 'WEEKLY_EVENT';
        applyValue(nextType);
        setValue(
            'isAutomatedScheduling',
            nextIsAutomatedScheduling,
            { shouldDirty: true, shouldValidate: true },
        );
        setValue(
            'tags',
            syncEventTypeTagsForEventType(getValues('tags'), nextType),
            { shouldDirty: true, shouldValidate: true },
        );
        if (enforcingTeamSettings) {
            setValue('teamSignup', true, { shouldDirty: true });
            setValue('singleDivision', true, { shouldDirty: true, shouldValidate: true });
            setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
            return;
        }
        if (enforcingTryoutSettings) {
            setValue('teamSignup', false, { shouldDirty: true });
            setValue('singleDivision', false, { shouldDirty: true, shouldValidate: true });
            setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
            setValue('divisionDetails', [], { shouldDirty: true, shouldValidate: true });
            setValue('divisions', [], { shouldDirty: true, shouldValidate: true });
            ensureFiniteEndAfterStart();
            return;
        }

        setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
        ensureFiniteEndAfterStart();
    }, [clearLeagueSlotErrors, getValues, setValue]);

    const handleAffiliateEventChange = useCallback((
        checked: boolean,
        applyValue: (value: boolean) => void,
    ) => {
        applyValue(checked);
        setValue('isAffiliateEvent', checked, { shouldDirty: true, shouldValidate: true });
        if (!checked) {
            setValue('affiliateUrl', '', { shouldDirty: true, shouldValidate: true });
            return;
        }
        const resetValues: Array<[string, unknown]> = [
            ['allowPaymentPlans', false],
            ['installmentCount', 0],
            ['installmentAmounts', []],
            ['installmentDueDates', []],
            ['installmentDueRelativeDays', []],
            ['allowTeamSplitDefault', false],
            ['requiredTemplateIds', []],
        ];
        resetValues.forEach(([name, value]) => {
            setValue(name, value, { shouldDirty: true, shouldValidate: true });
        });
    }, [setValue]);

    const handleIncludePoolPlayChange = useCallback((checked: boolean) => {
        setLeagueData((previous) => ({
            ...previous,
            includePlayoffs: checked,
            playoffTeamCount: checked
                ? previous.playoffTeamCount ?? MIN_BRACKET_TEAM_COUNT
                : undefined,
        }));
        const currentDetails = getValues('divisionDetails');
        setValue('divisionDetails', currentDetails.map((detail) => (
            checked
                ? {
                    ...detail,
                    playoffTeamCount: detail.playoffTeamCount ?? MIN_BRACKET_TEAM_COUNT,
                }
                : {
                    ...detail,
                    playoffTeamCount: undefined,
                    poolCount: undefined,
                    poolTeamCount: undefined,
                }
        )), { shouldDirty: true, shouldValidate: true });
    }, [getValues, setLeagueData, setValue]);

    const handleStartChange = useCallback((value: Date) => {
        setValue('start', formatLocalDateTime(value), { shouldDirty: true, shouldValidate: true });
    }, [setValue]);

    const handleEndChange = useCallback((value: Date) => {
        setValue('end', formatLocalDateTime(value), { shouldDirty: true, shouldValidate: true });
    }, [setValue]);

    const handleNoFixedEndDateTimeChange = useCallback((checked: boolean) => {
        setValue('noFixedEndDateTime', checked, { shouldDirty: true, shouldValidate: true });
        if (checked) {
            return;
        }
        const parsedStart = parseLocalDateTime(getValues('start'));
        const parsedEnd = parseLocalDateTime(getValues('end'));
        if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
            const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
            setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
        }
    }, [getValues, setValue]);

    const handleSelectedAddressChange = useCallback((
        coordinates: [number, number],
        address: string,
    ) => {
        setValue('coordinates', coordinates, { shouldDirty: true, shouldValidate: true });
        setValue('address', address, { shouldDirty: true, shouldValidate: true });
    }, [setValue]);

    return {
        handleAffiliateEventChange,
        handleEndChange,
        handleEventTypeChange,
        handleIncludePlayoffsToggle,
        handleIncludePoolPlayChange,
        handleLeagueScoringConfigChange,
        handleMatchRulesOverrideChange,
        handleNoFixedEndDateTimeChange,
        handleSelectedAddressChange,
        handleStartChange,
    };
};
