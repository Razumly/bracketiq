import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { getRequestOrigin } from "@/lib/requestOrigin";
import { requireSession } from "@/lib/permissions";
import { canManageEvent } from "@/server/accessControl";
import { parseSaveEventEditorCommand } from "@/contracts/eventEditor";
import { loadEventEditorSnapshot } from "@/server/events/eventEditorSnapshot";
import {
  EditorCapabilityError,
  EditorImmutableFieldError,
  EditorInputError,
  EditorPermissionError,
  EditorRevisionConflictError,
  EditorScheduleIntentError,
  saveEventEditor,
} from "@/server/events/eventEditorSave";
import {
  EventScheduleMutationError,
  EventScheduleRevisionConflictError,
} from "@/server/scheduler/eventScheduleMutation";
import { ScheduleError } from "@/server/scheduler/scheduleEvent";
import { deliverEventStaffInvitesAfterCommit } from "@/server/events/eventStaffDelivery";
import { EventStaffRevisionConflictError } from "@/server/events/eventStaffReconciliation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ eventId: string }> };

const normalizeFailureDetail = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 500) || "The server returned an unexpected error.";
};

const isErrorInstance = (error: unknown, constructor: unknown): boolean =>
  typeof constructor === "function" &&
  error instanceof (constructor as new (...args: never[]) => unknown);

const errorResponse = (error: unknown) => {
  if (error instanceof EditorPermissionError) {
    return NextResponse.json(
      { error: error.message, code: "EDITOR_PERMISSION_DENIED" },
      { status: 403 },
    );
  }
  if (error instanceof EditorImmutableFieldError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "EDITOR_IMMUTABLE_FIELD",
        field: error.fieldName,
      },
      { status: 403 },
    );
  }
  if (error instanceof EditorInputError) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_EDITOR_INPUT" },
      { status: 400 },
    );
  }
  if (error instanceof EditorRevisionConflictError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "EDITOR_REVISION_CONFLICT",
        editorRevision: error.currentEditorRevision,
        staffRevision: error.currentStaffRevision,
      },
      { status: 409 },
    );
  }
  if (isErrorInstance(error, EditorScheduleIntentError)) {
    return NextResponse.json(
      {
        error: (error as Error).message,
        code: "EDITOR_SCHEDULE_INTENT_REQUIRED",
      },
      { status: 409 },
    );
  }
  if (isErrorInstance(error, EventScheduleRevisionConflictError)) {
    const scheduleError = error as InstanceType<
      typeof EventScheduleRevisionConflictError
    >;
    return NextResponse.json(
      {
        error: scheduleError.message,
        code: scheduleError.code,
        scheduleRevision: scheduleError.currentRevision,
      },
      { status: 409 },
    );
  }
  if (isErrorInstance(error, EventScheduleMutationError)) {
    const scheduleError = error as InstanceType<
      typeof EventScheduleMutationError
    >;
    const status =
      scheduleError.code === "EDITOR_PROTECTED_MATCH_HISTORY" ? 409 : 400;
    return NextResponse.json(
      { error: scheduleError.message, code: scheduleError.code },
      { status },
    );
  }
  if (error instanceof ScheduleError) {
    return NextResponse.json(
      { error: error.message, code: "EDITOR_SCHEDULE_FAILED" },
      { status: 400 },
    );
  }
  if (error instanceof EditorCapabilityError) {
    return NextResponse.json(
      { error: error.message, code: "EDITOR_CAPABILITY_REQUIRED" },
      { status: 400 },
    );
  }
  const requestId = createId();
  const details = normalizeFailureDetail(error);
  const message = `Unable to save event editor configuration. ${details} Reference: ${requestId}.`;
  console.error("[event-editor] edit route failed", { requestId, error });
  return NextResponse.json(
    {
      error: message,
      code: "EDITOR_SAVE_FAILED",
      details,
      requestId,
    },
    { status: 500 },
  );
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await requireSession(request);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event)
    return NextResponse.json(
      { error: "Event not found.", code: "EDITOR_NOT_FOUND" },
      { status: 404 },
    );
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json(
      {
        error: "You do not have permission to edit this event.",
        code: "EDITOR_PERMISSION_DENIED",
      },
      { status: 403 },
    );
  }
  try {
    const snapshot = await loadEventEditorSnapshot(eventId, { actor: session });
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await requireSession(request);
  const { eventId } = await params;
  const body = await request.json().catch(() => null);
  let command;
  try {
    command = parseSaveEventEditorCommand(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid editor command.",
        code: "INVALID_EDITOR_COMMAND",
        details: error instanceof Error ? error.message : error,
      },
      { status: 400 },
    );
  }
  try {
    const result = await saveEventEditor(session, command, eventId, {
      sendStaffInvites: (candidates, savedEventId) =>
        deliverEventStaffInvitesAfterCommit(
          savedEventId,
          candidates as Parameters<
            typeof deliverEventStaffInvitesAfterCommit
          >[1],
          getRequestOrigin(request),
        ),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
