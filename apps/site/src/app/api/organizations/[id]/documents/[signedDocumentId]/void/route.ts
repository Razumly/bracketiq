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
  DOCUMENT_EVIDENCE_PROVENANCE,
  appendDocumentEvidenceAuditEvent,
  invalidateDocumentRequirementSatisfaction,
  type DocumentEvidenceDatabase,
} from "@/server/documentEvidence";

const voidSchema = z
  .object({
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; signedDocumentId: string }> },
) {
  const session = await requireSession(req);
  const { id: organizationId, signedDocumentId } = await params;
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

  const evidence = await prisma.signedDocuments.findFirst({
    where: { id: signedDocumentId, organizationId },
    select: { id: true, provenance: true, status: true },
  });
  if (!evidence) {
    return NextResponse.json(
      { error: "Signed document evidence not found." },
      { status: 404 },
    );
  }
  if (evidence.provenance !== DOCUMENT_EVIDENCE_PROVENANCE.IMPORTED) {
    return NextResponse.json(
      {
        error: "Only imported document evidence can be voided.",
      },
      { status: 409 },
    );
  }
  if (String(evidence.status ?? "").toUpperCase() === "VOID") {
    return NextResponse.json(
      { evidenceId: evidence.id, status: "VOID" },
      { status: 200 },
    );
  }

  const parsedBody = voidSchema.safeParse(
    (await req.json().catch(() => null)) ?? {},
  );
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }
  const normalizedReason = parsedBody.data.reason || null;
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.signedDocuments.updateMany({
        where: {
          id: evidence.id,
          OR: [{ status: null }, { status: { not: "VOID" } }],
        },
        data: {
          status: "VOID",
          updatedAt: now,
        },
      });
      if (updateResult.count === 0) {
        return;
      }
      await invalidateDocumentRequirementSatisfaction(
        {
          evidenceId: evidence.id,
          invalidatedAt: now,
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
      await appendDocumentEvidenceAuditEvent(
        {
          evidenceId: evidence.id,
          organizationId,
          eventType: "VOID",
          actorUserId: session.userId,
          reason: normalizedReason,
          createdAt: now,
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to void document evidence.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json(
    { evidenceId: evidence.id, status: "VOID" },
    { status: 200 },
  );
}
