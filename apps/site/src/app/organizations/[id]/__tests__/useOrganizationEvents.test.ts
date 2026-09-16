import { act, renderHook, waitFor } from "@testing-library/react";
import { eventService } from "@/lib/eventService";
import type { Event } from "@/types";
import { createSport } from "@/types/defaults";
import {
  buildOrganizationEventQuery,
  ORGANIZATION_EVENT_TYPES,
  readOrganizationEventCache,
  type OrganizationEventFilters,
} from "../organizationEventSource";
import { useOrganizationEvents } from "../useOrganizationEvents";

jest.mock("@/lib/eventService", () => ({
  eventService: {
    getEventsPaginated: jest.fn(),
    getEventsForFieldInRange: jest.fn(),
  },
}));

const getHosted = jest.mocked(eventService.getEventsPaginated);
const getFieldEvents = jest.mocked(eventService.getEventsForFieldInRange);
const filters: OrganizationEventFilters = {
  searchTerm: "",
  selectedEventTypes: [...ORGANIZATION_EVENT_TYPES],
  selectedSports: [],
  selectedStartDate: null,
  selectedEndDate: null,
  location: null,
  maxDistance: null,
};
const options = {
  organizationId: "org_1",
  fields: [],
  hiddenEventIds: [],
  enabled: false,
  filters,
};

function event(id: string, overrides: Partial<Event> = {}): Event {
  return {
    $id: id,
    organizationId: "org_1",
    name: "League night",
    description: "",
    location: "Austin",
    coordinates: [-97.74, 30.27],
    sport: createSport({ name: "Basketball" }),
    ...overrides,
  } as Event;
}

function pendingEvents() {
  let resolve!: (events: Event[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Event[]>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  getHosted.mockReset().mockResolvedValue([]);
  getFieldEvents.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Organization event queries", () => {
  it("maps selected filters to the hosted query without treating rentals as a hosted type", () => {
    const query = buildOrganizationEventQuery(" org_1 ", {
      ...filters,
      searchTerm: "  League ",
      selectedEventTypes: ["LEAGUE", "RENTAL"],
      selectedSports: ["Basketball"],
      location: { lat: 30, lng: -97 },
      maxDistance: 40,
      selectedStartDate: new Date(2026, 8, 1, 13),
      selectedEndDate: new Date(2026, 8, 3, 13),
    });
    expect(query).toEqual({
      includesHosted: true,
      includesRentals: true,
      hasScopedEventCache: true,
      filters: {
        organizationId: "org_1",
        query: "League",
        eventTypes: ["LEAGUE"],
        includeWeeklyChildren: true,
        sports: ["Basketball"],
        userLocation: { lat: 30, lng: -97 },
        maxDistance: 40,
        dateFrom: new Date(2026, 8, 1).toISOString(),
        dateTo: new Date(2026, 8, 3, 23, 59, 59, 999).toISOString(),
      },
    });
  });

  it.each([
    { start: null, end: null, expected: new Date(2026, 8, 4) },
    { start: null, end: new Date(2026, 8, 1), expected: new Date(2026, 8, 1) },
    {
      start: new Date("invalid"),
      end: new Date("invalid"),
      expected: new Date(2026, 8, 4),
    },
  ])(
    "uses a valid start for unbounded, past, and invalid dates: $expected",
    ({ start, end, expected }) => {
      const query = buildOrganizationEventQuery(
        "org_1",
        {
          ...filters,
          selectedStartDate: start,
          selectedEndDate: end,
          maxDistance: 20,
        },
        new Date(2026, 8, 4, 15),
      );
      expect(query.filters.dateFrom).toBe(expected.toISOString());
      expect(query.filters.maxDistance).toBeUndefined();
      expect(query.filters.eventTypes).toBeUndefined();
    },
  );

  it("combines available field results and removes hosted duplicates from the rental classification", async () => {
    const rental = event("rental_1", { organizationId: "other_org" });
    getHosted.mockResolvedValue([event("hosted_1")]);
    getFieldEvents
      .mockResolvedValueOnce([rental, event("hosted_1")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        rental,
        event("rental_2", { organizationId: "other_org" }),
      ]);
    const cache = await readOrganizationEventCache(
      buildOrganizationEventQuery("org_1", filters),
      [
        { $id: " field_1 " },
        { $id: "field_1" },
        { $id: "field_2" },
        { $id: "field_3" },
        { $id: "" },
      ],
    );
    expect(getFieldEvents).toHaveBeenCalledTimes(3);
    expect(cache.events.map((row) => row.$id)).toEqual([
      "hosted_1",
      "rental_1",
      "rental_2",
    ]);
    expect(cache.rentalEventIds).toEqual(["rental_1", "rental_2"]);
    expect(cache.offset).toBe(1);
    expect(cache.hasMoreEvents).toBe(false);
  });

  it("reports rental load failures and preserves the existing cache until a successful retry", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    getHosted.mockResolvedValue([event("cached")]);
    const { result } = renderHook(() => useOrganizationEvents({ ...options, fields: [{ $id: "field_1" }] }));
    await act(() => result.current.reload());
    getHosted.mockResolvedValue([event("replacement")]);
    getFieldEvents.mockRejectedValueOnce(new Error("Field is unavailable"));
    await act(() => result.current.reload({ background: true }));
    expect(result.current.data.events.map((row) => row.$id)).toEqual(["cached"]);
    expect(result.current.data.eventsError).toBe("Failed to load events. Please try again.");
    await act(() => result.current.reload({ background: true }));
    expect(result.current.data.events.map((row) => row.$id)).toEqual(["replacement"]);
    expect(result.current.data.eventsError).toBeNull();
  });

  it.each(["address", "organizerName"] as const)("matches rental search against %s after a refresh", async (field) => {
    getFieldEvents.mockResolvedValue([event("matching", { organizationId: "other_org", [field]: "Unique search" })]);
    const cache = await readOrganizationEventCache(
      buildOrganizationEventQuery("org_1", { ...filters, searchTerm: "unique", selectedEventTypes: ["RENTAL"] }),
      [{ $id: "field_1" }],
    );
    expect(cache.events.map((row) => row.$id)).toEqual(["matching"]);
  });

  it("filters rental-only results by text, sport, and distance and retains unknown coordinates", async () => {
    const rental = (id: string, overrides: Partial<Event> = {}) =>
      event(id, { organizationId: "other_org", ...overrides });
    getFieldEvents.mockResolvedValue([
      rental("near"),
      rental("unknown", { coordinates: [] }),
      rental("far", { coordinates: [0, 0] }),
      rental("other_name", { name: "Practice" }),
      rental("other_sport", { sport: createSport({ name: "Tennis" }) }),
    ]);
    const query = buildOrganizationEventQuery("org_1", {
      ...filters,
      selectedEventTypes: ["RENTAL"],
      searchTerm: " LEAGUE ",
      selectedSports: [" basketball "],
      location: { lat: 30.27, lng: -97.74 },
      maxDistance: 10,
    });
    const cache = await readOrganizationEventCache(query, [{ $id: "field_1" }]);
    expect(getHosted).not.toHaveBeenCalled();
    expect(cache.events.map((row) => row.$id)).toEqual(["near", "unknown"]);
    expect(cache.hasMoreEvents).toBe(false);
    expect(cache.hasScopedEventCache).toBe(true);
  });
});

describe("Organization event cache", () => {
  it("keeps loaded events during a background refresh and ignores an older response", async () => {
    getHosted.mockResolvedValueOnce([event("cached")]);
    const { result } = renderHook(() => useOrganizationEvents(options));
    await act(async () => {
      await result.current.reload();
    });
    const older = pendingEvents();
    const newer = pendingEvents();
    getHosted
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.reload({ background: true });
    });
    expect(result.current.data.events[0].$id).toBe("cached");
    expect(result.current.data.isLoadingInitial).toBe(false);
    act(() => {
      second = result.current.reload({ background: true });
    });
    await act(async () => {
      newer.resolve([event("newer")]);
      await second;
    });
    await act(async () => {
      older.resolve([event("older")]);
      await first;
    });
    expect(result.current.data.events.map((row) => row.$id)).toEqual(["newer"]);
    expect(result.current.data.isLoadingInitial).toBe(false);
  });

  it("finishes initial loading when a background request supersedes it and ignores the old failure", async () => {
    const older = pendingEvents();
    getHosted
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce([event("newer")]);
    const { result } = renderHook(() => useOrganizationEvents(options));
    let first!: Promise<void>;
    act(() => {
      first = result.current.reload();
    });
    expect(result.current.data.isLoadingInitial).toBe(true);
    await act(async () => {
      await result.current.reload({ background: true });
    });
    await act(async () => {
      older.reject(new Error("Old request failed"));
      await first;
    });
    expect(result.current.data.isLoadingInitial).toBe(false);
    expect(result.current.data.events[0].$id).toBe("newer");
    expect(result.current.data.eventsError).toBeNull();
  });

  it("loads a page once, deduplicates its records, and advances by the server page size", async () => {
    const firstPage = Array.from({ length: 18 }, (_, index) =>
      event(`event_${index}`),
    );
    getHosted.mockResolvedValueOnce(firstPage);
    const { result } = renderHook(() =>
      useOrganizationEvents({ ...options, hiddenEventIds: ["event_0"] }),
    );
    await act(async () => {
      await result.current.reload();
    });
    const next = pendingEvents();
    getHosted.mockReturnValueOnce(next.promise);
    let more!: Promise<void>;
    act(() => {
      more = result.current.loadMore();
      void result.current.loadMore();
    });
    expect(getHosted).toHaveBeenCalledTimes(2);
    expect(getHosted).toHaveBeenLastCalledWith(
      expect.anything(),
      18,
      18,
      "SOONEST",
    );
    expect(result.current.data.isLoadingMore).toBe(true);
    await act(async () => {
      next.resolve([event("event_0"), event("event_1"), event("new")]);
      await more;
    });
    expect(result.current.data.events).toHaveLength(18);
    expect(result.current.data.events.map((row) => row.$id)).not.toContain(
      "event_0",
    );
    expect(result.current.data.events.at(-1)?.$id).toBe("new");
    expect(result.current.data.hasMoreEvents).toBe(false);
    expect(result.current.data.isLoadingMore).toBe(false);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(getHosted).toHaveBeenCalledTimes(2);
  });

  it("does not append an old next page after a filter refresh replaces the cache", async () => {
    getHosted.mockResolvedValueOnce(
      Array.from({ length: 18 }, (_, index) => event(`old_${index}`)),
    );
    const { result, rerender } = renderHook(
      (currentFilters) =>
        useOrganizationEvents({ ...options, filters: currentFilters }),
      { initialProps: filters },
    );
    await act(async () => {
      await result.current.reload();
    });
    const next = pendingEvents();
    getHosted
      .mockReturnValueOnce(next.promise)
      .mockResolvedValueOnce([event("matching")]);
    let more!: Promise<void>;
    act(() => {
      more = result.current.loadMore();
    });
    rerender({ ...filters, searchTerm: "matching" });
    await act(async () => {
      await result.current.reload({ background: true });
    });
    await act(async () => {
      next.resolve([event("stale")]);
      await more;
    });
    expect(result.current.data.events.map((row) => row.$id)).toEqual([
      "matching",
    ]);
    expect(result.current.data.hasScopedEventCache).toBe(true);
    expect(result.current.data.isLoadingMore).toBe(false);
    expect(getHosted).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "matching" }),
      18,
      0,
      "SOONEST",
    );
  });

  it("applies the latest hidden-event selection when an in-flight request returns", async () => {
    const pending = pendingEvents();
    getHosted.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      (hiddenEventIds: string[]) =>
        useOrganizationEvents({ ...options, hiddenEventIds }),
      { initialProps: [] },
    );
    let loading!: Promise<void>;
    act(() => {
      loading = result.current.reload();
    });
    rerender(["hidden"]);
    await act(async () => {
      pending.resolve([event("hidden"), event("visible")]);
      await loading;
    });
    expect(result.current.data.events.map((row) => row.$id)).toEqual([
      "visible",
    ]);
    rerender(["hidden", "visible"]);
    expect(result.current.data.events).toEqual([]);
  });

  it("waits for an enabled tab, leaves filter refreshes to the shared filter workflow, and invalidates another Organization", async () => {
    getHosted.mockResolvedValueOnce([event("loaded")]);
    const { result, rerender } = renderHook(
      (props) => useOrganizationEvents(props),
      { initialProps: options },
    );
    expect(getHosted).not.toHaveBeenCalled();
    rerender({ ...options, enabled: true });
    await waitFor(() =>
      expect(result.current.data.isLoadingInitial).toBe(false),
    );
    rerender({
      ...options,
      enabled: true,
      filters: { ...filters, searchTerm: "changed" },
    });
    expect(getHosted).toHaveBeenCalledTimes(1);
    const pending = pendingEvents();
    getHosted.mockReturnValueOnce(pending.promise);
    let loading!: Promise<void>;
    act(() => {
      loading = result.current.reload({ background: true });
    });
    rerender({ ...options, organizationId: "org_2" });
    await act(async () => {
      pending.resolve([event("old_org")]);
      await loading;
    });
    expect(result.current.data.events).toEqual([]);
    expect(result.current.data.isLoadingInitial).toBe(true);
  });

  it("retains the cache after a failed refresh and replaces it after a retry", async () => {
    getHosted
      .mockResolvedValueOnce([event("cached")])
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([event("retried")]);
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useOrganizationEvents(options));
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      await result.current.reload({ background: true });
    });
    expect(result.current.data.events[0].$id).toBe("cached");
    expect(result.current.data.eventsError).toContain("Failed to load events");
    expect(result.current.data.isLoadingInitial).toBe(false);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.data.events[0].$id).toBe("retried");
    expect(result.current.data.eventsError).toBeNull();
  });
});
