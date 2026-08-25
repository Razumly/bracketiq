/** @jest-environment node */

const isEmailEnabledMock = jest.fn(() => false);
const sendEmailMock = jest.fn();
const filterUserIdsForNotificationChannelMock = jest.fn();
const sendPushToUsersMock = jest.fn();
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: (...args: unknown[]) => isEmailEnabledMock(...args),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));
jest.mock('@/server/notificationPreferences', () => ({
  filterUserIdsForNotificationChannel: (...args: unknown[]) => (
    filterUserIdsForNotificationChannelMock(...args)
  ),
}));
jest.mock('@/server/pushNotifications', () => ({
  sendPushToUsers: (...args: unknown[]) => sendPushToUsersMock(...args),
}));

import {
  notifyDocumentEvidenceChange,
  type DocumentNotificationDatabase,
} from '@/server/documentNotifications';

const buildDatabase = () => {
  const parentChildLinksFindManyMock = jest.fn().mockResolvedValue([{ parentId: 'parent_1' }]);
  const sensitiveUserDataFindManyMock = jest.fn().mockResolvedValue([
    { userId: 'subject_1', email: 'subject@example.com' },
    { userId: 'parent_1', email: 'parent@example.com' },
  ]);
  const userNotificationsCreateManyAndReturnMock = jest.fn().mockResolvedValue([
    { userId: 'subject_1' },
    { userId: 'parent_1' },
  ]);
  return {
    database: {
      parentChildLinks: { findMany: parentChildLinksFindManyMock },
      sensitiveUserData: { findMany: sensitiveUserDataFindManyMock },
      userNotifications: { createManyAndReturn: userNotificationsCreateManyAndReturnMock },
    } as unknown as DocumentNotificationDatabase,
    userNotificationsCreateManyAndReturnMock,
  };
};

const notificationInput = {
  organizationId: 'org_1',
  organizationName: 'City League',
  subjectUserId: 'subject_1',
  evidenceId: 'evidence_1',
  documentName: 'Waiver',
  action: 'IMPORT' as const,
  actorUserId: 'manager_1',
};

describe('document evidence notifications', () => {
  beforeEach(() => {
    isEmailEnabledMock.mockReset().mockReturnValue(false);
    sendEmailMock.mockReset();
    filterUserIdsForNotificationChannelMock.mockReset();
    sendPushToUsersMock.mockReset();
  });

  it('records customer-safe in-app notifications with a stable identity', async () => {
    const {
      database,
      userNotificationsCreateManyAndReturnMock,
    } = buildDatabase();
    userNotificationsCreateManyAndReturnMock
      .mockResolvedValueOnce([{ userId: 'subject_1' }, { userId: 'parent_1' }])
      .mockResolvedValueOnce([]);

    await notifyDocumentEvidenceChange(notificationInput, database);
    await notifyDocumentEvidenceChange(notificationInput, database);

    expect(userNotificationsCreateManyAndReturnMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'subject_1',
          data: {
            action: 'IMPORT',
            evidenceId: 'evidence_1',
            organizationId: 'org_1',
            viewUrl: '/api/documents/signed/evidence_1/file',
            deepLink: 'mvp://profile/documents/evidence_1',
          },
        }),
        expect.objectContaining({
          userId: 'parent_1',
          title: 'Document imported',
          body: 'City League added "Waiver" as imported signed-document evidence. Status: Imported.',
        }),
      ]),
      select: { userId: true },
      skipDuplicates: true,
    });
    const firstRows = userNotificationsCreateManyAndReturnMock.mock.calls[0][0].data;
    const secondRows = userNotificationsCreateManyAndReturnMock.mock.calls[1][0].data;
    expect(firstRows.map((row: { id: string }) => row.id)).toEqual(
      secondRows.map((row: { id: string }) => row.id),
    );
    expect(sendPushToUsersMock).toHaveBeenCalledTimes(1);
    expect(firstRows[0].data).not.toHaveProperty('actorUserId');
  });

  it('does not repeat push or email delivery for a committed retry', async () => {
    const { database, userNotificationsCreateManyAndReturnMock } = buildDatabase();
    filterUserIdsForNotificationChannelMock.mockResolvedValue(['subject_1', 'parent_1']);
    isEmailEnabledMock.mockReturnValue(true);
    userNotificationsCreateManyAndReturnMock
      .mockResolvedValueOnce([{ userId: 'subject_1' }, { userId: 'parent_1' }])
      .mockResolvedValueOnce([]);

    await notifyDocumentEvidenceChange(notificationInput, database);
    await notifyDocumentEvidenceChange(notificationInput, database);

    expect(sendPushToUsersMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it('sends safe push and email deliveries with an authorized document link', async () => {
    const { database } = buildDatabase();
    filterUserIdsForNotificationChannelMock.mockResolvedValue(['subject_1', 'parent_1']);
    isEmailEnabledMock.mockReturnValue(true);

    await notifyDocumentEvidenceChange(notificationInput, database);

    expect(sendPushToUsersMock).toHaveBeenCalledWith({
      userIds: ['subject_1', 'parent_1'],
      title: 'Document imported',
      body: 'City League added "Waiver" as imported signed-document evidence. Status: Imported.',
      notificationType: 'documents',
      data: {
        action: 'IMPORT',
        evidenceId: 'evidence_1',
        organizationId: 'org_1',
        viewUrl: '/api/documents/signed/evidence_1/file',
        deepLink: 'mvp://profile/documents/evidence_1',
      },
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'subject@example.com',
      subject: 'Document imported',
      text: expect.stringContaining(
        'View document: https://bracket-iq.com/api/documents/signed/evidence_1/file',
      ),
    }));
    expect(sendEmailMock.mock.calls[0][0].text).not.toContain('Document evidence ID:');
  });

  it('skips email delivery when email notifications are disabled', async () => {
    const { database } = buildDatabase();

    await notifyDocumentEvidenceChange(notificationInput, database);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(filterUserIdsForNotificationChannelMock).not.toHaveBeenCalled();
  });

  it('uses customer-safe wording for void notifications', async () => {
    const { database, userNotificationsCreateManyAndReturnMock } = buildDatabase();
    filterUserIdsForNotificationChannelMock.mockResolvedValue(['subject_1', 'parent_1']);
    isEmailEnabledMock.mockReturnValue(true);

    await notifyDocumentEvidenceChange(
      { ...notificationInput, action: 'VOID' },
      database,
    );

    expect(userNotificationsCreateManyAndReturnMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          title: 'Document evidence voided',
          body: 'City League voided imported signed-document evidence for "Waiver". Status: Voided.',
        }),
      ]),
      select: { userId: true },
      skipDuplicates: true,
    }));
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Document evidence voided',
      text: expect.stringContaining(
        'City League voided imported signed-document evidence for "Waiver". Status: Voided.',
      ),
    }));
    expect(sendEmailMock.mock.calls[0][0].text).not.toContain('verified');
    expect(sendEmailMock.mock.calls[0][0].text).not.toContain('BoldSign');
  });

  it('does not send optional channels when in-app delivery fails', async () => {
    const { database, userNotificationsCreateManyAndReturnMock } = buildDatabase();
    isEmailEnabledMock.mockReturnValue(true);
    filterUserIdsForNotificationChannelMock.mockResolvedValue(['subject_1']);
    userNotificationsCreateManyAndReturnMock.mockRejectedValueOnce(new Error('In-app failed.'));
    sendPushToUsersMock.mockRejectedValueOnce(new Error('Push failed.'));
    sendEmailMock.mockRejectedValueOnce(new Error('Email failed.'));

    await expect(notifyDocumentEvidenceChange(notificationInput, database)).resolves.toBeUndefined();

    expect(sendPushToUsersMock).not.toHaveBeenCalled();
    expect(filterUserIdsForNotificationChannelMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('keeps in-app and push delivery when email lookup fails', async () => {
    const { database, userNotificationsCreateManyAndReturnMock } = buildDatabase();
    filterUserIdsForNotificationChannelMock.mockResolvedValue(['subject_1', 'parent_1']);
    isEmailEnabledMock.mockReturnValue(true);
    (database.sensitiveUserData.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Email data unavailable.'),
    );

    await expect(notifyDocumentEvidenceChange(notificationInput, database)).resolves.toBeUndefined();

    expect(userNotificationsCreateManyAndReturnMock).toHaveBeenCalled();
    expect(sendPushToUsersMock).toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does not send email when a recipient has no email destination', async () => {
    const { database, userNotificationsCreateManyAndReturnMock } = buildDatabase();
    filterUserIdsForNotificationChannelMock.mockResolvedValue(['subject_1', 'parent_1']);
    isEmailEnabledMock.mockReturnValue(true);
    (database.sensitiveUserData.findMany as jest.Mock).mockResolvedValueOnce([
      { userId: 'subject_1', email: null },
      { userId: 'parent_1', email: 'parent@example.com' },
    ]);

    await notifyDocumentEvidenceChange(notificationInput, database);

    expect(userNotificationsCreateManyAndReturnMock).toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'parent@example.com',
    }));
  });
});
