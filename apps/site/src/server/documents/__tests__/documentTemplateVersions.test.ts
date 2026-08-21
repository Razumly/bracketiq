/** @jest-environment node */

import {
  createDocumentRequirementWithVersion,
  createDocumentTemplateVersion,
  ensureDocumentRequirement,
} from '@/server/documents/documentTemplateVersions';

const createClient = () => ({
  documentRequirements: {
    upsert: jest.fn(),
  },
  templateDocuments: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
});

const requirement = {
  id: 'requirement_1',
  organizationId: 'org_1',
  title: 'Participant waiver',
  status: 'ACTIVE',
};

const version = {
  id: 'version_2',
  title: 'Participant waiver',
  type: 'TEXT' as const,
  roleIndexes: [],
  signerRoles: [],
  organizationId: 'org_1',
};

describe('Document Template Version storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { latestSequence: null, expectedSequence: 1 },
    { latestSequence: 4, expectedSequence: 5 },
  ])(
    'allocates sequence $expectedSequence within one Document Requirement',
    async ({ latestSequence, expectedSequence }) => {
      const client = createClient();
      client.documentRequirements.upsert.mockResolvedValue({
        id: requirement.id,
        organizationId: requirement.organizationId,
      });
      client.$queryRaw.mockResolvedValue([{ id: requirement.id }]);
      client.templateDocuments.findFirst.mockResolvedValue(
        latestSequence === null ? null : { versionSequence: latestSequence },
      );
      client.templateDocuments.create.mockImplementation(async ({ data }) => data);

      const created = await createDocumentRequirementWithVersion(client as never, {
        requirement,
        version,
      });

      expect(created).toEqual(expect.objectContaining({
        id: version.id,
        documentRequirementId: requirement.id,
        organizationId: requirement.organizationId,
        versionSequence: expectedSequence,
      }));
      expect(client.templateDocuments.findFirst).toHaveBeenCalledWith({
        where: { documentRequirementId: requirement.id },
        orderBy: { versionSequence: 'desc' },
        select: { versionSequence: true },
      });
    },
  );

  it('rejects a Version that names a different Organization before writing', async () => {
    const client = createClient();

    await expect(createDocumentTemplateVersion(client as never, {
      requirement,
      version: { ...version, organizationId: 'org_2' },
    })).rejects.toThrow(
      'Document Requirement and Document Template Version must belong to the same Organization.',
    );
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.templateDocuments.create).not.toHaveBeenCalled();
  });

  it('rejects a Requirement returned for a different Organization', async () => {
    const client = createClient();
    client.documentRequirements.upsert.mockResolvedValue({
      id: requirement.id,
      organizationId: 'org_2',
    });

    await expect(ensureDocumentRequirement(client as never, requirement)).rejects.toThrow(
      'Document Requirement and Document Template Version must belong to the same Organization.',
    );
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.templateDocuments.create).not.toHaveBeenCalled();
  });
});
