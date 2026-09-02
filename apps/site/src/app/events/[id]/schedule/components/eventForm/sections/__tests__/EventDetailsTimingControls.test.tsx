import { screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

import { renderWithMantine } from "../../../../../../../../../test/utils/renderWithMantine";
import type { EventFormValues } from "../../formTypes";
import { EventDetailsTimingControls } from "../EventDetailsTimingControls";

type TimingHarnessProps = {
  eventType?: EventFormValues["eventType"];
  supportsNoFixedEndDateTime?: boolean;
};

const TimingHarness = ({
  eventType = "LEAGUE",
  supportsNoFixedEndDateTime = true,
}: TimingHarnessProps = {}) => {
  const form = useForm<EventFormValues>({
    defaultValues: {
      eventType,
      start: new Date("2026-08-15T09:00:00"),
      end: new Date("2026-08-15T17:00:00"),
      noFixedEndDateTime: false,
    } as EventFormValues,
  });

  return (
    <EventDetailsTimingControls
      control={form.control}
      eventType={eventType}
      startValue={form.getValues("start")}
      noFixedEndDateTime={false}
      supportsNoFixedEndDateTime={supportsNoFixedEndDateTime}
      automaticRefundsAvailable={false}
      manualPaymentsEnabled={false}
      todaysDate={new Date("2026-08-01T00:00:00")}
      maxStandardNumber={999}
      isImmutableField={() => false}
      onStartChange={jest.fn()}
      onEndChange={jest.fn()}
      onNoFixedEndDateTimeChange={jest.fn()}
      showRegistrationControls={false}
      showGeneratedEndDateControl={false}
    />
  );
};

describe("EventDetailsTimingControls", () => {
  it("hides generated-end selection when the options page owns it", () => {
    renderWithMantine(<TimingHarness />);

    expect(
      screen.queryByLabelText("Set the end date during match generation"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("End Date & Time")).toBeInTheDocument();
  });

  it("shows a planned end for Tryouts without a no-end checkbox", () => {
    renderWithMantine(
      <TimingHarness
        eventType="TRYOUT"
        supportsNoFixedEndDateTime={false}
      />,
    );

    expect(screen.getByLabelText("End Date & Time")).toBeInTheDocument();
    expect(screen.queryByLabelText("No Planned End")).not.toBeInTheDocument();
  });
});
