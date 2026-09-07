import type { ComponentProps } from "react";
import { Controller, useWatch, type Control } from "react-hook-form";
import { Checkbox, NumberInput, Stack } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";

import type { Event } from "@/types";
import { parseLocalDateTime } from "@/lib/dateUtils";

import type { EventFormValues } from "../formTypes";
import { AnimatedSection } from "../components/AnimatedSection";

type EventDetailsTimingControlsProps = {
  control: Control<EventFormValues>;
  eventType: Event["eventType"];
  startValue?: string;
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
  onStartChange: (value: Date) => void;
  onEndChange: (value: Date) => void;
  onNoFixedEndDateTimeChange: (checked: boolean) => void;
  showScheduleControls?: boolean;
  showRegistrationControls?: boolean;
  showGeneratedEndDateControl?: boolean;
};

export const EventDetailsTimingControls = ({
  control,
  eventType,
  startValue,
  noFixedEndDateTime,
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
  onEndChange,
  onNoFixedEndDateTimeChange,
  showScheduleControls = true,
  showRegistrationControls = true,
  showGeneratedEndDateControl = true,
}: EventDetailsTimingControlsProps) => {
  const generatedEndDateDisabled = isImmutableField("noFixedEndDateTime");
  const isAutomatedScheduling = useWatch({
    control,
    name: "isAutomatedScheduling",
  });
  const showAutomatedSchedulingControl =
    showScheduleControls && (eventType === "LEAGUE" || eventType === "TOURNAMENT");
  const isAutomatedSchedulingDisablesScheduleConstruction =
    eventType === "LEAGUE" || eventType === "TOURNAMENT";
  const showScheduleConstructionControls =
    showScheduleControls &&
    (!isAutomatedSchedulingDisablesScheduleConstruction ||
      isAutomatedScheduling !== false);
  return (
    <>
      {showAutomatedSchedulingControl ? (
        <div className="md:col-span-2">
          <Controller
            name="isAutomatedScheduling"
            control={control}
            render={({ field }) => (
              <Checkbox
                label="Automated Scheduling"
                description="Build the match schedule from the event setup when you create it."
                checked={Boolean(field.value)}
                disabled={isImmutableField("isAutomatedScheduling")}
                onChange={(event) => {
                  if (isImmutableField("isAutomatedScheduling")) return;
                  const checked = event.currentTarget.checked;
                  field.onChange(checked);
                }}
              />
            )}
          />
        </div>
      ) : null}
      {showScheduleConstructionControls ? (
        <div className="md:col-span-2">
          <Controller
            name="start"
            control={control}
            render={({ field }) => (
              <DateTimePicker
                label="Start Date & Time"
                valueFormat="MM/DD/YYYY hh:mm A"
                value={parseLocalDateTime(field.value)}
                styles={dateTimePickerStyles}
                disabled={isImmutableField("start")}
                onChange={(val) => {
                  if (isImmutableField("start")) return;
                  const parsed = parseLocalDateTime(
                    val as Date | string | null,
                  );
                  if (!parsed) return;
                  onStartChange(parsed);
                }}
                minDate={todaysDate}
                timePickerProps={{
                  withDropdown: true,
                  format: "12h",
                }}
                popoverProps={popoverProps}
                style={{ width: "100%" }}
              />
            )}
          />
        </div>
      ) : null}
      {showScheduleControls ? (
        <AnimatedSection
          in={
            eventType === "EVENT" ||
            eventType === "TRYOUT" ||
            supportsNoFixedEndDateTime
          }
          collapseClassName="md:col-span-2"
        >
          <Controller
            name="end"
            control={control}
            render={({ field, fieldState }) => (
              <div className="space-y-2">
                {!noFixedEndDateTime || !supportsNoFixedEndDateTime ? (
                  <DateTimePicker
                    label="End Date & Time"
                    valueFormat="MM/DD/YYYY hh:mm A"
                    value={parseLocalDateTime(field.value)}
                    styles={dateTimePickerStyles}
                    disabled={isImmutableField("end")}
                    onChange={(val) => {
                      if (isImmutableField("end")) return;
                      const parsed = parseLocalDateTime(
                        val as Date | string | null,
                      );
                      if (!parsed) return;
                      onEndChange(parsed);
                    }}
                    minDate={parseLocalDateTime(startValue) ?? todaysDate}
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
                  && (showScheduleConstructionControls || noFixedEndDateTime)
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
        </AnimatedSection>
      ) : null}
      {showRegistrationControls ? (
        <div className="md:col-span-2">
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
        <div className="md:col-span-2">
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
