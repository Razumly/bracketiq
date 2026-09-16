import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { findGuardianAuthority } from '@/server/guardianAuthority';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { requireSession } from '@/lib/permissions';
import {
  normalizeSignerContext,
  resolveRequiredSignerRoles,
  type SignerContext,
} from '@/lib/templateSignerTypes';
import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';
import {
  syncAllTeamRegistrationConsentStatusesForRegistrant,
  syncTeamRegistrationConsentStatus,
} from '@/server/teams/teamRegistrationDocuments';
import {
  BOLDSIGN_OPERATION_TYPES,
  findLatestBoldSignOperation,
  updateBoldSignOperationById,
} from '@/lib/boldsignSyncOperations';
import {
  ensureDocumentSubject,
  signedDocumentEvidenceFields,
  createDocumentRequirementSatisfaction,
  DOCUMENT_EVIDENCE_PROVENANCE,
} from '@/server/documentEvidence';
const schema = z.object({
  templateId: z.string(),
  documentId: z.string(),
  eventId: z.string().optional(),
  teamId: z.string().optional(),
  userId: z.string().optional(),
  childUserId: z.string().optional(),
  signerContext: z.string().optional(),
  user: z.record(z.string(), z.any()).optional(),
  type: z.string().optional(),
}).passthrough();

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isSignedStatus = (value: unknown): boolean => {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const resolveUserEmail = async (userId: string): Promise<string | null> => {
  const [sensitive, auth] = await Promise.all([
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);
  return normalizeEmail(sensitive?.email) ?? normalizeEmail(auth?.email) ?? null;
};

const resolveSignerContext = (params: {
  providedSignerContext?: string;
  userId: string;
  childUserId?: string;
}): SignerContext => {
  const explicit = normalizeSignerContext(params.providedSignerContext, 'participant');
  if (normalizeText(params.providedSignerContext)) {
    return explicit;
  }
  if (params.childUserId && params.userId === params.childUserId) {
    return 'child';
  }
  if (params.childUserId) {
    return 'parent_guardian';
  }
  return 'participant';
};

const resolveIpAddress = (request: NextRequest): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const candidate = forwarded.split(',')[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  return '127.0.0.1';
};

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'templateId and documentId are required.' }, { status: 400 });
  }

  const userId = normalizeText(parsed.data.userId) ?? session.userId;
  const eventId = normalizeText(parsed.data.eventId);
  const childUserId = normalizeText(parsed.data.childUserId);
  const signerContext = resolveSignerContext({
    providedSignerContext: normalizeText(parsed.data.signerContext),
    userId,
    childUserId,
  });

  if (!session.isAdmin && signerContext === 'child' && userId !== session.userId) {
    return NextResponse.json({ error: 'Child signatures must be completed by the child account.' }, { status: 403 });
  }

  if (!session.isAdmin && userId !== session.userId) {
    const parentLink = await findGuardianAuthority(prisma, session.userId, userId);
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!session.isAdmin && signerContext === 'parent_guardian' && childUserId) {
    const parentLink = await findGuardianAuthority(prisma, session.userId, childUserId);
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!session.isAdmin && signerContext === 'child') {
    const resolvedChildUserId = childUserId ?? userId;
    if (session.userId !== resolvedChildUserId) {
      const parentLink = await findGuardianAuthority(prisma, session.userId, resolvedChildUserId);
      if (!parentLink) {
        return NextResponse.json({ error: 'Child signatures must be completed by the child account.' }, { status: 403 });
      }
      const [parentEmail, childEmail] = await Promise.all([
        resolveUserEmail(session.userId),
        resolveUserEmail(resolvedChildUserId),
      ]);
      if (!parentEmail || !childEmail || parentEmail !== childEmail) {
        return NextResponse.json(
          { error: 'Child signatures must be completed by the child account unless parent and child share the same email.' },
          { status: 403 },
        );
      }
    }
  }

  const event = eventId
    ? await prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    })
    : null;
  if (eventId && !event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }
  const teamId = normalizeText(parsed.data.teamId);
  const team = teamId
    ? await prisma.canonicalTeams.findUnique({
      where: { id: teamId },
      select: { id: true, organizationId: true },
    })
    : null;
  if (teamId && !team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }
  const signedTemplate = await prisma.templateDocuments.findUnique({
    where: { id: parsed.data.templateId },
    select: {
      id: true,
      organizationId: true,
      signOnce: true,
      type: true,
      documentRequirementId: true,
      signerRoles: true,
      requiredSignerType: true,
    },
  });
  if (!signedTemplate) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  const requirement = await prisma.documentRequirements.findUnique({
    where: { id: signedTemplate.documentRequirementId },
    select: { id: true, organizationId: true },
  });
  if (
    !requirement
    || requirement.id !== signedTemplate.documentRequirementId
    || requirement.organizationId !== signedTemplate.organizationId
  ) {
    return NextResponse.json({ error: 'Template Requirement not found.' }, { status: 404 });
  }
  const requiredSignerRoles = resolveRequiredSignerRoles(
    signedTemplate.signerRoles,
    signedTemplate.requiredSignerType,
  );
  const templateOrganizationId = signedTemplate.organizationId;
  if (
    !templateOrganizationId
    || (eventId && event?.organizationId !== templateOrganizationId)
    || (teamId && team?.organizationId !== templateOrganizationId)
    || (event && team && event.organizationId !== team.organizationId)
  ) {
    return NextResponse.json(
      { error: 'Signature scope does not belong to the selected Template Organization.' },
      { status: 403 },
    );
  }

  const scopedChildUserId = childUserId ?? (signerContext === 'child' ? userId : null);
  const isTextSignature = String(signedTemplate.type ?? '').toUpperCase() === 'TEXT';
  if (!isTextSignature) {
    const operation = await findLatestBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND,
      documentId: parsed.data.documentId,
    });
    const operationMatchesScope = Boolean(
      operation
      && operation.templateDocumentId === parsed.data.templateId
      && operation.documentId === parsed.data.documentId
      && (operation.eventId ?? null) === (eventId ?? null)
      && (operation.teamId ?? null) === (teamId ?? null)
      && (operation.userId ?? null) === userId
      && (operation.childUserId ?? null) === scopedChildUserId
      && (operation.signerRole ?? null) === signerContext,
    );
    if (!operationMatchesScope || !operation) {
      return NextResponse.json(
        { error: 'Signature confirmation must use a server-issued signing operation.' },
        { status: 403 },
      );
    }

    await updateBoldSignOperationById(operation.id, {
      payload: {
        ...(operation.payload ?? {}),
        acknowledgedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      operationId: operation.id,
      syncStatus: operation.status,
    }, { status: 200 });
  }
  const existing = await prisma.signedDocuments.findFirst({
    where: {
      signedDocumentId: parsed.data.documentId,
      templateId: signedTemplate.id,
      userId,
      signerUserId: userId,
      hostId: scopedChildUserId ?? null,
      eventId: eventId ?? null,
      teamId: teamId ?? null,
      signerRole: signerContext,
      status: { in: ['UNSIGNED', 'SIGNED'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      signedDocumentId: true,
      templateId: true,
      organizationId: true,
      userId: true,
      signerUserId: true,
      documentSubjectId: true,
      hostId: true,
      eventId: true,
      teamId: true,
      scopeType: true,
      scopeId: true,
      status: true,
      signedAt: true,
      signerRole: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Text acknowledgement must use a server-issued signing document.' },
      { status: 403 },
    );
  }
  const existingEventId = existing.eventId ?? null;
  const existingTeamId = existing.teamId ?? null;
  if (
    existing.templateId !== signedTemplate.id
    || (existing.userId ?? null) !== userId
    || (existing.signerUserId ?? null) !== userId
    || (existing.hostId ?? null) !== scopedChildUserId
    || existingEventId !== (eventId ?? null)
    || existingTeamId !== (teamId ?? null)
    || (existing.signerRole != null && existing.signerRole !== signerContext)
  ) {
    return NextResponse.json(
      { error: 'Signature confirmation does not match the server-issued evidence scope.' },
      { status: 403 },
    );
  }
  const candidateOrganizations = Array.from(new Set([
    templateOrganizationId,
    event?.organizationId ?? null,
    team?.organizationId ?? null,
    existing.organizationId ?? null,
  ].filter((value): value is string => Boolean(value))));
  if (candidateOrganizations.length !== 1) {
    return NextResponse.json(
      { error: 'Signature scope does not have one owning Organization.' },
      { status: 403 },
    );
  }
  const organizationId = candidateOrganizations[0]!;
  if (
    !existing.organizationId
    && (!eventId && !teamId)
  ) {
    return NextResponse.json(
      { error: 'Unable to derive Organization ownership for this evidence.' },
      { status: 400 },
    );
  }
  if (
    existing.organizationId
    && existing.organizationId !== organizationId
  ) {
    return NextResponse.json(
      { error: 'Signature evidence belongs to another Organization.' },
      { status: 403 },
    );
  }
  const evidenceFields = signedDocumentEvidenceFields({
    organizationId,
    userId,
    hostId: scopedChildUserId,
    eventId,
    teamId,
    signOnce: signedTemplate.signOnce,
    provenance: DOCUMENT_EVIDENCE_PROVENANCE.BRACKETIQ,
  });
  if (
    (existing.documentSubjectId ?? null) !== (evidenceFields.documentSubjectId ?? null)
    || (existing.scopeType ?? null) !== (evidenceFields.scopeType ?? null)
    || (existing.scopeId ?? null) !== (evidenceFields.scopeId ?? null)
  ) {
    return NextResponse.json(
      { error: 'Signature confirmation does not match the server-issued evidence identity.' },
      { status: 403 },
    );
  }
  const existingIsSigned = isSignedStatus(existing.status);
  const persistAndSync = async (
    client: PrismaClient | Prisma.TransactionClient,
    passClient: boolean,
  ): Promise<void> => {
    const now = new Date();
    await ensureDocumentSubject({
      organizationId,
      userId,
      hostId: scopedChildUserId,
    }, client);
    if (!existingIsSigned) {
      await client.signedDocuments.update({
        where: { id: existing.id },
        data: {
          ...(existing.organizationId ? {} : { organizationId }),
          updatedAt: now,
          ...evidenceFields,
          status: 'SIGNED',
          signedAt: now.toISOString(),
          ipAddress: resolveIpAddress(request),
          requestId: request.headers.get('x-request-id') ?? null,
        },
      });
    }
    await createDocumentRequirementSatisfaction({
      evidenceId: existing.id,
      templateDocumentId: parsed.data.templateId,
      documentRequirementId: signedTemplate.documentRequirementId,
      organizationId,
      documentSubjectId: evidenceFields.documentSubjectId,
      scopeType: evidenceFields.scopeType,
      scopeId: evidenceFields.scopeId,
      requiredSignerRoles,
      signerRole: signerContext,
    }, client);

    const syncChild = async (params: {
      eventId?: string | null;
      childUserId?: string | null;
      parentUserId?: string | null;
    }) => {
      await syncChildRegistrationConsentStatus(
        passClient ? { ...params, client } : params,
      );
    };

    if (scopedChildUserId && signedTemplate?.signOnce) {
      const registrations = await client.eventRegistrations.findMany({
        where: {
          registrantId: scopedChildUserId,
          registrantType: 'CHILD',
          status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
        },
        select: {
          eventId: true,
          parentId: true,
        },
      });

      const syncTargetMap = new Map<string, { eventId: string; parentUserId?: string }>();
      for (const registration of registrations) {
        const normalizedEventId = normalizeText(registration.eventId);
        if (!normalizedEventId) {
          continue;
        }
        const parentUserId = normalizeText(registration.parentId);
        const targetKey = `${normalizedEventId}:${parentUserId ?? ''}`;
        if (!syncTargetMap.has(targetKey)) {
          syncTargetMap.set(targetKey, {
            eventId: normalizedEventId,
            parentUserId,
          });
        }
      }
      for (const target of syncTargetMap.values()) {
        await syncChild({
          eventId: target.eventId,
          childUserId: scopedChildUserId,
          parentUserId: target.parentUserId,
        });
      }
    } else {
      await syncChild({
        eventId,
        childUserId: scopedChildUserId,
      });
    }

    if (teamId) {
      const teamRegistrantId = scopedChildUserId ?? userId;
      if (signedTemplate?.signOnce) {
        await syncAllTeamRegistrationConsentStatusesForRegistrant({
          registrantId: teamRegistrantId,
          ...(passClient ? { client } : {}),
        });
      } else {
        await syncTeamRegistrationConsentStatus({
          teamId,
          registrantId: teamRegistrantId,
          parentUserId: signerContext === 'parent_guardian' ? userId : undefined,
          ...(passClient ? { client } : {}),
        });
      }
    }
  };

  try {
    if (typeof prisma.$transaction === 'function') {
      await prisma.$transaction((tx) => persistAndSync(tx, true));
    } else {
      await persistAndSync(prisma, false);
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Unable to record signature.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
