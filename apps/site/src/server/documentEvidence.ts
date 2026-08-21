import crypto from 'crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

type DocumentEvidenceDelegateNames =
  | 'documentSubjects'
  | 'documentRequirementSatisfactions'
  | 'documentEvidenceAuditEvents';

export type DocumentEvidenceDatabase = Partial<
  Pick<Prisma.TransactionClient, DocumentEvidenceDelegateNames>
>;

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
  documentSubjectUserId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  signOnce?: boolean | null;
};

const present = (value: string | null | undefined): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};
const requireDelegate = <K extends DocumentEvidenceDelegateNames>(
  database: DocumentEvidenceDatabase,
  delegateName: K,
): NonNullable<DocumentEvidenceDatabase[K]> => {
  const delegate = database[delegateName];
  if (!delegate) {
    throw new Error(`Document evidence storage delegate "${delegateName}" is required.`);
  }
  return delegate as NonNullable<DocumentEvidenceDatabase[K]>;
};

const normalizeSignerRole = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const mergeSignerRoles = (existing: string[], incoming: string[]): string[] => {
  const merged = [...existing];
  const seen = new Set(existing.map(normalizeSignerRole).filter(Boolean));
  for (const role of incoming) {
    const normalized = present(role);
    const roleKey = normalized ? normalizeSignerRole(normalized) : '';
    if (!normalized || !roleKey || seen.has(roleKey)) {
      continue;
    }
    seen.add(roleKey);
    merged.push(normalized);
  }
  return merged;
};

export const documentSubjectUserId = (context: Pick<EvidenceContext, 'userId' | 'hostId' | 'documentSubjectUserId'>): string | null => {
  return present(context.documentSubjectUserId) ?? present(context.hostId) ?? present(context.userId);
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
  context: Pick<EvidenceContext, 'organizationId' | 'userId' | 'hostId' | 'documentSubjectUserId'>,
  database: DocumentEvidenceDatabase = prisma,
): Promise<string> => {
  const subjectUserId = documentSubjectUserId(context);
  const organizationId = present(context.organizationId);
  const documentSubjectId = documentSubjectIdFor(organizationId, subjectUserId);
  if (!organizationId || !subjectUserId || !documentSubjectId) {
    throw new Error('Organization and Document Subject identity are required.');
  }

  const delegate = requireDelegate(database, 'documentSubjects');

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
}, database: DocumentEvidenceDatabase = prisma): Promise<void> => {
  const organizationId = present(params.organizationId);
  const documentSubjectId = present(params.documentSubjectId);
  const scopeType = params.scopeType ?? null;
  const scopeId = present(params.scopeId);
  const documentRequirementId = present(params.documentRequirementId);
  const templateDocumentId = present(params.templateDocumentId);
  const evidenceId = present(params.evidenceId);
  if (!organizationId || !documentSubjectId || !scopeType || !scopeId || !documentRequirementId || !templateDocumentId || !evidenceId) {
    throw new Error('Complete Document Requirement Satisfaction identity is required.');
  }

  const delegate = requireDelegate(database, 'documentRequirementSatisfactions');
  const existing = await delegate.findFirst({
    where: {
      organizationId,
      documentRequirementId,
      templateDocumentId,
      documentSubjectId,
      scopeType,
      scopeId,
      status: { not: 'INVALIDATED' },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      sourceEvidenceId: true,
      requiredSignerRoles: true,
      completedSignerRoles: true,
    },
  });
  const incomingSignerRoles = [
    ...(params.completedSignerRoles ?? []),
    ...(present(params.signerRole) ? [present(params.signerRole) as string] : []),
  ];
  const completedSignerRoles = mergeSignerRoles(existing?.completedSignerRoles ?? [], incomingSignerRoles);
  const requiredSignerRoles = mergeSignerRoles(
    existing?.requiredSignerRoles ?? [],
    params.requiredSignerRoles ?? [],
  );
  const effectiveRequiredSignerRoles = requiredSignerRoles.length > 0
    ? requiredSignerRoles
    : incomingSignerRoles.length > 0
      ? mergeSignerRoles([], incomingSignerRoles)
      : [];
  const isComplete = effectiveRequiredSignerRoles.length === 0
    || effectiveRequiredSignerRoles.every((requiredRole) => completedSignerRoles.some(
      (completedRole) => normalizeSignerRole(completedRole) === normalizeSignerRole(requiredRole),
    ));
  const createdAt = params.createdAt ?? new Date();
  const satisfactionId = existing?.id ?? `document-satisfaction:${evidenceId}`;
  await delegate.upsert({
    where: { id: satisfactionId },
    create: {
      id: satisfactionId,
      createdAt,
      updatedAt: createdAt,
      organizationId,
      documentRequirementId,
      templateDocumentId,
      documentSubjectId,
      scopeType,
      scopeId,
      sourceEvidenceId: existing?.sourceEvidenceId ?? evidenceId,
      status: isComplete ? 'SATISFIED' : 'PENDING',
      isComplete,
      requiredSignerRoles,
      completedSignerRoles,
      invalidatedAt: null,
    },
    update: {
      updatedAt: new Date(),
      status: isComplete ? 'SATISFIED' : 'PENDING',
      isComplete,
      requiredSignerRoles,
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
  payload?: Prisma.InputJsonValue | null;
  createdAt?: Date;
}, database: DocumentEvidenceDatabase = prisma): Promise<void> => {
  const evidenceId = present(params.evidenceId);
  const organizationId = present(params.organizationId);
  const delegate = requireDelegate(database, 'documentEvidenceAuditEvents');
  if (!evidenceId || !organizationId) {
    throw new Error('Document Evidence Audit Event identity is required.');
  }
  const createdAt = params.createdAt ?? new Date();
  await delegate.create({
    data: {
      id: crypto.randomUUID(),
      createdAt,
      organizationId,
      signedDocumentId: evidenceId,
      eventType: params.eventType,
      actorUserId: params.actorUserId ?? null,
      reason: params.reason ?? null,
      note: params.note ?? null,
      payload: params.payload ?? Prisma.JsonNull,
    },
  });
};

export const invalidateDocumentRequirementSatisfaction = async (params: {
  evidenceId: string;
  invalidatedAt?: Date;
}, database: DocumentEvidenceDatabase = prisma): Promise<void> => {
  const evidenceId = present(params.evidenceId);
  const delegate = requireDelegate(database, 'documentRequirementSatisfactions');
  if (!evidenceId) {
    throw new Error('Document Requirement Satisfaction identity is required.');
  }
  const invalidatedAt = params.invalidatedAt ?? new Date();
  await delegate.updateMany({
    where: {
      sourceEvidenceId: evidenceId,
      status: { in: ['PENDING', 'SATISFIED'] },
    },
    data: {
      updatedAt: invalidatedAt,
      status: 'INVALIDATED',
      isComplete: false,
      invalidatedAt,
    },
  });
};
