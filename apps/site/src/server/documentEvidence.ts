import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export type DocumentEvidenceDatabase = typeof prisma;

export const DOCUMENT_EVIDENCE_PROVENANCE = {
  BOLDSIGN: 'BOLDSIGN',
  BRACKETIQ: 'BRACKETIQ',
  IMPORTED: 'IMPORTED',
} as const;

export const DOCUMENT_SATISFACTION_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  EVENT_PARTICIPATION: 'EVENT_PARTICIPATION',
  TEAM_MEMBERSHIP: 'TEAM_MEMBERSHIP',
} as const;

export type DocumentEvidenceProvenance = (typeof DOCUMENT_EVIDENCE_PROVENANCE)[keyof typeof DOCUMENT_EVIDENCE_PROVENANCE];
export type DocumentSatisfactionScope = (typeof DOCUMENT_SATISFACTION_SCOPE)[keyof typeof DOCUMENT_SATISFACTION_SCOPE];

type EvidenceContext = {
  organizationId?: string | null;
  userId?: string | null;
  hostId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  signOnce?: boolean | null;
};

const present = (value: string | null | undefined): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

export const documentSubjectUserId = (context: Pick<EvidenceContext, 'userId' | 'hostId'>): string | null => {
  return present(context.hostId) ?? present(context.userId);
};

export const documentSubjectIdFor = (organizationId: string | null | undefined, subjectUserId: string | null | undefined): string | null => {
  const organization = present(organizationId);
  const subject = present(subjectUserId);
  return organization && subject ? `document-subject:${organization}:${subject}` : null;
};

export const documentScopeFor = (context: EvidenceContext): {
  scopeType: DocumentSatisfactionScope | null;
  scopeId: string | null;
} => {
  const organizationId = present(context.organizationId);
  const eventId = present(context.eventId);
  const teamId = present(context.teamId);
  if (context.signOnce || (!eventId && !teamId)) {
    return {
      scopeType: organizationId ? DOCUMENT_SATISFACTION_SCOPE.ORGANIZATION : null,
      scopeId: organizationId,
    };
  }
  if (teamId) {
    return {
      scopeType: DOCUMENT_SATISFACTION_SCOPE.TEAM_MEMBERSHIP,
      scopeId: teamId,
    };
  }
  return {
    scopeType: DOCUMENT_SATISFACTION_SCOPE.EVENT_PARTICIPATION,
    scopeId: eventId,
  };
};

export const signedDocumentEvidenceFields = (params: EvidenceContext & {
  provenance: DocumentEvidenceProvenance;
  providerDocumentId?: string | null;
}) => {
  const subjectUserId = documentSubjectUserId(params);
  const scope = documentScopeFor(params);
  return {
    provenance: params.provenance,
    providerDocumentId: present(params.providerDocumentId),
    signerUserId: present(params.userId),
    documentSubjectId: documentSubjectIdFor(params.organizationId, subjectUserId),
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
  };
};

export const ensureDocumentSubject = async (
  context: Pick<EvidenceContext, 'organizationId' | 'userId' | 'hostId'>,
  database: DocumentEvidenceDatabase | Record<string, any> = prisma,
): Promise<string | null> => {
  const subjectUserId = documentSubjectUserId(context);
  const organizationId = present(context.organizationId);
  const documentSubjectId = documentSubjectIdFor(organizationId, subjectUserId);
  if (!organizationId || !subjectUserId || !documentSubjectId) {
    return null;
  }

  const delegate = (database as Record<string, any>).documentSubjects;
  if (!delegate?.upsert) {
    return documentSubjectId;
  }

  await delegate.upsert({
    where: {
      organizationId_userId: {
        organizationId,
        userId: subjectUserId,
      },
    },
    create: {
      id: documentSubjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
      organizationId,
      userId: subjectUserId,
    },
    update: {
      updatedAt: new Date(),
    },
  });
  return documentSubjectId;
};

export const createDocumentRequirementSatisfaction = async (params: {
  evidenceId: string;
  templateDocumentId: string;
  documentRequirementId?: string | null;
  organizationId?: string | null;
  documentSubjectId?: string | null;
  scopeType?: DocumentSatisfactionScope | null;
  scopeId?: string | null;
  requiredSignerRoles?: string[] | null;
  completedSignerRoles?: string[] | null;
  signerRole?: string | null;
  createdAt?: Date;
}, database: DocumentEvidenceDatabase | Record<string, any> = prisma): Promise<void> => {
  const organizationId = present(params.organizationId);
  const documentSubjectId = present(params.documentSubjectId);
  const scopeType = params.scopeType ?? null;
  const scopeId = present(params.scopeId);
  const documentRequirementId = present(params.documentRequirementId);
  const templateDocumentId = present(params.templateDocumentId);
  const evidenceId = present(params.evidenceId);
  if (!organizationId || !documentSubjectId || !scopeType || !scopeId || !documentRequirementId || !templateDocumentId || !evidenceId) {
    return;
  }

  const delegate = (database as Record<string, any>).documentRequirementSatisfactions;
  if (!delegate?.upsert) {
    return;
  }

  const completedSignerRoles = params.completedSignerRoles
    ?? (present(params.signerRole) ? [present(params.signerRole) as string] : []);
  const createdAt = params.createdAt ?? new Date();
  await delegate.upsert({
    where: { id: `document-satisfaction:${evidenceId}` },
    create: {
      id: `document-satisfaction:${evidenceId}`,
      createdAt,
      updatedAt: createdAt,
      organizationId,
      documentRequirementId,
      templateDocumentId,
      documentSubjectId,
      scopeType,
      scopeId,
      sourceEvidenceId: evidenceId,
      status: 'SATISFIED',
      isComplete: true,
      requiredSignerRoles: params.requiredSignerRoles ?? [],
      completedSignerRoles,
      invalidatedAt: null,
    },
    update: {
      updatedAt: new Date(),
      status: 'SATISFIED',
      isComplete: true,
      completedSignerRoles,
      invalidatedAt: null,
    },
  });
};

export const appendDocumentEvidenceAuditEvent = async (params: {
  evidenceId: string;
  organizationId: string;
  eventType: 'IMPORT' | 'VOID';
  actorUserId?: string | null;
  reason?: string | null;
  note?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: Date;
}, database: DocumentEvidenceDatabase | Record<string, any> = prisma): Promise<void> => {
  const delegate = (database as Record<string, any>).documentEvidenceAuditEvents;
  if (!delegate?.create) {
    return;
  }
  const createdAt = params.createdAt ?? new Date();
  await delegate.create({
    data: {
      id: crypto.randomUUID(),
      createdAt,
      organizationId: params.organizationId,
      signedDocumentId: params.evidenceId,
      eventType: params.eventType,
      actorUserId: params.actorUserId ?? null,
      reason: params.reason ?? null,
      note: params.note ?? null,
      payload: params.payload ?? null,
    },
  });
};
 
export const invalidateDocumentRequirementSatisfaction = async (params: {
  evidenceId: string;
  invalidatedAt?: Date;
}, database: DocumentEvidenceDatabase | Record<string, any> = prisma): Promise<void> => {
  const delegate = (database as Record<string, any>).documentRequirementSatisfactions;
  if (!delegate?.updateMany) {
    return;
  }
  const invalidatedAt = params.invalidatedAt ?? new Date();
  await delegate.updateMany({
    where: {
      sourceEvidenceId: params.evidenceId,
      status: 'SATISFIED',
    },
    data: {
      updatedAt: invalidatedAt,
      status: 'INVALIDATED',
      isComplete: false,
      invalidatedAt,
    },
  });
};
