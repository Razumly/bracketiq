import { act, renderHook, waitFor } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";

import type { EventFormValues } from "../../formTypes";
import type { Event } from "@/types";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import { useEventTimingSource, type EventTimingController, type TimingSetValue } from "../useEventTimingSource";

const slot = (overrides: Partial<LeagueSlotForm> = {}): LeagueSlotForm => ({
  key: "slot-1",
  timeZone: "UTC",
  scheduledFieldId: "field-1",
  scheduledFieldIds: ["field-1"],
  daysOfWeek: [0],
  dayOfWeek: 0,
  startDate: "2026-07-20T09:00",
  endDate: undefined,
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  repeating: true,
  divisions: [],
  conflicts: [],
  checking: false,
  ...overrides,
});

const buildValues = (overrides: Record<string, unknown> = {}): EventFormValues => ({
  $id: "event-1",
  eventType: "WEEKLY_EVENT",
  start: "2026-07-20T09:00",
  end: "",
  timeZone: "UTC",
  noFixedEndDateTime: false,
  isAutomatedScheduling: true,
  leagueSlots: [slot()],
  ...overrides,
} as unknown as EventFormValues);

type Harness = {
  form: UseFormReturn<EventFormValues>;
  timing: EventTimingController;
};

type TimingHarnessOptions = {
  activeEditingEvent?: Event | null;
  eventSupportsScheduleSlots?: boolean;
  eventType?: EventFormValues["eventType"];
  isCreateMode?: boolean;
};

const useTimingHarness = (
  values: EventFormValues,
  options: TimingHarnessOptions = {},
): Harness => {
  const form = useForm<EventFormValues>({ defaultValues: values });
  const setValue = ((name, value, options) => {
    form.setValue(name, value as never, options);
  }) as TimingSetValue;
  const onNoFixedEndDateTimeChange = (checked: boolean) => {
    form.setValue("noFixedEndDateTime", checked, { shouldDirty: true });
    if (!checked) {
      form.setValue("end", "", { shouldDirty: true });
    }
  };
  const timing = useEventTimingSource({
    activeEditingEvent: options.activeEditingEvent ?? null,
    control: form.control,
    eventEnd: values.end,
    eventStart: values.start,
    eventTimeZone: values.timeZone,
    eventType: options.eventType ?? values.eventType,
    eventSupportsScheduleSlots: options.eventSupportsScheduleSlots ?? true,
    isAutomatedScheduling: values.isAutomatedScheduling,
    isCreateMode: options.isCreateMode ?? true,
    isImmutableField: () => false,
    leagueSlots: values.leagueSlots,
    noFixedEndDateTime: values.noFixedEndDateTime,
    onNoFixedEndDateTimeChange,
    setValue,
  });
  return { form, timing };
};

describe("useEventTimingSource", () => {
  it("makes an open calendar-derived end an explicit no-Planned-End policy", async () => {
    const { result } = renderHook(() =>
      useTimingHarness(buildValues({ end: "2026-07-20T18:00" })),
    );

    await waitFor(() => {
      expect(result.current.form.getValues("noFixedEndDateTime")).toBe(true);
    });
    expect(result.current.form.getValues("end")).toBe("");
    expect(result.current.timing.endSource).toBe("CALENDAR");
  });
  it("reinitializes timing ownership when a form enters slot scheduling", async () => {
    const values = buildValues({
      end: "2026-07-20T18:00",
      eventType: "EVENT",
      leagueSlots: [],
      noFixedEndDateTime: false,
    });
    const initialProps: {
      eventSupportsScheduleSlots: boolean;
      eventType: EventFormValues["eventType"];
    } = {
      eventSupportsScheduleSlots: false,
      eventType: "EVENT",
    };
    const { result, rerender } = renderHook(
      (props: typeof initialProps) => useTimingHarness(values, props),
      { initialProps },
    );

    expect(result.current.timing.startSource).toBe("ORGANIZER");
    expect(result.current.timing.endSource).toBe("ORGANIZER");

    rerender({
      eventSupportsScheduleSlots: true,
      eventType: "LEAGUE",
    });

    await waitFor(() => {
      expect(result.current.timing.startSource).toBe("CALENDAR");
      expect(result.current.timing.endSource).toBe("CALENDAR");
    });
    act(() => {
      result.current.form.setValue(
        "leagueSlots",
        [
          slot({
            dayOfWeek: 0,
            daysOfWeek: [0],
            endTimeMinutes: 11 * 60,
            startTimeMinutes: 10 * 60,
          }),
        ],
        { shouldDirty: true },
      );
    });
    await waitFor(() => {
      expect(result.current.form.getValues("start")).toBe("2026-07-20T10:00:00");
    });
    expect(result.current.timing.startSource).toBe("CALENDAR");
  });

  it("changes and resets Start without changing the independent End boundary", async () => {
    const values = buildValues({
      eventType: "TRYOUT",
      start: "2026-07-20T08:00",
      end: "2026-07-20T12:00",
      noFixedEndDateTime: false,
      leagueSlots: [slot({
        repeating: false,
        startDate: "2026-07-20T09:00",
        endDate: "2026-07-20T10:00",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
      })],
    });
    const { result } = renderHook(() => useTimingHarness(values));

    act(() => {
      result.current.timing.handleStartChange(new Date("2026-07-20T08:30:00.000Z"));
    });
    expect(result.current.form.getValues("start")).toBe("2026-07-20T08:30:00");
    expect(result.current.form.getValues("end")).toBe("2026-07-20T12:00");
    expect(result.current.timing.startSource).toBe("ORGANIZER");

    act(() => {
      result.current.timing.resetStartToCalendar();
    });
    await waitFor(() => {
      expect(result.current.form.getValues("start")).toBe("2026-07-20T09:00:00");
    });
    expect(result.current.form.getValues("end")).toBe("2026-07-20T12:00");
    expect(result.current.timing.startSource).toBe("CALENDAR");
    expect(result.current.timing.endSource).toBe("ORGANIZER");
  });
  it("clears Start ownership when no valid calendar timing exists", async () => {
    const values = buildValues({
      eventType: "TRYOUT",
      start: "2026-07-20T08:00",
      end: "2026-07-20T12:00",
      noFixedEndDateTime: false,
      leagueSlots: [slot({
        repeating: false,
        startDate: "2026-07-20T09:00",
        endDate: "2026-07-20T10:00",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
      })],
    });
    const { result } = renderHook(() => useTimingHarness(values));

    expect(result.current.timing.startSource).toBe("ORGANIZER");
    act(() => {
      result.current.form.setValue("leagueSlots", [], { shouldDirty: true });
    });
    await waitFor(() => {
      expect(result.current.form.getValues("leagueSlots")).toEqual([]);
    });

    act(() => {
      result.current.timing.resetStartToCalendar();
    });
    expect(result.current.timing.startSource).toBe("CALENDAR");
    expect(result.current.form.getValues("start")).toBe("2026-07-20T08:00");
    act(() => {
      result.current.timing.resetEndToCalendar();
    });
    expect(result.current.timing.endSource).toBe("CALENDAR");
    expect(result.current.form.getValues("end")).toBe("2026-07-20T12:00");

    act(() => {
      result.current.form.setValue("leagueSlots", [slot({
        repeating: false,
        startDate: "2026-07-20T09:00",
        endDate: "2026-07-20T10:00",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
      })], { shouldDirty: true });
    });
    await waitFor(() => {
      expect(result.current.form.getValues("start")).toBe("2026-07-20T09:00:00");
    });
  });
  it("warns when an existing Match remains outside a changed Event boundary", async () => {
    const activeEditingEvent = {
      $id: "event-1",
      start: "2026-07-20T09:00",
      end: "2026-07-20T18:00",
      matches: [
        {
          start: "2026-07-20T10:00",
          end: "2026-07-20T13:00",
        },
      ],
    } as unknown as Event;
    const { result } = renderHook(() =>
      useTimingHarness(
        buildValues({ eventType: "TRYOUT", end: "2026-07-20T18:00" }),
        { activeEditingEvent, isCreateMode: false },
      ),
    );

    act(() => {
      result.current.form.setValue("end", "2026-07-20T12:00");
    });

    await waitFor(() => {
      expect(result.current.timing.scheduleBoundaryWarning).toBe(
        "Schedule Boundary Warning: Existing Matches remain outside the current Event boundary.",
      );
    });
  });
});
