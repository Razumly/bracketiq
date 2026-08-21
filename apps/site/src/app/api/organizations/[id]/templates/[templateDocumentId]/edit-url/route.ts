import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  cloneEmbeddedTemplate,
  deleteTemplate,
  isBoldSignConfigured,
  isBoldSignForbiddenError,
  isBoldSignInvalidTemplateIdError,
  isBoldSignNotFoundError,
} from '@/lib/boldsignServer';
import {
  BOLDSIGN_OPERATION_STATUSES,
  BOLDSIGN_OPERATION_TYPES,
  createOrUpdateBoldSignOperation,
} from '@/lib/boldsignSyncOperations';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
  DocumentTemplateVersionNotFoundError,
  lockDocumentTemplateVersionForUpdate,
} from '@/server/documents/documentTemplateVersions';

export const dynamic = 'force-dynamic';
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateDocumentId: string }> },
) {
  const session = await requireSession(req);
  const { id, templateDocumentId } = await params;

  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.TEMPLATES_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: templateDocumentId },
    include: {
      documentRequirement: {
        select: { title: true, description: true },
      },
    },
  });
  if (!template || template.organizationId !== id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (template.type === 'TEXT') {
    return NextResponse.json({ error: 'Only PDF templates support BoldSign editing.' }, { status: 400 });
  }
  if (!template.templateId) {
    return NextResponse.json({ error: 'Template is missing BoldSign template id.' }, { status: 400 });
  }
  if (!isBoldSignConfigured()) {
    return NextResponse.json({
      error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.',
    }, { status: 503 });
  }

  let clonedTemplateId: string | undefined;
  try {
    const editState = await prisma.$transaction(async (tx) => {
      const locked = await lockDocumentTemplateVersionForUpdate(tx, template.id);
      const latestVersion = await tx.templateDocuments.findFirst({
        where: { documentRequirementId: template.documentRequirementId },
        orderBy: { versionSequence: 'desc' },
        select: { versionSequence: true },
      });
      const nextVersionSequence = Math.max(
        (latestVersion?.versionSequence ?? template.versionSequence) + 1,
        template.versionSequence + 1,
      );
      return { frozen: locked.frozen, nextVersionSequence };
    });

    const cloned = await cloneEmbeddedTemplate({ templateId: template.templateId });
    clonedTemplateId = cloned.templateId;
    const newVersionId = randomUUID();
    const roleIndexes = Array.isArray(template.roleIndexes) ? template.roleIndexes : [];
    const signerRoles = Array.isArray(template.signerRoles) ? template.signerRoles : [];
    const roles = roleIndexes.length > 0
      ? roleIndexes.map((roleIndex, index) => ({
        roleIndex,
        signerRole: signerRoles[index] ?? 'Participant',
      }))
      : [{
        roleIndex: template.roleIndex ?? 1,
        signerRole: signerRoles[0] ?? 'Participant',
      }];
    const operation = await createOrUpdateBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.TEMPLATE_CREATE,
      status: BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
      idempotencyKey: `template-edit:${template.id}:${cloned.templateId}`,
      organizationId: id,
      templateDocumentId: newVersionId,
      templateId: cloned.templateId,
      userId: session.userId,
      payload: {
        templateDocumentId: newVersionId,
        documentRequirementId: template.documentRequirementId,
        organizationId: id,
        title: template.documentRequirement?.title ?? template.title,
        description: template.documentRequirement?.description ?? template.description,
        signOnce: template.signOnce,
        requiredSignerType: template.requiredSignerType,
        createdBy: template.createdBy,
        roles,
        type: 'PDF',
        sourceTemplateDocumentId: template.id,
        sourceTemplateId: template.templateId,
        deferProjectionUntilEdit: true,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return NextResponse.json({
      editUrl: cloned.editUrl,
      selectedVersion: template.versionSequence,
      frozen: editState.frozen,
      willCreateNewVersion: true,
      nextVersionSequence: editState.nextVersionSequence,
      operationId: operation.id,
      templateId: cloned.templateId,
      newVersionId,
    }, { status: 200 });
  } catch (error) {
    if (clonedTemplateId) {
      try {
        await deleteTemplate({ templateId: clonedTemplateId });
      } catch {
        // Keep the original clone or operation error for the caller.
      }
    }
    if (error instanceof DocumentTemplateVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Failed to open template editor.';
    const isOutOfSyncTemplate = isBoldSignNotFoundError(error)
      || isBoldSignForbiddenError(error)
      || isBoldSignInvalidTemplateIdError(error);
    if (isOutOfSyncTemplate) {
      return NextResponse.json(
        {
          error: 'Template is out of sync with BoldSign. Delete and recreate this template.',
          detail: message,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
