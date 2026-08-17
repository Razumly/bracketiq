import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import {
  isEventFieldConfigurationError,
  loadEventWithRelations,
} from "@/server/repositories/events";
import { acquireEventLock } from "@/server/repositories/locks";
import {
  EventScheduleMutationError,
  reconcileEventSchedule,
} from "@/server/scheduler/eventScheduleMutation";
import { ScheduleError } from "@/server/scheduler/scheduleEvent";
import { serializeEvent, serializeMatches } from "@/server/scheduler/serialize";
import { canManageEvent } from "@/server/accessControl";
import { notifyTeamsOfMatchScheduleUpdate } from "@/server/matchScheduleNotifications";
import { refreshBroadcastPresentationForEvent } from "@/server/broadcast/presentation";

export const dynamic = "force-dynamic";

const SCHEDULE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

const scheduleSchema = z.object({
  expectedScheduleRevision: z.string().trim().min(1).optional(),
  participantCount: z.number().int().positive().optional(),
  includePlaceholderTeams: z.boolean().optional(),
  replaceExistingMatches: z.boolean().optional(),
}).strict();

const isFixedEndValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("No fixed end date/time") ||
    message.includes("No fixed end datetime scheduling") ||
    message.includes("End date/time must be after start date/time")
  );
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = scheduleSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { eventId } = await params;
    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          hostId: true,
          assistantHostIds: true,
          organizationId: true,
        },
      });
      if (!eventAccess) {
        throw new Response("Not found", { status: 404 });
      }
      if (!(await canManageEvent(session, eventAccess, tx))) {
        throw new Response("Forbidden", { status: 403 });
      }

      const event = await loadEventWithRelations(eventId, tx);

      const eventType =
        typeof event.eventType === "string"
          ? event.eventType.toUpperCase()
          : "";
      if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
        return {
          preview: false,
          event,
          matches: Object.values(event.matches),
          warnings: [],
          didRebuildSchedule: false,
          notification: null,
        };
      }

      const includePlaceholderTeams =
        parsed.data.includePlaceholderTeams !== false;
      const replaceExistingMatches =
        parsed.data.replaceExistingMatches === true;
      const hasExistingMatches = Object.values(event.matches).length > 0;
      const mode =
        hasExistingMatches && includePlaceholderTeams && !replaceExistingMatches
          ? "RESCHEDULE_PRESERVING_LOCKS"
          : hasExistingMatches
            ? "REBUILD"
            : "BUILD";
      const mutation = await reconcileEventSchedule({
        tx,
        eventId,
        mode,
        expectedScheduleRevision: parsed.data.expectedScheduleRevision,
        participantCount: parsed.data.participantCount,
        includePlaceholderTeams,
      });
      return {
        preview: false,
        event: mutation.event,
        matches: mutation.matches,
        warnings: mutation.warnings,
        didRebuildSchedule: true,
        notification: mutation.notification,
      };
    }, SCHEDULE_TRANSACTION_OPTIONS);

    if (result.didRebuildSchedule) {
      await refreshBroadcastPresentationForEvent({
        eventId,
        reason: "SCHEDULE_CHANGE",
      }).catch((error) => {
        console.error(
          "[broadcast-overlay] Presentation refresh failed after schedule rebuild",
          {
            eventId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        );
      });
    }
    await notifyTeamsOfMatchScheduleUpdate(result.notification ?? null).catch(
      (error) => {
        console.warn("Failed to send match schedule update notifications", {
          eventId,
          error,
        });
      },
    );

    return NextResponse.json(
      {
        preview: typeof result.preview === "boolean" ? result.preview : false,
        event: serializeEvent(result.event),
        matches: serializeMatches(result.matches),
        warnings: Array.isArray((result as { warnings?: unknown[] }).warnings)
          ? (result as { warnings: unknown[] }).warnings
          : [],
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (isEventFieldConfigurationError(error)) {
      const message =
        error instanceof Error
          ? error.message
          : "Select or create at least one field for this event.";
      return NextResponse.json(
        { error: message, code: "INVALID_EVENT_FIELDS" },
        { status: 400 },
      );
    }
    if (error instanceof EventScheduleMutationError) {
      const status =
        error.code === "EDITOR_PROTECTED_MATCH_HISTORY" ||
        error.code === "EDITOR_SCHEDULE_REVISION_CONFLICT"
          ? 409
          : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isFixedEndValidationError(error)) {
      const message =
        error instanceof Error ? error.message : "Invalid schedule window";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Schedule event failed", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
