import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
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
import {
  DocumentTemplateVersionFrozenError,
  DocumentTemplateVersionNotFoundError,
  editDocumentTemplateVersion,
  lockDocumentTemplateVersionForUpdate,
} from '@/server/documents/documentTemplateVersions';
import { acquireEventLock, acquireEventTemplateLocks, acquireTimeSlotLocks } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';
const templateEditSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  content: z.string().optional(),
  type: z.enum(['PDF', 'TEXT']).optional(),
  signOnce: z.boolean().optional(),
  requiredSignerType: z.string().optional(),
  roleIndex: z.number().int().nullable().optional(),
  roleIndexes: z.array(z.number().int()).optional(),
  signerRoles: z.array(z.string()).optional(),
  templateId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export async function PATCH(
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
  });
  if (!template || template.organizationId !== id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const parsed = templateEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid template edit.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  if (input.content !== undefined && template.type !== 'TEXT') {
    return NextResponse.json({ error: 'Only TEXT templates accept local content edits.' }, { status: 400 });
  }
  if (input.content !== undefined && !input.content.trim()) {
    return NextResponse.json({ error: 'Template text is required for TEXT templates.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction((tx) => editDocumentTemplateVersion(tx, {
      versionId: templateDocumentId,
      organizationId: id,
      material: {
        ...(input.content !== undefined ? { content: input.content.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.signOnce !== undefined ? { signOnce: input.signOnce } : {}),
        ...(input.requiredSignerType !== undefined ? { requiredSignerType: input.requiredSignerType } : {}),
        ...(input.roleIndex !== undefined ? { roleIndex: input.roleIndex } : {}),
        ...(input.roleIndexes !== undefined ? { roleIndexes: input.roleIndexes } : {}),
        ...(input.signerRoles !== undefined ? { signerRoles: input.signerRoles } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      display: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      },
    }));
    return NextResponse.json({
      template: result.template,
      requirement: result.requirement,
      previousVersionId: result.previousVersionId,
      newVersionCreated: result.isNewVersionCreated,
      newVersionSequence: result.template.versionSequence,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentTemplateVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DocumentTemplateVersionFrozenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Failed to edit template.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
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
  });
  if (!template || template.organizationId !== id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (template.type !== 'TEXT') {
    const frozenState = await prisma.$transaction((tx) => (
      lockDocumentTemplateVersionForUpdate(tx, templateDocumentId)
    ));
    if (frozenState.isFrozen) {
      return NextResponse.json({
        error: 'Frozen Document Template Versions cannot be deleted. Create a new Version instead.',
        frozen: true,
        versionSequence: template.versionSequence,
      }, { status: 409 });
    }
    if (!template.templateId) {
      return NextResponse.json({ error: 'Template is missing BoldSign template id.' }, { status: 400 });
    }
    if (!isBoldSignConfigured()) {
      return NextResponse.json({
        error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.',
      }, { status: 503 });
    }

    let deleteSkippedReason: string | null = null;
    try {
      await deleteTemplate({ templateId: template.templateId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template in BoldSign.';
      const canDeleteLocallyViaReconcile = isBoldSignNotFoundError(error)
        || isBoldSignForbiddenError(error)
        || isBoldSignInvalidTemplateIdError(error);
      if (!canDeleteLocallyViaReconcile) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      deleteSkippedReason = message;
    }

    const operation = await createOrUpdateBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.TEMPLATE_DELETE,
      status: BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
      idempotencyKey: `template-delete:${templateDocumentId}`,
      organizationId: id,
      templateDocumentId: template.id,
      templateId: template.templateId,
      userId: session.userId,
      payload: {
        templateDocumentId: template.id,
        templateId: template.templateId,
        title: template.title,
        requiredSignerType: template.requiredSignerType,
        remoteDeleteSkipped: Boolean(deleteSkippedReason),
        remoteDeleteSkippedReason: deleteSkippedReason,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return NextResponse.json(
      {
        deleted: false,
        operationId: operation.id,
        syncStatus: BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
      },
      { status: 202 },
    );
  }

  const deletion = await prisma.$transaction(async (tx) => {
    const locked = await lockDocumentTemplateVersionForUpdate(tx, templateDocumentId);
    if (locked.isFrozen) {
      return { isFrozen: true, versionSequence: locked.version.versionSequence };
    }

    const [eventsToUpdate, teamsToUpdate, timeSlotsToUpdate] = await Promise.all([
      tx.events.findMany({
        where: { requiredTemplateIds: { has: templateDocumentId } },
        select: { id: true, requiredTemplateIds: true },
      }),
      tx.canonicalTeams.findMany({
        where: { requiredTemplateIds: { has: templateDocumentId } },
        select: { id: true, requiredTemplateIds: true },
      }),
      tx.timeSlots.findMany({
        where: {
          OR: [
            { requiredTemplateIds: { has: templateDocumentId } },
            { hostRequiredTemplateIds: { has: templateDocumentId } },
          ],
        },
        select: { id: true, requiredTemplateIds: true, hostRequiredTemplateIds: true },
      }),
    ]);
    for (const event of eventsToUpdate.sort((left, right) => left.id.localeCompare(right.id))) {
      await acquireEventLock(tx, event.id);
    }
    await acquireEventTemplateLocks(tx, [templateDocumentId]);
    await acquireTimeSlotLocks(
      tx,
      timeSlotsToUpdate.map((timeSlot) => timeSlot.id),
    );

    const now = new Date();
    await Promise.all([
      ...eventsToUpdate.map((event) => tx.events.update({
        where: { id: event.id },
        data: {
          requiredTemplateIds: event.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
          updatedAt: now,
        },
      })),
      ...teamsToUpdate.map((team) => tx.canonicalTeams.update({
        where: { id: team.id },
        data: {
          requiredTemplateIds: team.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
          updatedAt: now,
        },
      })),
      ...timeSlotsToUpdate.map((timeSlot) => tx.timeSlots.update({
        where: { id: timeSlot.id },
        data: {
          requiredTemplateIds: timeSlot.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
          hostRequiredTemplateIds: timeSlot.hostRequiredTemplateIds.filter((entry) => entry !== templateDocumentId),
          updatedAt: now,
        },
      })),
    ]);
    await tx.templateDocuments.delete({
      where: { id: templateDocumentId },
    });
    return { isFrozen: false, versionSequence: locked.version.versionSequence };
  });

  if (deletion.isFrozen) {
    return NextResponse.json({
      error: 'Frozen Document Template Versions cannot be deleted. Create a new Version instead.',
      frozen: true,
      versionSequence: deletion.versionSequence,
    }, { status: 409 });
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
