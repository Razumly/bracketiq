import { act, renderHook } from "@testing-library/react";

import type { Match } from "@/types";
import useMatchConflictAlerts from "../useMatchConflictAlerts";

const buildMatch = (id: string, start: string, matchId: number): Match =>
  ({
    $id: id,
    matchId,
    fieldId: "field_1",
    start,
    end: new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(),
  }) as unknown as Match;

describe("useMatchConflictAlerts", () => {
  it("applies dismissal only to the conflict signature that created it", () => {
    const firstMatches = [
      buildMatch("match_1", "2026-08-15T12:00:00.000Z", 1),
      buildMatch("match_2", "2026-08-15T12:30:00.000Z", 2),
    ];
    const replacementMatches = [
      buildMatch("match_1", "2026-08-15T12:00:00.000Z", 1),
      buildMatch("match_3", "2026-08-15T12:30:00.000Z", 3),
    ];

    const { result, rerender } = renderHook(
      ({ matches }) => useMatchConflictAlerts({ matches }),
      { initialProps: { matches: firstMatches } },
    );

    expect(result.current.visibleMatchConflictMessage).toContain(
      "Match #1 overlaps Match #2",
    );

    act(() => {
      result.current.dismissMatchConflictMessage();
    });
    expect(result.current.visibleMatchConflictMessage).toBeNull();

    rerender({ matches: replacementMatches });

    expect(result.current.visibleMatchConflictMessage).toContain(
      "Match #1 overlaps Match #3",
    );
  });
});
