import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import {
  parseEventEditorAcceptMaintenanceProposal,
  parseEventEditorMaintenanceRequest,
  parseEventEditorRejectMaintenanceProposal,
} from "@/contracts/eventEditor";
import {
  acceptMaintenanceProposal,
  createMaintenanceProposal,
  MaintenanceOperationError,
  rejectMaintenanceProposal,
} from "@/server/scheduler/eventScheduleMaintenance";
import { EventScheduleMutationError } from "@/server/scheduler/eventScheduleMutation";
import { ScheduleError } from "@/server/scheduler/scheduleEvent";
import { isEventFieldConfigurationError } from "@/server/repositories/events";
import { notifyTeamsOfMatchScheduleUpdate } from "@/server/matchScheduleNotifications";
import { refreshBroadcastPresentationForEvent } from "@/server/broadcast/presentation";

export const dynamic = "force-dynamic";

const SCHEDULE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

const actorFor = (session: unknown): { userId: string; isAdmin: boolean } => {
  if (!session || typeof session !== "object") {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_UNAUTHORIZED",
      "Authentication is required.",
    );
  }
  const row = session as Record<string, unknown>;
  const userId = typeof row.userId === "string" ? row.userId.trim() : "";
  if (!userId) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_UNAUTHORIZED",
      "Authentication is required.",
    );
  }
  return { userId, isAdmin: row.isAdmin === true };
};

const invalidInput = (details: unknown): NextResponse =>
  NextResponse.json(
    { error: "Invalid maintenance operation input.", code: "EDITOR_MAINTENANCE_INVALID", details },
    { status: 400 },
  );

const errorResponse = (error: unknown): Response | null => {
  if (error instanceof Response) return error;
  if (error instanceof MaintenanceOperationError) {
    const status = error.code === "EDITOR_MAINTENANCE_UNAUTHORIZED"
      ? 403
      : error.code === "EDITOR_MAINTENANCE_NOT_FOUND"
        ? 404
        : error.code === "EDITOR_MAINTENANCE_STALE"
          || error.code === "EDITOR_MAINTENANCE_REJECTED"
          || error.code === "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT"
            ? 409
            : 400;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  if (error instanceof EventScheduleMutationError) {
    const status = error.code === "EDITOR_SCHEDULE_REVISION_CONFLICT"
      || error.code === "EDITOR_PROTECTED_MATCH_HISTORY"
      ? 409
      : 400;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  if (error instanceof ScheduleError || isEventFieldConfigurationError(error)) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid schedule input.",
        code: "EDITOR_MAINTENANCE_INVALID",
      },
      { status: 400 },
    );
  }
  return null;
};

const eventIdFor = async (params: Promise<{ eventId: string }>): Promise<string> => {
  const eventId = (await params).eventId.trim();
  if (!eventId) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_NOT_FOUND",
      "Event not found.",
    );
  }
  return eventId;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = parseEventEditorMaintenanceRequest(body);
    const eventId = await eventIdFor(params);
    if (parsed.eventId !== eventId) {
      return invalidInput({ eventId: "The path and request Event IDs differ." });
    }
    const response = await prisma.$transaction(
      (tx) => createMaintenanceProposal({
        tx,
        actor: actorFor(session),
        request: parsed,
      }),
      SCHEDULE_TRANSACTION_OPTIONS,
    );
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return invalidInput(error.flatten());
    const response = errorResponse(error);
    if (response) return response;
    console.error("Schedule maintenance proposal failed", error);
    return NextResponse.json(
      { error: "Internal Server Error", code: "EDITOR_MAINTENANCE_INVALID" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = parseEventEditorAcceptMaintenanceProposal(body);
    const eventId = await eventIdFor(params);
    if (parsed.eventId !== eventId) {
      return invalidInput({ eventId: "The path and request Event IDs differ." });
    }
    const result = await prisma.$transaction(
      (tx) => acceptMaintenanceProposal({
        tx,
        actor: actorFor(session),
        request: parsed,
      }),
      SCHEDULE_TRANSACTION_OPTIONS,
    );
    if (result.response.status === "ACCEPTED") {
      const notification = result.notification
        ? notifyTeamsOfMatchScheduleUpdate(result.notification).catch((error) => {
            console.warn("Failed to send match schedule update notifications", {
              eventId,
              error,
            });
          })
        : Promise.resolve();
      await Promise.all([
        refreshBroadcastPresentationForEvent({
          eventId,
          reason: "SCHEDULE_CHANGE",
        }).catch((error) => {
          console.error("[broadcast-overlay] Presentation refresh failed after schedule acceptance", {
            eventId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }),
        notification,
      ]);
    }
    return NextResponse.json(result.response, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return invalidInput(error.flatten());
    const response = errorResponse(error);
    if (response) return response;
    console.error("Schedule maintenance acceptance failed", error);
    return NextResponse.json(
      { error: "Internal Server Error", code: "EDITOR_MAINTENANCE_INVALID" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = parseEventEditorRejectMaintenanceProposal(body);
    const eventId = await eventIdFor(params);
    if (parsed.eventId !== eventId) {
      return invalidInput({ eventId: "The path and request Event IDs differ." });
    }
    const response = await prisma.$transaction(
      (tx) => rejectMaintenanceProposal({
        tx,
        actor: actorFor(session),
        request: parsed,
      }),
      SCHEDULE_TRANSACTION_OPTIONS,
    );
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return invalidInput(error.flatten());
    const response = errorResponse(error);
    if (response) return response;
    console.error("Schedule maintenance rejection failed", error);
    return NextResponse.json(
      { error: "Internal Server Error", code: "EDITOR_MAINTENANCE_INVALID" },
      { status: 500 },
    );
  }
}
