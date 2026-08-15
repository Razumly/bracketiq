import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import type { Event } from "@/types";
import { eventService } from "@/lib/eventService";
import { WidgetEventSearchPicker } from "../OrganizationPublicSettingsPanel";

jest.mock("@/lib/eventService", () => ({
  eventService: {
    getEventsPaginated: jest.fn(),
  },
}));

const getEventsPaginatedMock = eventService.getEventsPaginated as jest.Mock;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const buildEvent = (id: string, name: string): Event =>
  ({
    $id: id,
    name,
    eventType: "EVENT",
    start: "2026-08-20T12:00:00.000Z",
  }) as unknown as Event;

describe("WidgetEventSearchPicker", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("does not reveal a late response from an obsolete query", async () => {
    jest.useFakeTimers();
    const oldQuery = deferred<Event[]>();
    const currentQuery = deferred<Event[]>();
    getEventsPaginatedMock
      .mockReturnValueOnce(oldQuery.promise)
      .mockReturnValueOnce(currentQuery.promise);

    render(
      <MantineProvider>
        <WidgetEventSearchPicker
          label="Event search"
          description="Find an event"
          organizationId="org_1"
          eventTypes={["EVENT"]}
          selectedEvents={[]}
          onChange={jest.fn()}
        />
      </MantineProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Event search" });
    fireEvent.change(input, { target: { value: "old" } });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(getEventsPaginatedMock).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "current" } });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(getEventsPaginatedMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      oldQuery.resolve([buildEvent("event_old", "Old event")]);
      await Promise.resolve();
    });
    expect(screen.queryByText("Old event")).not.toBeInTheDocument();

    await act(async () => {
      currentQuery.resolve([buildEvent("event_current", "Current event")]);
      await Promise.resolve();
    });
    expect(screen.getByText("Current event")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByText("Current event")).not.toBeInTheDocument();
  });
});
