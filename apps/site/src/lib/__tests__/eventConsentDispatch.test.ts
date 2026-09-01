/** @jest-environment node */


const mockPrisma = {
  templateDocuments: {
    findMany: jest.fn(),
  },
  documentRequirementSatisfactions: {
    findMany: jest.fn(),
  },
  templateProviderQuarantines: {
    findMany: jest.fn(),
  },
};
const mockGetTemplateRoles = jest.fn();
const mockIsBoldSignConfigured = jest.fn();
const mockSendDocumentFromTemplate = jest.fn();
const mockCreateDocumentSendOperation = jest.fn();
const mockFindLatestBoldSignOperation = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/boldsignServer', () => ({
  getTemplateRoles: (...args: unknown[]) => mockGetTemplateRoles(...args),
  isBoldSignConfigured: (...args: unknown[]) => mockIsBoldSignConfigured(...args),
  sendDocumentFromTemplate: (...args: unknown[]) => mockSendDocumentFromTemplate(...args),
}));
jest.mock('@/lib/boldsignWebhookSync', () => ({
  createDocumentSendOperation: (...args: unknown[]) => mockCreateDocumentSendOperation(...args),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    FAILED: 'FAILED',
    TIMED_OUT: 'TIMED_OUT',
  },
  findLatestBoldSignOperation: (...args: unknown[]) => mockFindLatestBoldSignOperation(...args),
}));
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';

describe('event consent document dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
    mockIsBoldSignConfigured.mockReturnValue(true);
    mockPrisma.templateProviderQuarantines.findMany.mockResolvedValue([]);
    mockPrisma.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'version_quarantined',
        providerQuarantinedAt: null,
        templateId: 'provider_quarantined',
        title: 'Quarantined waiver',
        description: null,
        type: 'PDF',
        requiredSignerType: 'PARTICIPANT',
        roleIndex: 1,
        roleIndexes: [1],
        signerRoles: ['participant'],
      },
    ]);
    mockPrisma.templateProviderQuarantines.findMany.mockResolvedValue([
      { providerTemplateId: 'provider_quarantined' },
    ]);
  });

  it('rejects a quarantined Version before any provider call', async () => {
    const result = await dispatchRequiredEventDocuments({
      eventId: 'event_1',
      organizationId: 'org_1',
      requiredTemplateIds: ['version_quarantined'],
      participantUserId: 'user_1',
    });

    expect(result).toEqual(expect.objectContaining({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [expect.stringContaining('quarantined')],
    }));
    expect(mockGetTemplateRoles).not.toHaveBeenCalled();
    expect(mockSendDocumentFromTemplate).not.toHaveBeenCalled();
    expect(mockCreateDocumentSendOperation).not.toHaveBeenCalled();
    expect(mockFindLatestBoldSignOperation).not.toHaveBeenCalled();
  });
  it('does not dispatch a template already satisfied by imported evidence', async () => {
    mockPrisma.templateProviderQuarantines.findMany.mockResolvedValue([]);
    mockPrisma.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'version_imported',
        providerQuarantinedAt: null,
        templateId: 'provider_imported',
        title: 'Imported waiver',
        description: null,
        type: 'PDF',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
        roleIndex: 1,
        roleIndexes: [1],
        signerRoles: ['participant'],
      },
    ]);
    mockPrisma.documentRequirementSatisfactions.findMany.mockResolvedValue([
      { templateDocumentId: 'version_imported' },
    ]);

    const result = await dispatchRequiredEventDocuments({
      eventId: 'event_1',
      organizationId: 'org_1',
      requiredTemplateIds: ['version_imported'],
      participantUserId: 'user_1',
    });

    expect(result).toEqual(expect.objectContaining({
      sentDocumentIds: [],
      firstDocumentId: null,
      errors: [],
    }));
    expect(mockGetTemplateRoles).not.toHaveBeenCalled();
    expect(mockSendDocumentFromTemplate).not.toHaveBeenCalled();
    expect(mockCreateDocumentSendOperation).not.toHaveBeenCalled();
  });

});
