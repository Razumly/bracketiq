import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '@/generated/prisma/client';
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
  readByIdChunks,
  signedDocumentEvidenceFields,
  type DocumentEvidenceDatabase,
} from '@/server/documentEvidence';
import {
  notifyDocumentEvidenceChange,
} from '@/server/documentNotifications';
import {
  listOrganizationUsersScopeEvents,
  type OrganizationUsersScopeEvent,
} from '@/server/organizationUsersAccess';
import { getStorageProvider } from '@/lib/storageProvider';
import { validatePdfBuffer } from '@/lib/pdfUploadValidation';

export const dynamic = 'force-dynamic';
const DOCUMENT_IMPORT_ATTESTATION_TEXT =
  'I confirm that this file is a complete signed document for the shown customer, Document Template Version, and scope. I confirm that it contains all required signatures. I understand that BracketIQ did not verify the signatures.';
const DOCUMENT_IMPORT_ATTESTATION_VERSION = '1';

const PDF_MIME_TYPE = 'application/pdf';
const MAX_IMPORTED_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
const IMPORT_SCOPE_TYPES = ['ORGANIZATION', 'EVENT_PARTICIPATION'] as const;

type ImportScopeType = (typeof IMPORT_SCOPE_TYPES)[number];

type ParsedImportInput = {
  subjectUserId: string;
  templateId: string;
  historicalSigningDate?: string | null;
  sourceNote?: string | null;
  isAttestationAccepted: boolean;
  scopeType: ImportScopeType;
  scopeId: string;
};

type LockedImportTemplate = {
  id: string;
  title: string;
  organizationId: string;
  documentRequirementId: string;
  requiredSignerType: unknown;
  signerRoles: unknown;
  signOnce: boolean;
};

const importSchema = z.object({
  subjectUserId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
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
type ImportedTeamMemberFields = {
  playerIds: readonly string[] | null;
  captainId: string | null;
  managerId: string | null;
  headCoachId: string | null;
  coachIds: readonly string[] | null;
};


const teamMemberIds = (team: ImportedTeamMemberFields): string[] => normalizeIdList([
  ...(team.playerIds ?? []),
  team.captainId,
  team.managerId,
  team.headCoachId,
  ...(team.coachIds ?? []),
]);
const IMPORT_EVENT_PARTICIPATION_STATUSES = [
  'STARTED',
  'PENDING',
  'ACTIVE',
  'BLOCKED',
  'CONSENTFAILED',
] as const;
const IMPORT_EVENT_PARTICIPATION_TERMINAL_STATUSES = [
  'PAYMENT_FAILED',
  'CANCELLED',
] as const;
const IMPORT_EVENT_PARTICIPATION_QUERY_STATUSES = [
  ...IMPORT_EVENT_PARTICIPATION_STATUSES,
  ...IMPORT_EVENT_PARTICIPATION_TERMINAL_STATUSES,
] as const;
const IMPORT_TEAM_MEMBERSHIP_STATUSES = ['STARTED', 'PENDING', 'ACTIVE'] as const;

type ImportDatabase = Pick<
  PrismaClient | Prisma.TransactionClient,
  'events' | 'eventRegistrations' | 'teams' | 'canonicalTeams' | 'teamRegistrations'
>;

type ImportEventRegistration = {
  id: string;
  eventId: string;
  registrantId: string;
  parentId: string | null;
  registrantType: string;
  status: string | null;
  eventTeamId: string | null;
  sourceTeamRegistrationId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type ImportEventTeam = ImportedTeamMemberFields & {
  id: string;
  eventId: string | null;
  parentTeamId: string | null;
  kind: string | null;
};

type ImportTeamMembership = {
  id: string;
  teamId: string;
  userId: string;
  status: string | null;
};

type ImportEventParticipation = {
  eventId: string;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const registrationTime = (registration: ImportEventRegistration): number => (
  registration.updatedAt?.getTime()
  ?? registration.createdAt?.getTime()
  ?? 0
);

const latestRegistration = (
  registrations: readonly ImportEventRegistration[],
): ImportEventRegistration | null => (
  [...registrations]
    .sort((left, right) => (
      registrationTime(right) - registrationTime(left)
      || right.id.localeCompare(left.id)
    ))
    [0] ?? null
);

const validateEventParticipation = async (params: {
  organizationId: string;
  subjectUserId: string;
  eventId: string;
  scopeEvents?: readonly OrganizationUsersScopeEvent[];
}, client: ImportDatabase): Promise<ImportEventParticipation | null> => {
  const event = await client.events.findUnique({
    where: { id: params.eventId },
    select: { id: true, organizationId: true },
  });
  if (!event || event.organizationId !== params.organizationId) {
    return null;
  }
  if (
    params.scopeEvents
    && !params.scopeEvents.some((scopeEvent) => (
      scopeEvent.id === params.eventId
      && scopeEvent.organizationId === params.organizationId
    ))
  ) {
    return null;
  }

  const registrations = await client.eventRegistrations.findMany({
    where: {
      eventId: params.eventId,
      rosterRole: 'PARTICIPANT',
      status: { in: [...IMPORT_EVENT_PARTICIPATION_QUERY_STATUSES] },
      slotId: null,
      occurrenceDate: null,
      OR: [
        {
          registrantType: { in: ['SELF', 'CHILD'] },
          registrantId: params.subjectUserId,
        },
        { registrantType: 'TEAM' },
      ],
    },
    select: {
      id: true,
      eventId: true,
      registrantId: true,
      parentId: true,
      registrantType: true,
      status: true,
      eventTeamId: true,
      sourceTeamRegistrationId: true,
      createdAt: true,
      updatedAt: true,
    },
  }) as ImportEventRegistration[];
  const eligibleStatusSet = new Set<string>(IMPORT_EVENT_PARTICIPATION_STATUSES);
  const eligibleRegistrations = registrations.filter((registration) => (
    eligibleStatusSet.has(String(registration.status ?? '').trim().toUpperCase())
  ));

  const personRegistrations = registrations.filter((registration) => (
    ['SELF', 'CHILD'].includes(registration.registrantType)
    && registration.registrantId === params.subjectUserId
  ));
  const eligiblePersonRegistrations = personRegistrations.filter((registration) => (
    eligibleStatusSet.has(String(registration.status ?? '').trim().toUpperCase())
  ));
  const hasDirectParticipation = eligiblePersonRegistrations.some((registration) => (
    !normalizeId(registration.eventTeamId)
    && !normalizeId(registration.sourceTeamRegistrationId)
  ));
  const teamIds = normalizeIdList(
    eligibleRegistrations.flatMap((registration) => (
      registration.registrantType === 'TEAM'
        ? [registration.eventTeamId, registration.registrantId]
        : [registration.eventTeamId]
    )),
  );
  if (!teamIds.length) {
    return hasDirectParticipation ? { eventId: params.eventId } : null;
  }

  const eventTeams = await client.teams.findMany({
    where: {
      id: { in: teamIds },
      eventId: params.eventId,
      OR: [{ kind: { not: 'PLACEHOLDER' } }, { kind: null }],
    },
    select: {
      id: true,
      eventId: true,
      parentTeamId: true,
      kind: true,
      playerIds: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
      coachIds: true,
    },
  }) as ImportEventTeam[];
  const canonicalTeamIdsByEventTeamId = new Map<string, Set<string>>();
  eventTeams.forEach((team) => {
    const eventTeamId = normalizeId(team.id);
    const canonicalTeamId = normalizeId(team.parentTeamId);
    if (!eventTeamId || !canonicalTeamId) {
      return;
    }
    canonicalTeamIdsByEventTeamId.set(eventTeamId, new Set([canonicalTeamId]));
  });
  eligibleRegistrations
    .filter((registration) => registration.registrantType === 'TEAM')
    .forEach((registration) => {
      const eventTeamId = normalizeId(registration.eventTeamId)
        ?? normalizeId(registration.registrantId);
      const canonicalTeamId = normalizeId(registration.parentId);
      if (!eventTeamId || !canonicalTeamId) {
        return;
      }
      const canonicalTeamIdsForEventTeam = canonicalTeamIdsByEventTeamId.get(eventTeamId) ?? new Set<string>();
      canonicalTeamIdsForEventTeam.add(canonicalTeamId);
      canonicalTeamIdsByEventTeamId.set(eventTeamId, canonicalTeamIdsForEventTeam);
    });
  eventTeams.forEach((team) => {
    const eventTeamId = normalizeId(team.id);
    if (!eventTeamId || canonicalTeamIdsByEventTeamId.has(eventTeamId)) {
      return;
    }
    canonicalTeamIdsByEventTeamId.set(eventTeamId, new Set([eventTeamId]));
  });
  const canonicalTeamIds = normalizeIdList(
    Array.from(canonicalTeamIdsByEventTeamId.values()).flatMap((teamIds) => Array.from(teamIds)),
  );
  if (!canonicalTeamIds.length) {
    return hasDirectParticipation ? { eventId: params.eventId } : null;
  }

  const canonicalTeams = await client.canonicalTeams.findMany({
    where: {
      id: { in: canonicalTeamIds },
      organizationId: params.organizationId,
    },
    select: { id: true },
  });
  const organizationCanonicalTeamIds = new Set(canonicalTeams.map((team) => team.id));
  if (!organizationCanonicalTeamIds.size) {
    return hasDirectParticipation ? { eventId: params.eventId } : null;
  }

  const memberships = await client.teamRegistrations.findMany({
    where: {
      teamId: { in: Array.from(organizationCanonicalTeamIds) },
      userId: params.subjectUserId,
      rosterRole: 'PARTICIPANT',
      status: { in: [...IMPORT_TEAM_MEMBERSHIP_STATUSES] },
    },
    select: { id: true, teamId: true, userId: true, status: true },
  }) as ImportTeamMembership[];
  const eligibleMembershipStatusSet = new Set<string>(IMPORT_TEAM_MEMBERSHIP_STATUSES);
  const eligibleMemberships = memberships.filter((membership) => (
    eligibleMembershipStatusSet.has(String(membership.status ?? '').trim().toUpperCase())
  ));
  const membershipsByTeamId = new Map(
    eligibleMemberships.map((membership) => [membership.teamId, membership]),
  );
  const canonicalTeamIdByEventTeamId = new Map<string, string>();
  canonicalTeamIdsByEventTeamId.forEach((teamIds, eventTeamId) => {
    const [canonicalTeamId] = Array.from(teamIds);
    if (
      teamIds.size === 1
      && canonicalTeamId
      && organizationCanonicalTeamIds.has(canonicalTeamId)
    ) {
      canonicalTeamIdByEventTeamId.set(eventTeamId, canonicalTeamId);
    }
  });
  const personRegistrationsByEventTeamId = new Map<string, ImportEventRegistration[]>();
  personRegistrations.forEach((registration) => {
    const eventTeamId = normalizeId(registration.eventTeamId);
    if (!eventTeamId) {
      return;
    }
    const registrationsForEventTeam = personRegistrationsByEventTeamId.get(eventTeamId) ?? [];
    registrationsForEventTeam.push(registration);
    personRegistrationsByEventTeamId.set(eventTeamId, registrationsForEventTeam);
  });

  const validEventTeamIds = new Set(
    eventTeams
      .filter((team) => {
        const eventTeamId = normalizeId(team.id);
        const canonicalTeamId = eventTeamId
          ? canonicalTeamIdByEventTeamId.get(eventTeamId)
          : undefined;
        const membership = canonicalTeamId
          ? membershipsByTeamId.get(canonicalTeamId)
          : undefined;
        if (!eventTeamId || !canonicalTeamId || !membership) {
          return false;
        }
        const latestPersonRegistration = latestRegistration(
          personRegistrationsByEventTeamId.get(eventTeamId) ?? [],
        );
        if (latestPersonRegistration && !eligibleStatusSet.has(
          String(latestPersonRegistration.status ?? '').trim().toUpperCase(),
        )) {
          return false;
        }
        const isInEventTeamSnapshot = teamMemberIds(team).includes(params.subjectUserId);
        const hasLinkedRosterRegistration = latestPersonRegistration
          ? normalizeId(latestPersonRegistration.sourceTeamRegistrationId) === membership.id
          : isInEventTeamSnapshot;
        return hasLinkedRosterRegistration;
      })
      .map((team) => team.id),
  );
  const hasTeamParticipation = personRegistrations.some((registration) => {
    const eventTeamId = normalizeId(registration.eventTeamId);
    return Boolean(eventTeamId && validEventTeamIds.has(eventTeamId));
  }) || eligibleRegistrations.some((registration) => {
    if (registration.registrantType !== 'TEAM') {
      return false;
    }
    const eventTeamId = normalizeId(registration.eventTeamId) ?? normalizeId(registration.registrantId);
    const eventTeam = eventTeams.find((team) => team.id === eventTeamId);
    return Boolean(
      eventTeamId
      && eventTeam
      && validEventTeamIds.has(eventTeamId)
      && teamMemberIds(eventTeam).includes(params.subjectUserId),
    );
  });

  return hasDirectParticipation || hasTeamParticipation
    ? { eventId: params.eventId }
    : null;
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await getStorageProvider().deleteObject({ key: stored.key, bucket: stored.bucket });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Imported document cleanup failed.');
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(request);
  const { id: organizationId } = await params;
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, name: true },
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

  if (!parsed.isAttestationAccepted) {
    return NextResponse.json(
      { error: 'Document Import Attestation must be accepted.' },
      { status: 400 },
    );
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: parsed.templateId },
    select: {
      id: true,
      title: true,
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
    select: { id: true, title: true, organizationId: true },
  });
  if (!requirement || requirement.organizationId !== organizationId) {
    return NextResponse.json({ error: 'Document template not found.' }, { status: 404 });
  }
  const templateDisplayName = template.title?.trim() || requirement.title?.trim();
  if (!templateDisplayName) {
    return NextResponse.json(
      { error: 'Document Template Version title is required.' },
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
  if (parsed.scopeType === 'ORGANIZATION' && parsed.scopeId !== organizationId) {
    return NextResponse.json(
      { error: 'Organization scope does not belong to this Organization.' },
      { status: 400 },
    );
  }

  const [users, scopeEvents, organizationTeams] = await Promise.all([
    prisma.userData.findMany({
      where: { id: parsed.subjectUserId },
      select: { id: true },
    }),
    listOrganizationUsersScopeEvents(organizationId),
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
  if (parsed.scopeType === 'EVENT_PARTICIPATION') {
    const eventParticipation = await validateEventParticipation(
      {
        organizationId,
        subjectUserId: parsed.subjectUserId,
        eventId: parsed.scopeId,
        scopeEvents,
      },
      prisma,
    );
    if (!eventParticipation) {
      return NextResponse.json(
        { error: 'Document Subject does not have eligible participation in this Organization Event.' },
        { status: 400 },
      );
    }
  } else {
    const organizationEventIds = normalizeIdList(scopeEvents.map((event) => event.id));
    const organizationEventRegistrations = organizationEventIds.length
      ? await readByIdChunks(organizationEventIds, (eventIds) => prisma.eventRegistrations.findMany({
        where: {
          eventId: { in: eventIds },
          rosterRole: 'PARTICIPANT',
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          slotId: null,
          occurrenceDate: null,
          OR: [
            { registrantType: 'TEAM' },
            { eventTeamId: { not: null } },
          ],
        },
        select: {
          eventId: true,
          registrantId: true,
          parentId: true,
          registrantType: true,
          eventTeamId: true,
        },
      }))
      : [];
    const organizationEventTeamIds = normalizeIdList([
      ...scopeEvents.flatMap((event) => event.teamIds),
      ...organizationEventRegistrations.flatMap((registration) => {
        const registrantType = typeof registration.registrantType === 'string'
          ? registration.registrantType.toUpperCase()
          : '';
        if (registrantType !== 'TEAM' && typeof registration.eventTeamId !== 'string') {
          return [];
        }
        return [registration.eventTeamId, registration.registrantId, registration.parentId];
      }),
    ]);
    const organizationEventTeams = organizationEventTeamIds.length
      ? await readByIdChunks(organizationEventTeamIds, (teamIds) => prisma.teams.findMany({
        where: {
          id: { in: teamIds },
          OR: [{ kind: { not: 'PLACEHOLDER' } }, { kind: null }],
        },
        select: {
          id: true,
          playerIds: true,
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
        },
      }))
      : [];
    const organizationEventTeamMemberIds = organizationEventTeams.flatMap(teamMemberIds);

    const organizationTeamIds = organizationTeams.map((team) => team.id);
    const membershipTeamIds = Array.from(new Set([
      ...organizationTeamIds,
      ...organizationEventTeamIds,
    ]));
    const teamStaffAssignments = membershipTeamIds.length
      ? await readByIdChunks(membershipTeamIds, (teamIds) => prisma.teamStaffAssignments.findMany({
        where: {
          teamId: { in: teamIds },
          status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
        },
        select: { userId: true },
      }))
      : [];
    const teamRegistrations = membershipTeamIds.length
      ? await readByIdChunks(membershipTeamIds, (teamIds) => prisma.teamRegistrations.findMany({
        where: {
          teamId: { in: teamIds },
          userId: parsed.subjectUserId,
          status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
        },
        select: { teamId: true, userId: true },
      }))
      : [];
    const customerUserIds = new Set([
      ...scopeEvents.flatMap((event) => [
        ...event.userIds,
        ...(event.organizationId !== organizationId
          ? [
            event.hostId,
            ...(event.assistantHostIds ?? []),
            ...(event.officialIds ?? []),
          ]
          : []),
      ]),
      ...organizationEventTeamMemberIds,
      ...teamRegistrations.map((registration) => registration.userId),
      ...teamStaffAssignments.map((assignment) => assignment.userId),
    ]);
    if (!customerUserIds.has(parsed.subjectUserId)) {
      return NextResponse.json(
        { error: 'Document Subject is not a customer of this Organization.' },
        { status: 400 },
      );
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await validatePdfBuffer(buffer);
  if (!validation.isValid) {
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
    const signedAt = historicalSigningDate?.toISOString() ?? null;
    const now = new Date();
    const evidenceId = crypto.randomUUID();
    const evidenceScope = {
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      eventId: parsed.scopeType === 'EVENT_PARTICIPATION' ? parsed.scopeId : null,
      teamId: null,
    };
    const importedEvidence = await prisma.$transaction(async (tx) => {
      const lockedTemplates = await tx.$queryRaw<LockedImportTemplate[]>(Prisma.sql`
        SELECT
          "id",
          "title",
          "organizationId",
          "documentRequirementId",
          "requiredSignerType",
          "signerRoles",
          "signOnce"
        FROM "TemplateDocuments"
        WHERE "id" = ${parsed.templateId}
        FOR UPDATE
      `);
      const lockedTemplate = lockedTemplates[0];
      if (!lockedTemplate || lockedTemplate.organizationId !== organizationId) {
        throw new Error('Document template changed during import.');
      }
      const lockedRequirement = await tx.documentRequirements.findUnique({
        where: { id: lockedTemplate.documentRequirementId },
        select: { id: true, title: true, organizationId: true },
      });
      if (!lockedRequirement || lockedRequirement.organizationId !== organizationId) {
        throw new Error('Document template changed during import.');
      }
      const documentName = lockedTemplate.title?.trim() || lockedRequirement.title?.trim();
      if (!documentName) {
        throw new Error('Document Template Version title is required.');
      }
      if (lockedTemplate.signOnce !== (parsed.scopeType === 'ORGANIZATION')) {
        throw new Error('Document Template Version scope changed during import.');
      }
      if (parsed.scopeType === 'EVENT_PARTICIPATION') {
        const eventParticipation = await validateEventParticipation(
          {
            organizationId,
            subjectUserId: parsed.subjectUserId,
            eventId: parsed.scopeId,
          },
          tx,
        );
        if (!eventParticipation) {
          throw new Error('Document Subject participation changed during import.');
        }
      }
      const requiredSignerRoles = resolveRequiredSignerRoles(
        lockedTemplate.signerRoles,
        lockedTemplate.requiredSignerType,
      );
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
          templateId: lockedTemplate.id,
          userId: null,
          documentName,
          hostId: null,
          organizationId,
          eventId: evidenceScope.eventId,
          teamId: evidenceScope.teamId,
          ...signedDocumentEvidenceFields({
            organizationId,
            documentSubjectUserId: parsed.subjectUserId,
            ...evidenceScope,
            signOnce: lockedTemplate.signOnce,
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
          templateDocumentId: lockedTemplate.id,
          documentRequirementId: lockedTemplate.documentRequirementId,
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
      return { documentName };

    });
    const notificationInput = {
      organizationId,
      organizationName: organization.name,
      subjectUserId: parsed.subjectUserId,
      evidenceId,
      documentName: importedEvidence.documentName,
      action: 'IMPORT' as const,
      actorUserId: session.userId,
    };
    try {
      await notifyDocumentEvidenceChange(notificationInput);
    } catch (notificationError) {
      console.error('Document import notification failed.', {
        organizationId,
        evidenceId,
        error: notificationError,
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
    let cleanupError: unknown = null;
    if (stored) {
      try {
        await deleteStoredObject(stored);
      } catch (deleteError) {
        cleanupError = deleteError;
        console.error('Imported document cleanup failed.', {
          organizationId,
          key: stored.key,
          error: deleteError,
        });
      }
    }
    if (cleanupError) {
      return NextResponse.json(
        { error: 'Unable to import document evidence. Stored file cleanup failed.' },
        { status: 500 },
      );
    }
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
