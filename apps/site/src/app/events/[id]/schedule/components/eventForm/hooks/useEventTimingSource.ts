import { useCallback, useEffect, useMemo, useState } from "react";
import { useWatch, type Control } from "react-hook-form";

import type { Event, Match } from "@/types";
import {
  formatDateTimeInTimeZone,
  parseDateTimeInTimeZone,
} from "@/lib/dateUtils";

import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  computeOneTimeSlotBoundsError,
  computeRepeatingSlotBoundsError,
} from "../slotValidation";
import {
  deriveCalendarTimingFromSlots,
  type EventCalendarTiming,
} from "../eventResourceCalendar";
import type { EventFormValues } from "../formTypes";
import { normalizeSlotFieldIds, normalizeWeekdays } from "../slotForm";

export type EventTimingSource = "CALENDAR" | "ORGANIZER";

type TimingSources = {
  start: EventTimingSource;
  end: EventTimingSource;
};

type UseEventTimingSourceOptions = {
  activeEditingEvent?: Event | null;
  control: Control<EventFormValues>;
  eventEnd?: string | null;
  eventStart?: string | null;
  eventTimeZone?: string | null;
  eventType: Event["eventType"];
  eventSupportsScheduleSlots: boolean;
  isAutomatedScheduling?: boolean;
  isCreateMode: boolean;
  isImmutableField: (key: keyof Event) => boolean;
  leagueSlots: LeagueSlotForm[];
  noFixedEndDateTime: boolean;
  onNoFixedEndDateTimeChange: (checked: boolean) => void;
  setValue: TimingSetValue;
};
export type TimingFieldName = "start" | "end" | "noFixedEndDateTime";
export type TimingFieldValue = string | boolean;
export type TimingSetValueOptions = {
  shouldDirty?: boolean;
  shouldValidate?: boolean;
};
export type TimingSetValue = (
  fieldName: TimingFieldName,
  fieldValue: TimingFieldValue,
  fieldOptions: TimingSetValueOptions,
) => void;
export type EventTimingController = {
  endSource: EventTimingSource;
  handleEndChange: (value: Date) => void;
  handleNoFixedEndDateTimeChange: (checked: boolean) => void;
  handleStartChange: (value: Date) => void;
  resetEndToCalendar: () => void;
  resetStartToCalendar: () => void;
  scheduleBoundaryError: string | null;
  scheduleBoundaryWarning: string | null;
  startSource: EventTimingSource;
};

const setTimingFormValue = (
  setValue: TimingSetValue,
  name: TimingFieldName,
  value: TimingFieldValue,
  options: TimingSetValueOptions,
): void => {
  setValue(name, value, options);
};

const normalizeTimeZone = (value: string | null | undefined): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "UTC";

const parseBoundary = (
  value: string | null | undefined,
  timeZone: string,
): Date | null => parseDateTimeInTimeZone(value, timeZone);

const sameInstant = (
  left: string | null | undefined,
  right: Date | null,
  timeZone: string,
): boolean => {
  const parsedLeft = parseBoundary(left, timeZone);
  if (!parsedLeft || !right) {
    return false;
  }
  return parsedLeft.getTime() === right.getTime();
};

const hasConfiguredSlot = (slot: LeagueSlotForm): boolean =>
  Boolean(
    slot.$id ||
      normalizeSlotFieldIds(slot).length ||
      normalizeWeekdays(slot).length ||
      Number.isFinite(slot.startTimeMinutes) ||
      Number.isFinite(slot.endTimeMinutes) ||
      slot.startDate ||
      slot.endDate,
  );

type TimingSourceInferenceOptions = {
  activeEditingEvent?: Event | null;
  eventEnd?: string | null;
  eventStart?: string | null;
  eventTimeZone: string;
  isCreateMode: boolean;
  leagueSlots: LeagueSlotForm[];
  timing: EventCalendarTiming;
  noFixedEndDateTime: boolean;
};

const inferDefaultTimingSource = (
  options: Pick<TimingSourceInferenceOptions, "activeEditingEvent" | "isCreateMode">,
): EventTimingSource => {
  if (options.isCreateMode || !options.activeEditingEvent) {
    return "CALENDAR";
  }
  return "ORGANIZER";
};

const inferStartTimingSource = (
  options: Pick<TimingSourceInferenceOptions, "eventStart" | "eventTimeZone" | "timing">,
): EventTimingSource => (
  options.timing.start &&
  sameInstant(options.eventStart, options.timing.start, options.eventTimeZone)
    ? "CALENDAR"
    : "ORGANIZER"
);

const inferEndTimingSource = (
  options: Pick<
    TimingSourceInferenceOptions,
    "eventEnd" | "eventTimeZone" | "isCreateMode" | "noFixedEndDateTime" | "timing"
  >,
): EventTimingSource => {
  if (!options.timing.hasFiniteEnd) {
    if (options.isCreateMode || options.noFixedEndDateTime) {
      return "CALENDAR";
    }
    return "ORGANIZER";
  }
  if (
    options.timing.end &&
    sameInstant(options.eventEnd, options.timing.end, options.eventTimeZone)
  ) {
    return "CALENDAR";
  }
  return "ORGANIZER";
};

const inferTimingSources = (
  options: TimingSourceInferenceOptions,
): TimingSources => {
  if (!options.leagueSlots.some(hasConfiguredSlot)) {
    const defaultSource = inferDefaultTimingSource(options);
    return { start: defaultSource, end: defaultSource };
  }
  return {
    start: inferStartTimingSource(options),
    end: inferEndTimingSource(options),
  };
};
const formatBoundary = (value: Date, timeZone: string): string =>
  formatDateTimeInTimeZone(value, timeZone);

const matchIsOutsideBoundary = (
  match: Match,
  eventStart: Date | null,
  eventEnd: Date | null,
  timeZone: string,
): boolean => {
  const start = parseDateTimeInTimeZone(match.start, timeZone);
  const end = parseDateTimeInTimeZone(match.end, timeZone);
  if (eventStart && (!start || start.getTime() < eventStart.getTime())) {
    return true;
  }
  if (eventEnd && (!end || end.getTime() > eventEnd.getTime())) {
    return true;
  }
  return false;
};
const boundaryChanged = (
  initialValue: Date | null,
  currentValue: Date | null,
): boolean => {
  if (!initialValue || !currentValue) {
    return initialValue !== currentValue;
  }
  return initialValue.getTime() !== currentValue.getTime();
};
const buildBoundaryWarning = (options: {
  activeEditingEvent?: Event | null;
  endSource: EventTimingSource;
  eventEnd: string | null | undefined;
  eventStart: string | null | undefined;
  eventTimeZone: string;
  initialEventEnd: string | null | undefined;
  initialEventStart: string | null | undefined;
  startSource: EventTimingSource;
}): string | null => {
  const matches = options.activeEditingEvent?.matches;
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const currentStart = parseBoundary(options.eventStart, options.eventTimeZone);
  const currentEnd = parseBoundary(options.eventEnd, options.eventTimeZone);
  if (!currentStart && !currentEnd) return null;

  const initialStart = parseBoundary(
    options.initialEventStart,
    options.eventTimeZone,
  );
  const initialEnd = parseBoundary(
    options.initialEventEnd,
    options.eventTimeZone,
  );
  const changedBoundary =
    boundaryChanged(initialStart, currentStart) ||
    boundaryChanged(initialEnd, currentEnd);
  if (!changedBoundary) return null;
  const hasOutOfBoundsMatch = matches.some((match) =>
    matchIsOutsideBoundary(match, currentStart, currentEnd, options.eventTimeZone),
  );
  return hasOutOfBoundsMatch
    ? "Schedule Boundary Warning: Existing Matches remain outside the current Event boundary."
    : null;
};

type CalendarTimingSyncOptions = {
  currentEnd: string;
  currentNoFixedEnd: boolean;
  isImmutableField: (key: keyof Event) => boolean;
  setValue: TimingSetValue;
  sources: TimingSources;
  timing: EventCalendarTiming;
  writeBoundary: (name: "start" | "end", value: Date | null) => void;
};

const syncFiniteCalendarEnd = (options: CalendarTimingSyncOptions): void => {
  if (
    options.sources.end !== "CALENDAR" ||
    !options.timing.hasFiniteEnd ||
    !options.timing.end
  ) {
    return;
  }
  options.writeBoundary("end", options.timing.end);
  if (
    options.currentNoFixedEnd &&
    !options.isImmutableField("noFixedEndDateTime")
  ) {
    setTimingFormValue(options.setValue, "noFixedEndDateTime", false, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
};

const syncOpenCalendarEnd = (options: CalendarTimingSyncOptions): void => {
  if (
    options.sources.end !== "CALENDAR" ||
    !options.timing.start ||
    options.timing.hasFiniteEnd ||
    options.isImmutableField("noFixedEndDateTime")
  ) {
    return;
  }
  if (!options.currentNoFixedEnd) {
    setTimingFormValue(options.setValue, "noFixedEndDateTime", true, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  if (options.currentEnd && !options.isImmutableField("end")) {
    setTimingFormValue(options.setValue, "end", "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
};

const syncCalendarDerivedTiming = (
  options: CalendarTimingSyncOptions,
): void => {
  if (options.sources.start === "CALENDAR" && options.timing.start) {
    options.writeBoundary("start", options.timing.start);
  }
  syncFiniteCalendarEnd(options);
  syncOpenCalendarEnd(options);
};

type CurrentTimingValuesOptions = {
  eventEnd?: string | null;
  eventStart?: string | null;
  leagueSlots: LeagueSlotForm[];
  noFixedEndDateTime: boolean;
  watchedEnd?: string | null;
  watchedNoFixedEnd?: boolean | null;
  watchedSlots?: LeagueSlotForm[];
  watchedStart?: string | null;
};

const resolveCurrentTimingValues = (
  options: CurrentTimingValuesOptions,
): {
  currentEnd: string;
  currentNoFixedEnd: boolean;
  currentSlots: LeagueSlotForm[];
  currentStart: string;
} => ({
  currentEnd: options.watchedEnd ?? options.eventEnd ?? "",
  currentNoFixedEnd: Boolean(
    options.watchedNoFixedEnd ?? options.noFixedEndDateTime,
  ),
  currentSlots: options.watchedSlots ?? options.leagueSlots,
  currentStart: options.watchedStart ?? options.eventStart ?? "",
});

const resolveInitialBoundary = (
  activeValue: string | null | undefined,
  fallbackValue: string | null | undefined,
): string | null => activeValue ?? fallbackValue ?? null;

const buildTimingSourceKey = (
  isCreateMode: boolean,
  activeEditingEvent: Event | null | undefined,
  eventSupportsScheduleSlots: boolean,
): string =>
  `${isCreateMode ? "create" : activeEditingEvent?.$id ?? "event"}:${eventSupportsScheduleSlots ? "slots" : "boundaries"}`;

const resolveCalendarTiming = (options: {
  eventEnd: string;
  eventStart: string;
  eventSupportsScheduleSlots: boolean;
  eventTimeZone: string;
  eventType: Event["eventType"];
  isAutomatedScheduling?: boolean;
  leagueSlots: LeagueSlotForm[];
}): EventCalendarTiming =>
  options.eventSupportsScheduleSlots
    ? deriveCalendarTimingFromSlots({
        slots: options.leagueSlots,
        eventStart: options.eventStart,
        eventEnd: options.eventEnd,
        eventTimeZone: options.eventTimeZone,
        eventType: options.eventType,
        isAutomatedScheduling: options.isAutomatedScheduling,
        ignoreEventBounds: true,
      })
    : { start: null, end: null, hasFiniteEnd: false };

const resolveInitialTimingSources = (options: {
  activeEditingEvent?: Event | null;
  currentEnd: string;
  currentNoFixedEnd: boolean;
  currentStart: string;
  eventSupportsScheduleSlots: boolean;
  eventTimeZone: string;
  isCreateMode: boolean;
  leagueSlots: LeagueSlotForm[];
  timing: EventCalendarTiming;
}): TimingSources =>
  options.eventSupportsScheduleSlots
    ? inferTimingSources({
        activeEditingEvent: options.activeEditingEvent,
        eventEnd: options.currentEnd,
        eventStart: options.currentStart,
        eventTimeZone: options.eventTimeZone,
        isCreateMode: options.isCreateMode,
        leagueSlots: options.leagueSlots,
        noFixedEndDateTime: options.currentNoFixedEnd,
        timing: options.timing,
      })
    : { start: "ORGANIZER", end: "ORGANIZER" };

export const useEventTimingSource = ({
  activeEditingEvent,
  control,
  eventEnd,
  eventStart,
  eventTimeZone,
  eventType,
  eventSupportsScheduleSlots,
  isAutomatedScheduling,
  isCreateMode,
  isImmutableField,
  leagueSlots,
  noFixedEndDateTime,
  onNoFixedEndDateTimeChange,
  setValue,
}: UseEventTimingSourceOptions): EventTimingController => {
  const watchedStart = useWatch({ control, name: "start" });
  const watchedEnd = useWatch({ control, name: "end" });
  const watchedSlots = useWatch({ control, name: "leagueSlots" });
  const watchedNoFixedEnd = useWatch({
    control,
    name: "noFixedEndDateTime",
  });
  const currentTimingValues = resolveCurrentTimingValues({
    eventEnd,
    eventStart,
    leagueSlots,
    noFixedEndDateTime,
    watchedEnd,
    watchedNoFixedEnd,
    watchedSlots,
    watchedStart,
  });
  const {
    currentEnd,
    currentNoFixedEnd,
    currentSlots,
    currentStart,
  } = currentTimingValues;
  const timeZone = normalizeTimeZone(eventTimeZone);
  const sourceKey = buildTimingSourceKey(
    isCreateMode,
    activeEditingEvent,
    eventSupportsScheduleSlots,
  );
  const initialEventStart = resolveInitialBoundary(
    activeEditingEvent?.start,
    eventStart,
  );
  const initialEventEnd = resolveInitialBoundary(
    activeEditingEvent?.end,
    eventEnd,
  );
  const timing = useMemo(
    () =>
      resolveCalendarTiming({
        eventEnd: currentEnd,
        eventStart: currentStart,
        eventSupportsScheduleSlots,
        eventTimeZone: timeZone,
        eventType,
        isAutomatedScheduling,
        leagueSlots: currentSlots,
      }),
    [
      currentEnd,
      currentSlots,
      currentStart,
      eventSupportsScheduleSlots,
      eventType,
      isAutomatedScheduling,
      timeZone,
    ],
  );
  const initialSources: TimingSources = useMemo(
    () =>
      resolveInitialTimingSources({
        activeEditingEvent,
        currentEnd,
        currentNoFixedEnd,
        currentStart,
        eventSupportsScheduleSlots,
        eventTimeZone: timeZone,
        isCreateMode,
        leagueSlots: currentSlots,
        timing,
      }),
    [
      activeEditingEvent,
      currentEnd,
      currentNoFixedEnd,
      currentSlots,
      currentStart,
      eventSupportsScheduleSlots,
      isCreateMode,
      timeZone,
      timing,
    ],
  );
  const [sourceState, setSourceState] = useState<{
    key: string;
    sources: TimingSources;
  }>(() => ({ key: sourceKey, sources: initialSources }));
  const sourceKeyFallbackSources = useMemo<TimingSources>(
    () =>
      eventSupportsScheduleSlots
        ? { start: "CALENDAR", end: "CALENDAR" }
        : { start: "ORGANIZER", end: "ORGANIZER" },
    [eventSupportsScheduleSlots],
  );
  const sources =
    sourceState.key === sourceKey
      ? sourceState.sources
      : sourceKeyFallbackSources;

  const setSource = useCallback(
    (boundary: keyof TimingSources, source: EventTimingSource) => {
      setSourceState((current) => {
        const currentSources =
          current.key === sourceKey
            ? current.sources
            : sourceKeyFallbackSources;
        if (currentSources[boundary] === source) {
          return current;
        }
        return {
          key: sourceKey,
          sources: { ...currentSources, [boundary]: source },
        };
      });
    },
    [sourceKey, sourceKeyFallbackSources],
  );

  const writeBoundary = useCallback(
    (name: "start" | "end", value: Date | null) => {
      if (!value || isImmutableField(name)) return;
      const next = formatBoundary(value, timeZone);
      const current = name === "start" ? currentStart : currentEnd;
      if (sameInstant(current, value, timeZone)) return;
      setTimingFormValue(setValue, name, next, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [currentEnd, currentStart, isImmutableField, setValue, timeZone],
  );

  useEffect(() => {
    syncCalendarDerivedTiming({
      currentEnd,
      currentNoFixedEnd,
      isImmutableField,
      setValue,
      sources,
      timing,
      writeBoundary,
    });
  }, [
    currentEnd,
    currentNoFixedEnd,
    isImmutableField,
    setValue,
    sources,
    timing,
    writeBoundary,
  ]);

  const handleStartChange = useCallback(
    (value: Date) => {
      setSource("start", "ORGANIZER");
      writeBoundary("start", value);
    },
    [setSource, writeBoundary],
  );

  const handleEndChange = useCallback(
    (value: Date) => {
      setSource("end", "ORGANIZER");
      if (currentNoFixedEnd && !isImmutableField("noFixedEndDateTime")) {
        setTimingFormValue(setValue, "noFixedEndDateTime", false, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      writeBoundary("end", value);
    },
    [currentNoFixedEnd, isImmutableField, setSource, setValue, writeBoundary],
  );
  const handleNoFixedEndDateTimeChange = useCallback(
    (checked: boolean) => {
      setSource("end", "ORGANIZER");
      onNoFixedEndDateTimeChange(checked);
    },
    [onNoFixedEndDateTimeChange, setSource],
  );

  const resetStartToCalendar = useCallback(() => {
    if (isImmutableField("start")) return;
    const recalculated = deriveCalendarTimingFromSlots({
      slots: currentSlots,
      eventStart: currentStart,
      eventEnd: undefined,
      eventTimeZone: timeZone,
      eventType,
      isAutomatedScheduling,
      ignoreEventBounds: true,
    });
    setSource("start", "CALENDAR");
    if (!recalculated.start) return;
    writeBoundary("start", recalculated.start);
  }, [
    currentSlots,
    currentStart,
    eventType,
    isAutomatedScheduling,
    isImmutableField,
    setSource,
    timeZone,
    writeBoundary,
  ]);

  const resetEndToCalendar = useCallback(() => {
    if (isImmutableField("end")) return;
    const recalculated = deriveCalendarTimingFromSlots({
      slots: currentSlots,
      eventStart: currentStart,
      eventEnd: undefined,
      eventTimeZone: timeZone,
      eventType,
      isAutomatedScheduling,
      ignoreEventBounds: true,
    });
    setSource("end", "CALENDAR");
    if (!recalculated.start) return;
    if (recalculated.hasFiniteEnd && recalculated.end) {
      if (!isImmutableField("noFixedEndDateTime")) {
        setTimingFormValue(setValue, "noFixedEndDateTime", false, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      writeBoundary("end", recalculated.end);
      return;
    }
    if (!isImmutableField("noFixedEndDateTime")) {
      setTimingFormValue(setValue, "noFixedEndDateTime", true, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (!isImmutableField("end")) {
      setTimingFormValue(setValue, "end", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [
    currentSlots,
    currentStart,
    eventType,
    isAutomatedScheduling,
    isImmutableField,
    setSource,
    setValue,
    timeZone,
    writeBoundary,
  ]);

  const boundaryErrors = useMemo(() => {
    if (!eventSupportsScheduleSlots) return [] as string[];
    const parsedStart = parseBoundary(currentStart, timeZone);
    const parsedEnd = parseBoundary(currentEnd, timeZone);
    if (!parsedStart) return [] as string[];
    return currentSlots.flatMap((slot) => {
      if (!normalizeSlotFieldIds(slot).length) return [];
      const error =
        slot.repeating === false
          ? computeOneTimeSlotBoundsError({
              slot,
              eventStart: parsedStart,
              eventEnd: parsedEnd,
            })
          : computeRepeatingSlotBoundsError({
              slot,
              eventStart: parsedStart,
              eventEnd: parsedEnd,
            });
      return error ? [error] : [];
    });
  }, [currentEnd, currentSlots, currentStart, eventSupportsScheduleSlots, timeZone]);

  const scheduleBoundaryError =
    sources.start === "ORGANIZER" || sources.end === "ORGANIZER"
      ? boundaryErrors[0] ?? null
      : null;
  const scheduleBoundaryWarning = useMemo(
    () =>
      eventSupportsScheduleSlots
        ? buildBoundaryWarning({
            activeEditingEvent,
            endSource: sources.end,
            eventEnd: currentEnd,
            eventStart: currentStart,
            eventTimeZone: timeZone,
            initialEventEnd,
            initialEventStart,
            startSource: sources.start,
          })
        : null,
    [
      activeEditingEvent,
      currentEnd,
      currentStart,
      eventSupportsScheduleSlots,
      initialEventEnd,
      initialEventStart,
      sources.end,
      sources.start,
      timeZone,
    ],
  );

  return {
    endSource: sources.end,
    handleEndChange,
    handleNoFixedEndDateTimeChange,
    handleStartChange,
    resetEndToCalendar,
    resetStartToCalendar,
    scheduleBoundaryError,
    scheduleBoundaryWarning,
    startSource: sources.start,
  };
};
