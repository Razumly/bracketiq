import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SetStateAction } from "react";
import type { UseFormClearErrors, UseFormGetValues } from "react-hook-form";

import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { eventService } from '@/lib/eventService';
import { MIN_BRACKET_TEAM_COUNT } from '@/lib/divisionTypes';
import {
  calendarDateInTimeZoneToInstant,
  formatDateTimeInTimeZone,
  getDateTimePartsInTimeZone,
  parseDateTimeInTimeZone,
} from "@/lib/dateUtils";
import type { SportResourceLabels } from '@/lib/sportResourceLabels';
import type { Event, Field, LeagueConfig, TimeSlot, TournamentConfig } from '@/types';

import { mergeSlotPayloadsForForm } from "../../slotPayloadMerge";
import { buildTournamentConfig } from "../configDefaults";
import type { SlotDivisionLookup } from "../divisionForm";
import { isUnscheduledCompetition, supportsScheduleSlotsForEvent } from "../eventRules";
import { leagueSlotsEqual, slotConflictsEqual } from "../formEquality";
import type { EventFormValues } from "../formTypes";
import { isRentalLockedTimeSlot } from "../rentalResources";
import { toFieldIdList } from "../resourceGroups";
import { buildLeagueScheduleWarning } from "../scheduleMessages";
import {
  buildAutoResolvedSlotUpdate,
  buildServerSlotConflicts,
  buildSlotConflictCheckKey,
  buildSlotConflictContext,
  slotCanCheckExternalConflicts,
  snapshotToSlotForm,
  type SlotConflictContext,
  type SlotConflictPayload,
} from "../slotConflictHelpers";
import {
  createLeagueSlotForm,
  normalizeLeagueSlotDivisions,
  normalizeLeagueSlotFieldReferences,
  normalizeLeagueSlotUpdate,
  normalizeSlotFieldIds,
  normalizeWeekdays,
  slotMatchesLockedRental,
} from "../slotForm";
import { normalizeSlotState } from "../slotValidation";

type SetEventFormValue = (
  name: string,
  value: unknown,
  options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type SetScheduleConfig<T> = (
  updater: SetStateAction<T>,
  options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseEventSlotControllerOptions = {
  activeEditingEvent?: Event | null;
  clearErrors: UseFormClearErrors<EventFormValues>;
  eventEnd?: string | null;
  eventId?: string | null;
  hasNoFixedEventEnd?: boolean;
  eventStart?: string | null;
  eventSupportsScheduleSlots: boolean;
  eventTimeZone?: string | null;
  isAutomatedScheduling?: boolean;
  eventType: Event["eventType"];
  fields: Field[];
  getValues: UseFormGetValues<EventFormValues>;
  hasExternalRentalField: boolean;
  hasImmutableTimeSlots: boolean;
  immutableFields: Field[];
  immutableTimeSlots: TimeSlot[];
  isEditMode: boolean;
  leagueSlots: LeagueSlotForm[];
  parentEvent?: string | null;
  rentalLockedSlotsForDraft: TimeSlot[];
  resolvedOrganizationId: string;
  resourceLabels: SportResourceLabels;
  setLeagueData: SetScheduleConfig<LeagueConfig>;
  setPlayoffData: SetScheduleConfig<TournamentConfig>;
  setValue: SetEventFormValue;
  singleDivision: boolean;
  slotDivisionKeys: string[];
  slotDivisionLookup: SlotDivisionLookup;
};

const isDivisionOnlyUpdate = (updates: Partial<LeagueSlotForm>): boolean =>
  Object.keys(updates).every((key) => key === "divisions");

const isResourceOnlyUpdate = (updates: Partial<LeagueSlotForm>): boolean =>
  Object.keys(updates).every(
    (key) =>
      key === "scheduledFieldId" ||
      key === "scheduledFieldIds" ||
      key === "sourceType" ||
      key === "rentalBookingId" ||
      key === "rentalBookingItemId" ||
      key === "rentalLocked" ||
      key === "price" ||
      key === "requiredTemplateIds" ||
      key === "hostRequiredTemplateIds" ||
      key === "error",
  );
const dateTimeMatches = (
  value: string | undefined,
  expected: string | null,
  timeZone: string | null | undefined,
): boolean => {
  if (!value || !expected) {
    return false;
  }
  if (value === expected) {
    return true;
  }
  const parsedValue = parseDateTimeInTimeZone(value, timeZone);
  const parsedExpected = parseDateTimeInTimeZone(expected, timeZone);
  return Boolean(
    parsedValue &&
      parsedExpected &&
      parsedValue.getTime() === parsedExpected.getTime(),
  );
};
type EventCalendarSelection = {
  start: Date;
  end: Date;
  resourceId: string;
};
const isValidCalendarSelection = (
  selection: EventCalendarSelection,
  allowMissingResource = false,
): boolean => {
  if (!allowMissingResource && !selection.resourceId) {
    return false;
  }
  if (!(selection.start instanceof Date) || Number.isNaN(selection.start.getTime())) {
    return false;
  }
  if (!(selection.end instanceof Date) || Number.isNaN(selection.end.getTime())) {
    return false;
  }
  return selection.end.getTime() > selection.start.getTime();
};

const slotHasCalendarConfiguration = (slot: LeagueSlotForm): boolean =>
  Boolean(
    slot.$id ||
      normalizeSlotFieldIds(slot).length ||
      (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length) ||
      typeof slot.startTimeMinutes === "number" ||
      typeof slot.endTimeMinutes === "number" ||
      slot.startDate ||
      slot.endDate,
  );

type CalendarSlotMutationEntry = {
  occurrenceDate: string;
  resourceId: string;
  slotIndex: number;
};

type CalendarSlotMutationRange = {
  end: Date;
  endInstant?: Date;
  resourceId: string;
  start: Date;
  startInstant?: Date;
};
const resolveCalendarInstant = (
  displayValue: Date,
  instantValue: Date | undefined,
  eventTimeZone: string,
): Date =>
  instantValue
    ? new Date(instantValue.getTime())
    : calendarDateInTimeZoneToInstant(displayValue, eventTimeZone) ?? displayValue;

const weekdayIndexForLocalDate = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : (date.getUTCDay() + 6) % 7;
};

const weekdayIndexForParts = (
  parts: ReturnType<typeof getDateTimePartsInTimeZone>,
): number | null => (
  parts ? (new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay() + 6) % 7 : null
);

const shiftWeekdays = (days: number[], offset: number): number[] =>
  Array.from(new Set(days.map((day) => (day + offset + 7) % 7))).sort((a, b) => a - b);
type ZonedDateTimeParts = NonNullable<ReturnType<typeof getDateTimePartsInTimeZone>>;

type CalendarSelectionDetails = {
  end: Date;
  endDate: string;
  endParts: ZonedDateTimeParts;
  start: Date;
  startDate: string;
  startParts: ZonedDateTimeParts;
};

const resolveCalendarSelectionDetails = (
  selection: EventCalendarSelection,
  timeZone: string,
  allowMissingResource = false,
): CalendarSelectionDetails | null => {
  if (!isValidCalendarSelection(selection, allowMissingResource)) {
    return null;
  }
  const startParts = getDateTimePartsInTimeZone(selection.start, timeZone);
  const endParts = getDateTimePartsInTimeZone(selection.end, timeZone);
  const startDate = formatDateTimeInTimeZone(selection.start, timeZone);
  const endDate = formatDateTimeInTimeZone(selection.end, timeZone);
  if (!startParts || !endParts || !startDate || !endDate) {
    return null;
  }
  return {
    end: selection.end,
    endDate,
    endParts,
    start: selection.start,
    startDate,
    startParts,
  };
};

const buildCalendarSelectionSlot = (options: {
  details: CalendarSelectionDetails;
  eventEnd?: string | null;
  eventStart?: string | null;
  eventType: Event["eventType"];
  leagueSlots: LeagueSlotForm[];
  parentEvent?: string | null;
  resourceId: string;
  slotDivisionKeys: string[];
  timeZone: string;
}): LeagueSlotForm => {
  const {
    details,
    eventEnd,
    eventStart,
    eventType,
    leagueSlots,
    parentEvent,
    resourceId,
    slotDivisionKeys,
    timeZone,
  } = options;
  const firstStandaloneWeeklySelection =
    eventType === "WEEKLY_EVENT" &&
    !parentEvent &&
    !leagueSlots.some(slotHasCalendarConfiguration);
  const dayOfWeek =
    (new Date(
      Date.UTC(
        details.startParts.year,
        details.startParts.month - 1,
        details.startParts.day,
        12,
      ),
    ).getUTCDay() + 6) % 7;
  return createLeagueSlotForm(
    {
      scheduledFieldId: resourceId,
      scheduledFieldIds: [resourceId],
      dayOfWeek: dayOfWeek as TimeSlot["dayOfWeek"],
      daysOfWeek: [dayOfWeek] as TimeSlot["daysOfWeek"],
      startDate: details.startDate,
      endDate: firstStandaloneWeeklySelection ? undefined : details.endDate,
      startTimeMinutes: details.startParts.hour * 60 + details.startParts.minute,
      endTimeMinutes: details.endParts.hour * 60 + details.endParts.minute,
      timeZone,
      repeating: firstStandaloneWeeklySelection,
    },
    slotDivisionKeys,
    eventStart,
    firstStandaloneWeeklySelection ? undefined : eventEnd,
    timeZone,
  );
};

type CalendarMutationParts = {
  endInstant: Date;
  endParts: ZonedDateTimeParts;
  startInstant: Date;
  startParts: ZonedDateTimeParts;
  slotTimeZone: string;
};

const resolveCalendarMutationParts = (
  slot: LeagueSlotForm,
  range: CalendarSlotMutationRange,
  eventTimeZone?: string | null,
): CalendarMutationParts | null => {
  const eventTimeZoneValue = eventTimeZone ?? "UTC";
  const slotTimeZone =
    typeof slot.timeZone === "string" && slot.timeZone.trim().length > 0
      ? slot.timeZone
      : eventTimeZoneValue;
  const startInstant = resolveCalendarInstant(
    range.start,
    range.startInstant,
    eventTimeZoneValue,
  );
  const endInstant = resolveCalendarInstant(
    range.end,
    range.endInstant,
    eventTimeZoneValue,
  );
  const startParts = getDateTimePartsInTimeZone(startInstant, slotTimeZone);
  const endParts = getDateTimePartsInTimeZone(endInstant, slotTimeZone);
  if (!startParts || !endParts || endInstant.getTime() <= startInstant.getTime()) {
    return null;
  }
  return { endInstant, endParts, slotTimeZone, startInstant, startParts };
};

const buildOneTimeCalendarSlotUpdates = (
  parts: CalendarMutationParts,
  base: Partial<LeagueSlotForm>,
): Partial<LeagueSlotForm> => {
  const dayOfWeek = weekdayIndexForParts(parts.startParts);
  return {
    ...base,
    ...(dayOfWeek === null
      ? {}
      : {
          dayOfWeek: dayOfWeek as TimeSlot["dayOfWeek"],
          daysOfWeek: [dayOfWeek] as TimeSlot["daysOfWeek"],
        }),
    startDate: formatDateTimeInTimeZone(parts.startInstant, parts.slotTimeZone),
    endDate: formatDateTimeInTimeZone(parts.endInstant, parts.slotTimeZone),
  };
};

const buildRepeatingCalendarSlotUpdates = (
  slot: LeagueSlotForm,
  entry: CalendarSlotMutationEntry,
  parts: CalendarMutationParts,
  base: Partial<LeagueSlotForm>,
): Partial<LeagueSlotForm> => {
  const targetDay = weekdayIndexForParts(parts.startParts);
  const sourceDay = weekdayIndexForLocalDate(entry.occurrenceDate);
  const existingDays = normalizeWeekdays(slot);
  const dayOffset =
    targetDay !== null && sourceDay !== null ? targetDay - sourceDay : 0;
  const nextDays =
    targetDay === null
      ? existingDays
      : shiftWeekdays(existingDays.length ? existingDays : [targetDay], dayOffset);
  return {
    ...base,
    dayOfWeek: nextDays[0] as TimeSlot["dayOfWeek"],
    daysOfWeek: nextDays as TimeSlot["daysOfWeek"],
  };
};

const buildCalendarSlotRangeUpdates = (
  slot: LeagueSlotForm,
  entry: CalendarSlotMutationEntry,
  range: CalendarSlotMutationRange,
  eventTimeZone?: string | null,
): Partial<LeagueSlotForm> | null => {
  const parts = resolveCalendarMutationParts(slot, range, eventTimeZone);
  if (!parts) {
    return null;
  }
  const currentResourceIds = normalizeSlotFieldIds(slot);
  const nextResourceIds = Array.from(
    new Set([
      ...currentResourceIds.filter((resourceId) => resourceId !== entry.resourceId),
      range.resourceId,
    ]),
  );
  if (!nextResourceIds.length) {
    return null;
  }
  const base: Partial<LeagueSlotForm> = {
    scheduledFieldId: nextResourceIds[0],
    scheduledFieldIds: nextResourceIds,
    startTimeMinutes: parts.startParts.hour * 60 + parts.startParts.minute,
    endTimeMinutes: parts.endParts.hour * 60 + parts.endParts.minute,
  };
  return slot.repeating === false
    ? buildOneTimeCalendarSlotUpdates(parts, base)
    : buildRepeatingCalendarSlotUpdates(slot, entry, parts, base);
};
const activeEventScheduleSource = (
  event: Event,
): LeagueConfig & { includePlayoffsOrPools?: boolean } => (
  (event.leagueConfig || event) as LeagueConfig & { includePlayoffsOrPools?: boolean }
);

const activeEventIncludesPlayoffsOrPools = (
  source: LeagueConfig & { includePlayoffsOrPools?: boolean },
): boolean => Boolean(source.includePlayoffsOrPools ?? source.includePlayoffs);

const applyActiveEventScheduleDefaults = (
  event: Event,
  setLeagueData: SetScheduleConfig<LeagueConfig>,
  setPlayoffData: SetScheduleConfig<TournamentConfig>,
): void => {
  if (event.eventType !== "LEAGUE" && event.eventType !== "TOURNAMENT") {
    return;
  }
  const source = activeEventScheduleSource(event);
  const includePlayoffsOrPools = activeEventIncludesPlayoffsOrPools(source);
  setLeagueData(
    {
      gamesPerOpponent: source.gamesPerOpponent ?? 1,
      includePlayoffs: includePlayoffsOrPools,
      playoffTeamCount:
        source.playoffTeamCount ??
        (includePlayoffsOrPools ? MIN_BRACKET_TEAM_COUNT : undefined),
      usesSets: source.usesSets ?? false,
      restTimeMinutes: 0,
      setDurationMinutes: undefined,
      setsPerMatch: undefined,
    },
    { shouldDirty: false },
  );
  setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
};

const buildActiveEventScheduleSlots = (
  event: Event,
  eventType: Event["eventType"],
  isAutomatedScheduling: boolean | undefined,
  slotDivisionKeys: string[],
): LeagueSlotForm[] => {
  const fallbackFieldId = event.fields?.[0]?.$id;
  const editableSlots = (event.timeSlots || []).filter(
    (slot) => !isRentalLockedTimeSlot(slot),
  );
  const slots = mergeSlotPayloadsForForm(editableSlots, fallbackFieldId).map((slot) =>
    createLeagueSlotForm(
      slot,
      slotDivisionKeys,
      event.start,
      event.end,
    ),
  );
  return slots.length > 0
    ? slots
    : isUnscheduledCompetition(eventType, isAutomatedScheduling)
      ? []
      : [createLeagueSlotForm(undefined, slotDivisionKeys)];
};

const applyCreateScheduleDefaults = (
  setLeagueData: SetScheduleConfig<LeagueConfig>,
  setPlayoffData: SetScheduleConfig<TournamentConfig>,
): void => {
  setLeagueData(
    {
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: undefined,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      setDurationMinutes: undefined,
      setsPerMatch: undefined,
    },
    { shouldDirty: false },
  );
  setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
};



export const useEventSlotController = ({
  activeEditingEvent,
  clearErrors,
  eventEnd,
  eventId,
  hasNoFixedEventEnd,
  eventStart,
  eventSupportsScheduleSlots,
  eventTimeZone,
  isAutomatedScheduling,
  eventType,
  fields,
  getValues,
  hasExternalRentalField,
  hasImmutableTimeSlots,
  immutableFields,
  immutableTimeSlots,
  isEditMode,
  leagueSlots,
  parentEvent,
  rentalLockedSlotsForDraft,
  resolvedOrganizationId,
  resourceLabels,
  setLeagueData,
  setPlayoffData,
  setValue,
  singleDivision,
  slotDivisionKeys,
  slotDivisionLookup,
}: UseEventSlotControllerOptions) => {
  const previousEditableScheduleModeRef = useRef<boolean | null>(null);
  const slotConflictRequestRef = useRef(0);
  const slotDivisionKeysRef = useRef<string[]>(slotDivisionKeys);
  const scheduleInitializationKeyRef = useRef<string | null>(null);
  useEffect(() => {
    slotDivisionKeysRef.current = slotDivisionKeys;
  }, [slotDivisionKeys]);

  const slotValidationContext = useMemo(
    () => ({
      eventStart: parseDateTimeInTimeZone(eventStart, eventTimeZone),
      eventEnd: parseDateTimeInTimeZone(eventEnd, eventTimeZone),
    }),
    [eventEnd, eventStart, eventTimeZone],
  );
  const setLeagueSlots = useCallback(
    (
      updater: SetStateAction<LeagueSlotForm[]>,
      options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ) => {
      const current = getValues("leagueSlots");
      const next =
        typeof updater === "function"
          ? (updater as (previous: LeagueSlotForm[]) => LeagueSlotForm[])(
              current,
            )
          : updater;
      if (leagueSlotsEqual(current, next)) {
        return;
      }
      setValue("leagueSlots", next, {
        shouldDirty: options.shouldDirty ?? true,
        shouldValidate: options.shouldValidate ?? true,
      });
    },
    [getValues, setValue],
  );

  const updateLeagueSlots = useCallback(
    (
      updater: (slots: LeagueSlotForm[]) => LeagueSlotForm[],
      options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ) => {
      if (hasImmutableTimeSlots) {
        return;
      }
      setLeagueSlots(
        (previous) =>
          normalizeSlotState(
            updater(previous),
            eventType,
            parentEvent,
            slotValidationContext,
          ),
        options,
      );
    },
    [
      eventType,
      hasImmutableTimeSlots,
      parentEvent,
      setLeagueSlots,
      slotValidationContext,
    ],
  );



  const slotConflictEventId = activeEditingEvent?.$id ?? eventId ?? "";
  const slotConflictCheckKey = useMemo(
    () =>
      buildSlotConflictCheckKey({
        eventId: slotConflictEventId,
        eventType,
        organizationId: resolvedOrganizationId,
        parentEvent,
        eventStart,
        eventEnd,
        hasNoFixedEventEnd,
        slots: leagueSlots,
      }),
    [
      eventEnd,
      hasNoFixedEventEnd,
      eventStart,
      eventType,
      leagueSlots,
      parentEvent,
      resolvedOrganizationId,
      slotConflictEventId,
    ],
  );
  const slotConflictContext = useMemo(
    () =>
      buildSlotConflictContext({
        eventId: slotConflictEventId,
        eventStart,
        eventEnd,
        hasNoFixedEventEnd,
      }),
    [eventEnd, hasNoFixedEventEnd, eventStart, slotConflictEventId],
  );
  const { hasPendingExternalConflictChecks, hasExternalSlotConflictWarnings } =
    useMemo(() => {
      if (
        !supportsScheduleSlotsForEvent(eventType, parentEvent)
      ) {
        return {
          hasPendingExternalConflictChecks: false,
          hasExternalSlotConflictWarnings: false,
        };
      }

      let hasPending = false;
      let hasConflicts = false;
      for (const slot of leagueSlots) {
        if (!slotCanCheckExternalConflicts(slot, slotConflictContext)) {
          continue;
        }
        if (slot.checking) {
          hasPending = true;
        }
        if (slot.conflicts.length > 0) {
          hasConflicts = true;
        }
        if (hasPending && hasConflicts) {
          break;
        }
      }

      return {
        hasPendingExternalConflictChecks: hasPending,
        hasExternalSlotConflictWarnings: hasConflicts,
      };
    }, [
      eventType,
        leagueSlots,
      parentEvent,
      slotConflictContext,
    ]);

  useEffect(() => {
    const normalizedSlots = normalizeLeagueSlotDivisions(
      leagueSlots,
      slotDivisionKeys,
      slotDivisionLookup,
      singleDivision,
    );
    if (normalizedSlots === leagueSlots) {
      return;
    }
    updateLeagueSlots(
      (previous) =>
        normalizeLeagueSlotDivisions(
          previous,
          slotDivisionKeys,
          slotDivisionLookup,
          singleDivision,
        ),
      { shouldDirty: false },
    );
  }, [
    leagueSlots,
    singleDivision,
    slotDivisionKeys,
    slotDivisionLookup,
    updateLeagueSlots,
  ]);

  useEffect(() => {
    const availableFieldIds = toFieldIdList(fields);
    const normalizedSlots = normalizeLeagueSlotFieldReferences(
      leagueSlots,
      availableFieldIds,
    );
    if (normalizedSlots === leagueSlots) {
      return;
    }
    updateLeagueSlots(
      (previous) =>
        normalizeLeagueSlotFieldReferences(previous, availableFieldIds),
      { shouldDirty: false },
    );
  }, [fields, leagueSlots, updateLeagueSlots]);

  useEffect(() => {
    if (hasImmutableTimeSlots) {
      return;
    }

    let payload: SlotConflictPayload;
    try {
      payload = JSON.parse(slotConflictCheckKey) as SlotConflictPayload;
    } catch {
      return;
    }

    const clearConflicts = () => {
      setLeagueSlots(
        (previous) => {
          let changed = false;
          const next = previous.map((slot) => {
            if (!slot.conflicts.length && slot.checking === false) {
              return slot;
            }
            changed = true;
            return { ...slot, conflicts: [], checking: false };
          });
          return changed ? next : previous;
        },
        { shouldDirty: false },
      );
    };

    if (
      !supportsScheduleSlotsForEvent(payload.eventType, payload.parentEvent) ||
      payload.slots.length === 0
    ) {
      clearConflicts();
      return;
    }

    const context: SlotConflictContext = {
      eventId: payload.eventId,
      eventStart: payload.eventStart,
      eventEnd: payload.eventEnd,
      hasNoFixedEventEnd: payload.hasNoFixedEventEnd,
    };
    const slotForms = payload.slots.map(snapshotToSlotForm);
    const eligibleSlots = slotForms.filter((slot) =>
      slotCanCheckExternalConflicts(slot, context),
    );
    const fieldIds = Array.from(
      new Set(eligibleSlots.flatMap((slot) => normalizeSlotFieldIds(slot))),
    );
    if (!fieldIds.length) {
      clearConflicts();
      return;
    }

    const requestId = slotConflictRequestRef.current + 1;
    slotConflictRequestRef.current = requestId;
    setLeagueSlots(
      (previous) => {
        let changed = false;
        const next = previous.map((slot) => {
          const shouldCheck = slotCanCheckExternalConflicts(slot, context);
          if (slot.checking === shouldCheck) {
            return slot;
          }
          changed = true;
          return { ...slot, checking: shouldCheck };
        });
        return changed ? next : previous;
      },
      { shouldDirty: false },
    );

    let cancelled = false;
    const loadConflicts = async () => {
      try {
        const response = await eventService.getFieldSchedulingConflicts(payload);
        if (cancelled || slotConflictRequestRef.current !== requestId) {
          return;
        }

        const conflictsBySlotKey = new Map(
          slotForms.map((slot) => [
            slot.key,
            slotCanCheckExternalConflicts(slot, context)
              ? buildServerSlotConflicts(slot, response.conflicts)
              : [],
          ]),
        );
        setLeagueSlots(
          (previous) => {
            let changed = false;
            const next = previous.map((slot) => {
              const nextConflicts = conflictsBySlotKey.get(slot.key) ?? [];
              if (
                slot.checking === false &&
                slotConflictsEqual(slot.conflicts, nextConflicts)
              ) {
                return slot;
              }
              changed = true;
              return { ...slot, conflicts: nextConflicts, checking: false };
            });
            return changed ? next : previous;
          },
          { shouldDirty: false },
        );
      } catch (error) {
        if (cancelled || slotConflictRequestRef.current !== requestId) {
          return;
        }
        console.warn("Failed to load event scheduling conflicts:", error);
        setLeagueSlots(
          (previous) => {
            let changed = false;
            const next = previous.map((slot) => {
              if (slot.checking === false && slot.conflicts.length === 0) {
                return slot;
              }
              changed = true;
              return { ...slot, conflicts: [], checking: false };
            });
            return changed ? next : previous;
          },
          { shouldDirty: false },
        );
      }
    };

    void loadConflicts();
    return () => {
      cancelled = true;
    };
  }, [
    hasImmutableTimeSlots,
    resolvedOrganizationId,
    setLeagueSlots,
    slotConflictCheckKey,
  ]);

  const handleAddSlot = useCallback(
    (repeating: boolean = true) => {
      if (hasImmutableTimeSlots) {
        return;
      }
      clearErrors("leagueSlots");
      const created = createLeagueSlotForm(
        {
          repeating,
          startDate: repeating ? undefined : (eventStart ?? undefined),
          endDate: repeating ? undefined : (eventEnd ?? undefined),
          timeZone: eventTimeZone ?? undefined,
        },
        slotDivisionKeys,
        eventStart,
        eventEnd,
        eventTimeZone,
      );
      const normalized = repeating
        ? created
        : normalizeLeagueSlotUpdate({
            slot: created,
            updates: { repeating: false },
            eventStart,
            eventEnd,
            singleDivision,
            slotDivisionKeys,
            slotDivisionLookup,
          });
      updateLeagueSlots((previous) => [...previous, normalized]);
    },
    [
      clearErrors,
      eventEnd,
      eventStart,
      eventTimeZone,
      hasImmutableTimeSlots,
      singleDivision,
      slotDivisionKeys,
      slotDivisionLookup,
      updateLeagueSlots,
    ],
  );

  const handleRemoveSlot = useCallback(
    (index: number) => {
      if (hasImmutableTimeSlots) {
        return;
      }
      updateLeagueSlots((previous) =>
        previous.filter((_, slotIndex) => slotIndex !== index),
      );
    },
    [hasImmutableTimeSlots, updateLeagueSlots],
  );

  const handleUpdateSlot = useCallback(
    (index: number, updates: Partial<LeagueSlotForm>) => {
      const allowRentalDivisionEditOnLockedSlots =
        hasExternalRentalField && !singleDivision;

      const allowRentalResourceEditOnLockedSlots =
        hasExternalRentalField && isResourceOnlyUpdate(updates);
      const allowUpdateOnLockedSlots =
        hasImmutableTimeSlots &&
        ((allowRentalDivisionEditOnLockedSlots &&
          isDivisionOnlyUpdate(updates)) ||
          allowRentalResourceEditOnLockedSlots);
      if (hasImmutableTimeSlots && !allowUpdateOnLockedSlots) {
        return;
      }

      const current = leagueSlots[index];
      if (!current) {
        return;
      }
      const updated = normalizeLeagueSlotUpdate({
        slot: current,
        updates,
        eventStart,
        eventEnd,
        singleDivision,
        slotDivisionKeys,
        slotDivisionLookup,
      });
      const replaceSlot = (previous: LeagueSlotForm[]) => {
        const next = [...previous];
        next[index] = updated;
        return next;
      };

      if (allowUpdateOnLockedSlots) {
        setLeagueSlots(
          (previous) =>
            normalizeSlotState(
              replaceSlot(previous),
              eventType,
              parentEvent,
              slotValidationContext,
            ),
          { shouldValidate: false },
        );
      } else {
        updateLeagueSlots(replaceSlot, { shouldValidate: false });
      }
      clearErrors("leagueSlots");
    },
    [
      clearErrors,
      eventEnd,
      eventStart,
      eventType,
      hasExternalRentalField,
      hasImmutableTimeSlots,
      leagueSlots,
      parentEvent,
      setLeagueSlots,
      singleDivision,
      slotDivisionKeys,
      slotDivisionLookup,
      slotValidationContext,
      updateLeagueSlots,
    ],
  );
  const handleCreateCalendarSelection = useCallback(
    (selection: EventCalendarSelection) => {
      if (hasImmutableTimeSlots) {
        return;
      }
      const timeZone = eventTimeZone ?? "UTC";
      const details = resolveCalendarSelectionDetails(
        selection,
        timeZone,
        isUnscheduledCompetition(eventType, isAutomatedScheduling),
      );
      if (!details) {
        return;
      }
      if (isUnscheduledCompetition(eventType, isAutomatedScheduling)) {
        setValue("start", details.startDate, { shouldDirty: true, shouldValidate: true });
        setValue("end", details.endDate, { shouldDirty: true, shouldValidate: true });
        setValue("noFixedEndDateTime", false, { shouldDirty: true, shouldValidate: true });
        clearErrors("leagueSlots");
        return;
      }
      const created = buildCalendarSelectionSlot({
        details,
        eventEnd,
        eventStart,
        eventType,
        leagueSlots,
        parentEvent,
        resourceId: selection.resourceId,
        slotDivisionKeys,
        timeZone,
      });
      clearErrors("leagueSlots");
      updateLeagueSlots((previous) => {
        const hasOnlyPlaceholder =
          previous.length === 1 &&
          !slotHasCalendarConfiguration(previous[0]);
        return hasOnlyPlaceholder ? [created] : [...previous, created];
      });
    },
    [
      clearErrors,
      eventEnd,
      eventStart,
      eventTimeZone,
      eventType,
      hasImmutableTimeSlots,
      isAutomatedScheduling,
      leagueSlots,
      parentEvent,
      setValue,
      slotDivisionKeys,
      updateLeagueSlots,
    ],
  );
  const updateCalendarSlotRange = useCallback(
    (
      entry: CalendarSlotMutationEntry,
      range: CalendarSlotMutationRange,
    ) => {
      if (hasImmutableTimeSlots) {
        return;
      }
      const slot = leagueSlots[entry.slotIndex];
      if (!slot) {
        return;
      }
      const updates = buildCalendarSlotRangeUpdates(
        slot,
        entry,
        range,
        eventTimeZone,
      );
      if (!updates) {
        return;
      }
      handleUpdateSlot(entry.slotIndex, updates);
    },
    [
      eventTimeZone,
      handleUpdateSlot,
      hasImmutableTimeSlots,
      leagueSlots,
    ],
  );
  const handleMoveCalendarSlot = useCallback(
    (entry: CalendarSlotMutationEntry, range: CalendarSlotMutationRange) => {
      updateCalendarSlotRange(entry, range);
    },
    [updateCalendarSlotRange],
  );
  const handleResizeCalendarSlot = useCallback(
    (entry: CalendarSlotMutationEntry, range: CalendarSlotMutationRange) => {
      updateCalendarSlotRange(entry, range);
    },
    [updateCalendarSlotRange],
  );


  const handleAssignCalendarResource = useCallback(
    (index: number, resourceId: string) => {
      const normalizedResourceId = resourceId.trim();
      if (!normalizedResourceId || hasImmutableTimeSlots) {
        return;
      }
      const slot = leagueSlots[index];
      if (!slot) {
        return;
      }
      const resourceIds = Array.from(
        new Set([...normalizeSlotFieldIds(slot), normalizedResourceId]),
      );
      handleUpdateSlot(index, {
        scheduledFieldId: resourceIds[0],
        scheduledFieldIds: resourceIds,
        error: undefined,
      });
    },
    [handleUpdateSlot, hasImmutableTimeSlots, leagueSlots],
  );

  const handleAutoResolveSlotConflict = useCallback(
    (index: number) => {
      if (hasImmutableTimeSlots) {
        return;
      }
      const slot = leagueSlots[index];
      if (!slot || slot.conflicts.length === 0) {
        return;
      }
      const updates = buildAutoResolvedSlotUpdate(slot, slotConflictContext);
      if (updates) {
        handleUpdateSlot(index, updates);
      }
    },
    [handleUpdateSlot, hasImmutableTimeSlots, leagueSlots, slotConflictContext],
  );

  const scheduleInitializationKey = [
    activeEditingEvent?.$id ?? "create",
    eventType,
    parentEvent ?? "",
    eventSupportsScheduleSlots ? "supported" : "unsupported",
    isAutomatedScheduling === false ? "manual" : "automatic",
  ].join(":");

  useEffect(() => {
    if (isEditMode || hasImmutableTimeSlots) {
      return;
    }
    if (scheduleInitializationKeyRef.current === scheduleInitializationKey) {
      return;
    }
    scheduleInitializationKeyRef.current = scheduleInitializationKey;
    if (leagueSlots.some(slotHasCalendarConfiguration)) {
      return;
    }
    if (
      activeEditingEvent &&
      supportsScheduleSlotsForEvent(
        activeEditingEvent.eventType,
        activeEditingEvent.parentEvent,
      )
    ) {
      applyActiveEventScheduleDefaults(
        activeEditingEvent,
        setLeagueData,
        setPlayoffData,
      );
      const initialSlots = buildActiveEventScheduleSlots(
        activeEditingEvent,
        eventType,
        isAutomatedScheduling,
        slotDivisionKeysRef.current,
      );
      setLeagueSlots(
        normalizeSlotState(
          initialSlots,
          activeEditingEvent.eventType,
          activeEditingEvent.parentEvent,
          slotValidationContext,
        ),
        { shouldDirty: false },
      );
      return;
    }
    if (!activeEditingEvent) {
      applyCreateScheduleDefaults(setLeagueData, setPlayoffData);
      const initialSlots = isUnscheduledCompetition(
        eventType,
        isAutomatedScheduling,
      )
        ? []
        : [createLeagueSlotForm(undefined, slotDivisionKeysRef.current)];
      setLeagueSlots(
        normalizeSlotState(
          initialSlots,
          eventType,
          undefined,
          slotValidationContext,
        ),
        { shouldDirty: false },
      );
    }
  }, [
    activeEditingEvent,
    eventSupportsScheduleSlots,
    eventType,
    hasImmutableTimeSlots,
    isAutomatedScheduling,
    isEditMode,
    leagueSlots,
    parentEvent,
    scheduleInitializationKey,
    setLeagueData,
    setLeagueSlots,
    setPlayoffData,
    slotValidationContext,
  ]);

  useEffect(() => {
    if (!hasImmutableTimeSlots) {
      return;
    }
    const fallbackFieldId = immutableFields[0]?.$id;
    const slotForms = mergeSlotPayloadsForForm(
      immutableTimeSlots,
      fallbackFieldId,
    ).map((slot) =>
      createLeagueSlotForm(
        slot,
        slotDivisionKeysRef.current,
        eventStart,
        eventEnd,
      ),
    );
    const normalizedSlots = normalizeSlotState(
      slotForms,
      eventType,
      parentEvent,
      slotValidationContext,
    );
    setLeagueSlots(
      (previous) =>
        leagueSlotsEqual(previous, normalizedSlots)
          ? previous
          : normalizedSlots,
      { shouldDirty: false },
    );
  }, [
    eventEnd,
    eventStart,
    eventType,
    hasImmutableTimeSlots,
    immutableFields,
    immutableTimeSlots,
    parentEvent,
    setLeagueSlots,
    slotValidationContext,
  ]);


  useEffect(() => {
    const previousMode = previousEditableScheduleModeRef.current;
    previousEditableScheduleModeRef.current = eventSupportsScheduleSlots;
    if (
      previousMode === null ||
      previousMode === eventSupportsScheduleSlots ||
      !eventSupportsScheduleSlots
    ) {
      return;
    }
    if (!rentalLockedSlotsForDraft.length) {
      return;
    }

    setLeagueSlots(
      (previousSlots) => {
        const seededFromRentalDefaults =
          previousSlots.length > 0 &&
          previousSlots.every((slot) =>
            rentalLockedSlotsForDraft.some((lockedSlot) =>
              slotMatchesLockedRental(slot, lockedSlot),
            ),
          );
        if (!seededFromRentalDefaults) {
          return previousSlots;
        }
        return normalizeSlotState(
          [
            createLeagueSlotForm(
              undefined,
              slotDivisionKeysRef.current,
              eventStart,
              eventEnd,
              eventTimeZone,
            ),
          ],
          eventType,
          parentEvent,
        );
      },
      { shouldDirty: false },
    );
  }, [
    eventEnd,
    eventStart,
    eventSupportsScheduleSlots,
    eventTimeZone,
    eventType,
    parentEvent,
    rentalLockedSlotsForDraft,
    setLeagueSlots,
  ]);

  useEffect(() => {
    updateLeagueSlots((previous) => previous, { shouldDirty: false });
  }, [eventType, updateLeagueSlots]);

  const leagueWarning = useMemo(
    () =>
      buildLeagueScheduleWarning({
        hasPendingExternalConflictChecks,
        hasExternalSlotConflictWarnings,
        resourceLabels,
      }),
    [
      hasExternalSlotConflictWarnings,
      hasPendingExternalConflictChecks,
      resourceLabels,
    ],
  );

  return {
    handleAddSlot,
    handleAssignCalendarResource,
    handleAutoResolveSlotConflict,
    handleCreateCalendarSelection,
    handleMoveCalendarSlot,
    handleRemoveSlot,
    handleResizeCalendarSlot,
    handleUpdateSlot,
    leagueWarning,
  };
};
