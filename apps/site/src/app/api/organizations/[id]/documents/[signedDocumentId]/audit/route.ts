import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { DOCUMENT_EVIDENCE_PROVENANCE } from '@/server/documentEvidence';

export const dynamic = 'force-dynamic';

const AUDIT_TRAIL_DESCRIPTION = 'This audit trail records application events. It is not tamper-proof.';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; signedDocumentId: string }> },
) {
  const session = await requireSession(request);
  const { id: organizationId, signedDocumentId } = await params;
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.DOCUMENTS_AUDIT_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const evidence = await prisma.signedDocuments.findFirst({
    where: {
      id: signedDocumentId,
      organizationId,
      provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
    },
    select: {
      id: true,
      documentName: true,
      provenance: true,
      status: true,
      historicalSigningDate: true,
      importedAt: true,
      sourceNote: true,
      attestationText: true,
      attestationVersion: true,
      contentHash: true,
      uploaderId: true,
    },
  });
  if (!evidence) {
    return NextResponse.json({ error: 'Imported document evidence not found.' }, { status: 404 });
  }

  const auditEvents = await prisma.documentEvidenceAuditEvents.findMany({
    where: {
      organizationId,
      signedDocumentId: evidence.id,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      eventType: true,
      actorUserId: true,
      reason: true,
      note: true,
      payload: true,
    },
  });

  const actorUserIds = [...new Set(
    [
      ...auditEvents.map((event) => event.actorUserId),
      evidence.uploaderId,
    ].filter((actorUserId): actorUserId is string => Boolean(actorUserId)),
  )];
  const actorProfiles = actorUserIds.length > 0
    ? await prisma.userData.findMany({
      where: { id: { in: actorUserIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    : [];
  const actorDisplayNames = new Map(
    actorProfiles.map((profile) => {
      const fullName = [profile.firstName, profile.lastName]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' ')
        .trim();
      return [profile.id, fullName || 'Name unavailable'] as const;
    }),
  );

  const responseAuditEvents = auditEvents.map((event) => ({
    id: event.id,
    createdAt: event.createdAt?.toISOString() ?? null,
    eventType: event.eventType,
    actorUserId: event.actorUserId,
    actorDisplayName: event.actorUserId
      ? actorDisplayNames.get(event.actorUserId) ?? null
      : null,
    reason: event.reason,
    note: event.note,
    payload: event.payload,
  }));

  return NextResponse.json({
    auditTrail: {
      description: AUDIT_TRAIL_DESCRIPTION,
      evidence: {
        id: evidence.id,
        documentName: evidence.documentName,
        provenance: evidence.provenance,
        status: evidence.status,
        historicalSigningDate: evidence.historicalSigningDate?.toISOString() ?? null,
        importedAt: evidence.importedAt?.toISOString() ?? null,
        sourceNote: evidence.sourceNote,
        attestationText: evidence.attestationText,
        attestationVersion: evidence.attestationVersion,
        contentHash: evidence.contentHash,
        uploader: evidence.uploaderId
          ? {
            userId: evidence.uploaderId,
            displayName: actorDisplayNames.get(evidence.uploaderId) ?? null,
          }
          : null,
      },
      events: responseAuditEvents,
    },
  }, { status: 200 });
}
