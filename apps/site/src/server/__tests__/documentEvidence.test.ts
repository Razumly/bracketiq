import {
  appendDocumentEvidenceAuditEvent,
  createDocumentRequirementSatisfaction,
  invalidateDocumentRequirementSatisfaction,
  documentScopeFor,
  documentSubjectIdFor,
  ensureDocumentSubject,
  signedDocumentEvidenceFields,
  DOCUMENT_EVIDENCE_PROVENANCE,
  DOCUMENT_SATISFACTION_SCOPE,
} from '@/server/documentEvidence';

describe('document evidence storage seam', () => {
  it('separates a child Document Subject from a parent Signer', () => {
    expect(documentSubjectIdFor('org_1', 'child_1')).toBe('document-subject:org_1:child_1');
    expect(signedDocumentEvidenceFields({
      organizationId: 'org_1',
      userId: 'parent_1',
      hostId: 'child_1',
      eventId: 'event_1',
      provenance: DOCUMENT_EVIDENCE_PROVENANCE.BOLDSIGN,
      providerDocumentId: 'boldsign_doc_1',
    })).toMatchObject({
      provenance: DOCUMENT_EVIDENCE_PROVENANCE.BOLDSIGN,
      providerDocumentId: 'boldsign_doc_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
    });
  });

  it('uses explicit organization, Event Participation, and Team-membership scopes', () => {
    expect(documentScopeFor({ organizationId: 'org_1', signOnce: true, eventId: 'event_1' })).toEqual({
      scopeType: DOCUMENT_SATISFACTION_SCOPE.ORGANIZATION,
      scopeId: 'org_1',
    });
    expect(documentScopeFor({ organizationId: 'org_1', eventId: 'event_1' })).toEqual({
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
    });
    expect(documentScopeFor({ organizationId: 'org_1', teamId: 'team_1' })).toEqual({
      scopeType: DOCUMENT_SATISFACTION_SCOPE.TEAM_MEMBERSHIP,
      scopeId: 'team_1',
    });
  });

  it('upserts one stable Document Subject and Satisfaction identity', async () => {
    const documentSubjects = { upsert: jest.fn().mockResolvedValue({}) };
    const documentRequirementSatisfactions = {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const database = { documentSubjects, documentRequirementSatisfactions };

    await expect(ensureDocumentSubject({
      organizationId: 'org_1',
      userId: 'parent_1',
      hostId: 'child_1',
    }, database)).resolves.toBe('document-subject:org_1:child_1');
    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_1',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
      signerRole: 'parent_guardian',
    }, database);

    expect(documentSubjects.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'org_1', userId: 'child_1' } },
      create: expect.objectContaining({ id: 'document-subject:org_1:child_1' }),
    }));
    expect(documentRequirementSatisfactions.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'document-satisfaction:evidence_1' },
      create: expect.objectContaining({
        documentSubjectId: 'document-subject:org_1:child_1',
        templateDocumentId: 'version_1',
        sourceEvidenceId: 'evidence_1',
        scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
        scopeId: 'event_1',
        status: 'SATISFIED',
        isComplete: true,
        requiredSignerRoles: [],
        completedSignerRoles: ['parent_guardian'],
      }),
    }));
  });
  it('keeps Satisfaction pending until all required signer roles complete', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'document-satisfaction:evidence_1',
          sourceEvidenceId: 'evidence_1',
          requiredSignerRoles: ['parent_guardian', 'participant'],
          completedSignerRoles: ['parent_guardian'],
        }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const database = { documentRequirementSatisfactions };

    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_1',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
      requiredSignerRoles: ['parent_guardian', 'participant'],
      signerRole: 'parent_guardian',
    }, database);
    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_2',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
      requiredSignerRoles: ['parent_guardian', 'participant'],
      signerRole: 'participant',
    }, database);

    expect(documentRequirementSatisfactions.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      create: expect.objectContaining({
        status: 'PENDING',
        isComplete: false,
        completedSignerRoles: ['parent_guardian'],
      }),
    }));
    expect(documentRequirementSatisfactions.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      update: expect.objectContaining({
        status: 'SATISFIED',
        isComplete: true,
        completedSignerRoles: ['parent_guardian', 'participant'],
      }),
    }));
  });

  it('normalizes signer role boundaries when deciding Satisfaction completion', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const database = { documentRequirementSatisfactions };

    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_normalized_role',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
      requiredSignerRoles: ['Parent Guardian'],
      signerRole: ' parent_guardian ',
    }, database);

    expect(documentRequirementSatisfactions.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'SATISFIED',
        isComplete: true,
        requiredSignerRoles: ['Parent Guardian'],
        completedSignerRoles: ['parent_guardian'],
      }),
    }));
  });

  it('creates a replacement Satisfaction after an invalidated source is excluded', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const database = { documentRequirementSatisfactions };

    await invalidateDocumentRequirementSatisfaction({
      evidenceId: 'evidence_invalidated',
      invalidatedAt: new Date('2026-08-21T00:00:00.000Z'),
    }, database);

    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_replacement',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
      signerRole: 'participant',
    }, database);

    expect(documentRequirementSatisfactions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { not: 'INVALIDATED' },
      }),
    }));
    expect(documentRequirementSatisfactions.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'document-satisfaction:evidence_replacement' },
      create: expect.objectContaining({
        sourceEvidenceId: 'evidence_replacement',
      }),
    }));

    expect(documentRequirementSatisfactions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sourceEvidenceId: 'evidence_invalidated',
        status: { in: ['PENDING', 'SATISFIED'] },
      },
    }));
  });

  it('rejects missing Organization or Subject identity before writing', async () => {
    const documentSubjects = { upsert: jest.fn().mockResolvedValue({}) };
    const database = { documentSubjects };

    await expect(ensureDocumentSubject({
      organizationId: null,
      userId: 'child_1',
    }, database)).rejects.toThrow('Organization and Document Subject identity are required.');
    expect(documentSubjects.upsert).not.toHaveBeenCalled();

    await expect(ensureDocumentSubject({
      organizationId: 'org_1',
      userId: null,
    }, database)).rejects.toThrow('Organization and Document Subject identity are required.');
    expect(documentSubjects.upsert).not.toHaveBeenCalled();
  });

  it('rejects incomplete Satisfaction identity before writing', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    };

    await expect(createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_missing_scope',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      scopeType: null,
      scopeId: null,
    }, { documentRequirementSatisfactions })).rejects.toThrow(
      'Complete Document Requirement Satisfaction identity is required.',
    );
    expect(documentRequirementSatisfactions.findFirst).not.toHaveBeenCalled();
    expect(documentRequirementSatisfactions.upsert).not.toHaveBeenCalled();
  });


  it('records import and void audit events and invalidates Satisfaction', async () => {
    const documentEvidenceAuditEvents = { create: jest.fn().mockResolvedValue({}) };
    const documentRequirementSatisfactions = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const database = { documentEvidenceAuditEvents, documentRequirementSatisfactions };
    const createdAt = new Date('2026-08-21T00:00:00.000Z');

    await appendDocumentEvidenceAuditEvent({
      evidenceId: 'evidence_1',
      organizationId: 'org_1',
      eventType: 'IMPORT',
      actorUserId: 'admin_1',
      note: 'Imported from prior system.',
      createdAt,
    }, database);
    await invalidateDocumentRequirementSatisfaction({
      evidenceId: 'evidence_1',
      invalidatedAt: createdAt,
    }, database);
    await appendDocumentEvidenceAuditEvent({
      evidenceId: 'evidence_1',
      organizationId: 'org_1',
      eventType: 'VOID',
      actorUserId: 'admin_1',
      reason: 'Duplicate record.',
      createdAt,
    }, database);

    expect(documentEvidenceAuditEvents.create).toHaveBeenCalledTimes(2);
    expect(documentEvidenceAuditEvents.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        signedDocumentId: 'evidence_1',
        eventType: 'VOID',
        reason: 'Duplicate record.',
      }),
    }));
    expect(documentRequirementSatisfactions.updateMany).toHaveBeenCalledWith({
      where: {
        sourceEvidenceId: 'evidence_1',
        status: { in: ['PENDING', 'SATISFIED'] },
      },
      data: expect.objectContaining({
        status: 'INVALIDATED',
        isComplete: false,
        invalidatedAt: createdAt,
      }),
    });
  });
});
