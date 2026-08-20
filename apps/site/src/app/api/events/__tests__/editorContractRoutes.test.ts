/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const canManageEventMock = jest.fn();
const loadCreateSnapshotMock = jest.fn();
const loadSnapshotMock = jest.fn();
const createEventEditorMock = jest.fn();
const saveEventEditorMock = jest.fn();
const parseCreateMock = jest.fn();
const bootstrapQueryMock = jest.fn();
const parseSaveMock = jest.fn();
const prismaMock = { events: { findUnique: jest.fn() } };
const deliverInvitesMock = jest.fn();
const getRequestOriginMock = jest.fn(() => 'http://localhost');

class MockEditorRevisionConflictError extends Error {
  currentEditorRevision = 'current-editor';
  currentStaffRevision = 'current-staff';
  currentScheduleRevision = 'current-schedule';
  constructor() {
    super('The editor changed while you were editing. Reload before saving again.');
  }
}
class MockEditorInputError extends Error {
  constructor(message: string) {
    super(message);
  }
}
class MockEditorPermissionError extends Error {}


jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
}));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: (...args: any[]) => getRequestOriginMock(...args) }));
jest.mock('@/contracts/eventEditor', () => ({
  EVENT_EDITOR_CONTRACT_VERSION: 3,
  eventEditorBootstrapQuerySchema: { safeParse: (...args: any[]) => bootstrapQueryMock(...args) },
  parseCreateEventEditorCommand: (...args: any[]) => parseCreateMock(...args),
  parseSaveEventEditorCommand: (...args: any[]) => parseSaveMock(...args),
  projectEventEditorDraftNestedInput: (input: unknown) => (
    jest.requireActual('@/contracts/eventEditor').projectEventEditorDraftNestedInput(input)
  ),
}));
jest.mock('@/server/events/eventEditorSnapshot', () => ({
  loadCreateEventEditorSnapshot: (...args: any[]) => loadCreateSnapshotMock(...args),
  loadEventEditorSnapshot: (...args: any[]) => loadSnapshotMock(...args),
}));
jest.mock('@/server/events/eventEditorSave', () => ({
  createEventEditor: (...args: any[]) => createEventEditorMock(...args),
  saveEventEditor: (...args: any[]) => saveEventEditorMock(...args),
  EditorCapabilityError: class extends Error {},
  EditorImmutableFieldError: class extends Error {},
  EditorInputError: MockEditorInputError,
  EditorPermissionError: MockEditorPermissionError,
  EditorRevisionConflictError: MockEditorRevisionConflictError,
}));
jest.mock('@/server/events/eventStaffDelivery', () => ({
  deliverEventStaffInvitesAfterCommit: (...args: any[]) => deliverInvitesMock(...args),
}));

import { GET as createGet, POST as createPost } from '@/app/api/events/editor/route';
import { GET as editGet, PUT as editPut } from '@/app/api/events/[eventId]/editor/route';
import {
  emptyEditorSnapshot,
  legacyEventToEditorDraft,
} from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import { eventEditorFixtures } from '@/test/eventEditor/fixtures';
import {
  EventCreateOperationConflictError,
  EventCreateOperationPayloadMismatchError,
} from '@/server/events/eventCreateOperationReplay';
import { EventFieldReferenceError } from '@/server/repositories/events';
import { TimeSlotValidationError } from '@/lib/timeSlotAvailability';
import {
  EditorInputError,
  EditorPermissionError,
  EditorRevisionConflictError,
} from '@/server/events/eventEditorSave';

const request = (url: string, method = 'GET', body?: unknown) => new NextRequest(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const editContext = (eventId = 'event_1') => ({ params: Promise.resolve({ eventId }) });

describe('canonical editor routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bootstrapQueryMock.mockImplementation((input: Record<string, string>) => (
      input.eventType === 'NOT_A_MODE'
        ? { success: false, error: { flatten: () => ({ fieldErrors: {} }) } }
        : { success: true, data: input }
    ));
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({ id: 'event_1', hostId: 'host_1' });
    loadCreateSnapshotMock.mockResolvedValue({
      draft: { basics: { organizationId: null } },
      catalogs: { organizations: [] },
    });
  });

  it('rejects malformed create bootstrap queries before loading catalogs', async () => {
    const response = await createGet(request('http://localhost/api/events/editor?eventType=NOT_A_MODE'));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_EDITOR_COMMAND');
    expect(loadCreateSnapshotMock).not.toHaveBeenCalled();
  });

  it('creates through the canonical command and returns its operation receipt and revisions', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-1',
      expectedRevisions: {
        editorRevision: 'new',
        staffRevision: null,
        scheduleRevision: 'new',
      },
      draft: { basics: { name: 'Fixture' } },
    };
    const result = {
      status: 'SAVED',
      createOperationId: 'create-operation-1',
      editorRevision: 'editor-revision-1',
      staffRevision: 'staff-revision-1',
      scheduleRevision: 'schedule-revision-1',
      snapshot: { eventId: 'event_1' },
      questionIdMap: {},
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockResolvedValue(result);

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(result);
    expect(createEventEditorMock).toHaveBeenCalledWith(
      { userId: 'host_1', isAdmin: false },
      command,
      expect.objectContaining({ sendStaffInvites: expect.any(Function) }),
    );
  });
  it('returns invalid-editor-input for missing field resources instead of an internal error', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-1',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new EventFieldReferenceError(['field_missing']));

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'The selected field resources were not found: field_missing.',
      code: 'INVALID_EDITOR_INPUT',
    });
  });
  it('returns typed Time Slot evidence for a create input failure', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-invalid-slot',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new TimeSlotValidationError(
      'ONE_TIME_SLOT_CONFLICT',
      'The selected Time Slots overlap.',
      { slotIds: ['slot_1', 'slot_2'] },
    ));

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'The selected Time Slots overlap.',
      code: 'INVALID_TIME_SLOT',
      slotIds: ['slot_1', 'slot_2'],
    });
  });
  it('maps invalid staff input to a client-correctable create response', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-invalid-staff',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(
      new EditorInputError('Organization events can only assign active organization hosts and officials.'),
    );

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Organization events can only assign active organization hosts and officials.',
      code: 'INVALID_EDITOR_INPUT',
    });
  });
  it('returns current revisions for a stale create command', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-stale',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new EditorRevisionConflictError());

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'The editor changed while you were editing. Reload before saving again.',
      code: 'EDITOR_REVISION_CONFLICT',
      editorRevision: 'current-editor',
      staffRevision: 'current-staff',
      scheduleRevision: 'current-schedule',
    });
  });

  it('returns a typed authority error when creation is not permitted', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-forbidden',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new EditorPermissionError('Not permitted.'));

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Not permitted.',
      code: 'EDITOR_PERMISSION_DENIED',
    });
  });
  it('returns diagnostic details for unexpected create failures', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-unexpected-failure',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new Error('Database write failed.'));

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(expect.objectContaining({
      code: 'EDITOR_SAVE_FAILED',
      details: 'Database write failed.',
      requestId: expect.any(String),
    }));
    expect(body.error).toContain('Database write failed.');
    expect(body.error).toContain(body.requestId);
  });



  it('maps a create payload mismatch to a typed conflict without retrying persistence', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-1',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new EventCreateOperationPayloadMismatchError());

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({
      code: 'CREATE_OPERATION_PAYLOAD_MISMATCH',
    }));
    expect(createEventEditorMock).toHaveBeenCalledTimes(1);
  });

  it('maps an in-flight create operation to a retryable typed conflict', async () => {
    const command = {
      contractVersion: 3,
      createOperationId: 'create-operation-1',
      draft: { basics: { name: 'Fixture' } },
    };
    parseCreateMock.mockReturnValue(command);
    createEventEditorMock.mockRejectedValue(new EventCreateOperationConflictError());

    const response = await createPost(request('http://localhost/api/events/editor', 'POST', command));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({
      code: 'CREATE_OPERATION_CONFLICT',
    }));
  });
  it('returns a versioned create bootstrap with one operation identity and preserves query intent', async () => {
    const snapshot = {
      draft: { basics: { organizationId: null } },
      catalogs: { organizations: [] },
    };
    loadCreateSnapshotMock.mockResolvedValue(snapshot);
    const response = await createGet(request(
      'http://localhost/api/events/editor?eventType=EVENT&sportId=sport_1&start=2026-09-01T10%3A00%3A00.000Z',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      contractVersion: 3,
      createOperationId: expect.any(String),
      snapshot,
    });
    expect(loadCreateSnapshotMock).toHaveBeenCalledWith(
      {
        eventType: 'EVENT',
        sportId: 'sport_1',
        start: '2026-09-01T10:00:00.000Z',
      },
      { actor: { userId: 'host_1', isAdmin: false } },
    );
  });

  it('maps stale edit revisions to a conflict without invoking persistence twice', async () => {
    const command = { contractVersion: 1, editorRevision: 'old', staffRevision: 'old', draft: {} };
    parseSaveMock.mockReturnValue(command);
    saveEventEditorMock.mockRejectedValue(new EditorRevisionConflictError());

    const response = await editPut(request('http://localhost/api/events/event_1/editor', 'PUT', command), editContext());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({
      code: 'EDITOR_REVISION_CONFLICT',
      editorRevision: 'current-editor',
      staffRevision: 'current-staff',
    }));
    expect(saveEventEditorMock).toHaveBeenCalledTimes(1);
  });
  it('normalizes a version-3 legacy BUILD_IF_MISSING Save at the PUT boundary', async () => {
    const fixture = eventEditorFixtures.find(({ name }) => name === 'single-division league')!.event;
    const draft = legacyEventToEditorDraft(fixture);
    const command = {
      contractVersion: 3,
      editorRevision: 'editor-revision-1',
      staffRevision: null,
      draft,
      scheduleTransition: {
        mode: 'BUILD_IF_MISSING',
        expectedScheduleRevision: 'schedule-revision-1',
      },
    };
    const snapshot = emptyEditorSnapshot(draft, 'EDIT');
    const result = {
      status: 'SAVED',
      snapshot: {
        ...snapshot,
        eventId: 'event_1',
        editorRevision: 'editor-revision-2',
        scheduleState: {
          ...snapshot.scheduleState,
          revision: 'schedule-revision-2',
        },
      },
      questionIdMap: {},
      staffEmailDelivery: 'NOT_REQUESTED',
      scheduleOutcome: {
        status: 'NOT_REQUESTED',
        matchCount: 0,
        warnings: [],
      },
    };
    parseSaveMock.mockImplementation((input: unknown) => (
      jest.requireActual('@/contracts/eventEditor').parseSaveEventEditorCommand(input)
    ));
    saveEventEditorMock.mockResolvedValue(result);

    const response = await editPut(
      request('http://localhost/api/events/event_1/editor', 'PUT', command),
      editContext(),
    );
    const body = await response.json();
    const domainCommand = saveEventEditorMock.mock.calls[0]?.[1];

    expect(response.status).toBe(200);
    expect(saveEventEditorMock).toHaveBeenCalledTimes(1);
    expect(domainCommand).toEqual(expect.objectContaining({
      scheduleTransition: { mode: 'PRESERVE' },
    }));
    expect(domainCommand).toEqual(expect.objectContaining({
      scheduleTransition: expect.not.objectContaining({
        expectedScheduleRevision: expect.anything(),
      }),
    }));
    expect(body).toEqual(expect.objectContaining({
      status: 'SAVED',
      scheduleOutcome: {
        status: 'NOT_REQUESTED',
        matchCount: 0,
        warnings: [],
      },
    }));
  });
  it('returns diagnostic details for unexpected edit failures', async () => {
    const command = { contractVersion: 1, editorRevision: 'current', staffRevision: 'current', draft: {} };
    parseSaveMock.mockReturnValue(command);
    saveEventEditorMock.mockRejectedValue(new Error('Database update failed.'));

    const response = await editPut(request('http://localhost/api/events/event_1/editor', 'PUT', command), editContext());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(expect.objectContaining({
      code: 'EDITOR_SAVE_FAILED',
      details: 'Database update failed.',
      requestId: expect.any(String),
    }));
    expect(body.error).toContain('Database update failed.');
    expect(body.error).toContain(body.requestId);
  });


  it('returns the canonical snapshot with read-only capabilities when mutation is not authorized', async () => {
    loadSnapshotMock.mockResolvedValueOnce({
      eventId: 'event_1',
      capabilities: {
        canEdit: false,
        canManageStaff: false,
        canDelegateHost: false,
        readOnly: true,
        readOnlyReason: 'NOT_AUTHORIZED',
      },
    });

    const response = await editGet(request('http://localhost/api/events/event_1/editor'), editContext());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      eventId: 'event_1',
      capabilities: expect.objectContaining({
        canEdit: false,
        readOnly: true,
        readOnlyReason: 'NOT_AUTHORIZED',
      }),
    }));
    expect(loadSnapshotMock).toHaveBeenCalledWith(
      'event_1',
      { actor: { userId: 'host_1', isAdmin: false } },
    );
  });
});
