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

const loadRecipients = async (
  subjectUserId: string,
  database: DocumentNotificationDatabase,
): Promise<NotificationRecipient[]> => {
  const parentRows = await database.parentChildLinks.findMany({
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
    ? await database.sensitiveUserData.findMany({
      where: { userId: { in: recipientIds } },
      select: { userId: true, email: true },
    })
    : [];
  const emailByUserId = new Map(emailRows.map((row) => [row.userId, row.email]));
  return recipientIds.map((id) => ({ id, email: emailByUserId.get(id) ?? null }));
};

type InAppNotificationRow = {
  id: string;
  createdAt: Date;
  userId: string;
  notificationType: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export type DocumentNotificationDatabase = {
  parentChildLinks: {
    findMany: (args: {
      where: { childId: string; status: 'ACTIVE' };
      select: { parentId: true };
    }) => Promise<Array<{ parentId: string }>>;
  };
  sensitiveUserData: {
    findMany: (args: {
      where: { userId: { in: string[] } };
      select: { userId: true; email: true };
    }) => Promise<Array<{ userId: string; email: string | null }>>;
  };
  userNotifications: {
    createMany: (args: { data: InAppNotificationRow[] }) => Promise<unknown>;
  };
};

const defaultDocumentNotificationDatabase = prisma as unknown as DocumentNotificationDatabase;

const recordInAppNotifications = async (
  recipients: NotificationRecipient[],
  input: DocumentEvidenceNotificationInput,
  copy: { title: string; body: string },
  database: DocumentNotificationDatabase,
): Promise<void> => {
  if (!recipients.length) return;
  await database.userNotifications.createMany({
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

export const recordDocumentEvidenceInAppNotification = async (
  input: DocumentEvidenceNotificationInput,
  database: DocumentNotificationDatabase = defaultDocumentNotificationDatabase,
): Promise<void> => {
  const recipients = await loadRecipients(input.subjectUserId, database);
  await recordInAppNotifications(recipients, input, getNotificationCopy(input), database);
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

export type DocumentNotificationDeliveryOptions = {
  includeInApp?: boolean;
};

export const notifyDocumentEvidenceChange = async (
  input: DocumentEvidenceNotificationInput,
  options: DocumentNotificationDeliveryOptions = {},
): Promise<void> => {
  const copy = getNotificationCopy(input);
  let recipients: NotificationRecipient[];
  try {
    recipients = await loadRecipients(input.subjectUserId, defaultDocumentNotificationDatabase);
  } catch (error) {
    console.error('Document notification recipient lookup failed.', {
      action: input.action,
      evidenceId: input.evidenceId,
      error,
    });
    return;
  }

  const deliveries: Array<[string, Promise<void>]> = [];
  if (options.includeInApp !== false) {
    deliveries.push(['in-app', recordInAppNotifications(
      recipients,
      input,
      copy,
      defaultDocumentNotificationDatabase,
    )]);
  }
  deliveries.push(['push', sendDocumentPush(recipients, input, copy)]);
  deliveries.push(['email', sendDocumentEmails(recipients, input, copy)]);
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
