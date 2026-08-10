jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/repositories/locks', () => ({ acquireEventLock: jest.fn() }));
jest.mock('@/server/repositories/events', () => ({ upsertEventFromPayload: jest.fn() }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn().mockResolvedValue(true),
  hasOrgPermission: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/server/scheduler/matchTimingPolicy', () => ({
  resolveMatchTimingPolicy: jest.fn().mockReturnValue({
    durationMinutes: 60,
    breakMinutes: 0,
    totalMinutes: 60,
    source: 'MATCH_DURATION',
  }),
}));
jest.mock('@/app/events/[id]/schedule/components/eventForm/editorContractAdapters', () => ({
  editorDraftToLegacyEvent: jest.fn().mockReturnValue({}),
}));
jest.mock('../eventEditorSnapshot', () => ({
  buildEventEditorSnapshot: jest.fn(),
  loadEventEditorSnapshot: jest.fn(),
  loadCreateEventEditorSnapshot: jest.fn(),
}));
jest.mock('../eventStaffReconciliation', () => ({
  EVENT_STAFF_CONTRACT_VERSION: 1,
  reconcileEventStaffDesiredState: jest.fn().mockResolvedValue({ emailCandidates: [] }),
}));

import { prisma } from '@/lib/prisma';
import { acquireEventLock } from '@/server/repositories/locks';
import { upsertEventFromPayload } from '@/server/repositories/events';
import { buildEventEditorSnapshot, loadEventEditorSnapshot } from '../eventEditorSnapshot';
import { reconcileEventStaffDesiredState } from '../eventStaffReconciliation';
import {
  EditorRevisionConflictError,
  saveEventEditor,
} from '../eventEditorSave';

const txFor = (questionRows: Array<{ id: string }> = []) => {
  const tx: any = {
    events: {
      findUnique: jest.fn().mockResolvedValue({ id: 'event_1', hostId: 'host_1' }),
    },
    registrationQuestions: {
      findMany: jest.fn().mockImplementation(async () => questionRows.map((row) => ({ ...row }))),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        questionRows.push({ id: data.id });
        return data;
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  (prisma as any).$transaction = jest.fn(async (callback: (client: any) => unknown) => callback(tx));
  return tx;
};

const snapshot = (editorRevision = 'revision_1') => ({
  contractVersion: 1,
  mode: 'EDIT',
  eventId: 'event_1',
  editorRevision,
  staffRevision: 'staff_revision_1',
  draft: {},
  capabilities: {
    canUseOnlinePayments: true,
    canManageStaff: true,
    canEdit: true,
    supportsTeamStaffing: true,
  },
  catalogs: { sports: [], organizations: [], fields: [], templates: [] },
  immutable: { fieldNames: [], rental: false, template: false },
} as any);

const commandFor = (questions: unknown[]) => ({
  contractVersion: 1,
  editorRevision: 'revision_1',
  staffRevision: 'staff_revision_1',
  draft: {
    basics: { eventType: 'EVENT', hostId: 'host_1', organizationId: null },
    registration: {
      payment: { mode: 'FREE', priceCents: 0 },
      questions,
    },
    competition: {
      usesSets: false,
      matchDurationMinutes: 60,
      matchRulesOverride: null,
      divisionDetails: [],
      playoffDivisionDetails: [],
      divisionFieldIds: {},
    },
    staff: {
      assistantHostIds: [],
      officialPositions: [],
      eventOfficials: [],
      pendingInvites: [],
    },
    resources: { fieldIds: [], timeSlotIds: [], fields: [], timeSlots: [] },
  },
} as any);

describe('saveEventEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(snapshot());
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(snapshot());
  });

  it('rejects a stale editor revision before any configuration write', async () => {
    const tx = txFor();
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(snapshot('revision_current'));

    await expect(saveEventEditor(
      { userId: 'host_1' },
      commandFor([]),
      'event_1',
    )).rejects.toBeInstanceOf(EditorRevisionConflictError);

    expect(tx.events.findUnique).toHaveBeenCalledTimes(1);
    expect(upsertEventFromPayload).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredState).not.toHaveBeenCalled();
  });

  it('rolls back before question or staff reconciliation when event persistence fails', async () => {
    const tx = txFor();
    (upsertEventFromPayload as jest.Mock).mockRejectedValue(new Error('division persistence failed'));

    await expect(saveEventEditor(
      { userId: 'host_1' },
      commandFor([]),
      'event_1',
    )).rejects.toThrow('division persistence failed');

    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect(tx.registrationQuestions.create).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredState).not.toHaveBeenCalled();
  });

  it('maps a new question client id once and updates its canonical row on repeat', async () => {
    const questionRows: Array<{ id: string }> = [];
    const tx = txFor(questionRows);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue('event_1');
    (loadEventEditorSnapshot as jest.Mock)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot());

    const first = await saveEventEditor(
      { userId: 'host_1' },
      commandFor([{
        clientId: 'question_client_1',
        prompt: 'Preferred side?',
        answerType: 'TEXT',
        required: true,
        sortOrder: 0,
      }]),
      'event_1',
    );
    const canonicalId = first.questionIdMap.question_client_1;
    expect(canonicalId).toEqual(expect.any(String));
    expect(tx.registrationQuestions.create).toHaveBeenCalledTimes(1);

    await saveEventEditor(
      { userId: 'host_1' },
      commandFor([{
        id: canonicalId,
        prompt: 'Preferred side?',
        answerType: 'TEXT',
        required: true,
        sortOrder: 0,
      }]),
      'event_1',
    );

    expect(tx.registrationQuestions.create).toHaveBeenCalledTimes(1);
    expect(tx.registrationQuestions.update).toHaveBeenCalledTimes(1);
    expect(acquireEventLock).toHaveBeenCalledTimes(2);
  });
});
