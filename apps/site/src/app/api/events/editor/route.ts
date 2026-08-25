import { NextRequest, NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { TimeSlotValidationError } from "@/lib/timeSlotAvailability";
import { repeatingTimeSlotValidationResponse } from "@/server/repeatingTimeSlotValidationResponse";
import { requireSession } from "@/lib/permissions";
import { getRequestOrigin } from "@/lib/requestOrigin";
import { hasOrgPermission } from "@/server/accessControl";
import { ORG_PERMISSIONS } from "@/lib/organizationPermissions";
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  eventEditorAcceptProposalCommandSchema,
  eventEditorBootstrapQuerySchema,
  parseCreateEventEditorCommand,
  parseEventEditorAcceptProposalCommand,
  parseEventEditorRejectProposalCommand,
  type CreateEventEditorCommand,
} from "@/contracts/eventEditor";
import {
  acceptScheduleProposalFromEditor,
  createEventEditor,
  createScheduleProposalFromEditor,
  rejectScheduleProposalFromEditor,
  EditorCapabilityError,
  EditorImmutableFieldError,
  EditorInputError,
  EditorPermissionError,
  EditorRevisionConflictError,
  EditorScheduleIntentError,
  EventEditorProposalInvalidError,
  EventEditorProposalStaleError,
} from "@/server/events/eventEditorSave";
import {
  notifyTeamsOfMatchScheduleUpdate,
  type MatchScheduleNotificationPlan,
} from "@/server/matchScheduleNotifications";
import { eventRegistrationErrorResponse } from "@/server/events/eventRegistrationErrorResponse";
import { ScheduleError } from "@/server/scheduler/scheduleEvent";
import { isEventFieldConfigurationError } from "@/server/repositories/events";
import { deliverEventStaffInvitesAfterCommit } from "@/server/events/eventStaffDelivery";
import { loadCreateEventEditorSnapshot } from "@/server/events/eventEditorSnapshot";
import {
  serializeEventEditorSnapshot,
  serializeEventEditorSnapshotEnvelope,
} from "@/server/events/eventEditorWireCompatibility";
import {
  EventCreateOperationConflictError,
  EventCreateOperationIncompleteError,
  EventCreateOperationPayloadMismatchError,
} from "@/server/events/eventCreateOperationReplay";
import { notifySocialAudienceOfEventCreation } from "@/server/eventCreationNotifications";
import {
  EventScheduleMutationError,
  EventScheduleRevisionConflictError,
} from "@/server/scheduler/eventScheduleMutation";
import { sendAdminEventCreatedNotification } from "@/server/adminNotifications";

export const dynamic = "force-dynamic";
const queryInput = (request: NextRequest): Record<string, string> => {
  const accepted = [
    "organizationId",
    "eventType",
    "sportId",
    "parentEventId",
    "templateId",
    "rentalBookingId",
    "start",
  ];
  return Object.fromEntries(
    accepted
      .map((key) => [key, request.nextUrl.searchParams.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
};
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
  if (error instanceof EventCreateOperationPayloadMismatchError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "CREATE_OPERATION_PAYLOAD_MISMATCH",
      },
      { status: 409 },
    );
  }
  if (
    error instanceof EventCreateOperationConflictError ||
    error instanceof EventCreateOperationIncompleteError
  ) {
    return NextResponse.json(
      {
        error: error.message,
        code: "CREATE_OPERATION_CONFLICT",
      },
      { status: 409 },
    );
  }
  if (error instanceof EditorInputError) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_EDITOR_INPUT" },
      { status: 400 },
    );
  }
  const registrationResponse = eventRegistrationErrorResponse(error);
  if (registrationResponse) return registrationResponse;
  if (error instanceof EditorRevisionConflictError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "EDITOR_REVISION_CONFLICT",
        editorRevision: error.currentEditorRevision,
        staffRevision: error.currentStaffRevision,
        scheduleRevision: error.currentScheduleRevision,
      },
      { status: 409 },
    );
  }
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
  if (isEventFieldConfigurationError(error)) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Select or create at least one field for this event.",
        code: "INVALID_EDITOR_INPUT",
      },
      { status: 400 },
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
  const repeatingTimeSlotResponse = repeatingTimeSlotValidationResponse(error);
  if (repeatingTimeSlotResponse) {
    return repeatingTimeSlotResponse;
  }
  if (error instanceof TimeSlotValidationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "INVALID_TIME_SLOT",
        slotIds: error.slotIds,
      },
      { status: 400 },
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
  if (error instanceof EventEditorProposalInvalidError) {
    return NextResponse.json(
      { error: error.message, code: "EDITOR_PROPOSAL_INVALID" },
      { status: 409 },
    );
  }
  if (error instanceof EventEditorProposalStaleError) {
    return NextResponse.json(
      { error: error.message, code: "EDITOR_PROPOSAL_STALE" },
      { status: 409 },
    );
  }
  const requestId = createId();
  const details = normalizeFailureDetail(error);
  const message = `Unable to save event editor configuration. ${details} Reference: ${requestId}.`;
  console.error("[event-editor] create route failed", { requestId, error });
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
const assertCreateOrganizationPermission = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  snapshot: Awaited<ReturnType<typeof loadCreateEventEditorSnapshot>>,
) => {
  const organizationId = snapshot.draft.basics.organizationId;
  if (!organizationId || session.isAdmin) return;
  const organization = snapshot.catalogs.organizations.find(
    (entry) => entry.id === organizationId || entry.$id === organizationId,
  );
  if (
    !organization ||
    !(await hasOrgPermission(
      session,
      organization as any,
      ORG_PERMISSIONS.EVENTS_MANAGE,
    ))
  ) {
    throw new EditorPermissionError();
  }
};

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  const parsed = eventEditorBootstrapQuerySchema.safeParse(queryInput(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid editor bootstrap query.",
        code: "INVALID_EDITOR_COMMAND",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  try {
    const snapshot = await loadCreateEventEditorSnapshot(parsed.data, {
      actor: session,
    });
    await assertCreateOrganizationPermission(session, snapshot);
    return NextResponse.json(
      {
        contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
        createOperationId: createId(),
        snapshot: serializeEventEditorSnapshot(snapshot),
      },
      { status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
const buildEventCreatedHandler =
  (request: NextRequest, hostUserId: string) =>
  async (eventId: string, draft: CreateEventEditorCommand["draft"]) => {
    const eventStart = new Date(draft.basics.start);
    const end =
      draft.schedule.mode === "FIXED_END"
        ? draft.schedule.endConstraint
        : draft.schedule.generatedScheduleEnd;
    const baseUrl = getRequestOrigin(request);
    await notifySocialAudienceOfEventCreation({
      eventId,
      hostId: draft.basics.hostId ?? hostUserId,
      eventName: draft.basics.name,
      eventStart,
      location: draft.basics.location,
      baseUrl,
    });
    await sendAdminEventCreatedNotification({
      event: {
        id: eventId,
        name: draft.basics.name,
        eventType: draft.basics.eventType,
        state: draft.basics.state,
        hostId: draft.basics.hostId ?? hostUserId,
        organizationId: draft.basics.organizationId,
        sportIds: draft.basics.sportIds,
        start: draft.basics.start,
        end,
        timeZone: draft.basics.timeZone,
        location: draft.basics.location,
        address: draft.basics.address,
        teamSignup: draft.participation.teamSignup,
        price: draft.registration.payment.priceCents,
        maxParticipants: draft.participation.maxParticipants,
        createdAt: new Date(),
      },
      baseUrl,
    });
  };

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => null);
  let command: CreateEventEditorCommand;
  try {
    command = parseCreateEventEditorCommand(body);
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
    const eventType =
      typeof command.draft?.basics?.eventType === "string"
        ? command.draft.basics.eventType.trim().toUpperCase()
        : "";
    const isScheduledProposal =
      ["LEAGUE", "TOURNAMENT"].includes(eventType) &&
      command.completion?.mode === "CREATE_AND_BUILD_SCHEDULE" &&
      command.hasScheduleProposalSupport === true;
    const createOptions = {
      sendStaffInvites: (candidates: unknown[], eventId: string) =>
        deliverEventStaffInvitesAfterCommit(
          eventId,
          candidates as Parameters<
            typeof deliverEventStaffInvitesAfterCommit
          >[1],
          getRequestOrigin(request),
        ),
      onEventCreated: buildEventCreatedHandler(request, session.userId),
      onScheduleChanged: async (notification: MatchScheduleNotificationPlan) => {
        await notifyTeamsOfMatchScheduleUpdate(notification);
      },
    };
    const result = isScheduledProposal
      ? await createScheduleProposalFromEditor(session, command, createOptions)
      : await createEventEditor(session, command, createOptions);
    return NextResponse.json(serializeEventEditorSnapshotEnvelope(result), {
      status: result.status === "PROPOSED" ? 202 : 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => null);
  let command;
  try {
    command = parseEventEditorAcceptProposalCommand(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid schedule proposal acceptance command.",
        code: "INVALID_EDITOR_COMMAND",
        details: error instanceof Error ? error.message : error,
      },
      { status: 400 },
    );
  }
  try {
    const result = await acceptScheduleProposalFromEditor(
      session,
      command.createOperationId,
      command.proposalRevision,
      command.draft,
      {
        sendStaffInvites: (candidates, eventId) =>
          deliverEventStaffInvitesAfterCommit(
            eventId,
            candidates as Parameters<
              typeof deliverEventStaffInvitesAfterCommit
            >[1],
            getRequestOrigin(request),
          ),
        onEventCreated: buildEventCreatedHandler(request, session.userId),
        onScheduleChanged: async (notification: MatchScheduleNotificationPlan) => {
          await notifyTeamsOfMatchScheduleUpdate(notification);
        },
      },
    );
    return NextResponse.json(serializeEventEditorSnapshotEnvelope(result), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => null);
  let command;
  try {
    command = parseEventEditorRejectProposalCommand(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid schedule proposal rejection command.",
        code: "INVALID_EDITOR_COMMAND",
        details: error instanceof Error ? error.message : error,
      },
      { status: 400 },
    );
  }
  try {
    await rejectScheduleProposalFromEditor(
      session,
      command.createOperationId,
      command.proposalRevision,
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
