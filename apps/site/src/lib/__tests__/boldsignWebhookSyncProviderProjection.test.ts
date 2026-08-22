/** @jest-environment node */

type TestRow = Record<string, unknown>;
type QueryArgs = {
  where?: Record<string, unknown>;
  select?: Record<string, boolean>;
};
type WriteArgs = QueryArgs & {
  data: TestRow;
};

const state: {
  signedDocuments: TestRow[];
  documentSubjects: TestRow[];
  satisfactions: TestRow[];
} = {
  signedDocuments: [],
  documentSubjects: [],
  satisfactions: [],
};

let failureSignerRole: string | null = null;

const matchesWhere = (row: TestRow, where: Record<string, unknown>): boolean => {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') {
      return Array.isArray(value) && value.some((branch) =>
        branch
        && typeof branch === 'object'
        && !Array.isArray(branch)
        && matchesWhere(row, branch as Record<string, unknown>));
    }
    if (value && typeof value === 'object' && 'not' in value) {
      return row[key] !== value.not;
    }
    if (value && typeof value === 'object' && 'in' in value) {
      return Array.isArray(value.in) && value.in.includes(row[key]);
    }
    return row[key] === value;
  });
};

const selected = (row: TestRow, select?: Record<string, boolean>): TestRow => {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
};

const sensitiveUserDataMock = { findFirst: jest.fn() };
const authUserMock = { findUnique: jest.fn() };
const eventsMock = { findMany: jest.fn() };
const canonicalTeamsMock = { findUnique: jest.fn() };

const documentTransactionClient = {
  signedDocuments: {
    findFirst: jest.fn(async ({ where = {}, select }: QueryArgs) => {
      const row = state.signedDocuments.find((candidate) => matchesWhere(candidate, where));
      return row ? selected(row, select) : null;
    }),
    findMany: jest.fn(async ({ where, select }: QueryArgs) => state.signedDocuments
      .filter((row) => !where || matchesWhere(row, where))
      .map((row) => selected(row, select))),
    create: jest.fn(async ({ data, select }: WriteArgs) => {
      if (failureSignerRole && data.signerRole === failureSignerRole) {
        throw new Error(`simulated ${failureSignerRole} projection failure`);
      }
      const row = { ...data };
      state.signedDocuments.push(row);
      return selected(row, select);
    }),
    update: jest.fn(async ({ where = {}, data, select }: WriteArgs) => {
      const row = state.signedDocuments.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error(`missing signed document ${String(where.id)}`);
      Object.assign(row, data);
      return selected(row, select);
    }),
    updateMany: jest.fn(async ({ where = {}, data }: WriteArgs) => {
      const rows = state.signedDocuments.filter((row) => matchesWhere(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    }),
  },
  documentSubjects: {
    upsert: jest.fn(async ({
      where,
      create,
      update,
    }: {
      where: Record<string, unknown>;
      create: TestRow;
      update: TestRow;
    }) => {
      const key = where.organizationId_userId;
      if (!key || typeof key !== 'object' || !('organizationId' in key) || !('userId' in key)) {
        throw new Error('missing Document Subject key');
      }
      const row = state.documentSubjects.find((candidate) =>
        candidate.organizationId === key.organizationId && candidate.userId === key.userId);
      if (!row) {
        const created = { ...create };
        state.documentSubjects.push(created);
        return created;
      }
      Object.assign(row, update);
      return row;
    }),
  },
  documentRequirementSatisfactions: {
    findFirst: jest.fn(async ({ where = {}, select }: QueryArgs) => {
      const row = state.satisfactions.find((candidate) => matchesWhere(candidate, where));
      return row ? selected(row, select) : null;
    }),
    upsert: jest.fn(async ({
      where,
      create,
      update,
    }: {
      where: Record<string, unknown>;
      create: TestRow;
      update: TestRow;
    }) => {
      let row = state.satisfactions.find((candidate) => candidate.id === where.id);
      if (!row) {
        row = { ...create };
        state.satisfactions.push(row);
      } else {
        Object.assign(row, update);
      }
      return row;
    }),
    updateMany: jest.fn(async ({
      where = {},
      data,
    }: WriteArgs) => {
      const rows = state.satisfactions.filter((row) => matchesWhere(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    }),
  },
  eventRegistrations: {
    findMany: jest.fn(async () => []),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  sensitiveUserData: sensitiveUserDataMock,
  authUser: authUserMock,
  events: eventsMock,
  canonicalTeams: canonicalTeamsMock,
};

const prismaMock = {
  ...documentTransactionClient,
  sensitiveUserData: sensitiveUserDataMock,
  authUser: authUserMock,
  templateDocuments: { findFirst: jest.fn(), findUnique: jest.fn() },
  events: eventsMock,
  teamRegistrations: { updateMany: jest.fn(async () => ({ count: 0 })) },
  canonicalTeams: canonicalTeamsMock,
  $transaction: jest.fn(),
};


const operationMock = jest.fn();
const updateOperationMock = jest.fn();
const createOperationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/boldsignServer', () => ({
  getDocumentProperties: jest.fn(),
  getTemplateProperties: jest.fn(),
  isBoldSignForbiddenError: jest.fn(() => false),
  isBoldSignInvalidTemplateIdError: jest.fn(() => false),
  isBoldSignNotFoundError: jest.fn(() => false),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_WEBHOOK: 'PENDING_WEBHOOK',
    PENDING_RECONCILE: 'PENDING_RECONCILE',
    CONFIRMED: 'CONFIRMED',
    FAILED: 'FAILED',
  },
  BOLDSIGN_OPERATION_TYPES: { DOCUMENT_SEND: 'DOCUMENT_SEND' },
  BOLDSIGN_SYNC_TIMEOUT_MS: 86_400_000,
  findLatestBoldSignOperation: operationMock,
  updateBoldSignOperationById: updateOperationMock,
  createOrUpdateBoldSignOperation: createOperationMock,

  getBoldSignOperationById: jest.fn(),
  listBoldSignOperationsForReconcile: jest.fn(),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  acquireEventLockAndLoadStructure: jest.fn(),
}));
jest.mock('@/server/teams/teamRegistrationDocuments', () => ({
  syncAllTeamRegistrationConsentStatusesForRegistrant: jest.fn(),
}));
jest.mock('@/lib/childConsentProgress', () => ({
  syncChildRegistrationConsentStatus: jest.fn(),
}));
jest.mock('@/server/documents/documentTemplateVersions', () => ({
  createDocumentTemplateVersion: jest.fn(),
  editDocumentTemplateVersion: jest.fn(),
  ensureDocumentRequirement: jest.fn(),
  isDocumentTemplateVersionFrozen: jest.fn(),
}));

import {
  projectSignedDocumentEvidence,
  type SignedDocumentProjectionCommand,
} from '@/lib/boldsignWebhookSync';
const projectionCommand = (
  signers: SignedDocumentProjectionCommand['signers'],
  overrides: Partial<SignedDocumentProjectionCommand> = {},
): SignedDocumentProjectionCommand => ({
  documentId: 'provider-document-1',
  eventToken: 'completed',
  status: 'Completed',
  signedAt: '2026-08-21T00:00:00.000Z',
  templateId: 'provider-template-1',
  templateDocumentId: 'version-1',
  documentName: 'Consent',
  organizationId: 'organization-1',
  eventId: 'event-1',
  teamId: null,
  signers,
  ...overrides,
});


const resetState = () => {
  state.signedDocuments.length = 0;
  state.documentSubjects.length = 0;
  state.satisfactions.length = 0;
  failureSignerRole = null;
  jest.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (
    callback: (tx: typeof documentTransactionClient) => unknown,
  ) => {
    const signedDocuments = state.signedDocuments.map((row) => ({ ...row }));
    const documentSubjects = state.documentSubjects.map((row) => ({ ...row }));
    const satisfactions = state.satisfactions.map((row) => ({ ...row }));
    try {
      return await callback(documentTransactionClient);
    } catch (error) {
      state.signedDocuments.splice(0, state.signedDocuments.length, ...signedDocuments);
      state.documentSubjects.splice(0, state.documentSubjects.length, ...documentSubjects);
      state.satisfactions.splice(0, state.satisfactions.length, ...satisfactions);
      throw error;
    }
  });
  prismaMock.templateDocuments.findFirst.mockResolvedValue({
    id: 'version-1',
    organizationId: 'organization-1',
    title: 'Consent',
    documentRequirementId: 'requirement-1',
    signOnce: false,
    signerRoles: ['participant', 'child'],
  });
  prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
  prismaMock.authUser.findUnique.mockResolvedValue(null);
  prismaMock.events.findMany.mockResolvedValue([]);
  prismaMock.teamRegistrations.updateMany.mockResolvedValue({ count: 0 });
  updateOperationMock.mockResolvedValue(undefined);
};

describe('BoldSign provider document projection integrity', () => {
  beforeEach(resetState);

  it('restores projection state after a later signer fails', async () => {
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({
      where,
    }: { where: Record<string, unknown> }) => {
      if (where.email === 'first@example.test') return { userId: 'first-user' };
      if (where.email === 'second@example.test') return { userId: 'second-user' };
      return null;
    });
    failureSignerRole = 'child';

    await expect(projectSignedDocumentEvidence({
      command: projectionCommand([
        {
          signerEmail: 'first@example.test',
          signerRole: 'participant',
          roleIndex: 1,
          signerStatusToken: 'completed',
          signedAt: null,
          userId: null,
        },
        {
          signerEmail: 'second@example.test',
          signerRole: 'child',
          roleIndex: 2,
          signerStatusToken: 'completed',
          signedAt: null,
          userId: null,
        },
      ]),
    })).rejects.toThrow('simulated child projection failure');

    expect(state.signedDocuments).toEqual([]);
    expect(state.documentSubjects).toEqual([]);
    expect(state.satisfactions).toEqual([]);
  });
  it('retains completion time when a roleless completion updates existing evidence', async () => {
    state.signedDocuments.push({
      id: 'evidence-1',
      signedDocumentId: 'provider-document-1',
      organizationId: 'organization-1',
      status: 'UNSIGNED',
      signedAt: null,
    });

    await projectSignedDocumentEvidence({
      command: projectionCommand([]),
    });

    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      status: 'SIGNED',
      signedAt: '2026-08-21T00:00:00.000Z',
    }));

    await projectSignedDocumentEvidence({
      command: projectionCommand([], {
        signedAt: '2026-08-22T00:00:00.000Z',
      }),
    });

    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      status: 'SIGNED',
      signedAt: '2026-08-21T00:00:00.000Z',
    }));
  });
  it('does not assign signed time for a roleless non-completion fallback', async () => {
    state.signedDocuments.push({
      id: 'evidence-1',
      signedDocumentId: 'provider-document-1',
      organizationId: 'organization-1',
      status: 'UNSIGNED',
      signedAt: null,
    });

    await projectSignedDocumentEvidence({
      command: projectionCommand([], {
        eventToken: 'sent',
        status: 'Sent',
        signedAt: '2026-08-22T00:00:00.000Z',
      }),
    });

    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      status: 'UNSIGNED',
      signedAt: null,
    }));
  });

  it('retains an unknown structured signer without signer or subject identity', async () => {
    await projectSignedDocumentEvidence({
      command: projectionCommand([{
        signerEmail: 'unknown@example.test',
        signerRole: 'participant',
        roleIndex: 1,
        signerStatusToken: 'completed',
        signedAt: null,
        userId: null,
      }]),
    });

    expect(state.signedDocuments).toHaveLength(1);
    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      organizationId: 'organization-1',
      signedDocumentId: 'provider-document-1',
      templateId: 'version-1',
      userId: null,
      signerUserId: null,
      documentSubjectId: null,
      signerEmail: 'unknown@example.test',
    }));
    expect(state.documentSubjects).toHaveLength(0);
    expect(state.satisfactions).toHaveLength(0);
  });
  it('derives all required roles when a provider version has no explicit role list', async () => {
    prismaMock.templateDocuments.findFirst.mockResolvedValue({
      id: 'version-1',
      organizationId: 'organization-1',
      title: 'Consent',
      documentRequirementId: 'requirement-1',
      requiredSignerType: 'PARENT_GUARDIAN_CHILD',
      signOnce: false,
      signerRoles: [],
    });

    await projectSignedDocumentEvidence({
      command: projectionCommand([
        {
          signerEmail: 'parent@example.test',
          signerRole: 'parent_guardian',
          roleIndex: 1,
          signerStatusToken: 'completed',
          signedAt: null,
          userId: 'parent-user',
        },
        {
          signerEmail: 'child@example.test',
          signerRole: 'child',
          roleIndex: 2,
          signerStatusToken: 'completed',
          signedAt: null,
          userId: 'child-user',
        },
      ]),
    });

    expect(state.satisfactions).toHaveLength(1);
    expect(state.satisfactions[0]).toEqual(expect.objectContaining({
      requiredSignerRoles: ['Parent/Guardian', 'Child'],
      completedSignerRoles: ['parent_guardian', 'child'],
      status: 'SATISFIED',
      isComplete: true,
    }));
  });


  it('invalidates an active Satisfaction when BoldSign terminates a signed document', async () => {
    prismaMock.templateDocuments.findFirst.mockResolvedValue({
      id: 'version-1',
      organizationId: 'organization-1',
      title: 'Consent',
      documentRequirementId: 'requirement-1',
      signOnce: false,
      signerRoles: ['participant'],
    });

    await projectSignedDocumentEvidence({
      command: projectionCommand([{
        signerEmail: 'participant@example.test',
        signerRole: 'participant',
        roleIndex: 1,
        signerStatusToken: 'completed',
        signedAt: null,
        userId: 'participant-user',
      }]),
    });

    expect(state.satisfactions).toHaveLength(1);
    expect(state.satisfactions[0]).toEqual(expect.objectContaining({
      status: 'SATISFIED',
      isComplete: true,
    }));

    const terminalCommand = projectionCommand([{
      signerEmail: 'participant@example.test',
      signerRole: 'participant',
      roleIndex: 1,
      signerStatusToken: 'revoked',
      signedAt: null,
      userId: 'participant-user',
    }], {
      eventToken: 'revoked',
      status: 'Revoked',
      signedAt: '2026-08-22T00:00:00.000Z',
    });
    await projectSignedDocumentEvidence({ command: terminalCommand });
    await projectSignedDocumentEvidence({ command: terminalCommand });

    expect(state.signedDocuments).toHaveLength(1);
    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      status: 'REVOKED',
    }));
    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      signedAt: '2026-08-21T00:00:00.000Z',
    }));
    expect(state.satisfactions[0]).toEqual(expect.objectContaining({
      status: 'INVALIDATED',
      isComplete: false,
    }));
  });

  it('invalidates every existing Satisfaction when a terminal signer is unmatched', async () => {
    state.signedDocuments.push({
      id: 'existing-evidence',
      signedDocumentId: 'provider-document-1',
      templateId: 'version-1',
      organizationId: 'organization-1',
      status: 'SIGNED',
      signedAt: '2026-08-21T00:00:00.000Z',
    });
    state.satisfactions.push({
      id: 'document-satisfaction:existing-evidence',
      sourceEvidenceId: 'existing-evidence',
      status: 'SATISFIED',
      isComplete: true,
    });

    const terminalCommand = projectionCommand([{
      signerEmail: 'unmatched@example.test',
      signerRole: 'other',
      roleIndex: 2,
      signerStatusToken: 'revoked',
      signedAt: null,
      userId: null,
    }], {
      eventToken: 'revoked',
      status: 'Revoked',
    });
    await projectSignedDocumentEvidence({ command: terminalCommand });
    await projectSignedDocumentEvidence({ command: terminalCommand });

    expect(state.signedDocuments).toHaveLength(1);
    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      id: 'existing-evidence',
      status: 'REVOKED',
    }));
    expect(state.satisfactions[0]).toEqual(expect.objectContaining({
      status: 'INVALIDATED',
      isComplete: false,
    }));
  });


  it('rejects existing evidence owned by another Organization', async () => {
    state.signedDocuments.push({
      id: 'foreign-evidence',
      signedDocumentId: 'provider-document-1',
      organizationId: 'other-organization',
    });

    await expect(projectSignedDocumentEvidence({
      command: projectionCommand([{
        signerEmail: 'participant@example.test',
        signerRole: 'participant',
        roleIndex: 1,
        signerStatusToken: 'completed',
        signedAt: null,
        userId: null,
      }]),
    })).rejects.toThrow('evidence Organization ownership mismatch');

    expect(state.signedDocuments).toEqual([expect.objectContaining({
      id: 'foreign-evidence',
      organizationId: 'other-organization',
    })]);
    expect(state.documentSubjects).toHaveLength(0);
    expect(state.satisfactions).toHaveLength(0);
  });

  it('repairs ownerless evidence and preserves one row on repeated projection', async () => {
    state.signedDocuments.push({
      id: 'legacy-ownerless-evidence',
      signedDocumentId: 'provider-document-1',
      templateId: 'version-1',
      organizationId: null,
      userId: 'participant-user',
      signerRole: 'participant',
      hostId: null,
      status: 'UNSIGNED',
      signedAt: null,
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ userId: 'participant-user' });
    const command = projectionCommand([{
      signerEmail: 'participant@example.test',
      signerRole: 'participant',
      roleIndex: 1,
      signerStatusToken: 'completed',
      signedAt: null,
      userId: null,
    }]);

    await projectSignedDocumentEvidence({ command });
    await projectSignedDocumentEvidence({ command });

    expect(state.signedDocuments).toHaveLength(1);
    expect(state.signedDocuments[0]).toEqual(expect.objectContaining({
      organizationId: 'organization-1',
      documentSubjectId: 'document-subject:organization-1:participant-user',
    }));
    expect(state.documentSubjects).toHaveLength(1);
    expect(documentTransactionClient.signedDocuments.create).toHaveBeenCalledTimes(0);
    expect(documentTransactionClient.signedDocuments.update).toHaveBeenCalledTimes(2);
    expect(documentTransactionClient.documentRequirementSatisfactions.upsert).toHaveBeenCalledTimes(2);
  });
});
