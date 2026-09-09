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
  showAutomatedSchedulingControl?: boolean;
};
const TimingHarness = ({
  eventType = "LEAGUE",
  supportsNoFixedEndDateTime = true,
  hasGeneratedEnd = false,
  onPolicyChange = jest.fn(),
  showAutomatedSchedulingControl = true,
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
      showAutomatedSchedulingControl={showAutomatedSchedulingControl}
      showRegistrationControls={false}
      showGeneratedEndDateControl
    />
  );
};

describe("EventDetailsTimingControls", () => {
  it.each(['LEAGUE', 'TOURNAMENT'] as const)('keeps the event end visible after %s automation is disabled', (eventType) => {
    renderWithMantine(<TimingHarness eventType={eventType} hasGeneratedEnd />);
    fireEvent.click(screen.getByLabelText('Automated Scheduling'));

    expect(screen.getByRole('button', { name: 'Start Date & Time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End Date & Time' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Set the end date during match generation'),
    ).not.toBeInTheDocument();
  });

  it('can hide the automated scheduling control when the page already owns it', () => {
    renderWithMantine(
      <TimingHarness showAutomatedSchedulingControl={false} />,
    );

    expect(screen.queryByLabelText('Automated Scheduling')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Date & Time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End Date & Time' })).toBeInTheDocument();
  });
});
