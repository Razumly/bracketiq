import type { ComponentProps } from "react";
import { Controller, useWatch, type Control } from "react-hook-form";
import { Checkbox, NumberInput, Stack } from '@/components/organization/organization-operation-ui';
import { DateTimePicker } from '@/components/organization/organization-operation-ui';

import type { Event } from "@/types";
import {
  calendarDateInTimeZoneToInstant,
  instantToCalendarDateInTimeZone,
  parseDateTimeInTimeZone,
  parseLocalDateTime,
} from "@/lib/dateUtils";

import type { EventTimingSource } from "../hooks/useEventTimingSource";
import type { EventFormValues } from "../formTypes";
import { AnimatedSection } from "../components/AnimatedSection";

type EventDetailsTimingControlsProps = {
  control: Control<EventFormValues>;
  eventType: Event["eventType"];
  startValue?: string;
  eventTimeZone?: string | null;
  noFixedEndDateTime: boolean;
  supportsNoFixedEndDateTime: boolean;
  automaticRefundsAvailable: boolean;
  manualPaymentsEnabled: boolean;
  todaysDate: Date;
  maxStandardNumber: number;
  dateTimePickerStyles?: ComponentProps<typeof DateTimePicker>["styles"];
  numberInputStyles?: ComponentProps<typeof NumberInput>["styles"];
  popoverProps?: ComponentProps<typeof DateTimePicker>["popoverProps"];
  isImmutableField: (key: keyof Event) => boolean;
  startTimingSource?: EventTimingSource;
  endTimingSource?: EventTimingSource;
  onResetStartToCalendar?: () => void;
  onResetEndToCalendar?: () => void;
  scheduleBoundaryError?: string | null;
  scheduleBoundaryWarning?: string | null;
  onStartChange: (value: Date) => void;
  onEndChange: (value: Date) => void;
  onNoFixedEndDateTimeChange: (checked: boolean) => void;
  onAutomatedSchedulingChange?: (checked: boolean) => void;
  showAutomatedSchedulingControl?: boolean;
  showScheduleControls?: boolean;
  showRegistrationControls?: boolean;
  showGeneratedEndDateControl?: boolean;

  fieldColumnClassName?: string;
};
const normalizeEventTimeZone = (value: string | null | undefined): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "UTC";

const dateForEventTimeZone = (
  value: string | Date | null | undefined,
  timeZone: string,
): Date | null => {
  const parsed = parseDateTimeInTimeZone(value, timeZone);
  return parsed ? instantToCalendarDateInTimeZone(parsed, timeZone) : null;
};

const instantFromPickerValue = (
  value: Date | string | null,
  timeZone: string,
): Date | null => {
  const localDate = parseLocalDateTime(value);
  return localDate ? calendarDateInTimeZoneToInstant(localDate, timeZone) : null;
};

export const EventDetailsTimingControls = ({
  control,
  eventType,
  startValue,
  noFixedEndDateTime,
  eventTimeZone,
  supportsNoFixedEndDateTime,
  automaticRefundsAvailable,
  manualPaymentsEnabled,
  todaysDate,
  maxStandardNumber,
  dateTimePickerStyles,
  numberInputStyles,
  popoverProps,
  isImmutableField,
  onStartChange,
  startTimingSource,
  endTimingSource,
  onResetStartToCalendar,
  onResetEndToCalendar,
  scheduleBoundaryError,
  scheduleBoundaryWarning,
  onEndChange,
  onNoFixedEndDateTimeChange,
  onAutomatedSchedulingChange,
  showAutomatedSchedulingControl = true,
  showScheduleControls = true,
  showRegistrationControls = true,
  showGeneratedEndDateControl = true,
  fieldColumnClassName = "md:col-span-2",
}: EventDetailsTimingControlsProps) => {
  const normalizedEventTimeZone = normalizeEventTimeZone(eventTimeZone);
  const todaysDateInEventTimeZone =
    instantToCalendarDateInTimeZone(todaysDate, normalizedEventTimeZone) ?? todaysDate;
  const generatedEndDateDisabled = isImmutableField("noFixedEndDateTime");
  const isAutomatedScheduling = useWatch({
    control,
    name: "isAutomatedScheduling",
  });
  const shouldShowAutomatedSchedulingControl =
    showAutomatedSchedulingControl &&
    showScheduleControls &&
    (eventType === "LEAGUE" || eventType === "TOURNAMENT");
  const isAutomatedSchedulingDisablesScheduleConstruction =
    eventType === "LEAGUE" || eventType === "TOURNAMENT";
  const showScheduleConstructionControls =
    showScheduleControls &&
    (!isAutomatedSchedulingDisablesScheduleConstruction ||
      isAutomatedScheduling !== false);
  return (
    <>
      {shouldShowAutomatedSchedulingControl ? (
        <div className={fieldColumnClassName}>
          <Controller
            name="isAutomatedScheduling"
            control={control}
            render={({ field }) => (
              <Checkbox
                label="Automated Scheduling"
                description="Use the event setup when you build the match schedule."
                checked={Boolean(field.value)}
                disabled={isImmutableField("isAutomatedScheduling")}
                onChange={(event) => {
                  if (isImmutableField("isAutomatedScheduling")) return;
                  const checked = event.currentTarget.checked;
                  if (onAutomatedSchedulingChange) {
                    onAutomatedSchedulingChange(checked);
                  } else {
                    field.onChange(checked);
                  }
                }}
              />
            )}
          />
        </div>
      ) : null}
      {showScheduleControls ? (
        <div className={fieldColumnClassName}>
          <Controller
            name="start"
            control={control}
            render={({ field }) => (
              <DateTimePicker
                label="Start Date & Time"
                valueFormat="MM/DD/YYYY hh:mm A"
                value={dateForEventTimeZone(field.value, normalizedEventTimeZone)}
                styles={dateTimePickerStyles}
                disabled={isImmutableField("start")}
                onChange={(val) => {
                  if (isImmutableField("start")) return;
                  const parsed = instantFromPickerValue(
                    val as Date | string | null,
                    normalizedEventTimeZone,
                  );
                  if (!parsed) return;
                  onStartChange(parsed);
                }}
                minDate={todaysDateInEventTimeZone}
                timePickerProps={{
                  withDropdown: true,
                  format: "12h",
                }}
                popoverProps={popoverProps}
                style={{ width: "100%" }}
              />
            )}
          />
          {startTimingSource ? (
            <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <span role="status">
                {startTimingSource === "CALENDAR"
                  ? "Calendar-derived Start"
                  : "Organizer-controlled Start"}
              </span>
              {onResetStartToCalendar ? (
                <button
                  type="button"
                  className="font-medium text-blue-700 hover:underline"
                  onClick={onResetStartToCalendar}
                  disabled={isImmutableField("start")}
                >
                  Reset to calendar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {showScheduleControls ? (
        <AnimatedSection
          in={
            eventType === "EVENT" ||
            eventType === "TRYOUT" ||
            supportsNoFixedEndDateTime
          }
          collapseClassName={fieldColumnClassName}
        >
          <Controller
            name="end"
            control={control}
            render={({ field, fieldState }) => (
              <div className="space-y-2">
                {!noFixedEndDateTime || !supportsNoFixedEndDateTime || isAutomatedScheduling === false ? (
                  <DateTimePicker
                    label="End Date & Time"
                    valueFormat="MM/DD/YYYY hh:mm A"
                    value={dateForEventTimeZone(field.value, normalizedEventTimeZone)}
                    styles={dateTimePickerStyles}
                    disabled={isImmutableField("end")}
                    onChange={(val) => {
                      if (isImmutableField("end")) return;
                      const parsed = instantFromPickerValue(
                        val as Date | string | null,
                        normalizedEventTimeZone,
                      );
                      if (!parsed) return;
                      onEndChange(parsed);
                    }}
                    minDate={
                      dateForEventTimeZone(startValue, normalizedEventTimeZone)
                      ?? todaysDateInEventTimeZone
                    }
                    timePickerProps={{
                      withDropdown: true,
                      format: "12h",
                    }}
                    popoverProps={popoverProps}
                    style={{ width: "100%" }}
                    error={fieldState.error?.message as string | undefined}
                  />
                ) : null}
                {supportsNoFixedEndDateTime
                  && showScheduleConstructionControls
                  && showGeneratedEndDateControl ? (
                  <div className="space-y-1">
                    <Checkbox
                      size="xs"
                      label={
                        eventType === "WEEKLY_EVENT"
                          ? "No Planned End"
                          : "Set the end date during match generation"
                      }
                      description={
                        eventType === "WEEKLY_EVENT"
                          ? "Keep this Weekly Event open-ended. Clear this option to set a Planned End."
                          : "Use an open scheduling window now. The generated match schedule will determine the event end date."
                      }
                      checked={noFixedEndDateTime}
                      disabled={generatedEndDateDisabled || (!showScheduleConstructionControls && !noFixedEndDateTime)}
                      onChange={(event) => {
                        if (generatedEndDateDisabled) return;
                        onNoFixedEndDateTimeChange(event.currentTarget.checked);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          />
          {endTimingSource ? (
            <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <span role="status">
                {endTimingSource === "CALENDAR"
                  ? "Calendar-derived Planned End"
                  : "Organizer-controlled Planned End"}
              </span>
              {onResetEndToCalendar ? (
                <button
                  type="button"
                  className="font-medium text-blue-700 hover:underline"
                  onClick={onResetEndToCalendar}
                  disabled={isImmutableField("end")}
                >
                  Reset to calendar
                </button>
              ) : null}
            </div>
          ) : null}
          {scheduleBoundaryError ? (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {scheduleBoundaryError}
            </div>
          ) : null}
          {scheduleBoundaryWarning ? (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
            >
              {scheduleBoundaryWarning}
            </div>
          ) : null}
        </AnimatedSection>
      ) : null}
      {showRegistrationControls ? (
        <div className={fieldColumnClassName}>
          <Controller
            name="registrationCutoffHours"
            control={control}
            render={({ field, fieldState }) => (
              <NumberInput
                label="Registration Cutoff (Hours)"
                min={0}
                max={maxStandardNumber}
                value={
                  typeof field.value === "number" && field.value > 0
                    ? field.value
                    : ""
                }
                w="100%"
                styles={numberInputStyles}
                clampBehavior="strict"
                disabled={isImmutableField("registrationCutoffHours")}
                onChange={(val) => {
                  if (isImmutableField("registrationCutoffHours")) return;
                  const numeric =
                    typeof val === "number" && Number.isFinite(val)
                      ? val
                      : Number(val);
                  field.onChange(
                    Number.isFinite(numeric)
                      ? Math.max(0, Math.trunc(numeric))
                      : 0,
                  );
                }}
                error={fieldState.error?.message as string | undefined}
              />
            )}
          />
        </div>
      ) : null}
      {showRegistrationControls ? (
        <div className={fieldColumnClassName}>
          <Controller
            name="cancellationRefundHours"
            control={control}
            render={({ field, fieldState }) => {
              const automaticRefundsChecked = field.value != null;
              const automaticRefundsImmutable = isImmutableField(
                "cancellationRefundHours",
              );
              const automaticRefundsInputDisabled =
                automaticRefundsImmutable ||
                manualPaymentsEnabled ||
                !automaticRefundsAvailable ||
                !automaticRefundsChecked;
              const automaticRefundsToggleDisabled =
                automaticRefundsImmutable ||
                manualPaymentsEnabled ||
                !automaticRefundsAvailable;

              return (
                <Stack gap={6}>
                  <NumberInput
                    label="Refund Cutoff (Hours)"
                    min={0}
                    max={maxStandardNumber}
                    value={
                      automaticRefundsChecked &&
                      typeof field.value === "number" &&
                      field.value > 0
                        ? field.value
                        : ""
                    }
                    w="100%"
                    styles={numberInputStyles}
                    clampBehavior="strict"
                    disabled={automaticRefundsInputDisabled}
                    onChange={(val) => {
                      if (automaticRefundsInputDisabled) return;
                      const numeric =
                        typeof val === "number" && Number.isFinite(val)
                          ? val
                          : Number(val);
                      field.onChange(
                        Number.isFinite(numeric)
                          ? Math.max(0, Math.trunc(numeric))
                          : 0,
                      );
                    }}
                    error={fieldState.error?.message as string | undefined}
                  />
                  <Checkbox
                    size="xs"
                    label="Automatic Refunds"
                    checked={automaticRefundsChecked}
                    disabled={automaticRefundsToggleDisabled}
                    onChange={(event) => {
                      if (automaticRefundsToggleDisabled) return;
                      field.onChange(
                        event.currentTarget.checked ? (field.value ?? 0) : null,
                      );
                    }}
                  />
                </Stack>
              );
            }}
          />
        </div>
      ) : null}
    </>
  );
};
