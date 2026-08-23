import {
  appendDocumentEvidenceAuditEvent,
  createDocumentRequirementSatisfaction,
  invalidateDocumentRequirementSatisfactions,
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

  it('acquires the Satisfaction identity lock before reading the existing row', async () => {
    const sequence: string[] = [];
    const documentRequirementSatisfactions = {
      findFirst: jest.fn(async () => {
        sequence.push('read');
        return null;
      }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const database = {
      $executeRaw: jest.fn(async () => {
        sequence.push('lock');
        return 1;
      }),
      documentRequirementSatisfactions,
    };

    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_lock',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:player_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
      scopeId: 'event_1',
      requiredSignerRoles: ['participant'],
      signerRole: 'participant',
    }, database);

    expect(sequence).toEqual(['lock', 'read']);
    expect(database.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('marks a roleless imported completion as satisfied', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };

    await createDocumentRequirementSatisfaction({
      evidenceId: 'imported_evidence',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:player_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.ORGANIZATION,
      scopeId: 'org_1',
      requiredSignerRoles: [],
    }, { documentRequirementSatisfactions });

    expect(documentRequirementSatisfactions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'SATISFIED',
          isComplete: true,
          requiredSignerRoles: [],
          completedSignerRoles: [],
        }),
      }),
    );
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
  it('keeps a Satisfaction complete when invalidated evidence has another active contributor', async () => {
    const documentRequirementSatisfactions = {
      findMany: jest.fn().mockResolvedValue([{
        id: 'document-satisfaction:evidence_0',
        sourceEvidenceId: 'evidence_voided',
        requiredSignerRoles: ['participant'],
      }]),
      update: jest.fn().mockResolvedValue({}),
    };
    const documentRequirementSatisfactionEvidence = {
      findMany: jest.fn()
        .mockResolvedValueOnce([{
          satisfactionId: 'document-satisfaction:evidence_0',
        }])
        .mockResolvedValueOnce([
          {
            satisfactionId: 'document-satisfaction:evidence_0',
            signedDocumentId: 'evidence_voided',
            completedSignerRoles: ['participant'],
          },
          {
            satisfactionId: 'document-satisfaction:evidence_0',
            signedDocumentId: 'evidence_active',
            completedSignerRoles: ['participant'],
          },
        ]),
    };
    const signedDocuments = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'evidence_voided', status: 'VOID', signerRole: null },
        { id: 'evidence_active', status: 'SIGNED', signerRole: 'participant' },
      ]),
    };

    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_voided'],
    }, {
      documentRequirementSatisfactions,
      documentRequirementSatisfactionEvidence,
      signedDocuments,
    });

    expect(documentRequirementSatisfactions.update).toHaveBeenCalledWith({
      where: { id: 'document-satisfaction:evidence_0' },
      data: expect.objectContaining({
        status: 'SATISFIED',
        isComplete: true,
        completedSignerRoles: ['participant'],
        sourceEvidenceId: 'evidence_active',
        invalidatedAt: null,
      }),
    });
  });


  it('recomputes an aggregate from every contributor when a later row is voided', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'document-satisfaction:evidence_first',
          sourceEvidenceId: 'evidence_first',
          requiredSignerRoles: ['participant'],
          completedSignerRoles: ['participant'],
        }),
      findMany: jest.fn().mockResolvedValue([{
        id: 'document-satisfaction:evidence_first',
        requiredSignerRoles: ['participant'],
      }]),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    const documentRequirementSatisfactionEvidence = {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn()
        .mockResolvedValueOnce([{ satisfactionId: 'document-satisfaction:evidence_first' }])
        .mockResolvedValueOnce([
          {
            satisfactionId: 'document-satisfaction:evidence_first',
            signedDocumentId: 'evidence_first',
            completedSignerRoles: ['participant'],
          },
          {
            satisfactionId: 'document-satisfaction:evidence_first',
            signedDocumentId: 'evidence_later',
            completedSignerRoles: ['participant'],
          },
        ]),
    };
    const signedDocuments = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'evidence_first', status: 'SIGNED', signerRole: null },
        { id: 'evidence_later', status: 'VOID', signerRole: null },
      ]),
    };
    const database = {
      documentRequirementSatisfactions,
      documentRequirementSatisfactionEvidence,
      signedDocuments,
    };

    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_first',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:player_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.ORGANIZATION,
      scopeId: 'org_1',
      requiredSignerRoles: ['participant'],
      signerRole: 'participant',
    }, database);
    await createDocumentRequirementSatisfaction({
      evidenceId: 'evidence_later',
      templateDocumentId: 'version_1',
      documentRequirementId: 'requirement_1',
      organizationId: 'org_1',
      documentSubjectId: 'document-subject:org_1:player_1',
      scopeType: DOCUMENT_SATISFACTION_SCOPE.ORGANIZATION,
      scopeId: 'org_1',
      requiredSignerRoles: ['participant'],
      signerRole: 'participant',
    }, database);

    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_later'],
      invalidatedAt: new Date('2026-08-21T00:00:00.000Z'),
    }, database);
    expect(documentRequirementSatisfactionEvidence.upsert).toHaveBeenCalledTimes(2);
    expect(documentRequirementSatisfactionEvidence.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          satisfactionId: 'document-satisfaction:evidence_first',
          signedDocumentId: 'evidence_later',
          completedSignerRoles: ['participant'],
        }),
      }),
    );
    expect(documentRequirementSatisfactions.update).toHaveBeenCalledWith({
      where: { id: 'document-satisfaction:evidence_first' },
      data: expect.objectContaining({
        status: 'SATISFIED',
        isComplete: true,
        invalidatedAt: null,
      }),
    });
    expect(documentRequirementSatisfactionEvidence.findMany).toHaveBeenCalledTimes(2);
    expect(signedDocuments.findMany).toHaveBeenCalledTimes(1);
  });
  it('force-invalidates an aggregate when every contributor from a terminal provider fails', async () => {
    const documentRequirementSatisfactions = {
      findMany: jest.fn().mockResolvedValue([{
        id: 'document-satisfaction:evidence_first',
        requiredSignerRoles: ['Parent/Guardian', 'Child'],
      }]),
      update: jest.fn().mockResolvedValue({}),
    };
    const documentRequirementSatisfactionEvidence = {
      findMany: jest.fn()
        .mockResolvedValueOnce([
          {
            satisfactionId: 'document-satisfaction:evidence_first',
          },
        ])
        .mockResolvedValueOnce([
          {
            satisfactionId: 'document-satisfaction:evidence_first',
            signedDocumentId: 'evidence_first',
            completedSignerRoles: ['parent_guardian'],
          },
          {
            satisfactionId: 'document-satisfaction:evidence_first',
            signedDocumentId: 'evidence_failed',
            completedSignerRoles: ['child'],
          },
        ]),
    };

    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_first', 'evidence_failed'],
      isForceInvalidation: true,
      invalidatedAt: new Date('2026-08-21T00:00:00.000Z'),
    }, {
      documentRequirementSatisfactions,
      documentRequirementSatisfactionEvidence,
      signedDocuments: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'evidence_first', status: 'REVOKED', signerRole: 'parent_guardian' },
          { id: 'evidence_failed', status: 'REVOKED', signerRole: 'child' },
        ]),
      },
    });

    expect(documentRequirementSatisfactions.update).toHaveBeenCalledWith({
      where: { id: 'document-satisfaction:evidence_first' },
      data: expect.objectContaining({
        status: 'INVALIDATED',
        isComplete: false,
      }),
    });
  });

  it('keeps an independent complete contributor after a terminal provider failure', async () => {
    const documentRequirementSatisfactions = {
      findMany: jest.fn().mockResolvedValue([{
        id: 'document-satisfaction:evidence_failed',
        requiredSignerRoles: ['participant'],
      }]),
      update: jest.fn().mockResolvedValue({}),
    };
    const documentRequirementSatisfactionEvidence = {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ satisfactionId: 'document-satisfaction:evidence_failed' }])
        .mockResolvedValueOnce([
          {
            satisfactionId: 'document-satisfaction:evidence_failed',
            signedDocumentId: 'evidence_failed',
            completedSignerRoles: ['participant'],
          },
          {
            satisfactionId: 'document-satisfaction:evidence_failed',
            signedDocumentId: 'evidence_independent',
            completedSignerRoles: ['participant'],
          },
        ]),
    };

    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_failed'],
      isForceInvalidation: true,
    }, {
      documentRequirementSatisfactions,
      documentRequirementSatisfactionEvidence,
      signedDocuments: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'evidence_failed', status: 'REVOKED', signerRole: 'participant' },
          { id: 'evidence_independent', status: 'SIGNED', signerRole: 'participant' },
        ]),
      },
    });

    expect(documentRequirementSatisfactions.update).toHaveBeenCalledWith({
      where: { id: 'document-satisfaction:evidence_failed' },
      data: expect.objectContaining({
        status: 'SATISFIED',
        isComplete: true,
      }),
    });
  });



  it('keeps a roleless active Satisfaction complete after contributor recomputation', async () => {
    const documentRequirementSatisfactions = {
      findMany: jest.fn().mockResolvedValue([{
        id: 'document-satisfaction:roleless',
        requiredSignerRoles: [],
      }]),
      update: jest.fn().mockResolvedValue({}),
    };
    const documentRequirementSatisfactionEvidence = {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ satisfactionId: 'document-satisfaction:roleless' }])
        .mockResolvedValueOnce([{
          satisfactionId: 'document-satisfaction:roleless',
          signedDocumentId: 'evidence_roleless',
          completedSignerRoles: [],
        }]),
    };
    const signedDocuments = {
      findMany: jest.fn().mockResolvedValue([{
        id: 'evidence_roleless',
        status: 'SIGNED',
        signerRole: null,
      }]),
    };

    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_roleless'],
    }, {
      documentRequirementSatisfactions,
      documentRequirementSatisfactionEvidence,
      signedDocuments,
    });

    expect(documentRequirementSatisfactions.update).toHaveBeenCalledWith({
      where: { id: 'document-satisfaction:roleless' },
      data: expect.objectContaining({
        status: 'SATISFIED',
        isComplete: true,
        completedSignerRoles: [],
      }),
    });
  });
  it('creates a replacement Satisfaction after an invalidated source is excluded', async () => {
    const documentRequirementSatisfactions = {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const database = { documentRequirementSatisfactions };

    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_invalidated'],
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
        sourceEvidenceId: { in: ['evidence_invalidated'] },
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
    await invalidateDocumentRequirementSatisfactions({
      evidenceIds: ['evidence_1'],
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
        sourceEvidenceId: { in: ['evidence_1'] },
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
