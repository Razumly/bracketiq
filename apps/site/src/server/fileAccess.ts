import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { findGuardianAuthority } from '@/server/guardianAuthority';
import { IMPORTED_DOCUMENT_VIEW_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasAnyOrgPermission } from '@/server/accessControl';
import { canManageBillPayment, loadBillForAction } from '@/server/billing/billPaymentActions';
/**
 * Most image files are intentionally public (event, organization, and profile
 * media). Manual payment proofs are the exception: a leaked file ID must not
 * disclose a receipt or payment screenshot. The proof record is the durable
 * discriminator, so access remains correct even when the same generic file
 * endpoint serves both public and private media.
 */
export const assertFileReadAccess = async (req: NextRequest, fileId: string): Promise<void> => {
  const proof = await prisma.billPaymentProofs.findFirst({
    where: { fileId },
    select: { billId: true, uploadedByUserId: true },
  });
  if (proof) {
    const session = await requireSession(req);
    if (proof.uploadedByUserId === session.userId) return;

    const bill = await loadBillForAction(proof.billId);
    if (!bill || !(await canManageBillPayment(session, bill))) {
      throw new Response('Forbidden', { status: 403 });
    }
    return;
  }

  const importedDocument = await prisma.signedDocuments.findFirst({
    where: {
      importedFileId: fileId,
      provenance: 'IMPORTED',
    },
    select: {
      userId: true,
      documentSubjectId: true,
      organizationId: true,
    },
  });
  if (!importedDocument) return;

  const session = await requireSession(req);
  if (session.isAdmin) return;

  const subject = importedDocument.documentSubjectId
    ? await prisma.documentSubjects.findUnique({
      where: { id: importedDocument.documentSubjectId },
      select: { userId: true, organizationId: true },
    })
    : null;
  if (subject && subject.organizationId !== importedDocument.organizationId) {
    throw new Response('Forbidden', { status: 403 });
  }
  const subjectUserId = subject?.userId ?? importedDocument.userId;
  if (subjectUserId === session.userId) return;

  if (subjectUserId) {
    const parentChildLink = await findGuardianAuthority(prisma, session.userId, subjectUserId);
    if (parentChildLink) return;
  }

  const organizationId = subject?.organizationId ?? importedDocument.organizationId;
  const organization = organizationId
    ? await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    })
    : null;
  if (
    organization
    && await hasAnyOrgPermission(session, organization, IMPORTED_DOCUMENT_VIEW_PERMISSIONS)
  ) {
    return;
  }

  throw new Response('Forbidden', { status: 403 });
};
