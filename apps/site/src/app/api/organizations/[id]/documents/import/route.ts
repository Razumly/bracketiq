import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { ORG_PERMISSIONS } from "@/lib/organizationPermissions";
import {
  canManageOrganization,
  hasOrgPermission,
} from "@/server/accessControl";
import {
  appendDocumentEvidenceAuditEvent,
  createDocumentRequirementSatisfaction,
  DOCUMENT_EVIDENCE_PROVENANCE,
  ensureDocumentSubject,
  signedDocumentEvidenceFields,
  type DocumentEvidenceDatabase,
} from "@/server/documentEvidence";
import { listOrganizationUsersScopeEvents } from "@/server/organizationUsersAccess";

export const dynamic = "force-dynamic";

const importSchema = z
  .object({
    subjectUserId: z.string().trim().min(1),
    signerUserId: z.string().trim().min(1).optional(),
    hostId: z.string().trim().min(1).nullable().optional(),
    templateId: z.string().trim().min(1),
    documentName: z.string().trim().min(1),
    contentHash: z.string().trim().min(1),
    importedFileId: z.string().trim().min(1),
    historicalSigningDate: z.string().trim().min(1).nullable().optional(),
    sourceNote: z.string().trim().max(4000).nullable().optional(),
    attestationText: z.string().trim().max(4000).nullable().optional(),
    attestationVersion: z.string().trim().max(160).nullable().optional(),
    signerEmail: z.string().trim().email().nullable().optional(),
    signerRole: z.string().trim().max(160).nullable().optional(),
    roleIndex: z.number().int().nullable().optional(),
    scopeType: z.enum([
      "ORGANIZATION",
      "EVENT_PARTICIPATION",
      "TEAM_MEMBERSHIP",
    ]),
    scopeId: z.string().trim().min(1),
  })
  .strict();

const parseHistoricalDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const normalizeSignerRole = (value: string): string =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');



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
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }
  const canManageDocuments =
    session.isAdmin ||
    (await canManageOrganization(session, organization)) ||
    (await hasOrgPermission(
      session,
      organization,
      ORG_PERMISSIONS.TEMPLATES_MANAGE,
    ));
  if (!canManageDocuments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const historicalSigningDate = parseHistoricalDate(
    parsed.data.historicalSigningDate,
  );
  if (parsed.data.historicalSigningDate && !historicalSigningDate) {
    return NextResponse.json(
      { error: "historicalSigningDate must be a valid date." },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "Document template not found." },
      { status: 404 },
    );
  }
  const requirement = await prisma.documentRequirements.findUnique({
    where: { id: template.documentRequirementId },
    select: { id: true, organizationId: true },
  });
  if (
    !requirement
    || requirement.id !== template.documentRequirementId
    || requirement.organizationId !== organizationId
  ) {
    return NextResponse.json(
      { error: "Document template not found." },
      { status: 404 },
    );
  }

  const signerUserId = parsed.data.signerUserId ?? null;
  const hostId =
    parsed.data.hostId ?? (signerUserId ? parsed.data.subjectUserId : null);
  if (hostId && hostId !== parsed.data.subjectUserId) {
    return NextResponse.json(
      { error: "hostId must match subjectUserId." },
      { status: 400 },
    );
  }
  const templateSignerRoles = Array.isArray(template.signerRoles)
    ? template.signerRoles
    : [];
  if (
    parsed.data.signerRole
    && templateSignerRoles.length > 0
    && !templateSignerRoles.some(
      (role) => normalizeSignerRole(role) === normalizeSignerRole(parsed.data.signerRole!),
    )
  ) {
    return NextResponse.json(
      { error: "Signer role is not required by this Document Template Version." },
      { status: 400 },
    );
  }
  const userIds = [
    ...new Set(
      [parsed.data.subjectUserId, signerUserId, hostId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
  const [users, scopedEntity, importedFile, scopeEvents, organizationTeams] =
    await Promise.all([
      prisma.userData.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      }),
      parsed.data.scopeType === "EVENT_PARTICIPATION"
        ? prisma.events.findUnique({
            where: { id: parsed.data.scopeId },
            select: { id: true, organizationId: true },
          })
        : parsed.data.scopeType === "TEAM_MEMBERSHIP"
          ? prisma.canonicalTeams.findUnique({
              where: { id: parsed.data.scopeId },
              select: { id: true, organizationId: true },
            })
          : null,
      prisma.file.findUnique({
        where: { id: parsed.data.importedFileId },
        select: { id: true, organizationId: true },
      }),
      listOrganizationUsersScopeEvents(organizationId),
      prisma.canonicalTeams.findMany({
        where: { organizationId },
        select: { id: true },
      }),
    ]);
  if (users.length !== userIds.length) {
    return NextResponse.json(
      { error: "Document Subject or signer User was not found." },
      { status: 400 },
    );
  }
  if (organizationTeams.some((team) => team.id === parsed.data.subjectUserId)) {
    return NextResponse.json(
      { error: "Document Subject must be a User, not a Team." },
      { status: 400 },
    );
  }
  if (signerUserId && organizationTeams.some((team) => team.id === signerUserId)) {
    return NextResponse.json(
      { error: "Signer must be a User, not a Team." },
      { status: 400 },
    );
  }
  const organizationTeamIds = organizationTeams.map((team) => team.id);
  const scopeEvent = parsed.data.scopeType === "EVENT_PARTICIPATION"
    ? scopeEvents.find((event) => event.id === parsed.data.scopeId)
    : undefined;
  const eventTeamIds = scopeEvent?.teamIds ?? [];
  const membershipTeamIds = Array.from(new Set([
    ...organizationTeamIds,
    ...eventTeamIds,
    ...(parsed.data.scopeType === "TEAM_MEMBERSHIP" ? [parsed.data.scopeId] : []),
  ]));
  const teamRegistrations = membershipTeamIds.length > 0
    ? await prisma.teamRegistrations.findMany({
        where: {
          teamId: { in: membershipTeamIds },
          userId: { in: userIds },
          status: { in: ["STARTED", "PENDING", "ACTIVE"] },
        },
        select: { teamId: true, userId: true },
      })
    : [];
  const customerUserIds = new Set([
    ...scopeEvents.flatMap((event) => event.userIds),
    ...teamRegistrations.map((registration) => registration.userId),
  ]);
  if (!customerUserIds.has(parsed.data.subjectUserId)) {
    return NextResponse.json(
      { error: "Document Subject is not a customer of this Organization." },
      { status: 400 },
    );
  }
  if (
    signerUserId
    && signerUserId !== parsed.data.subjectUserId
    && !customerUserIds.has(signerUserId)
  ) {
    return NextResponse.json(
      { error: "Signer is not a customer of this Organization." },
      { status: 400 },
    );
  }
  if (
    parsed.data.scopeType === "ORGANIZATION"
    && parsed.data.scopeId !== organizationId
  ) {
    return NextResponse.json(
      { error: "Organization scope does not belong to this Organization." },
      { status: 400 },
    );
  }
  if (
    parsed.data.scopeType !== "ORGANIZATION"
    && (!scopedEntity || scopedEntity.organizationId !== organizationId)
  ) {
    return NextResponse.json(
      { error: "Document scope does not belong to this Organization." },
      { status: 400 },
    );
  }
  if (parsed.data.scopeType === "EVENT_PARTICIPATION") {
    const isDirectEventCustomer = Boolean(
      scopeEvent?.userIds.includes(parsed.data.subjectUserId),
    );
    const hasTeamEventMembership = teamRegistrations.some(
      (registration) =>
        registration.userId === parsed.data.subjectUserId
        && eventTeamIds.includes(registration.teamId),
    );
    if (!isDirectEventCustomer && !hasTeamEventMembership) {
      return NextResponse.json(
        { error: "Document Subject is not a participant in this Event." },
        { status: 400 },
      );
    }
  }
  if (parsed.data.scopeType === "TEAM_MEMBERSHIP") {
    const hasTeamMembership = teamRegistrations.some(
      (registration) =>
        registration.teamId === parsed.data.scopeId
        && registration.userId === parsed.data.subjectUserId,
    );
    if (!hasTeamMembership) {
      return NextResponse.json(
        { error: "Document Subject is not a member of this Team." },
        { status: 400 },
      );
    }
  }
  if (!importedFile || importedFile.organizationId !== organizationId) {
    return NextResponse.json(
      { error: "Imported File does not belong to this Organization." },
      { status: 400 },
    );
  }
  const evidenceScope = {
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId,
    eventId: parsed.data.scopeType === "EVENT_PARTICIPATION"
      ? parsed.data.scopeId
      : null,
    teamId: parsed.data.scopeType === "TEAM_MEMBERSHIP"
      ? parsed.data.scopeId
      : null,
  };
  const now = new Date();
  const evidenceId = crypto.randomUUID();
  const signedAt = historicalSigningDate?.toISOString() ?? now.toISOString();

  try {
    await prisma.$transaction(async (tx) => {
      const documentSubjectId = await ensureDocumentSubject(
        {
          organizationId,
          userId: signerUserId,
          hostId,
          documentSubjectUserId: parsed.data.subjectUserId,
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
          userId: signerUserId,
          documentName: parsed.data.documentName,
          hostId,
          organizationId,
          eventId: evidenceScope.eventId,
          teamId: evidenceScope.teamId,
          ...signedDocumentEvidenceFields({
            organizationId,
            userId: signerUserId,
            hostId,
            documentSubjectUserId: parsed.data.subjectUserId,
            ...evidenceScope,
            signOnce: false,
            provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
          }),
          scopeType: evidenceScope.scopeType,
          scopeId: evidenceScope.scopeId,
          importedFileId: parsed.data.importedFileId ?? null,
          contentHash: parsed.data.contentHash,
          historicalSigningDate,
          sourceNote: parsed.data.sourceNote ?? null,
          importedAt: now,
          uploaderId: session.userId,
          attestationText: parsed.data.attestationText ?? null,
          attestationVersion: parsed.data.attestationVersion ?? null,
          status: "SIGNED",
          signedAt,
          signerEmail: parsed.data.signerEmail ?? null,
          signerRole: parsed.data.signerRole ?? null,
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
          requiredSignerRoles: templateSignerRoles,
          signerRole: parsed.data.signerRole,
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
      await appendDocumentEvidenceAuditEvent(
        {
          evidenceId: evidence.id,
          organizationId,
          eventType: "IMPORT",
          actorUserId: session.userId,
          note: parsed.data.sourceNote ?? null,
          payload: {
            importedFileId: parsed.data.importedFileId ?? null,
            contentHash: parsed.data.contentHash,
            historicalSigningDate: historicalSigningDate?.toISOString() ?? null,
          },
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Matching imported evidence already exists." },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Unable to import document evidence.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json(
    {
      evidenceId,
      documentId: `imported-${evidenceId}`,
      provenance: DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED,
    },
    { status: 201 },
  );
}
