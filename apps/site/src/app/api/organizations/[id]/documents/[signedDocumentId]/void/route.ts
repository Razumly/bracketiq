import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyRecentAuthToken } from "@/lib/authServer";
import { requireSession } from "@/lib/permissions";
import { ORG_PERMISSIONS } from "@/lib/organizationPermissions";
import { hasOrgPermission } from "@/server/accessControl";
import {
  DOCUMENT_EVIDENCE_PROVENANCE,
  appendDocumentEvidenceAuditEvent,
  invalidateDocumentRequirementSatisfactions,
  type DocumentEvidenceDatabase,
} from "@/server/documentEvidence";
import {
  notifyDocumentEvidenceChange,
  recordDocumentEvidenceInAppNotification,
  type DocumentNotificationDatabase,
} from "@/server/documentNotifications";

const DOCUMENT_VOID_REASONS = [
  "Wrong Document Subject",
  "Wrong Document Requirement or Version",
  "Wrong scope",
  "Duplicate evidence",
  "Incomplete or unsigned document",
  "Unreadable or incorrect file",
  "Replaced by corrected evidence",
  "Other",
] as const;

const voidSchema = z
  .object({
    reason: z.enum(DOCUMENT_VOID_REASONS),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reason === "Other" && !value.note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A note is required when the void reason is Other.",
      });
    }
  });

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
  if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.DOCUMENTS_VOID))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const recentAuth = verifyRecentAuthToken(req.headers.get("x-recent-auth-token") ?? "");
  const ageSeconds = recentAuth
    ? Math.floor(Date.now() / 1000) - recentAuth.issuedAtSeconds
    : Number.POSITIVE_INFINITY;
  if (
    !recentAuth
    || recentAuth.userId !== session.userId
    || ageSeconds < -60
    || ageSeconds > 10 * 60
  ) {
    return NextResponse.json(
      {
        error: "Recent identity verification is required before voiding document evidence.",
        code: "RECENT_AUTH_REQUIRED",
      },
      { status: 401 },
    );
  }

  const evidence = await prisma.signedDocuments.findFirst({
    where: { id: signedDocumentId, organizationId },
    select: { id: true, provenance: true, status: true, documentName: true, documentSubjectId: true },
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
  const normalizedReason = parsedBody.data.reason;
  const normalizedNote = parsedBody.data.note || null;
  const now = new Date();
  let isVoided = false;
  const subject = evidence.documentSubjectId
    ? await prisma.documentSubjects.findUnique({
      where: { id: evidence.documentSubjectId },
      select: { userId: true },
    })
    : null;
  const notificationInput = subject?.userId
    ? {
      organizationId,
      subjectUserId: subject.userId,
      evidenceId: evidence.id,
      documentName: evidence.documentName,
      action: "VOID" as const,
      actorUserId: session.userId,
    }
    : null;

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
      isVoided = true;
      await invalidateDocumentRequirementSatisfactions(
        {
          evidenceIds: [evidence.id],
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
          note: normalizedNote,
          createdAt: now,
        },
        tx as unknown as DocumentEvidenceDatabase,
      );
      if (notificationInput) {
        await recordDocumentEvidenceInAppNotification(
          notificationInput,
          tx as unknown as DocumentNotificationDatabase,
        );
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to void document evidence.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (isVoided && notificationInput) {
    try {
      await notifyDocumentEvidenceChange(
        notificationInput,
        { isInAppIncluded: false },
      );
    } catch (error) {
      console.error("Document void notification failed.", {
        organizationId,
        evidenceId: evidence.id,
        error,
      });
    }
  }


  return NextResponse.json(
    { evidenceId: evidence.id, status: "VOID" },
    { status: 200 },
  );
}
