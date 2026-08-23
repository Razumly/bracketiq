import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

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
    where: { id: signedDocumentId, organizationId },
    select: { id: true },
  });
  if (!evidence) {
    return NextResponse.json({ error: 'Signed document evidence not found.' }, { status: 404 });
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
    auditEvents
      .map((event) => event.actorUserId)
      .filter((actorUserId): actorUserId is string => Boolean(actorUserId)),
  )];
  const actorProfiles = actorUserIds.length > 0
    ? await prisma.userData.findMany({
      where: { id: { in: actorUserIds } },
      select: { id: true, firstName: true, lastName: true, userName: true },
    })
    : [];
  const actorDisplayNames = new Map(
    actorProfiles.map((profile) => {
      const fullName = [profile.firstName, profile.lastName]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' ')
        .trim();
      return [profile.id, fullName || profile.userName?.trim() || null] as const;
    }),
  );

  const responseAuditEvents = auditEvents.map((event) => ({
    ...event,
    actorDisplayName: event.actorUserId
      ? actorDisplayNames.get(event.actorUserId) ?? null
      : null,
  }));

  return NextResponse.json({ auditEvents: responseAuditEvents }, { status: 200 });

}
