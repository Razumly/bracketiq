import crypto from 'crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { advisoryLockId } from '@/server/repositories/locks';

type DocumentEvidenceDelegateNames =
  | 'documentSubjects'
  | 'documentRequirementSatisfactions'
  | 'documentRequirementSatisfactionEvidence'
  | 'documentEvidenceAuditEvents'
  | 'signedDocuments';

export type DocumentEvidenceDatabase = Partial<
  Pick<Prisma.TransactionClient, DocumentEvidenceDelegateNames | '$executeRaw'>
>;

const acquireDocumentSatisfactionLock = async (
  database: DocumentEvidenceDatabase,
  identity: string,
): Promise<void> => {
  if (typeof database.$executeRaw !== 'function') {
    return;
  }
  await database.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${advisoryLockId(identity)})`,
  );
};
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
const isActiveEvidenceStatus = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'SIGNED' || normalized === 'COMPLETED';
};
const DOCUMENT_EVIDENCE_QUERY_CHUNK_SIZE = 500;

const readByIdChunks = async <T>(
  ids: string[],
  read: (idChunk: string[]) => Promise<T[]>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += DOCUMENT_EVIDENCE_QUERY_CHUNK_SIZE) {
    rows.push(...await read(ids.slice(offset, offset + DOCUMENT_EVIDENCE_QUERY_CHUNK_SIZE)));
  }
  return rows;
};

const documentSatisfactionIdentity = (params: {
  organizationId: string;
  documentRequirementId: string;
  templateDocumentId: string;
  documentSubjectId: string;
  scopeType: DocumentSatisfactionScope;
  scopeId: string;
}): string => JSON.stringify([
  'document-requirement-satisfaction',
  params.organizationId,
  params.documentRequirementId,
  params.templateDocumentId,
  params.documentSubjectId,
  params.scopeType,
  params.scopeId,
]);
const satisfactionEvidenceId = (satisfactionId: string, evidenceId: string): string =>
  `document-satisfaction-evidence:${satisfactionId}:${evidenceId}`;


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
export type DocumentSatisfactionPreflightScope = {
  templateDocumentId: string;
  scopeType: DocumentSatisfactionScope;
  scopeId: string;
};

export const documentSatisfactionScopeFor = (params: Pick<
  EvidenceContext,
  'organizationId' | 'documentSubjectUserId' | 'eventId' | 'teamId' | 'signOnce'
> & {
  templateDocumentId: string;
}): DocumentSatisfactionPreflightScope | null => {
  const templateDocumentId = present(params.templateDocumentId);
  const scope = documentScopeFor(params);
  if (!templateDocumentId || !scope.scopeType || !scope.scopeId) {
    return null;
  }
  return {
    templateDocumentId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
  };
};

export const findSatisfiedDocumentTemplateIds = async (params: {
  documentSubjectId?: string | null;
  scopes: readonly DocumentSatisfactionPreflightScope[];
}, database: DocumentEvidenceDatabase = prisma): Promise<Set<string>> => {
  const documentSubjectId = present(params.documentSubjectId);
  const scopes = params.scopes.filter((scope) => (
    Boolean(present(scope.templateDocumentId) && scope.scopeType && present(scope.scopeId))
  ));
  if (!documentSubjectId || scopes.length === 0) {
    return new Set();
  }

  const delegate = requireDelegate(database, 'documentRequirementSatisfactions');
  const rows = await delegate.findMany({
    where: {
      documentSubjectId,
      status: 'SATISFIED',
      isComplete: true,
      OR: scopes.map((scope) => ({
        templateDocumentId: scope.templateDocumentId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      })),
    },
    select: { templateDocumentId: true },
  });
  return new Set(rows.map((row) => row.templateDocumentId));
};
export type DocumentSatisfactionSignerState = {
  templateDocumentId: string;
  scopeType: DocumentSatisfactionScope;
  scopeId: string;
  status: string;
  isComplete: boolean;
  requiredSignerRoles: string[];
  completedSignerRoles: string[];
};

export const findDocumentSatisfactionSignerStates = async (params: {
  documentSubjectId?: string | null;
  scopes: readonly DocumentSatisfactionPreflightScope[];
}, database: DocumentEvidenceDatabase = prisma): Promise<DocumentSatisfactionSignerState[]> => {
  const documentSubjectId = present(params.documentSubjectId);
  const scopes = params.scopes.filter((scope) => (
    Boolean(present(scope.templateDocumentId) && scope.scopeType && present(scope.scopeId))
  ));
  if (!documentSubjectId || scopes.length === 0) {
    return [];
  }

  const delegate = requireDelegate(database, 'documentRequirementSatisfactions');
  const rows = await delegate.findMany({
    where: {
      documentSubjectId,
      invalidatedAt: null,
      OR: scopes.map((scope) => ({
        templateDocumentId: scope.templateDocumentId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      })),
    },
    select: {
      templateDocumentId: true,
      scopeType: true,
      scopeId: true,
      status: true,
      isComplete: true,
      requiredSignerRoles: true,
      completedSignerRoles: true,
    },
  });
  return rows.map((row) => ({
    templateDocumentId: row.templateDocumentId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    status: String(row.status),
    isComplete: Boolean(row.isComplete),
    requiredSignerRoles: Array.isArray(row.requiredSignerRoles) ? row.requiredSignerRoles : [],
    completedSignerRoles: Array.isArray(row.completedSignerRoles) ? row.completedSignerRoles : [],
  }));
};
export const hasCompletedDocumentSignerRole = (
  completedSignerRoles: readonly string[],
  signerRole: string,
): boolean => {
  const normalizedSignerRole = normalizeSignerRole(signerRole);
  return Boolean(normalizedSignerRole) && completedSignerRoles.some((role) => (
    normalizeSignerRole(role) === normalizedSignerRole
  ));
};
export type CompletedDocumentSatisfaction = {
  documentSubjectId: string;
  templateDocumentId: string;
  scopeType: DocumentSatisfactionScope;
  scopeId: string;
  sourceEvidenceId: string;
  signedAt: string | null;
  updatedAt: Date | null;
};

export const findCompletedDocumentSatisfactions = async (params: {
  documentSubjectIds: readonly string[];
  templateDocumentIds: readonly string[];
  scopes: readonly Pick<DocumentSatisfactionPreflightScope, 'scopeType' | 'scopeId'>[];
}, database: DocumentEvidenceDatabase = prisma): Promise<CompletedDocumentSatisfaction[]> => {
  const documentSubjectIds = params.documentSubjectIds
    .map(present)
    .filter((id): id is string => Boolean(id));
  const templateDocumentIds = params.templateDocumentIds
    .map(present)
    .filter((id): id is string => Boolean(id));
  const scopes = params.scopes.filter((scope) => Boolean(scope.scopeType && present(scope.scopeId)));
  if (documentSubjectIds.length === 0 || templateDocumentIds.length === 0 || scopes.length === 0) {
    return [];
  }

  const delegate = requireDelegate(database, 'documentRequirementSatisfactions');
  const rows = await delegate.findMany({
    where: {
      documentSubjectId: { in: documentSubjectIds },
      templateDocumentId: { in: templateDocumentIds },
      status: 'SATISFIED',
      isComplete: true,
      OR: scopes.map((scope) => ({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      })),
    },
    select: {
      documentSubjectId: true,
      templateDocumentId: true,
      scopeType: true,
      scopeId: true,
      sourceEvidenceId: true,
      updatedAt: true,
    },
  });
  const sourceEvidenceIds = Array.from(new Set(rows.map((row) => row.sourceEvidenceId)));
  if (sourceEvidenceIds.length === 0) {
    return [];
  }
  const evidenceDelegate = requireDelegate(database, 'signedDocuments');
  const evidenceRows = await evidenceDelegate.findMany({
    where: { id: { in: sourceEvidenceIds } },
    select: { id: true, signedAt: true },
  });
  const signedAtByEvidenceId = new Map(
    evidenceRows.map((row) => [row.id, row.signedAt] as const),
  );
  return rows.map((row) => ({
    ...row,
    signedAt: signedAtByEvidenceId.get(row.sourceEvidenceId) ?? null,
  }));
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
  const satisfactionIdentity = documentSatisfactionIdentity({
    organizationId,
    documentRequirementId,
    templateDocumentId,
    documentSubjectId,
    scopeType,
    scopeId,
  });
  await acquireDocumentSatisfactionLock(database, satisfactionIdentity);
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
  const incomingSignerRoles = mergeSignerRoles(
    [],
    [
      ...(params.completedSignerRoles ?? []),
      ...(present(params.signerRole) ? [present(params.signerRole) as string] : []),
    ],
  );
  const completedSignerRoles = mergeSignerRoles(existing?.completedSignerRoles ?? [], incomingSignerRoles);
  const requiredSignerRoles = mergeSignerRoles(
    existing?.requiredSignerRoles ?? [],
    params.requiredSignerRoles ?? [],
  );
  const isComplete = requiredSignerRoles.length === 0
    || requiredSignerRoles.every((requiredRole) => completedSignerRoles.some(
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
  const contributorDelegate = database.documentRequirementSatisfactionEvidence;
  if (contributorDelegate) {
    await contributorDelegate.upsert({
      where: {
        id: satisfactionEvidenceId(satisfactionId, evidenceId),
      },
      create: {
        id: satisfactionEvidenceId(satisfactionId, evidenceId),
        createdAt,
        updatedAt: createdAt,
        satisfactionId,
        signedDocumentId: evidenceId,
        completedSignerRoles: incomingSignerRoles,
      },
      update: {
        updatedAt: new Date(),
        completedSignerRoles: incomingSignerRoles,
      },
    });
  }
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

export const invalidateDocumentRequirementSatisfactions = async (params: {
  evidenceIds: string[];
  invalidatedAt?: Date;
  isForceInvalidation?: boolean;
}, database: DocumentEvidenceDatabase = prisma): Promise<void> => {
  const evidenceIds = Array.from(new Set(
    params.evidenceIds
      .map((evidenceId) => present(evidenceId))
      .filter((evidenceId): evidenceId is string => Boolean(evidenceId)),
  ));
  const satisfactionDelegate = requireDelegate(database, 'documentRequirementSatisfactions');
  if (evidenceIds.length === 0) {
    throw new Error('Document Requirement Satisfaction identity is required.');
  }
  const invalidatedAt = params.invalidatedAt ?? new Date();
  const contributorDelegate = database.documentRequirementSatisfactionEvidence;
  const signedDocumentDelegate = database.signedDocuments;
  const invalidationData = {
    updatedAt: invalidatedAt,
    status: 'INVALIDATED' as const,
    isComplete: false,
    invalidatedAt,
  };

  if (!contributorDelegate || !signedDocumentDelegate) {
    await satisfactionDelegate.updateMany({
      where: {
        sourceEvidenceId: { in: evidenceIds },
        status: { in: ['PENDING', 'SATISFIED'] },
      },
      data: invalidationData,
    });
    return;
  }

  const contributorRows = await readByIdChunks(
    evidenceIds,
    (ids) => contributorDelegate.findMany({
      where: { signedDocumentId: { in: ids } },
      select: { satisfactionId: true },
    }),
  );
  const satisfactionIds = Array.from(new Set(contributorRows.map((row) => row.satisfactionId)));
  if (satisfactionIds.length === 0) {
    await satisfactionDelegate.updateMany({
      where: {
        sourceEvidenceId: { in: evidenceIds },
        status: { in: ['PENDING', 'SATISFIED'] },
      },
      data: invalidationData,
    });
    return;
  }

  const satisfactions = await readByIdChunks(
    satisfactionIds,
    (ids) => satisfactionDelegate.findMany({
      where: {
        id: { in: ids },
        status: { in: ['PENDING', 'SATISFIED'] },
      },
      select: {
        id: true,
        sourceEvidenceId: true,
        requiredSignerRoles: true,
      },
    }),
  );
  const satisfactionLinks = await readByIdChunks(
    satisfactionIds,
    (ids) => contributorDelegate.findMany({
      where: { satisfactionId: { in: ids } },
      select: { satisfactionId: true, signedDocumentId: true, completedSignerRoles: true },
    }),
  );
  const linkedEvidenceIds = Array.from(new Set(satisfactionLinks.map((link) => link.signedDocumentId)));
  const evidenceRows = linkedEvidenceIds.length > 0
    ? await readByIdChunks(
      linkedEvidenceIds,
      (ids) => signedDocumentDelegate.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, signerRole: true },
      }),
    )
    : [];
  const evidenceById = new Map(evidenceRows.map((row) => [row.id, row]));
  const linksBySatisfactionId = new Map<string, typeof satisfactionLinks>();
  for (const link of satisfactionLinks) {
    const links = linksBySatisfactionId.get(link.satisfactionId) ?? [];
    links.push(link);
    linksBySatisfactionId.set(link.satisfactionId, links);
  }

  for (const satisfaction of satisfactions) {
    const links = linksBySatisfactionId.get(satisfaction.id) ?? [];
    const activeRows = links
      .map((link) => evidenceById.get(link.signedDocumentId))
      .filter((row): row is NonNullable<typeof row> => {
        if (!row || !isActiveEvidenceStatus(row.status)) {
          return false;
        }
        return !params.isForceInvalidation || !evidenceIds.includes(row.id);
      });
    const completedSignerRoles = mergeSignerRoles(
      [],
      links.flatMap((link) => {
        const row = evidenceById.get(link.signedDocumentId);
        if (
          !row
          || !isActiveEvidenceStatus(row.status)
          || (params.isForceInvalidation && evidenceIds.includes(row.id))
        ) {
          return [];
        }
        const contributorRoles = Array.isArray(link.completedSignerRoles)
          ? link.completedSignerRoles
          : [];
        return contributorRoles.length > 0
          ? contributorRoles
          : (typeof row.signerRole === 'string' ? [row.signerRole] : []);
      }),
    );
    const requiredSignerRoles = satisfaction.requiredSignerRoles ?? [];
    const isComplete = activeRows.length > 0
      && (
        requiredSignerRoles.length === 0
          || requiredSignerRoles.every((requiredRole) => completedSignerRoles.some(
            (completedRole) => normalizeSignerRole(completedRole) === normalizeSignerRole(requiredRole),
          ))
      );
    const sourceEvidenceId = activeRows.some((row) => row.id === satisfaction.sourceEvidenceId)
      ? satisfaction.sourceEvidenceId
      : activeRows[0]?.id ?? satisfaction.sourceEvidenceId;

    await satisfactionDelegate.update({
      where: { id: satisfaction.id },
      data: {
        updatedAt: invalidatedAt,
        status: activeRows.length === 0
          ? 'INVALIDATED'
          : isComplete
            ? 'SATISFIED'
            : 'PENDING',
        isComplete,
        completedSignerRoles,
        sourceEvidenceId,
        invalidatedAt: activeRows.length === 0 ? invalidatedAt : null,
      },
    });
  }
};
