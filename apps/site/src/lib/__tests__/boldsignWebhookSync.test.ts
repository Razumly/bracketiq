/** @jest-environment node */

import crypto from 'crypto';
import type { BoldSignSyncOperation } from '@/lib/boldsignSyncOperations';
const mockPrisma = {
  templateDocuments: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  templateProviderQuarantines: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockEnsureDocumentRequirement = jest.fn();
const mockEditDocumentTemplateVersion = jest.fn();
const mockUpdateBoldSignOperationById = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/server/documents/documentTemplateVersions', () => ({
  createDocumentTemplateVersion: jest.fn(),
  editDocumentTemplateVersion: mockEditDocumentTemplateVersion,
  ensureDocumentRequirement: mockEnsureDocumentRequirement,
  isDocumentTemplateVersionFrozen: jest.fn(),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  ...jest.requireActual('@/lib/boldsignSyncOperations'),
  updateBoldSignOperationById: mockUpdateBoldSignOperationById,
}));

import {
  isAuthEventType,
  isVerificationEvent,
  parseBoldSignWebhookEvent,
  projectTemplateProjectionFromOperation,
  shouldProcessBoldSignEvent,
  verifyBoldSignWebhookSignature,
} from '@/lib/boldsignWebhookSync';

describe('boldsignWebhookSync', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BOLDSIGN_WEBHOOK_SECRET: 'test_webhook_secret',
    };
    mockPrisma.templateProviderQuarantines.upsert.mockReset();
    mockPrisma.templateDocuments.findFirst.mockReset();
    mockPrisma.templateDocuments.findUnique.mockReset();
    mockPrisma.templateDocuments.updateMany.mockReset();
    mockPrisma.$transaction.mockReset();
    mockUpdateBoldSignOperationById.mockReset();
    mockEnsureDocumentRequirement.mockReset();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback({
      templateDocuments: mockPrisma.templateDocuments,
      templateProviderQuarantines: mockPrisma.templateProviderQuarantines,
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('verifies a valid BoldSign webhook signature', () => {
    const payload = JSON.stringify({ event: { id: 'evt_1', eventType: 'Sent' } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', 'test_webhook_secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const result = verifyBoldSignWebhookSignature({
      rawBody: payload,
      signatureHeader: `t=${timestamp},s0=${signature}`,
      now: new Date(timestamp * 1000),
    });

    expect(result.valid).toBe(true);
    expect(result.signatureTimestamp).toBe(timestamp);
  });

  it('rejects invalid signatures', () => {
    const payload = JSON.stringify({ event: { id: 'evt_1', eventType: 'Sent' } });
    const timestamp = Math.floor(Date.now() / 1000);

    const result = verifyBoldSignWebhookSignature({
      rawBody: payload,
      signatureHeader: `t=${timestamp},s0=deadbeef`,
      now: new Date(timestamp * 1000),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('verification failed');
  });

  it('rejects signatures outside timestamp tolerance', () => {
    const payload = JSON.stringify({ event: { id: 'evt_1', eventType: 'Sent' } });
    const timestamp = Math.floor(Date.now() / 1000) - 1_000;
    const signature = crypto
      .createHmac('sha256', 'test_webhook_secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const result = verifyBoldSignWebhookSignature({
      rawBody: payload,
      signatureHeader: `t=${timestamp},s0=${signature}`,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside tolerance');
  });

  it('parses canonical event fields from webhook payloads', () => {
    const parsed = parseBoldSignWebhookEvent({
      payload: {
        event: {
          id: 'evt_1',
          eventType: 'TemplateCreated',
          createdAt: '2026-03-01T12:00:00.000Z',
        },
        data: {
          object: {
            templateId: 'tmpl_1',
            status: 'Active',
          },
        },
      },
      rawBody: '{"event":{"id":"evt_1"}}',
      headerEventType: 'TemplateCreated',
    });

    expect(parsed.eventId).toBe('evt_1');
    expect(parsed.eventType).toBe('TemplateCreated');
    expect(parsed.eventToken).toBe('templatecreated');
    expect(parsed.templateId).toBe('tmpl_1');
    expect(parsed.status).toBe('Active');
    expect(parsed.eventTimestamp).toBeGreaterThan(0);
  });

  it('identifies authentication and verification events for filtering', () => {
    expect(isAuthEventType('AuthenticationFailed')).toBe(true);
    expect(shouldProcessBoldSignEvent('AuthenticationFailed')).toBe(false);
    expect(shouldProcessBoldSignEvent('Sent')).toBe(true);
    expect(isVerificationEvent('Verification', 'TemplateCreated')).toBe(true);
  });
  it('does not project a deferred template before the edit webhook', async () => {
    const operation: BoldSignSyncOperation = {
      id: 'operation_1',
      operationType: 'TEMPLATE_CREATE',
      status: 'PENDING_WEBHOOK',
      idempotencyKey: 'idempotency_1',
      organizationId: 'org_1',
      templateId: 'bold_template_1',
      payload: {
        deferProjectionUntilEdit: true,
        sourceTemplateDocumentId: 'version_1',
      },
    };

    const result = await projectTemplateProjectionFromOperation({
      templateId: 'bold_template_1',
      operation,
      status: 'ACTIVE',
      eventToken: 'templatecreated',
    });

    expect(result).toBeNull();
    expect(mockPrisma.templateDocuments.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.templateDocuments.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('projects the cloned template when the edit webhook arrives', async () => {
    mockPrisma.templateDocuments.findFirst.mockResolvedValue(null);
    const sourceTemplate = {
      id: 'version_1',
      organizationId: 'org_1',
      title: 'Original title',
      description: null,
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signOnce: false,
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
    };
    const projectedTemplate = {
      id: 'version_2',
      templateId: 'bold_template_edited',
    };
    mockPrisma.templateDocuments.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => (
        where.id === 'version_1' ? sourceTemplate : null
      ),
    );
    mockEnsureDocumentRequirement.mockResolvedValue({ id: 'requirement_1' });
    mockEditDocumentTemplateVersion.mockResolvedValue({
      template: { id: 'version_2' },
    });

    const operation: BoldSignSyncOperation = {
      id: 'operation_1',
      operationType: 'TEMPLATE_CREATE',
      status: 'PENDING_WEBHOOK',
      idempotencyKey: 'idempotency_1',
      organizationId: 'org_1',
      templateId: 'bold_template_edited',
      templateDocumentId: 'version_2',
      payload: {
        deferProjectionUntilEdit: true,
        sourceTemplateDocumentId: 'version_1',
        title: 'Edited title',
        roles: [{ roleIndex: 2, signerRole: 'participant' }],
      },
    };

    const result = await projectTemplateProjectionFromOperation({
      templateId: 'bold_template_edited',
      operation,
      status: 'ACTIVE',
      eventToken: 'templateedited',
    });

    expect(result).toEqual({ id: 'version_2' });
    expect(mockEditDocumentTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        templateDocuments: mockPrisma.templateDocuments,
      }),
      expect.objectContaining({
        versionId: 'version_1',
        organizationId: 'org_1',
        isFrozenRejectionRequired: false,
        isNewVersionRequired: true,
        newVersionId: 'version_2',
        material: expect.objectContaining({
          templateId: 'bold_template_edited',
        }),
      }),
    );

    mockPrisma.templateDocuments.findFirst.mockImplementation(
      async ({ where }: { where?: Record<string, unknown> }) =>
        where && 'frozenAt' in where
          ? null
          : projectedTemplate,
    );
    mockPrisma.templateDocuments.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => (
        where.id === 'version_1' ? sourceTemplate : projectedTemplate
      ),
    );
    const duplicate = await projectTemplateProjectionFromOperation({
      templateId: 'bold_template_edited',
      operation,
      status: 'ACTIVE',
      eventToken: 'templateedited',
    });

    expect(duplicate).toEqual(expect.objectContaining({
      id: 'version_2',
      templateId: 'bold_template_edited',
    }));
    expect(mockEditDocumentTemplateVersion).toHaveBeenCalledTimes(1);
  });
  it('rejects a provider edit against a frozen Version instead of reusing its provider id', async () => {
    const frozenTemplate = {
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      frozenAt: new Date('2026-08-21T00:00:00.000Z'),
      type: 'PDF',
      templateId: 'bold_template_1',
      title: 'Original title',
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
    };
    mockPrisma.templateDocuments.findFirst.mockResolvedValue(frozenTemplate);
    mockEnsureDocumentRequirement.mockResolvedValue({ id: 'requirement_1', organizationId: 'org_1' });
    mockEditDocumentTemplateVersion.mockRejectedValue(new Error('frozen'));

    const operation = {
      id: 'operation_1',
      operationType: 'TEMPLATE_CREATE',
      status: 'PENDING_WEBHOOK',
      idempotencyKey: 'idempotency_1',
      organizationId: 'org_1',
      templateId: 'bold_template_1',
      payload: {
        documentRequirementId: 'requirement_1',
        organizationId: 'org_1',
        title: 'Provider changed title',
        type: 'PDF',
      },
    } as BoldSignSyncOperation;

    await expect(projectTemplateProjectionFromOperation({
      templateId: 'bold_template_1',
      operation,
      status: 'ACTIVE',
      eventToken: 'templateedited',
    })).rejects.toThrow('frozen');

    expect(mockUpdateBoldSignOperationById).toHaveBeenCalledWith(
      'operation_1',
      expect.objectContaining({
        status: 'FAILED',
        lastError: expect.stringContaining('quarantined'),
        completedAt: expect.any(Date),
      }),
      expect.objectContaining({
        templateDocuments: mockPrisma.templateDocuments,
      }),
    );
    expect(mockEditDocumentTemplateVersion).not.toHaveBeenCalled();
  });
  it('quarantines a detached edit session that reuses a frozen provider id', async () => {
    const frozenTemplate = {
      id: 'version_1',
      organizationId: 'org_1',
      frozenAt: new Date('2026-08-21T00:00:00.000Z'),
      templateId: 'bold_template_1',
    };
    mockPrisma.templateDocuments.findFirst.mockImplementation(
      async ({ where }: { where?: Record<string, unknown> }) =>
        where && 'frozenAt' in where ? frozenTemplate : null,
    );
    mockPrisma.templateDocuments.findUnique.mockResolvedValue(frozenTemplate);

    const operation = {
      id: 'operation_reused_provider_id',
      operationType: 'TEMPLATE_CREATE',
      status: 'PENDING_WEBHOOK',
      idempotencyKey: 'idempotency_reused_provider_id',
      organizationId: 'org_1',
      templateId: 'bold_template_1',
      payload: {
        deferProjectionUntilEdit: true,
        sourceTemplateDocumentId: 'version_1',
        documentRequirementId: 'requirement_1',
        organizationId: 'org_1',
        title: 'Provider changed title',
        type: 'PDF',
      },
    } as BoldSignSyncOperation;

    await expect(projectTemplateProjectionFromOperation({
      templateId: 'bold_template_1',
      operation,
      status: 'ACTIVE',
      eventToken: 'templateedited',
    })).rejects.toThrow(/quarantined/i);

    expect(mockUpdateBoldSignOperationById).toHaveBeenCalledWith(
      'operation_reused_provider_id',
      expect.objectContaining({
        status: 'FAILED',
        lastError: expect.stringContaining('quarantined'),
      }),
      expect.objectContaining({
        templateDocuments: mockPrisma.templateDocuments,
      }),
    );
    expect(mockEditDocumentTemplateVersion).not.toHaveBeenCalled();
  });
  it('quarantines later provider edits after a new Version exists', async () => {
    const latestTemplate = {
      id: 'version_2',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      frozenAt: null,
      type: 'PDF',
      templateId: 'bold_template_shared',
      title: 'Current title',
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
    };
    const frozenTemplate = {
      ...latestTemplate,
      id: 'version_1',
      templateId: 'bold_template_original',
      frozenAt: new Date('2026-08-20T00:00:00.000Z'),
    };
    mockPrisma.templateDocuments.findFirst
      .mockImplementation(async ({ where }: { where?: Record<string, unknown> }) =>
        where && 'frozenAt' in where ? frozenTemplate : latestTemplate);
    mockPrisma.templateDocuments.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === 'version_1' ? frozenTemplate : null,
    );

    const operation = {
      id: 'operation_later_detached_edit',
      operationType: 'TEMPLATE_CREATE',
      status: 'PENDING_WEBHOOK',
      idempotencyKey: 'idempotency_later_detached_edit',
      organizationId: 'org_1',
      templateDocumentId: 'version_2',
      templateId: 'bold_template_shared',
      payload: {
        deferProjectionUntilEdit: true,
        sourceTemplateDocumentId: 'version_1',
        documentRequirementId: 'requirement_1',
        organizationId: 'org_1',
        title: 'Later provider change',
        type: 'PDF',
      },
    } as BoldSignSyncOperation;

    await expect(projectTemplateProjectionFromOperation({
      templateId: 'bold_template_shared',
      operation,
      status: 'ACTIVE',
      eventToken: 'templateedited',
    })).rejects.toThrow(/quarantined/i);

    expect(mockUpdateBoldSignOperationById).toHaveBeenCalledWith(
      'operation_later_detached_edit',
      expect.objectContaining({
        status: 'FAILED',
        lastError: expect.stringContaining('quarantined'),
      }),
      expect.objectContaining({
        templateDocuments: mockPrisma.templateDocuments,
      }),
    );
    expect(mockEditDocumentTemplateVersion).not.toHaveBeenCalled();
  });
  it('quarantines a provider ID when any referenced Version is frozen', async () => {
    const latestTemplate = {
      id: 'version_2',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      frozenAt: null,
      type: 'PDF',
      templateId: 'bold_template_1',
      title: 'Current title',
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
    };
    const frozenTemplate = {
      ...latestTemplate,
      id: 'version_1',
      frozenAt: new Date('2026-08-20T00:00:00.000Z'),
    };
    mockPrisma.templateDocuments.findFirst
      .mockImplementation(async ({ where }: { where?: Record<string, unknown> }) =>
        where && 'frozenAt' in where ? frozenTemplate : latestTemplate);

    const operation = {
      id: 'operation_reused_provider_id',
      operationType: 'TEMPLATE_CREATE',
      status: 'PENDING_WEBHOOK',
      idempotencyKey: 'idempotency_reused_provider_id',
      organizationId: 'org_1',
      templateId: 'bold_template_1',
      payload: {
        documentRequirementId: 'requirement_1',
        organizationId: 'org_1',
        title: 'Provider changed title',
        type: 'PDF',
      },
    } as BoldSignSyncOperation;

    await expect(projectTemplateProjectionFromOperation({
      templateId: 'bold_template_1',
      operation,
      status: 'ACTIVE',
      eventToken: 'templateedited',
    })).rejects.toThrow(/quarantined/i);

    expect(mockUpdateBoldSignOperationById).toHaveBeenCalledWith(
      'operation_reused_provider_id',
      expect.objectContaining({
        status: 'FAILED',
        lastError: expect.stringContaining('quarantined'),
      }),
      expect.objectContaining({
        templateDocuments: mockPrisma.templateDocuments,
      }),
    );
    expect(mockPrisma.templateDocuments.updateMany).toHaveBeenCalledWith({
      where: {
        templateId: 'bold_template_1',
        providerQuarantinedAt: null,
      },
      data: {
        providerQuarantinedAt: expect.any(Date),
        providerQuarantineReason: expect.stringContaining('quarantined'),
        updatedAt: expect.any(Date),
      },
    });
    expect(mockEditDocumentTemplateVersion).not.toHaveBeenCalled();
  });
});
