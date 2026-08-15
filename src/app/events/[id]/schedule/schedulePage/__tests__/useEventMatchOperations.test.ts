import { act, renderHook } from "@testing-library/react";

import type { Event, Field, Match } from "@/types";
import useEventMatchOperations from "../useEventMatchOperations";

jest.mock("@/lib/clientId", () => ({
  createClientId: jest.fn(() => "generated-match"),
}));

type HookParams = Parameters<typeof useEventMatchOperations>[0];

const buildMatch = (id: string, matchId: number, eventId: string): Match =>
  ({
    $id: id,
    matchId,
    eventId,
    fieldId: null,
    team1Id: null,
    team2Id: null,
    officialId: null,
    officialIds: [],
    teamOfficialId: null,
    locked: false,
    team1Points: [],
    team2Points: [],
    losersBracket: false,
    officialCheckedIn: false,
  }) as unknown as Match;

const buildEvent = (id: string, eventType: string, fields: Field[]): Event =>
  ({
    $id: id,
    eventType,
    fields,
  }) as unknown as Event;

const buildParams = (overrides: Partial<HookParams> = {}) =>
  ({
    activeEvent: buildEvent("event_1", "LEAGUE", []),
    activeMatches: [],
    canEditMatches: true,
    changesMatches: [],
    eventId: "event_1",
    matches: [],
    onDraftMatchChanged: jest.fn(),
    setChangesEvent: jest.fn(),
    setChangesMatches: jest.fn(),
    setError: jest.fn(),
    setEvent: jest.fn(),
    setHasUnsavedChanges: jest.fn(),
    setInfoMessage: jest.fn(),
    setMatches: jest.fn(),
    ...overrides,
  }) as HookParams;

const applyLatestMatchUpdate = (
  setChangesMatches: jest.Mock,
  previous: Match[] = [],
): Match[] => {
  const update =
    setChangesMatches.mock.calls[setChangesMatches.mock.calls.length - 1]?.[0];
  if (typeof update !== "function") {
    throw new Error("Expected a functional Match collection update.");
  }
  return update(previous);
};

describe("useEventMatchOperations", () => {
  it("creates and moves Matches against the current Event resources and Match collection", () => {
    const staleField = { $id: "field_old", name: "Old field" } as Field;
    const currentField = {
      $id: "field_current",
      name: "Current field",
    } as Field;
    const staleMatch = buildMatch("match_old", 40, "event_old");
    const currentMatch = buildMatch("match_current", 7, "event_current");
    const setChangesMatches = jest.fn();
    const initialProps = buildParams({
      activeEvent: buildEvent("event_old", "LEAGUE", [staleField]),
      activeMatches: [staleMatch],
      eventId: "event_old",
      matches: [staleMatch],
      setChangesMatches,
    });
    const currentProps = buildParams({
      activeEvent: buildEvent("event_current", "TOURNAMENT", [currentField]),
      activeMatches: [currentMatch],
      changesMatches: [],
      eventId: "event_current",
      matches: [staleMatch],
      setChangesMatches,
    });

    const { result, rerender } = renderHook(
      ({ params }) => useEventMatchOperations(params),
      { initialProps: { params: initialProps } },
    );

    rerender({ params: currentProps });
    act(() => {
      result.current.handleAddScheduleMatch();
    });

    const createdCollection = applyLatestMatchUpdate(setChangesMatches);
    expect(createdCollection.map((match) => match.$id)).toEqual([
      "match_current",
      "client:generated-match",
    ]);
    expect(createdCollection[1]).toMatchObject({
      eventId: "event_current",
      matchId: 8,
      team1: expect.objectContaining({ name: "Place Holder 1" }),
    });

    setChangesMatches.mockClear();
    const start = new Date("2026-08-15T18:00:00.000Z");
    const end = new Date("2026-08-15T19:30:00.000Z");
    act(() => {
      result.current.handleMatchCalendarMove(currentMatch, {
        start,
        end,
        fieldId: "field_current",
      });
    });

    const movedCollection = applyLatestMatchUpdate(setChangesMatches);
    expect(movedCollection).toHaveLength(1);
    expect(movedCollection[0]).toMatchObject({
      $id: "match_current",
      start: start.toISOString(),
      end: end.toISOString(),
      fieldId: "field_current",
      field: currentField,
    });
  });

  it("uses the route Event identity while the Event record is still loading", () => {
    const currentMatch = buildMatch("match_current", 7, "event_current");
    const setChangesMatches = jest.fn();
    const { result } = renderHook(() =>
      useEventMatchOperations(
        buildParams({
          activeEvent: null,
          activeMatches: [currentMatch],
          eventId: "event_current",
          setChangesMatches,
        }),
      ),
    );

    act(() => {
      result.current.handleAddScheduleMatch();
    });

    const createdCollection = applyLatestMatchUpdate(setChangesMatches);
    expect(createdCollection.map((match) => match.$id)).toEqual([
      "match_current",
      "client:generated-match",
    ]);
    expect(createdCollection[1]).toMatchObject({
      eventId: "event_current",
      matchId: 8,
    });
  });

  it("immediately scopes the Match editor and its save callback to current authority", () => {
    const target = buildMatch("match_1", 1, "event_1");
    const setChangesMatches = jest.fn();
    const authorizedProps = buildParams({
      activeMatches: [target],
      matches: [target],
      setChangesMatches,
    });
    const { result, rerender } = renderHook(
      ({ params }) => useEventMatchOperations(params),
      { initialProps: { params: authorizedProps } },
    );

    act(() => {
      result.current.handleMatchEditRequest(target, "schedule");
    });
    expect(result.current.isMatchEditorOpen).toBe(true);
    expect(result.current.matchBeingEdited?.$id).toBe("match_1");

    rerender({
      params: {
        ...authorizedProps,
        canEditMatches: false,
      },
    });
    expect(result.current.isMatchEditorOpen).toBe(false);
    expect(result.current.matchBeingEdited).toBeNull();

    setChangesMatches.mockClear();
    act(() => {
      result.current.handleMatchEditSave({ ...target, locked: true } as Match);
      result.current.handleMatchDelete(target);
    });
    expect(setChangesMatches).not.toHaveBeenCalled();

    rerender({ params: authorizedProps });
    expect(result.current.isMatchEditorOpen).toBe(false);
    expect(result.current.matchBeingEdited).toBeNull();
  });
});
