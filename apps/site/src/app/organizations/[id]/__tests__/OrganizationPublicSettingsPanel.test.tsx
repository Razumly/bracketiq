import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import type { Event, Organization } from "@/types";
import { eventService } from "@/lib/eventService";
import OrganizationPublicSettingsPanel, { WidgetEventSearchPicker } from "../OrganizationPublicSettingsPanel";

jest.mock("@/lib/eventService", () => ({
  eventService: {
    getEventsPaginated: jest.fn(),
  },
}));

const getEventsPaginatedMock = eventService.getEventsPaginated as jest.Mock;

it("keeps edited public page content when organization data refreshes", () => {
  const organization = { $id: 'org_1', name: 'River City', publicSlug: 'river-city', publicHeadline: 'Welcome to River City' } as Organization;
  const onUpdated = jest.fn();
  const { rerender } = render(<OrganizationPublicSettingsPanel organization={organization} onUpdated={onUpdated} />);
  const headline = screen.getByRole('textbox', { name: 'Public headline' });
  headline.focus();
  fireEvent.change(headline, { target: { value: 'A new season' } });
  rerender(<OrganizationPublicSettingsPanel organization={{ ...organization, publicHeadline: 'Server headline' }} onUpdated={onUpdated} />);
  expect(headline).toHaveFocus();
  expect(headline).toHaveValue('A new season');
  rerender(<OrganizationPublicSettingsPanel organization={{ ...organization, $id: 'org_2', publicHeadline: 'Second club' }} onUpdated={onUpdated} />);
  expect(headline).toHaveValue('Second club');
});

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
  it("scopes responses to the active organization and event types", async () => {
    jest.useFakeTimers();
    const oldScope = deferred<Event[]>();
    const organizationScope = deferred<Event[]>();
    const currentScope = deferred<Event[]>();
    getEventsPaginatedMock
      .mockReturnValueOnce(oldScope.promise)
      .mockReturnValueOnce(organizationScope.promise)
      .mockReturnValueOnce(currentScope.promise);

    const view = render(
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
    fireEvent.change(input, { target: { value: "league" } });
    expect(getEventsPaginatedMock).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(250);
    });

    view.rerender(
      <MantineProvider>
        <WidgetEventSearchPicker
          label="Event search"
          description="Find an event"
          organizationId="org_2"
          eventTypes={["EVENT"]}
          selectedEvents={[]}
          onChange={jest.fn()}
        />
      </MantineProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(250);
    });

    view.rerender(
      <MantineProvider>
        <WidgetEventSearchPicker
          label="Event search"
          description="Find an event"
          organizationId="org_2"
          eventTypes={["TOURNAMENT"]}
          selectedEvents={[]}
          onChange={jest.fn()}
        />
      </MantineProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(250);
    });

    await act(async () => {
      oldScope.resolve([buildEvent("event_old", "Old organization event")]);
      await Promise.resolve();
    });
    expect(
      screen.queryByText("Old organization event"),
    ).not.toBeInTheDocument();

    await act(async () => {
      organizationScope.resolve([
        buildEvent("event_org", "Current organization event"),
      ]);
      await Promise.resolve();
    });
    expect(
      screen.queryByText("Current organization event"),
    ).not.toBeInTheDocument();

    await act(async () => {
      currentScope.resolve([
        buildEvent("event_current", "Current filtered event"),
      ]);
      await Promise.resolve();
    });
    expect(screen.getByText("Current filtered event")).toBeInTheDocument();
    expect(getEventsPaginatedMock).toHaveBeenNthCalledWith(
      1,
      { query: "league", organizationId: "org_1", eventTypes: ["EVENT"] },
      8,
      0,
      "SOONEST",
    );
    expect(getEventsPaginatedMock).toHaveBeenNthCalledWith(
      2,
      { query: "league", organizationId: "org_2", eventTypes: ["EVENT"] },
      8,
      0,
      "SOONEST",
    );
    expect(getEventsPaginatedMock).toHaveBeenNthCalledWith(
      3,
      { query: "league", organizationId: "org_2", eventTypes: ["TOURNAMENT"] },
      8,
      0,
      "SOONEST",
    );
  });

  it("excludes selected events from active search results", async () => {
    jest.useFakeTimers();
    const selectedEvent = buildEvent("event_selected", "Already selected");
    const availableEvent = buildEvent("event_available", "Available event");
    getEventsPaginatedMock.mockResolvedValue([selectedEvent, availableEvent]);

    render(
      <MantineProvider>
        <WidgetEventSearchPicker
          label="Event search"
          description="Find an event"
          organizationId="org_1"
          eventTypes={["EVENT"]}
          selectedEvents={[
            {
              id: "event_selected",
              name: "Already selected",
              eventType: "EVENT",
              start: "2026-08-20T12:00:00.000Z",
            },
          ]}
          onChange={jest.fn()}
        />
      </MantineProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Event search" }), {
      target: { value: "event" },
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByText("Already selected")).toHaveLength(1);
    expect(screen.getByText("Available event")).toBeInTheDocument();
  });
});
