import type { Prisma } from "@/generated/prisma/client";
import {
  reconcileEventSchedule,
  type EventScheduleMutationResult,
  type EventScheduleMutationMode,
} from "@/server/scheduler/eventScheduleMutation";

export type LockedEventSourceRow = {
  id: string;
  sourceType?: unknown;
  eventType?: unknown;
};

export type EventSourceTransitionEvent = {
  id: string;
  eventType?: unknown;
  sportIds?: unknown;
  start?: unknown;
};

export type EventSourceUpdate = {
  sourceType: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
};

export type EventSourceTransitionOptions = {
  tx: Prisma.TransactionClient;
  currentEvent: LockedEventSourceRow;
  sourceUpdate: EventSourceUpdate;
  eventUpdate: Record<string, unknown>;
  beforeScheduleReconcile?: (
    event: EventSourceTransitionEvent,
  ) => Promise<void>;
  includePlaceholderTeams?: boolean;
  participantCount?: number;
};
export type EventSourceTransitionResult = {
  event: EventSourceTransitionEvent;
  sourceChanged: boolean;
  scheduleMutation: EventScheduleMutationResult | null;
};

const normalizedSourceValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const nullableSourceValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizedEventType = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const isSchedulableEventType = (value: string | null): boolean =>
  value === "LEAGUE" || value === "TOURNAMENT";

const scheduleMutationModeForSourceTransition = (
  destinationEventType: string | null,
  matchCount: number,
): EventScheduleMutationMode | null => {
  if (isSchedulableEventType(destinationEventType)) {
    return matchCount > 0 ? "REBUILD" : "BUILD";
  }
  return matchCount > 0 ? "DELETE" : null;
};

const persistedMatchCount = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<number> => {
  const matches = tx.matches;
  if (!matches || typeof matches.count !== "function") return 0;
  return matches.count({ where: { eventId } });
};

/**
 * Applies an event source update after the caller has acquired the event
 * advisory lock and loaded the current row. Source changes are the boundary
 * that decides whether the existing schedule must be built, rebuilt, or
 * deleted; the caller's event update and that reconciliation share the same
 * transaction.
 */
export const applyEventSourceTransition = async ({
  tx,
  currentEvent,
  sourceUpdate,
  eventUpdate,
  beforeScheduleReconcile,
  includePlaceholderTeams = true,
  participantCount,
}: EventSourceTransitionOptions): Promise<EventSourceTransitionResult> => {
  const previousSourceType = normalizedSourceValue(currentEvent.sourceType);
  const nextSourceType = normalizedSourceValue(sourceUpdate.sourceType);
  const sourceChanged = previousSourceType !== nextSourceType;
  const previousEventType = normalizedEventType(currentEvent.eventType);
  const destinationEventType = normalizedEventType(
    eventUpdate.eventType ?? currentEvent.eventType,
  );
  const eventTypeChanged = previousEventType !== destinationEventType;
  const transitionRequired = sourceChanged || eventTypeChanged;
  const matchCount = transitionRequired
    ? await persistedMatchCount(tx, currentEvent.id)
    : 0;
  const scheduleMode = transitionRequired
    ? scheduleMutationModeForSourceTransition(destinationEventType, matchCount)
    : null;
  const {
    sourceType: _ignoredSourceType,
    sourceId: _ignoredSourceId,
    sourceUrl: _ignoredSourceUrl,
    ...restEventUpdate
  } = eventUpdate;
  const persistedEventUpdate = {
    ...restEventUpdate,
    sourceType: nullableSourceValue(sourceUpdate.sourceType),
    sourceId: nullableSourceValue(sourceUpdate.sourceId),
    sourceUrl: nullableSourceValue(sourceUpdate.sourceUrl),
    updatedAt: new Date(),
  };

  const updatedEvent = await tx.events.update({
    where: { id: currentEvent.id },
    data: persistedEventUpdate as never,
  });
  await beforeScheduleReconcile?.(updatedEvent);

  if (!scheduleMode) {
    return {
      event: updatedEvent,
      sourceChanged,
      scheduleMutation: null,
    };
  }

  const scheduleMutation = await reconcileEventSchedule({
    tx,
    eventId: currentEvent.id,
    mode: scheduleMode,
    includePlaceholderTeams,
    participantCount,
    historyPolicy: "REJECT_PROTECTED",
  });
  return {
    event: scheduleMutation.event,
    sourceChanged,
    scheduleMutation,
  };
};
