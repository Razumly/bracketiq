import { fireEvent, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

import { renderWithMantine } from "../../../../../../../../../test/utils/renderWithMantine";
import type { EventFormValues } from "../../formTypes";
import { EventDetailsTimingControls } from "../EventDetailsTimingControls";

type TimingHarnessProps = {
  eventType?: EventFormValues["eventType"];
  supportsNoFixedEndDateTime?: boolean;
  hasGeneratedEnd?: boolean;
  onPolicyChange?: (value: boolean) => void;
};

const TimingHarness = ({
  eventType = "LEAGUE",
  supportsNoFixedEndDateTime = true,
  hasGeneratedEnd = false,
  onPolicyChange = jest.fn(),
}: TimingHarnessProps = {}) => {
  const form = useForm<EventFormValues>({
    defaultValues: {
      eventType,
      start: new Date("2026-08-15T09:00:00"),
      end: new Date("2026-08-15T17:00:00"),
      noFixedEndDateTime: hasGeneratedEnd,
      isAutomatedScheduling: true,
    } as EventFormValues,
  });

  return (
    <EventDetailsTimingControls
      control={form.control}
      eventType={eventType}
      startValue={form.getValues("start")}
      noFixedEndDateTime={hasGeneratedEnd}
      supportsNoFixedEndDateTime={supportsNoFixedEndDateTime}
      automaticRefundsAvailable={false}
      manualPaymentsEnabled={false}
      todaysDate={new Date("2026-08-01T00:00:00")}
      maxStandardNumber={999}
      isImmutableField={() => false}
      onStartChange={jest.fn()}
      onEndChange={jest.fn()}
      onNoFixedEndDateTimeChange={onPolicyChange}
      showRegistrationControls={false}
      showGeneratedEndDateControl
    />
  );
};

describe("EventDetailsTimingControls", () => {
  it.each(['LEAGUE', 'TOURNAMENT'] as const)('preserves the selected policy when %s automation is disabled', (eventType) => {
    const onPolicyChange = jest.fn();
    renderWithMantine(<TimingHarness eventType={eventType} hasGeneratedEnd onPolicyChange={onPolicyChange} />);
    fireEvent.click(screen.getByLabelText('Automated Scheduling'));
    expect(screen.getByLabelText('Automated Scheduling')).not.toBeChecked();
    expect(screen.getByLabelText('Set the end date during match generation')).toBeChecked();
    expect(onPolicyChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Set the end date during match generation'));
    expect(onPolicyChange).toHaveBeenCalledWith(false);
  });
});
