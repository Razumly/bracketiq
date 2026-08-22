/** @jest-environment node */

import {
  createDocumentRequirementWithVersion,
  createDocumentTemplateVersion,
  editDocumentTemplateVersion,
  ensureDocumentRequirement,
  isDocumentTemplateVersionFrozen,
} from '@/server/documents/documentTemplateVersions';

const createClient = () => ({
  documentRequirements: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  templateDocuments: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  templateProviderQuarantines: {
    findUnique: jest.fn(),
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

  it('detects a frozen Version from persisted assignment references', async () => {
    const client = createClient();
    client.templateDocuments.findUnique.mockResolvedValue({
      id: 'version_1',
      frozenAt: null,
    });
    client.$queryRaw.mockResolvedValue([{ id: 'event_1' }]);

    await expect(isDocumentTemplateVersionFrozen(client as never, 'version_1')).resolves.toBe(true);
  });

  it('updates an unfrozen Version in place for compatibility', async () => {
    const client = createClient();
    const current = {
      id: 'version_1',
      documentRequirementId: requirement.id,
      versionSequence: 1,
      frozenAt: null,
      organizationId: requirement.organizationId,
      templateId: null,
      type: 'TEXT' as const,
      title: requirement.title,
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 0,
      roleIndexes: [],
      signerRoles: [],
      content: 'Old text',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([]);
    client.documentRequirements.findUnique.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: requirement.title,
      description: null,
    });
    client.documentRequirements.update.mockImplementation(async ({ data }) => ({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: data.title ?? requirement.title,
      description: data.description ?? null,
    }));
    client.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));

    const result = await editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      material: { content: 'Updated text' },
      display: { title: 'Updated waiver', description: 'Updated description' },
    });

    expect(result.isNewVersionCreated).toBe(false);
    expect(result.template.id).toBe(current.id);
    expect(result.template.content).toBe('Updated text');
    expect(result.requirement).toEqual(expect.objectContaining({
      title: 'Updated waiver',
      description: 'Updated description',
    }));
    expect(client.documentRequirements.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: requirement.id },
      data: expect.objectContaining({ title: 'Updated waiver' }),
    }));
    expect(client.templateDocuments.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: current.id },
      data: expect.not.objectContaining({ title: 'Updated waiver' }),
    }));
    expect(client.templateDocuments.create).not.toHaveBeenCalled();

  });
  it('inherits provider quarantine when an unfrozen Version switches provider ids', async () => {
    const client = createClient();
    const current = {
      id: 'version_draft',
      documentRequirementId: requirement.id,
      versionSequence: 2,
      frozenAt: null,
      providerQuarantinedAt: new Date('2026-01-02T00:00:00.000Z'),
      providerQuarantineReason: 'Provider edit was quarantined.',
      organizationId: requirement.organizationId,
      templateId: 'bold_template_old',
      type: 'PDF' as const,
      title: requirement.title,
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([]);
    client.documentRequirements.findUnique.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: requirement.title,
      description: null,
    });
    client.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    client.templateProviderQuarantines.findUnique.mockResolvedValue({
      quarantinedAt: new Date('2026-01-03T00:00:00.000Z'),
      reason: 'The target provider template is quarantined.',
    });

    const result = await editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      material: { templateId: 'bold_template_new' },
    });
    expect(result.isNewVersionCreated).toBe(false);
    expect(result.template).toEqual(expect.objectContaining({
      templateId: 'bold_template_new',
      providerQuarantinedAt: new Date('2026-01-03T00:00:00.000Z'),
      providerQuarantineReason: 'The target provider template is quarantined.',
    }));
    expect(client.templateDocuments.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: current.id },
      data: expect.objectContaining({
        templateId: 'bold_template_new',
        providerQuarantinedAt: new Date('2026-01-03T00:00:00.000Z'),
        providerQuarantineReason: 'The target provider template is quarantined.',
      }),
    }));
  });
  it('updates frozen Version display metadata without changing material fields', async () => {
    const client = createClient();
    const current = {
      id: 'version_pdf_1',
      documentRequirementId: requirement.id,
      versionSequence: 1,
      frozenAt: new Date('2026-01-01T00:00:00.000Z'),
      organizationId: requirement.organizationId,
      templateId: 'bold_template_1',
      type: 'PDF' as const,
      title: requirement.title,
      description: null,
      signOnce: true,
      requiredSignerType: 'PARENT_GUARDIAN_CHILD',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 1,
      roleIndexes: [1, 2],
      signerRoles: ['parent', 'child'],
      content: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw.mockResolvedValueOnce([current]);
    client.documentRequirements.findUnique.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: requirement.title,
      description: null,
    });
    client.documentRequirements.update.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: 'Updated display title',
      description: 'Updated display description',
    });

    const result = await editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      display: {
        title: 'Updated display title',
        description: 'Updated display description',
      },
    });

    expect(result.isNewVersionCreated).toBe(false);
    expect(result.previousVersionId).toBeNull();
    expect(result.template).toEqual(expect.objectContaining({
      id: current.id,
      templateId: current.templateId,
      type: current.type,
      signOnce: current.signOnce,
      requiredSignerType: current.requiredSignerType,
      roleIndexes: current.roleIndexes,
      signerRoles: current.signerRoles,
      content: current.content,
    }));
    expect(result.requirement).toEqual(expect.objectContaining({
      title: 'Updated display title',
      description: 'Updated display description',
    }));
    expect(client.templateDocuments.update).not.toHaveBeenCalled();
    expect(client.templateDocuments.create).not.toHaveBeenCalled();
  });

  it('freezes the referenced Version and creates the next Version without rewriting assignments', async () => {
    const client = createClient();
    const current = {
      id: 'version_1',
      documentRequirementId: requirement.id,
      versionSequence: 1,
      frozenAt: null,
      providerQuarantinedAt: new Date('2026-01-02T00:00:00.000Z'),
      providerQuarantineReason: 'Provider edit was quarantined.',
      organizationId: requirement.organizationId,
      templateId: 'bold_template_1',
      type: 'PDF' as const,
      title: requirement.title,
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ id: 'event_1' }])
      .mockResolvedValueOnce([{ id: requirement.id }]);
    client.documentRequirements.findUnique.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: requirement.title,
      description: null,
    });
    client.templateDocuments.findFirst.mockResolvedValue({ versionSequence: 1 });
    client.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    client.templateDocuments.create.mockImplementation(async ({ data }) => data);

    const result = await editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      newVersionId: 'version_2',
      material: {
        signerRoles: ['participant', 'guardian'],
        roleIndexes: [1, 2],
      },
    });

    expect(result.isNewVersionCreated).toBe(true);
    expect(result.previousVersionId).toBe(current.id);
    expect(result.template).toEqual(expect.objectContaining({
      id: 'version_2',
      documentRequirementId: requirement.id,
      versionSequence: 2,
      templateId: current.templateId,
      signerRoles: ['participant', 'guardian'],
      roleIndexes: [1, 2],
      providerQuarantinedAt: current.providerQuarantinedAt,
      providerQuarantineReason: current.providerQuarantineReason,
    }));
    expect(client.templateDocuments.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: current.id },
      data: expect.objectContaining({ frozenAt: expect.any(Date) }),
    }));
    expect(client.templateDocuments.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: current.id },
      data: expect.objectContaining({ signerRoles: expect.anything() }),
    }));
  });
  it('creates a new TEXT Version when an assigned Version content changes', async () => {
    const client = createClient();
    const current = {
      id: 'version_text_1',
      documentRequirementId: requirement.id,
      versionSequence: 1,
      frozenAt: null,
      organizationId: requirement.organizationId,
      templateId: null,
      type: 'TEXT' as const,
      title: requirement.title,
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 0,
      roleIndexes: [],
      signerRoles: [],
      content: 'Old text',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ id: 'team_1' }])
      .mockResolvedValueOnce([{ id: requirement.id }]);
    client.documentRequirements.findUnique.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: requirement.title,
      description: null,
    });
    client.templateDocuments.findFirst.mockResolvedValue({ versionSequence: 1 });
    client.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    client.templateDocuments.create.mockImplementation(async ({ data }) => data);

    const result = await editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      newVersionId: 'version_text_2',
      material: { content: 'New text' },
    });

    expect(result.isNewVersionCreated).toBe(true);
    expect(result.previousVersionId).toBe(current.id);
    expect(result.template).toEqual(expect.objectContaining({
      id: 'version_text_2',
      versionSequence: 2,
      content: 'New text',
      templateId: null,
      type: 'TEXT',
      signerRoles: [],
    }));
    expect(client.templateDocuments.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: current.id },
      data: expect.objectContaining({ content: 'New text' }),
    }));
  });
  it('forces an unassigned provider edit into a new Version', async () => {
    const client = createClient();
    const current = {
      id: 'version_pdf_1',
      documentRequirementId: requirement.id,
      versionSequence: 1,
      frozenAt: null,
      providerQuarantinedAt: new Date('2026-01-02T00:00:00.000Z'),
      providerQuarantineReason: 'Provider edit was quarantined.',
      organizationId: requirement.organizationId,
      templateId: 'bold_template_1',
      type: 'PDF' as const,
      title: requirement.title,
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ id: requirement.id }]);
    client.templateDocuments.findUnique.mockResolvedValue(null);
    client.documentRequirements.findUnique.mockResolvedValue({
      id: requirement.id,
      organizationId: requirement.organizationId,
      title: requirement.title,
      description: null,
    });
    client.templateDocuments.findFirst.mockResolvedValue({ versionSequence: 1 });
    client.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    client.templateDocuments.create.mockImplementation(async ({ data }) => data);

    const result = await editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      isNewVersionRequired: true,
      newVersionId: 'version_pdf_2',
      material: {
        templateId: 'bold_template_edited',
        signerRoles: ['participant', 'guardian'],
        roleIndexes: [1, 2],
      },
    });

    expect(result.isNewVersionCreated).toBe(true);
    expect(result.previousVersionId).toBe(current.id);
    expect(result.template).toEqual(expect.objectContaining({
      id: 'version_pdf_2',
      templateId: 'bold_template_edited',
      signerRoles: ['participant', 'guardian'],
      roleIndexes: [1, 2],
      versionSequence: 2,
      providerQuarantinedAt: null,
      providerQuarantineReason: null,
    }));
    expect(client.templateDocuments.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: current.id },
      data: expect.objectContaining({ templateId: 'bold_template_edited' }),
    }));
  });

  it('rejects provider material updates for a frozen Version without changing metadata', async () => {
    const client = createClient();
    const current = {
      id: 'version_1',
      documentRequirementId: requirement.id,
      versionSequence: 1,
      frozenAt: new Date('2026-01-01T00:00:00.000Z'),
      organizationId: requirement.organizationId,
      templateId: 'bold_template_1',
      type: 'PDF' as const,
      title: requirement.title,
      description: null,
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'staff_1',
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
      content: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    client.$queryRaw.mockResolvedValueOnce([current]);

    await expect(editDocumentTemplateVersion(client as never, {
      versionId: current.id,
      organizationId: requirement.organizationId,
      isFrozenRejectionRequired: true,
      material: { signerRoles: ['guardian'] },
      display: { title: 'Provider edit' },
    })).rejects.toMatchObject({
      name: 'DocumentTemplateVersionFrozenError',
      versionId: current.id,
    });

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.documentRequirements.findUnique).not.toHaveBeenCalled();
    expect(client.documentRequirements.update).not.toHaveBeenCalled();
    expect(client.templateDocuments.update).not.toHaveBeenCalled();
    expect(client.templateDocuments.create).not.toHaveBeenCalled();
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
