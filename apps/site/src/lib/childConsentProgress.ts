import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';
import {
  documentSatisfactionScopeFor,
  documentSubjectIdFor,
  findDocumentSatisfactionSignerStates,
  hasCompletedDocumentSignerRole,
} from '@/server/documentEvidence';
import { acquireEventLockAndLoadStructure } from '@/server/events/eventRegistrations';
import { sendEventRegistrationHostNotification } from '@/server/registrationHostNotifications';

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
type ChildConsentClient = PrismaClient | Prisma.TransactionClient;
const updateRegistrationWithEventLock = async (
  client: ChildConsentClient,
  eventId: string,
  registrationId: string,
  data: Record<string, unknown>,
  useTransaction: boolean,
) => {
  if (useTransaction && typeof prisma.$transaction === 'function') {
    return prisma.$transaction(async (tx) => {
      await acquireEventLockAndLoadStructure(tx, eventId);
      return tx.eventRegistrations.update({
        where: { id: registrationId },
        data,
      });
    });
  }
  await acquireEventLockAndLoadStructure(client, eventId);
  return client.eventRegistrations.update({
    where: { id: registrationId },
    data,
  });
};

export const syncChildRegistrationConsentStatus = async (params: {
  eventId?: string | null;
  childUserId?: string | null;
  parentUserId?: string | null;
  client?: ChildConsentClient;
}) => {
  const eventId = normalizeText(params.eventId);
  const childUserId = normalizeText(params.childUserId);
  const client = params.client ?? prisma;
  if (!eventId || !childUserId) {
    return;
  }

  const registration = await client.eventRegistrations.findFirst({
    where: {
      eventId,
      registrantId: childUserId,
      registrantType: 'CHILD',
      status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
      ...(normalizeText(params.parentUserId) ? { parentId: normalizeText(params.parentUserId) } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      parentId: true,
      status: true,
    },
  });
  if (!registration?.parentId) {
    return;
  }

  const event = await client.events.findUnique({
    where: { id: eventId },
    select: {
      organizationId: true,
      requiredTemplateIds: true,
    },
  });
  if (!event) {
    return;
  }

  const requiredTemplateIds = Array.isArray(event.requiredTemplateIds)
    ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (!requiredTemplateIds.length) {
    await updateRegistrationWithEventLock(
      client,
      eventId,
      registration.id,
      {
        status: 'ACTIVE',
        consentStatus: 'completed',
        updatedAt: new Date(),
      },
      !params.client,
    );
    if (registration.status !== 'ACTIVE') {
      await sendEventRegistrationHostNotification({
        eventId,
        registrationId: registration.id,
      });
    }
    return;
  }

  const templates = await client.templateDocuments.findMany({
    where: { id: { in: requiredTemplateIds } },
    select: {
      id: true,
      requiredSignerType: true,
      signOnce: true,
    },
  });
  const requiredTemplateSet = new Set(requiredTemplateIds);
  const parentTemplateIds = new Set<string>();
  const childTemplateIds = new Set<string>();
  const signOnceTemplateIds = new Set<string>();
  const eventScopedTemplateIds = new Set<string>();

  templates.forEach((template) => {
    if (!requiredTemplateSet.has(template.id)) {
      return;
    }
    const signerType = normalizeRequiredSignerType(template.requiredSignerType);
    if (signerType === 'PARENT_GUARDIAN' || signerType === 'PARENT_GUARDIAN_CHILD') {
      parentTemplateIds.add(template.id);
    }
    if (signerType === 'CHILD' || signerType === 'PARENT_GUARDIAN_CHILD') {
      childTemplateIds.add(template.id);
    }
    if (template.signOnce) {
      signOnceTemplateIds.add(template.id);
    } else {
      eventScopedTemplateIds.add(template.id);
    }
  });

  const relevantTemplateIds = Array.from(new Set([
    ...parentTemplateIds,
    ...childTemplateIds,
  ]));
  if (!relevantTemplateIds.length) {
    await updateRegistrationWithEventLock(
      client,
      eventId,
      registration.id,
      {
        status: 'ACTIVE',
        consentStatus: 'completed',
        updatedAt: new Date(),
      },
      !params.client,
    );
    if (registration.status !== 'ACTIVE') {
      await sendEventRegistrationHostNotification({
        eventId,
        registrationId: registration.id,
      });
    }
    return;
  }

  const documentSubjectId = documentSubjectIdFor(event.organizationId, childUserId);
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const satisfactionScopes = relevantTemplateIds.flatMap((templateId) => {
    const template = templatesById.get(templateId);
    if (!template) {
      return [];
    }
    const scope = documentSatisfactionScopeFor({
      templateDocumentId: template.id,
      organizationId: event.organizationId,
      documentSubjectUserId: childUserId,
      eventId,
      teamId: null,
      signOnce: template.signOnce,
    });
    return scope ? [scope] : [];
  });
  const satisfactionStates = await findDocumentSatisfactionSignerStates({
    documentSubjectId,
    scopes: satisfactionScopes,
  });
  const parentSignedTemplates = new Set(
    satisfactionStates
      .filter((state) => hasCompletedDocumentSignerRole(state.completedSignerRoles, 'parent_guardian'))
      .map((state) => state.templateDocumentId),
  );
  const childSignedTemplates = new Set(
    satisfactionStates
      .filter((state) => hasCompletedDocumentSignerRole(state.completedSignerRoles, 'child'))
      .map((state) => state.templateDocumentId),
  );

  const parentComplete = Array.from(parentTemplateIds).every((templateId) => parentSignedTemplates.has(templateId));
  const childComplete = Array.from(childTemplateIds).every((templateId) => childSignedTemplates.has(templateId));

  const requiresChildSignature = childTemplateIds.size > 0;
  const requiresParentSignature = parentTemplateIds.size > 0;

  let childEmail: string | undefined;
  if (requiresChildSignature) {
    const childSensitive = await client.sensitiveUserData.findFirst({
      where: { userId: childUserId },
      select: { email: true },
    });
    childEmail = normalizeText(childSensitive?.email);
  }

  const consentComplete = parentComplete && childComplete;
  let consentStatus = 'sent';
  if (requiresChildSignature && !childEmail) {
    consentStatus = 'child_email_required';
  } else if (consentComplete) {
    consentStatus = 'completed';
  } else if (requiresChildSignature && !childComplete) {
    if (requiresParentSignature && parentComplete) {
      consentStatus = 'parentSigned';
    } else if (requiresParentSignature && !parentComplete) {
      consentStatus = 'guardian_approval_required';
    } else {
      consentStatus = 'sent';
    }
  } else if (requiresParentSignature && !parentComplete) {
    if (requiresChildSignature && childComplete) {
      consentStatus = 'childSigned';
    } else {
      consentStatus = 'guardian_approval_required';
    }
  }

  await updateRegistrationWithEventLock(
    client,
    eventId,
    registration.id,
    {
      status: consentComplete ? 'ACTIVE' : 'STARTED',
      consentStatus,
      updatedAt: new Date(),
    },
    !params.client,
  );
  if (consentComplete && registration.status !== 'ACTIVE') {
    await sendEventRegistrationHostNotification({
      eventId,
      registrationId: registration.id,
    });
  }
};
