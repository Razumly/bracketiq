import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { type Prisma } from '@/generated/prisma/client';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { canManageOrganization, hasOrgPermission } from '@/server/accessControl';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';
import { listOrganizationUsersScopeEvents } from '@/server/organizationUsersAccess';
import {
  ensureDocumentSubject,
  signedDocumentEvidenceFields,
  DOCUMENT_EVIDENCE_PROVENANCE,
} from '@/server/documentEvidence';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  userId: z.string().trim().min(1),
  eventId: z.string().trim().min(1).nullable().optional(),
  templateId: z.string().trim().min(1),
}).strict();

const customerBelongsToOrganization = async (organizationId: string, userId: string): Promise<boolean> => {
  const scopeEvents = await listOrganizationUsersScopeEvents(organizationId);
  if (scopeEvents.some((event) => event.userIds.includes(userId))) {
    return true;
  }
  const canonicalTeams = await prisma.canonicalTeams.findMany({
    where: { organizationId },
    select: { id: true },
  });
  if (!canonicalTeams.length) {
    return false;
  }
  const registration = await prisma.teamRegistrations.findFirst({
    where: {
      teamId: { in: canonicalTeams.map((team) => team.id) },
      userId,
      status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
    },
    select: { id: true },
  });
  return Boolean(registration);
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

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: parsed.data.templateId },
    select: {
      id: true,
      organizationId: true,
      title: true,
      type: true,
      requiredSignerType: true,
      signOnce: true,
    },
  });
  const event = parsed.data.eventId
    ? await prisma.events.findUnique({
      where: { id: parsed.data.eventId },
      select: { id: true, organizationId: true, fieldIds: true },
    })
    : null;
  if (!template || template.organizationId !== organizationId) {
    return NextResponse.json({ error: 'Document template not found.' }, { status: 404 });
  }
  if (parsed.data.eventId && !event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }
  if (normalizeRequiredSignerType(template.requiredSignerType) !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Only participant documents can be added from this page.' }, { status: 400 });
  }

  if (event) {
    let eventBelongsToOrganization = event.organizationId === organizationId;
    if (!eventBelongsToOrganization && Array.isArray(event.fieldIds) && event.fieldIds.length > 0) {
      const organizationFields = await prisma.fields.findMany({
        where: { organizationId },
        select: { id: true },
      });
      const organizationFieldIds = new Set(organizationFields.map((field) => field.id));
      eventBelongsToOrganization = event.fieldIds.some((fieldId) => organizationFieldIds.has(fieldId));
    }
    if (!eventBelongsToOrganization) {
      return NextResponse.json({ error: 'Event is not part of this organization.' }, { status: 404 });
    }

    const [directRegistration, eventTeams] = await Promise.all([
      prisma.eventRegistrations.findFirst({
        where: {
          eventId: event.id,
          registrantId: parsed.data.userId,
          registrantType: { in: ['SELF', 'CHILD'] },
          rosterRole: 'PARTICIPANT',
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED'] },
        },
        select: { id: true },
      }),
      prisma.teams.findMany({
        where: { eventId: event.id },
        select: { playerIds: true },
      }),
    ]);
    const isEventCustomer = Boolean(directRegistration)
      || eventTeams.some((team) => team.playerIds.includes(parsed.data.userId));
    if (!isEventCustomer) {
      return NextResponse.json({ error: 'Customer is not registered for this event.' }, { status: 404 });
    }
  } else {
    if (template.type !== 'TEXT') {
      return NextResponse.json({ error: 'PDF documents require an event.' }, { status: 400 });
    }
    if (!await customerBelongsToOrganization(organizationId, parsed.data.userId)) {
      return NextResponse.json({ error: 'Customer is not part of this organization.' }, { status: 404 });
    }
  }

  if (template.type === 'TEXT') {
    const existing = await prisma.signedDocuments.findFirst({
      where: {
        templateId: template.id,
        userId: parsed.data.userId,
        organizationId,
        eventId: event?.id ?? null,
        signerRole: 'participant',
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      return NextResponse.json({ documentId: existing.signedDocumentId, type: 'TEXT' }, { status: 200 });
    }

    const now = new Date();
    await ensureDocumentSubject({
      organizationId,
      userId: parsed.data.userId,
      hostId: null,
    });
    const signedDocumentData: Prisma.SignedDocumentsUncheckedCreateInput = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      signedDocumentId: `text-${crypto.randomUUID()}`,
      templateId: template.id,
      userId: parsed.data.userId,
      documentName: template.title ?? 'Document',
      hostId: null,
      organizationId,
      eventId: event?.id ?? null,
      teamId: null,
      ...signedDocumentEvidenceFields({
        organizationId,
        userId: parsed.data.userId,
        hostId: null,
        eventId: event?.id ?? null,
        teamId: null,
        signOnce: template.signOnce,
        provenance: DOCUMENT_EVIDENCE_PROVENANCE.BRACKETIQ,
      }),
      status: 'UNSIGNED',
      signedAt: null,
      signerEmail: null,
      roleIndex: null,
      signerRole: 'participant',
      ipAddress: null,
      requestId: null,
    };
    const created = await prisma.signedDocuments.create({ data: signedDocumentData });
    return NextResponse.json({ documentId: created.signedDocumentId, type: 'TEXT' }, { status: 201 });
  }

  if (!event) {
    return NextResponse.json({ error: 'PDF documents require an event.' }, { status: 400 });
  }
  const dispatch = await dispatchRequiredEventDocuments({
    eventId: event.id,
    organizationId,
    requiredTemplateIds: [template.id],
    participantUserId: parsed.data.userId,
  });
  if (dispatch.errors.length > 0) {
    return NextResponse.json({ error: dispatch.errors[0] }, { status: 400 });
  }
  if (!dispatch.firstDocumentId) {
    return NextResponse.json({ error: 'Unable to add this document.' }, { status: 400 });
  }
  return NextResponse.json({ documentId: dispatch.firstDocumentId, type: 'PDF' }, { status: 201 });
}
