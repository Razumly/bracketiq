import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';
import {
  filterUserIdsForNotificationChannel,
} from '@/server/notificationPreferences';
import { sendPushToUsers } from '@/server/pushNotifications';

type DocumentNotificationAction = 'IMPORT' | 'VOID';

export type DocumentEvidenceNotificationInput = {
  organizationId: string;
  subjectUserId: string;
  evidenceId: string;
  documentName: string;
  action: DocumentNotificationAction;
  actorUserId?: string | null;
};

type NotificationRecipient = {
  id: string;
  email?: string | null;
};

const normalizeRecipientIds = (subjectUserId: string, parentIds: string[]): string[] => (
  Array.from(new Set([subjectUserId, ...parentIds].map((value) => value.trim()).filter(Boolean)))
);

const getNotificationCopy = (input: DocumentEvidenceNotificationInput): {
  title: string;
  body: string;
} => {
  if (input.action === 'VOID') {
    return {
      title: 'Document evidence voided',
      body: `The document evidence for ${input.documentName} was voided by the organization.`,
    };
  }
  return {
    title: 'Signed document added',
    body: `The organization added signed document evidence for ${input.documentName}.`,
  };
};

const loadRecipients = async (subjectUserId: string): Promise<NotificationRecipient[]> => {
  const parentRows = await prisma.parentChildLinks.findMany({
    where: {
      childId: subjectUserId,
      status: 'ACTIVE',
    },
    select: { parentId: true },
  });
  const recipientIds = normalizeRecipientIds(
    subjectUserId,
    parentRows.map((row) => row.parentId),
  );
  if (!recipientIds.length) return [];

  const emailRows = isEmailEnabled()
    ? await prisma.sensitiveUserData.findMany({
      where: { userId: { in: recipientIds } },
      select: { userId: true, email: true },
    })
    : [];
  const emailByUserId = new Map(emailRows.map((row) => [row.userId, row.email]));
  return recipientIds.map((id) => ({ id, email: emailByUserId.get(id) ?? null }));
};

const recordInAppNotifications = async (
  recipients: NotificationRecipient[],
  input: DocumentEvidenceNotificationInput,
  copy: { title: string; body: string },
): Promise<void> => {
  if (!recipients.length) return;
  await prisma.userNotifications.createMany({
    data: recipients.map((recipient) => ({
      id: crypto.randomUUID(),
      createdAt: new Date(),
      userId: recipient.id,
      notificationType: 'documents',
      title: copy.title,
      body: copy.body,
      data: {
        action: input.action,
        evidenceId: input.evidenceId,
        organizationId: input.organizationId,
      },
    })),
  });
};

const sendDocumentPush = async (
  recipients: NotificationRecipient[],
  input: DocumentEvidenceNotificationInput,
  copy: { title: string; body: string },
): Promise<void> => {
  if (!recipients.length) return;
  await sendPushToUsers({
    userIds: recipients.map((recipient) => recipient.id),
    title: copy.title,
    body: copy.body,
    notificationType: 'documents',
    data: {
      action: input.action,
      evidenceId: input.evidenceId,
      organizationId: input.organizationId,
    },
  });
};

const sendDocumentEmails = async (
  recipients: NotificationRecipient[],
  input: DocumentEvidenceNotificationInput,
  copy: { title: string; body: string },
): Promise<void> => {
  if (!recipients.length || !isEmailEnabled()) return;
  const eligibleUserIds = await filterUserIdsForNotificationChannel(
    recipients.map((recipient) => recipient.id),
    'documents',
    'email',
  );
  const eligibleIds = new Set(eligibleUserIds);
  await Promise.all(
    recipients
      .filter((recipient) => eligibleIds.has(recipient.id) && recipient.email)
      .map((recipient) => sendEmail({
        to: recipient.email as string,
        subject: copy.title,
        text: `${copy.body}\n\nDocument evidence ID: ${input.evidenceId}`,
      })),
  );
};

export const notifyDocumentEvidenceChange = async (
  input: DocumentEvidenceNotificationInput,
): Promise<void> => {
  const copy = getNotificationCopy(input);
  let recipients: NotificationRecipient[];
  try {
    recipients = await loadRecipients(input.subjectUserId);
  } catch (error) {
    console.error('Document notification recipient lookup failed.', {
      action: input.action,
      evidenceId: input.evidenceId,
      error,
    });
    return;
  }

  const deliveries = [
    ['in-app', recordInAppNotifications(recipients, input, copy)],
    ['push', sendDocumentPush(recipients, input, copy)],
    ['email', sendDocumentEmails(recipients, input, copy)],
  ] as const;
  const results = await Promise.allSettled(deliveries.map(([, delivery]) => delivery));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('Document notification delivery failed.', {
        channel: deliveries[index][0],
        action: input.action,
        evidenceId: input.evidenceId,
        error: result.reason,
      });
    }
  });
};
