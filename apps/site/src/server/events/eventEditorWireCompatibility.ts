import type { EventEditorSnapshot } from "@/contracts/eventEditor";

type EventEditorSnapshotWithLegacyScheduleKey = EventEditorSnapshot & {
  draft: EventEditorSnapshot["draft"] & {
    schedule: EventEditorSnapshot["draft"]["schedule"] & {
      automatedScheduling: boolean;
    };
  };
};

export const serializeEventEditorSnapshot = (
  snapshot: EventEditorSnapshot,
): EventEditorSnapshotWithLegacyScheduleKey => {
  const schedule = snapshot.draft?.schedule;
  if (!schedule) {
    return snapshot as EventEditorSnapshotWithLegacyScheduleKey;
  }

  return {
    ...snapshot,
    draft: {
      ...snapshot.draft,
      schedule: {
        ...schedule,
        automatedScheduling: schedule.isAutomatedScheduling,
      },
    },
  };
};

export const serializeEventEditorSnapshotEnvelope = <
  T extends { snapshot: EventEditorSnapshot },
>(
  result: T,
): Omit<T, "snapshot"> & {
  snapshot: EventEditorSnapshotWithLegacyScheduleKey;
} => ({
  ...result,
  snapshot: serializeEventEditorSnapshot(result.snapshot),
});
