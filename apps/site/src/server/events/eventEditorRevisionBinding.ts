import { prisma } from "@/lib/prisma";
import type { EventEditorSnapshot } from "@/contracts/eventEditor";
import { loadEventWithRelations } from "@/server/repositories/events";
import {
  loadMaintenanceRevisionBinding,
  type MaintenanceRevisionClient,
} from "@/server/scheduler/eventScheduleMaintenanceRevisionBinding";
import {
  computeEventEditorRevision,
  type EditorActor,
} from "./eventEditorSnapshot";

/**
 * Attach the binding used by schedule maintenance to an editable event
 * snapshot. The scheduler owns the binding hash and row projection.
 */
export const attachEventEditorRevisionBinding = async (
  snapshot: EventEditorSnapshot,
  context: {
    actor: EditorActor;
    client?: typeof prisma;
  },
): Promise<EventEditorSnapshot> => {
  if (
    snapshot.mode !== "EDIT"
    || !snapshot.eventId
    || snapshot.scheduleState.availableMaintenanceOperations.length === 0
  ) {
    return snapshot;
  }

  const event = await loadEventWithRelations(snapshot.eventId, context.client ?? prisma);
  const revisionBinding = await loadMaintenanceRevisionBinding(
    event,
    snapshot.scheduleState.revision,
    {
      userId: context.actor.userId,
      isAdmin: Boolean(context.actor.isAdmin),
    },
    (context.client ?? prisma) as unknown as MaintenanceRevisionClient,
    {
      includeCheckIns: true,
      automatedScheduling: snapshot.draft.schedule.isAutomatedScheduling,
      computeRevision: computeEventEditorRevision,
      snapshot: {
        editorRevision: snapshot.editorRevision,
        staffRevision: snapshot.staffRevision,
      },
    },
  );

  return {
    ...snapshot,
    revisionBinding,
  };
};
