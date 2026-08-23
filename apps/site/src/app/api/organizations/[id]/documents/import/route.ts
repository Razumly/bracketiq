import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { resolveRequiredSignerRoles } from '@/lib/templateSignerTypes';
import {
  appendDocumentEvidenceAuditEvent,
  createDocumentRequirementSatisfaction,
  DOCUMENT_EVIDENCE_PROVENANCE,
  ensureDocumentSubject,
  signedDocumentEvidenceFields,
  type DocumentEvidenceDatabase,
} from '@/server/documentEvidence';
import { listOrganizationUsersScopeEvents } from '@/server/organizationUsersAccess';
import { getStorageProvider } from '@/lib/storageProvider';
import { validatePdfBuffer } from '@/lib/pdfUploadValidation';
import { notifyDocumentEvidenceChange } from '@/server/documentNotifications';

export const dynamic = 'force-dynamic';
export const DOCUMENT_IMPORT_ATTESTATION_TEXT =
  'I confirm that this file is a complete signed document for the shown customer, Document Template Version, and scope. I confirm that it contains all required signatures. I understand that BracketIQ did not verify the signatures.';
export const DOCUMENT_IMPORT_ATTESTATION_VERSION = '1';

const PDF_MIME_TYPE = 'application/pdf';
const MAX_IMPORTED_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
const IMPORT_SCOPE_TYPES = ['ORGANIZATION', 'EVENT_PARTICIPATION', 'TEAM_MEMBERSHIP'] as const;

type ImportScopeType = (typeof IMPORT_SCOPE_TYPES)[number];

type ParsedImportInput = {
  subjectUserId: string;
  templateId: string;
  documentName: string;
  historicalSigningDate?: string | null;
  sourceNote?: string | null;
  isAttestationAccepted: boolean;
  scopeType: ImportScopeType;
  scopeId: string;
};

const importSchema = z.object({
  subjectUserId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  documentName: z.string().trim().min(1).max(240),
  historicalSigningDate: z.string().trim().min(1).nullable().optional(),
  sourceNote: z.string().trim().max(4000).nullable().optional(),
  attestationAccepted: z.boolean(),
  scopeType: z.enum(IMPORT_SCOPE_TYPES),
  scopeId: z.string().trim().min(1),
});

const textField = (form: FormData, name: string): string | undefined => {
  const value = form.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const nullableTextField = (form: FormData, name: string): string | null => (
  textField(form, name) ?? null
);

const parseBooleanField = (form: FormData, name: string): boolean => (
  textField(form, name)?.toLowerCase() === 'true'
);

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  ));
};
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseHistoricalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  ) ? parsed : null;
};

const parseImportForm = async (
  request: NextRequest,
): Promise<{
  data: ParsedImportInput;
  file: File;
} | {
  response: NextResponse;
}> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) {
    return { response: NextResponse.json({ error: 'A multipart PDF upload is required.' }, { status: 400 }) };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { response: NextResponse.json({ error: 'Invalid multipart form data.' }, { status: 400 }) };
  }

  const fileEntry = form.get('file');
  if (typeof File === 'undefined' || !(fileEntry instanceof File)) {
    return { response: NextResponse.json({ error: 'file is required.' }, { status: 400 }) };
  }
  if (fileEntry.size > MAX_IMPORTED_DOCUMENT_UPLOAD_BYTES) {
    return {
      response: NextResponse.json(
        { error: 'PDF must be 25MB or less. Choose a smaller file and try again.' },
        { status: 413 },
      ),
    };
  }
  if (fileEntry.type.trim().toLowerCase() !== PDF_MIME_TYPE) {
    return {
      response: NextResponse.json(
        { error: 'Only PDF uploads are supported for imported documents.' },
        { status: 415 },
      ),
    };
  }

  const parsed = importSchema.safeParse({
    subjectUserId: textField(form, 'subjectUserId'),
    templateId: textField(form, 'templateId'),
    documentName: textField(form, 'documentName'),
    historicalSigningDate: nullableTextField(form, 'historicalSigningDate'),
    sourceNote: nullableTextField(form, 'sourceNote'),
    attestationAccepted: parseBooleanField(form, 'attestationAccepted'),
    scopeType: textField(form, 'scopeType'),
    scopeId: textField(form, 'scopeId'),
  });
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: 'Invalid input.', details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  const { attestationAccepted, ...input } = parsed.data;
  return {
    data: {
      ...input,
      isAttestationAccepted: attestationAccepted,
    },
    file: fileEntry,
  };
};

const deleteStoredObject = async (stored: { key: string; bucket?: string | null }): Promise<void> => {
  try {
    await getStorageProvider().deleteObject({ key: stored.key, bucket: stored.bucket });
  } catch (error) {
    console.error('Imported document cleanup failed.', { key: stored.key, error });
  }
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(request);
  const { id: organizationId } = await params;
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.DOCUMENTS_IMPORT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsedForm = await parseImportForm(request);
  if ('response' in parsedForm) return parsedForm.response;
  const { data: parsed, file } = parsedForm;
  const historicalSigningDate = parseHistoricalDate(parsed.historicalSigningDate);
  if (parsed.historicalSigningDate && !historicalSigningDate) {
    return NextResponse.json(
      { error: 'historicalSigningDate must be a valid date.' },
      { status: 400 },
    );
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: parsed.templateId },
    select: {
      id: true,
      organizationId: true,
      documentRequirementId: true,
      requiredSignerType: true,
      signerRoles: true,
      signOnce: true,
    },
  });
  if (!template || template.organizationId !== organizationId) {
    return NextResponse.json({ error: 'Document template not found.' }, { status: 404 });
  }
  const requirement = await prisma.documentRequirements.findUnique({
    where: { id: template.documentRequirementId },
    select: { id: true, organizationId: true },
  });
  if (!requirement || requirement.organizationId !== organizationId) {
    return NextResponse.json({ error: 'Document template not found.' }, { status: 404 });
  }

  if (!parsed.isAttestationAccepted) {
    return NextResponse.json(
      { error: 'Document Import Attestation must be accepted.' },
      { status: 400 },
    );
  }
  if (parsed.scopeType === 'ORGANIZATION' && parsed.scopeId !== organizationId) {
    return NextResponse.json(
      { error: 'Organization scope does not belong to this Organization.' },
      { status: 400 },
    );
  }
  if (template.signOnce && parsed.scopeType !== 'ORGANIZATION') {
    return NextResponse.json(
      { error: 'Sign-once Document Template Versions require Organization scope.' },
      { status: 400 },
    );
  }
  if (!template.signOnce && parsed.scopeType !== 'EVENT_PARTICIPATION') {
    return NextResponse.json(
      { error: 'Non-sign-once Document Template Versions require Event Participation scope.' },
      { status: 400 },
    );
  }

  const [users, scopedEntity, scopeEvents, eventScopeRegistrations, organizationTeams] = await Promise.all([
    prisma.userData.findMany({
      where: { id: parsed.subjectUserId },
      select: { id: true },
    }),
    parsed.scopeType === 'EVENT_PARTICIPATION'
      ? prisma.events.findUnique({
        where: { id: parsed.scopeId },
        select: { id: true, organizationId: true },
      })
      : parsed.scopeType === 'TEAM_MEMBERSHIP'
        ? prisma.canonicalTeams.findUnique({
          where: { id: parsed.scopeId },
          select: { id: true, organizationId: true },
        })
        : null,
    listOrganizationUsersScopeEvents(organizationId),
    parsed.scopeType === 'EVENT_PARTICIPATION'
      ? prisma.eventRegistrations.findMany({
        where: {
          eventId: parsed.scopeId,
          rosterRole: 'PARTICIPANT',
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          OR: [
            { registrantType: 'TEAM' },
            { eventTeamId: { not: null } },
          ],
        },
        select: { registrantId: true, parentId: true, eventTeamId: true },
      })
      : Promise.resolve([]),
    prisma.canonicalTeams.findMany({
      where: { organizationId },
      select: { id: true },
    }),
  ]);
  if (!users.some((user) => user.id === parsed.subjectUserId)) {
    return NextResponse.json({ error: 'Document Subject was not found.' }, { status: 400 });
  }
  if (organizationTeams.some((team) => team.id === parsed.subjectUserId)) {
    return NextResponse.json({ error: 'Document Subject must be a User, not a Team.' }, { status: 400 });
  }

  const organizationTeamIds = organizationTeams.map((team) => team.id);
  const scopeEvent = parsed.scopeType === 'EVENT_PARTICIPATION'
    ? scopeEvents.find((event) => event.id === parsed.scopeId)
    : undefined;
  const eventCanonicalTeamIds = new Set(
    [
      ...(scopeEvent?.teamIds ?? []),
      ...eventScopeRegistrations.flatMap((registration) => [
        registration.parentId,
        registration.registrantId,
        registration.eventTeamId,
      ]),
    ].filter((teamId): teamId is string => typeof teamId === 'string' && teamId.trim().length > 0),
  );
  const membershipTeamIds = Array.from(new Set([
    ...organizationTeamIds,
    ...eventCanonicalTeamIds,
    ...(parsed.scopeType === 'TEAM_MEMBERSHIP' ? [parsed.scopeId] : []),
  ]));
  const eventTeamIds = parsed.scopeType === 'EVENT_PARTICIPATION'
    ? normalizeIdList(eventScopeRegistrations.flatMap((registration) => [
      registration.eventTeamId,
      registration.registrantId,
    ]))
    : [];
  const eventTeamsDelegate = (prisma as any).teams;
  const teamStaffAssignmentsDelegate = (prisma as any).teamStaffAssignments;
  const [eventTeams, teamStaffAssignments] = await Promise.all([
    eventTeamIds.length && typeof eventTeamsDelegate?.findMany === 'function'
      ? eventTeamsDelegate.findMany({
        where: {
          id: { in: eventTeamIds },
          OR: [{ kind: { not: 'PLACEHOLDER' } }, { kind: null }],
        },
        select: {
          playerIds: true,
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
        },
      })
      : Promise.resolve([]),
    membershipTeamIds.length && typeof teamStaffAssignmentsDelegate?.findMany === 'function'
      ? teamStaffAssignmentsDelegate.findMany({
        where: {
          teamId: { in: membershipTeamIds },
          status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
        },
        select: { userId: true },
      })
      : Promise.resolve([]),
  ]);
  const teamRegistrations = membershipTeamIds.length
    ? await prisma.teamRegistrations.findMany({
      where: {
        teamId: { in: membershipTeamIds },
        userId: parsed.subjectUserId,
        status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
      },
      select: { teamId: true, userId: true },
    })
    : [];
  const customerUserIds = new Set([
    ...scopeEvents.flatMap((event) => [
      ...event.userIds,
      ...(event.organizationId !== organizationId
        ? [event.hostId, ...(event.assistantHostIds ?? [])]
        : []),
      ...(event.officialIds ?? []),
    ]),
    ...eventTeams.flatMap((team: Record<string, unknown>) => normalizeIdList([
      ...(Array.isArray(team.playerIds) ? team.playerIds : []),
      team.captainId,
      team.managerId,
      team.headCoachId,
      ...(Array.isArray(team.coachIds) ? team.coachIds : []),
    ])),
    ...teamRegistrations.map((registration) => registration.userId),
    ...teamStaffAssignments.flatMap((assignment: Record<string, unknown>) => (
      typeof assignment.userId === 'string' ? [assignment.userId] : []
    )),
  ]);
  if (!customerUserIds.has(parsed.subjectUserId)) {
    return NextResponse.json(
      { error: 'Document Subject is not a customer of this Organization.' },
      { status: 400 },
    );
  }
  const scopeBelongsToOrganization = parsed.scopeType === 'EVENT_PARTICIPATION'
    ? Boolean(scopeEvent)
    : scopedEntity?.organizationId === organizationId;
  if (parsed.scopeType !== 'ORGANIZATION' && !scopeBelongsToOrganization) {
    return NextResponse.json(
      { error: 'Document scope does not belong to this Organization.' },
      { status: 400 },
    );
  }
  if (parsed.scopeType === 'EVENT_PARTICIPATION') {
    const isDirectEventCustomer = Boolean(scopeEvent?.userIds.includes(parsed.subjectUserId));
    const hasTeamEventMembership = teamRegistrations.some((registration) => (
      eventCanonicalTeamIds.has(registration.teamId)
      && registration.userId === parsed.subjectUserId
    )) || eventTeams.some((team: Record<string, unknown>) => normalizeIdList([
      ...(Array.isArray(team.playerIds) ? team.playerIds : []),
      team.captainId,
      team.managerId,
      team.headCoachId,
      ...(Array.isArray(team.coachIds) ? team.coachIds : []),
    ]).includes(parsed.subjectUserId));
    if (!isDirectEventCustomer && !hasTeamEventMembership) {
      return NextResponse.json(
        { error: 'Document Subject is not a participant in this Event.' },
        { status: 400 },
      );
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await validatePdfBuffer(buffer);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 415 });
  }
  const contentHash = `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
  const storage = getStorageProvider();
  let stored: { key: string; bucket?: string | null } | null = null;
  try {
    const storedResult = await storage.putObject({
      data: buffer,
      originalName: file.name,
      contentType: PDF_MIME_TYPE,
      organizationId,
    });
    stored = { key: storedResult.key, bucket: storedResult.bucket };

    const now = new Date();
    const evidenceId = crypto.randomUUID();
    const signedAt = historicalSigningDate?.toISOString() ?? null;
    const evidenceScope = {
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      eventId: parsed.scopeType === 'EVENT_PARTICIPATION' ? parsed.scopeId : null,
      teamId: parsed.scopeType === 'TEAM_MEMBERSHIP' ? parsed.scopeId : null,
    };
    const requiredSignerRoles = resolveRequiredSignerRoles(
      template.signerRoles,
      template.requiredSignerType,
    );

    await prisma.$transaction(async (tx) => {
      const importedFileId = crypto.randomUUID();
      await tx.file.create({
        data: {
          id: importedFileId,
          createdAt: now,
          updatedAt: now,
          organizationId,
          uploaderId: session.userId,
          originalName: file.name,
          mimeType: PDF_MIME_TYPE,
          sizeBytes: buffer.length,
          bucket: stored?.bucket ?? null,
          path: stored?.key ?? '',
        },
      });
      const documentSubjectId = await ensureDocumentSubject(
        {
          organizationId,
          documentSubjectUserId: parsed.subjectUserId,
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
      const evidence = await tx.signedDocuments.create({
        data: {
          id: evidenceId,
          createdAt: now,
          updatedAt: now,
          signedDocumentId: `imported-${evidenceId}`,
          templateId: template.id,
          userId: null,
          documentName: parsed.documentName,
          hostId: null,
          organizationId,
          eventId: evidenceScope.eventId,
          teamId: evidenceScope.teamId,
          ...signedDocumentEvidenceFields({
            organizationId,
            documentSubjectUserId: parsed.subjectUserId,
            ...evidenceScope,
            signOnce: template.signOnce,
            provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
          }),
          scopeType: evidenceScope.scopeType,
          scopeId: evidenceScope.scopeId,
          importedFileId,
          contentHash,
          historicalSigningDate,
          sourceNote: parsed.sourceNote ?? null,
          importedAt: now,
          uploaderId: session.userId,
          attestationText: DOCUMENT_IMPORT_ATTESTATION_TEXT,
          attestationVersion: DOCUMENT_IMPORT_ATTESTATION_VERSION,
          status: 'SIGNED',
          signedAt,
          signerEmail: null,
          signerRole: null,
          roleIndex: null,
          ipAddress: null,
          requestId: null,
        },
      });

      await createDocumentRequirementSatisfaction(
        {
          evidenceId: evidence.id,
          templateDocumentId: template.id,
          documentRequirementId: template.documentRequirementId,
          organizationId,
          documentSubjectId,
          scopeType: evidenceScope.scopeType,
          scopeId: evidenceScope.scopeId,
          requiredSignerRoles,
          completedSignerRoles: requiredSignerRoles,
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
      await appendDocumentEvidenceAuditEvent(
        {
          evidenceId: evidence.id,
          organizationId,
          eventType: 'IMPORT',
          actorUserId: session.userId,
          note: parsed.sourceNote ?? null,
          payload: {
            importedFileId,
            contentHash,
            historicalSigningDate: historicalSigningDate?.toISOString() ?? null,
          },
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
    });

    try {
      await notifyDocumentEvidenceChange({
        organizationId,
        subjectUserId: parsed.subjectUserId,
        evidenceId,
        documentName: parsed.documentName,
        action: 'IMPORT',
        actorUserId: session.userId,
      });
    } catch (error) {
      console.error('Imported document notification failed.', {
        organizationId,
        evidenceId,
        error,
      });
    }

    return NextResponse.json(
      {
        evidenceId,
        documentId: `imported-${evidenceId}`,
        provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
      },
      { status: 201 },
    );
  } catch (error) {
    if (stored) await deleteStoredObject(stored);
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Matching imported evidence already exists.' },
        { status: 409 },
      );
    }
    console.error('Unable to import document evidence.', { organizationId, error });
    return NextResponse.json(
      { error: 'Unable to import document evidence.' },
      { status: 400 },
    );
  }
}
