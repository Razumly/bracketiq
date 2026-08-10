import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { parseSaveEventEditorCommand } from '@/contracts/eventEditor';
import { loadEventEditorSnapshot } from '@/server/events/eventEditorSnapshot';
import {
  EditorCapabilityError,
  EditorImmutableFieldError,
  EditorInputError,
  EditorPermissionError,
  EditorRevisionConflictError,
  saveEventEditor,
} from '@/server/events/eventEditorSave';
import { deliverEventStaffInvitesAfterCommit } from '@/server/events/eventStaffDelivery';
import { EventStaffRevisionConflictError } from '@/server/events/eventStaffReconciliation';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ eventId: string }> };

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
  if (error instanceof EditorRevisionConflictError) {
    return NextResponse.json({
      error: error.message,
      code: 'EDITOR_REVISION_CONFLICT',
      editorRevision: error.currentEditorRevision,
      staffRevision: error.currentStaffRevision,
    }, { status: 409 });
  }
  if (error instanceof EventStaffRevisionConflictError) {
    return NextResponse.json({ error: error.message, code: 'STAFF_REVISION_CONFLICT', staffRevision: error.currentRevision }, { status: 409 });
  }
  if (error instanceof EditorCapabilityError) {
    return NextResponse.json({ error: error.message, code: 'EDITOR_CAPABILITY_REQUIRED' }, { status: 400 });
  }
  console.error('[event-editor] edit route failed', error);
  return NextResponse.json({ error: 'Unable to save event editor configuration.', code: 'EDITOR_SAVE_FAILED' }, { status: 500 });
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await requireSession(request);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: 'Event not found.', code: 'EDITOR_NOT_FOUND' }, { status: 404 });
  if (!await canManageEvent(session, event)) {
    return NextResponse.json({ error: 'You do not have permission to edit this event.', code: 'EDITOR_PERMISSION_DENIED' }, { status: 403 });
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
    return NextResponse.json({ error: 'Invalid editor command.', code: 'INVALID_EDITOR_COMMAND', details: error instanceof Error ? error.message : error }, { status: 400 });
  }
  try {
    const result = await saveEventEditor(session, command, eventId, {
      sendStaffInvites: (candidates, savedEventId) => deliverEventStaffInvitesAfterCommit(
        savedEventId,
        candidates as Parameters<typeof deliverEventStaffInvitesAfterCommit>[1],
        getRequestOrigin(request),
      ),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
