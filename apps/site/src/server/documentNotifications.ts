import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { SITE_URL } from '@/lib/siteUrl';
import { isEmailEnabled, sendEmail } from '@/server/email';
import {
  filterUserIdsForNotificationChannel,
} from '@/server/notificationPreferences';
import { sendPushToUsers } from '@/server/pushNotifications';

type DocumentNotificationAction = 'IMPORT' | 'VOID';

export type DocumentEvidenceNotificationInput = {
  organizationId: string;
  organizationName: string;
  subjectUserId: string;
  evidenceId: string;
  documentName: string;
  action: DocumentNotificationAction;
  actorUserId?: string | null;
};

type NotificationRecipient = {
  id: string;
};

const normalizeRecipientIds = (subjectUserId: string, parentIds: string[]): string[] => (
  Array.from(new Set([subjectUserId, ...parentIds].map((value) => value.trim()).filter(Boolean)))
);

const getNotificationCopy = (input: DocumentEvidenceNotificationInput): {
  title: string;
  body: string;
} => {
  const organizationName = typeof input.organizationName === 'string'
    ? input.organizationName.trim()
    : '';
  const documentName = typeof input.documentName === 'string'
    ? input.documentName.trim()
    : '';
  if (!organizationName || !documentName) {
    throw new Error('Document notifications require an organization and document name.');
  }
  if (input.action === 'VOID') {
    return {
      title: 'Document evidence voided',
      body: `${organizationName} voided imported signed-document evidence for "${documentName}". Status: Voided.`,
    };
  }
  return {
    title: 'Document imported',
    body: `${organizationName} added "${documentName}" as imported signed-document evidence. Status: Imported.`,
  };
};

const getDocumentViewUrl = (evidenceId: string): string => (
  `/api/documents/signed/${encodeURIComponent(evidenceId)}/file`
);

const getDocumentDeepLink = (evidenceId: string): string => (
  `mvp://profile/documents/${encodeURIComponent(evidenceId)}`
);

const getNotificationData = (
  input: DocumentEvidenceNotificationInput,
): Record<string, string> => ({
  action: input.action,
  evidenceId: input.evidenceId,
  organizationId: input.organizationId,
  viewUrl: getDocumentViewUrl(input.evidenceId),
  deepLink: getDocumentDeepLink(input.evidenceId),
});

const getNotificationId = (
  recipientId: string,
  input: DocumentEvidenceNotificationInput,
): string => (
  crypto
    .createHash('sha256')
    .update(`document-notification:${input.action}:${input.evidenceId}:${recipientId}`)
    .digest('hex')
);

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
  return normalizeRecipientIds(
    subjectUserId,
    parentRows.map((row) => row.parentId),
  ).map((id) => ({ id }));
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
    createManyAndReturn: (args: {
      data: InAppNotificationRow[];
      select: { userId: true };
      skipDuplicates?: boolean;
    }) => Promise<Array<{ userId: string }>>;
  };
};

const defaultDocumentNotificationDatabase = prisma as unknown as DocumentNotificationDatabase;
const recordInAppNotifications = async (
  recipients: NotificationRecipient[],
  input: DocumentEvidenceNotificationInput,
  copy: { title: string; body: string },
  database: DocumentNotificationDatabase,
): Promise<NotificationRecipient[]> => {
  if (!recipients.length) return [];
  const data = getNotificationData(input);
  const createdRows = await database.userNotifications.createManyAndReturn({
    data: recipients.map((recipient) => ({
      id: getNotificationId(recipient.id, input),
      createdAt: new Date(),
      userId: recipient.id,
      notificationType: 'documents',
      title: copy.title,
      body: copy.body,
      data,
    })),
    select: { userId: true },
    skipDuplicates: true,
  });
  const createdUserIds = new Set(createdRows.map((row) => row.userId));
  return recipients.filter((recipient) => createdUserIds.has(recipient.id));
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
    data: getNotificationData(input),
  });
};

const sendDocumentEmails = async (
  recipients: NotificationRecipient[],
  input: DocumentEvidenceNotificationInput,
  copy: { title: string; body: string },
  database: DocumentNotificationDatabase,
): Promise<void> => {
  if (!recipients.length || !isEmailEnabled()) return;
  const eligibleUserIds = await filterUserIdsForNotificationChannel(
    recipients.map((recipient) => recipient.id),
    'documents',
    'email',
  );
  const emailRows = await database.sensitiveUserData.findMany({
    where: { userId: { in: eligibleUserIds } },
    select: { userId: true, email: true },
  });
  const emailByUserId = new Map(emailRows.map((row) => [row.userId, row.email]));
  const documentUrl = `${SITE_URL}${getDocumentViewUrl(input.evidenceId)}`;
  await Promise.all(
    recipients
      .filter((recipient) => emailByUserId.get(recipient.id))
      .map((recipient) => sendEmail({
        to: emailByUserId.get(recipient.id) as string,
        subject: copy.title,
        text: `${copy.body}\n\nView document: ${documentUrl}`,
      })),
  );
};

export const notifyDocumentEvidenceChange = async (
  input: DocumentEvidenceNotificationInput,
  database: DocumentNotificationDatabase = defaultDocumentNotificationDatabase,
): Promise<void> => {
  const copy = getNotificationCopy(input);
  let recipients: NotificationRecipient[];
  try {
    recipients = await loadRecipients(input.subjectUserId, database);
  } catch (error) {
    console.error('Document notification recipient lookup failed.', {
      action: input.action,
      evidenceId: input.evidenceId,
      error,
    });
    return;
  }

  let recipientsForOptionalChannels: NotificationRecipient[] = [];
  try {
    recipientsForOptionalChannels = await recordInAppNotifications(
      recipients,
      input,
      copy,
      database,
    );
  } catch (error) {
    console.error('Document notification delivery failed.', {
      channel: 'in-app',
      action: input.action,
      evidenceId: input.evidenceId,
      error,
    });
  }
  if (!recipientsForOptionalChannels.length) return;

  const deliveries: Array<[string, Promise<void>]> = [
    ['push', sendDocumentPush(recipientsForOptionalChannels, input, copy)],
    ['email', sendDocumentEmails(recipientsForOptionalChannels, input, copy, database)],
  ];
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
