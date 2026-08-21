import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { canManageOrganization, hasOrgPermission } from '@/server/accessControl';
import {
  appendDocumentEvidenceAuditEvent,
  createDocumentRequirementSatisfaction,
  DOCUMENT_EVIDENCE_PROVENANCE,
  ensureDocumentSubject,
  signedDocumentEvidenceFields,
  type DocumentEvidenceDatabase,
} from '@/server/documentEvidence';

export const dynamic = 'force-dynamic';

const importSchema = z.object({
  subjectUserId: z.string().trim().min(1),
  signerUserId: z.string().trim().min(1).optional(),
  hostId: z.string().trim().min(1).nullable().optional(),
  templateId: z.string().trim().min(1),
  documentName: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  importedFileId: z.string().trim().min(1).nullable().optional(),
  historicalSigningDate: z.string().trim().min(1).nullable().optional(),
  sourceNote: z.string().trim().max(4000).nullable().optional(),
  attestationText: z.string().trim().max(4000).nullable().optional(),
  attestationVersion: z.string().trim().max(160).nullable().optional(),
  signerEmail: z.string().trim().email().nullable().optional(),
  signerRole: z.string().trim().max(160).nullable().optional(),
  roleIndex: z.number().int().nullable().optional(),
  scopeType: z.enum(['ORGANIZATION', 'EVENT_PARTICIPATION', 'TEAM_MEMBERSHIP']),
  scopeId: z.string().trim().min(1),
}).strict();

const parseHistoricalDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id: organizationId } = await params;
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }
  const canManageDocuments = session.isAdmin
    || await canManageOrganization(session, organization)
    || await hasOrgPermission(session, organization, ORG_PERMISSIONS.TEMPLATES_MANAGE);
  if (!canManageDocuments) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.', details: parsed.error.flatten() }, { status: 400 });
  }
  const historicalSigningDate = parseHistoricalDate(parsed.data.historicalSigningDate);
  if (parsed.data.historicalSigningDate && !historicalSigningDate) {
    return NextResponse.json({ error: 'historicalSigningDate must be a valid date.' }, { status: 400 });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: parsed.data.templateId },
    select: {
      id: true,
      organizationId: true,
      documentRequirementId: true,
      signerRoles: true,
    },
  });
  if (!template || template.organizationId !== organizationId) {
    return NextResponse.json({ error: 'Document template not found.' }, { status: 404 });
  }

  const signerUserId = parsed.data.signerUserId ?? parsed.data.subjectUserId;
  const hostId = parsed.data.hostId ?? (parsed.data.signerUserId ? parsed.data.subjectUserId : null);
  const now = new Date();
  const evidenceId = crypto.randomUUID();
  const signedAt = historicalSigningDate?.toISOString() ?? now.toISOString();

  try {
    await prisma.$transaction(async (tx) => {
      const documentSubjectId = await ensureDocumentSubject({
        organizationId,
        userId: signerUserId,
        hostId,
      }, tx as unknown as DocumentEvidenceDatabase);
      if (!documentSubjectId) {
        throw new Error('Document Subject identity is required.');
      }

      const evidence = await tx.signedDocuments.create({
        data: {
          id: evidenceId,
          createdAt: now,
          updatedAt: now,
          signedDocumentId: `imported-${evidenceId}`,
          templateId: template.id,
          userId: signerUserId,
          documentName: parsed.data.documentName,
          hostId,
          organizationId,
          eventId: parsed.data.scopeType === 'EVENT_PARTICIPATION' ? parsed.data.scopeId : null,
          teamId: parsed.data.scopeType === 'TEAM_MEMBERSHIP' ? parsed.data.scopeId : null,
          ...signedDocumentEvidenceFields({
            organizationId,
            userId: signerUserId,
            hostId,
            eventId: parsed.data.scopeType === 'EVENT_PARTICIPATION' ? parsed.data.scopeId : null,
            teamId: parsed.data.scopeType === 'TEAM_MEMBERSHIP' ? parsed.data.scopeId : null,
            signOnce: false,
            provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
          }),
          scopeType: parsed.data.scopeType,
          scopeId: parsed.data.scopeId,
          importedFileId: parsed.data.importedFileId ?? null,
          contentHash: parsed.data.contentHash,
          historicalSigningDate,
          sourceNote: parsed.data.sourceNote ?? null,
          importedAt: now,
          uploaderId: session.userId,
          attestationText: parsed.data.attestationText ?? null,
          attestationVersion: parsed.data.attestationVersion ?? null,
          status: 'SIGNED',
          signedAt,
          signerEmail: parsed.data.signerEmail ?? null,
          roleIndex: parsed.data.roleIndex ?? null,
          signerRole: parsed.data.signerRole ?? null,
          ipAddress: null,
          requestId: null,
        },
      });

      await createDocumentRequirementSatisfaction({
        evidenceId: evidence.id,
        templateDocumentId: template.id,
        documentRequirementId: template.documentRequirementId,
        organizationId,
        documentSubjectId,
        scopeType: parsed.data.scopeType,
        scopeId: parsed.data.scopeId,
        requiredSignerRoles: template.signerRoles,
        signerRole: parsed.data.signerRole,
      }, tx as unknown as DocumentEvidenceDatabase);
      await appendDocumentEvidenceAuditEvent({
        evidenceId: evidence.id,
        organizationId,
        eventType: 'IMPORT',
        actorUserId: session.userId,
        note: parsed.data.sourceNote ?? null,
        payload: {
          importedFileId: parsed.data.importedFileId ?? null,
          contentHash: parsed.data.contentHash,
          historicalSigningDate: historicalSigningDate?.toISOString() ?? null,
        },
      }, tx as unknown as DocumentEvidenceDatabase);
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Matching imported evidence already exists.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Unable to import document evidence.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    evidenceId,
    documentId: `imported-${evidenceId}`,
    provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
  }, { status: 201 });
}
