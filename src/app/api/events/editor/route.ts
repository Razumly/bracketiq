import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
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
import { deliverEventStaffInvitesAfterCommit } from '@/server/events/eventStaffDelivery';
import { loadCreateEventEditorSnapshot } from '@/server/events/eventEditorSnapshot';

export const dynamic = 'force-dynamic';

const queryInput = (request: NextRequest): Record<string, string> => {
  const accepted = ['organizationId', 'eventType', 'sportId', 'parentEventId', 'templateId', 'rentalBookingId'];
  return Object.fromEntries(
    accepted
      .map((key) => [key, request.nextUrl.searchParams.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
};
const errorResponse = (error: unknown) => {
  if (error instanceof EditorPermissionError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_PERMISSION_DENIED' }, { status: 403 });
  }
  if (error instanceof EditorImmutableFieldError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_IMMUTABLE_FIELD', field: error.fieldName }, { status: 403 });
  }
  if (error instanceof EditorInputError) {
    return NextResponse.json({ error: error.message, code: 'INVALID_EDITOR_INPUT' }, { status: 400 });
  }
  if (error instanceof EditorCapabilityError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_CAPABILITY_REQUIRED' }, { status: 400 });
  }
  console.error('[event-editor] create route failed', error);
  return NextResponse.json({ error: 'Unable to save event editor configuration.', code: 'EDITOR_SAVE_FAILED' }, { status: 500 });
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
    return NextResponse.json(snapshot, { status: 200 });
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
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
