import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@/lib/id';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  eventEditorBootstrapQuerySchema,
  parseCreateEventEditorCommand,
  type CreateEventEditorCommand,
} from '@/contracts/eventEditor';
import {
  createEventEditor,
  EditorCapabilityError,
  EditorImmutableFieldError,
  EditorInputError,
  EditorPermissionError,
} from '@/server/events/eventEditorSave';
import { isEventFieldConfigurationError } from '@/server/repositories/events';
import { deliverEventStaffInvitesAfterCommit } from '@/server/events/eventStaffDelivery';
import { loadCreateEventEditorSnapshot } from '@/server/events/eventEditorSnapshot';
import {
  EventCreateOperationConflictError,
  EventCreateOperationIncompleteError,
  EventCreateOperationPayloadMismatchError,
} from '@/server/events/eventCreateOperationReplay';
import { notifySocialAudienceOfEventCreation } from '@/server/eventCreationNotifications';
import { sendAdminEventCreatedNotification } from '@/server/adminNotifications';

export const dynamic = 'force-dynamic';
const queryInput = (request: NextRequest): Record<string, string> => {
  const accepted = ['organizationId', 'eventType', 'sportId', 'parentEventId', 'templateId', 'rentalBookingId', 'start'];
  return Object.fromEntries(
    accepted
      .map((key) => [key, request.nextUrl.searchParams.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
};
const normalizeFailureDetail = (error: unknown): string => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 500) || 'The server returned an unexpected error.';
};

const errorResponse = (error: unknown) => {
  if (error instanceof EventCreateOperationPayloadMismatchError) {
    return NextResponse.json({
      error: error.message,
      code: 'CREATE_OPERATION_PAYLOAD_MISMATCH',
    }, { status: 409 });
  }
  if (error instanceof EventCreateOperationConflictError || error instanceof EventCreateOperationIncompleteError) {
    return NextResponse.json({
      error: error.message,
      code: 'CREATE_OPERATION_CONFLICT',
    }, { status: 409 });
  }
  if (error instanceof EditorPermissionError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_PERMISSION_DENIED' }, { status: 403 });
  }
  if (error instanceof EditorImmutableFieldError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_IMMUTABLE_FIELD', field: error.fieldName }, { status: 403 });
  }
  if (isEventFieldConfigurationError(error)) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Select or create at least one field for this event.',
      code: 'INVALID_EDITOR_INPUT',
    }, { status: 400 });
  }
  if (error instanceof EditorInputError) {
    return NextResponse.json({ error: error.message, code: 'INVALID_EDITOR_INPUT' }, { status: 400 });
  }
  if (error instanceof EditorCapabilityError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_CAPABILITY_REQUIRED' }, { status: 400 });
  }
  const requestId = createId();
  const details = normalizeFailureDetail(error);
  const message = `Unable to save event editor configuration. ${details} Reference: ${requestId}.`;
  console.error('[event-editor] create route failed', { requestId, error });
  return NextResponse.json({
    error: message,
    code: 'EDITOR_SAVE_FAILED',
    details,
    requestId,
  }, { status: 500 });
};
const assertCreateOrganizationPermission = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  snapshot: Awaited<ReturnType<typeof loadCreateEventEditorSnapshot>>,
) => {
  const organizationId = snapshot.draft.basics.organizationId;
  if (!organizationId || session.isAdmin) return;
  const organization = snapshot.catalogs.organizations.find((entry) => (
    entry.id === organizationId || entry.$id === organizationId
  ));
  if (!organization || !(await hasOrgPermission(session, organization as any, ORG_PERMISSIONS.EVENTS_MANAGE))) {
    throw new EditorPermissionError();
  }
};

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  const parsed = eventEditorBootstrapQuerySchema.safeParse(queryInput(request));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid editor bootstrap query.', code: 'INVALID_EDITOR_COMMAND', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const snapshot = await loadCreateEventEditorSnapshot(parsed.data, { actor: session });
    await assertCreateOrganizationPermission(session, snapshot);
    return NextResponse.json({
      contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
      createOperationId: createId(),
      snapshot,
    }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => null);
  let command: CreateEventEditorCommand;
  try {
    command = parseCreateEventEditorCommand(body);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid editor command.', code: 'INVALID_EDITOR_COMMAND', details: error instanceof Error ? error.message : error }, { status: 400 });
  }
  try {
    const result = await createEventEditor(session, command, {
      sendStaffInvites: (candidates, eventId) => deliverEventStaffInvitesAfterCommit(
        eventId,
        candidates as Parameters<typeof deliverEventStaffInvitesAfterCommit>[1],
        getRequestOrigin(request),
      ),
      onEventCreated: async (eventId, draft) => {
        const eventStart = new Date(draft.basics.start);
        const end = draft.schedule.mode === 'FIXED_END'
          ? draft.schedule.endConstraint
          : draft.schedule.generatedScheduleEnd;
        await notifySocialAudienceOfEventCreation({
          eventId,
          hostId: draft.basics.hostId ?? session.userId,
          eventName: draft.basics.name,
          eventStart,
          location: draft.basics.location,
          baseUrl: getRequestOrigin(request),
        });
        await sendAdminEventCreatedNotification({
          event: {
            id: eventId,
            name: draft.basics.name,
            eventType: draft.basics.eventType,
            state: draft.basics.state,
            hostId: draft.basics.hostId ?? session.userId,
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
          baseUrl: getRequestOrigin(request),
        });
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
