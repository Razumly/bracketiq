/** @jest-environment node */

const isEmailEnabledMock = jest.fn(() => false);
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: (...args: unknown[]) => isEmailEnabledMock(...args),
  sendEmail: jest.fn(),
}));
jest.mock('@/server/notificationPreferences', () => ({
  filterUserIdsForNotificationChannel: jest.fn(),
}));
jest.mock('@/server/pushNotifications', () => ({
  sendPushToUsers: jest.fn(),
}));

import {
  recordDocumentEvidenceInAppNotification,
  type DocumentNotificationDatabase,
} from '@/server/documentNotifications';

describe('recordDocumentEvidenceInAppNotification', () => {
  it('uses the supplied database for recipient reads and writes', async () => {
    const parentChildLinksFindManyMock = jest.fn().mockResolvedValue([{ parentId: 'parent_1' }]);
    const sensitiveUserDataFindManyMock = jest.fn();
    const userNotificationsCreateManyMock = jest.fn().mockResolvedValue({ count: 2 });
    const database = {
      parentChildLinks: { findMany: parentChildLinksFindManyMock },
      sensitiveUserData: { findMany: sensitiveUserDataFindManyMock },
      userNotifications: { createMany: userNotificationsCreateManyMock },
    } as unknown as DocumentNotificationDatabase;

    await recordDocumentEvidenceInAppNotification(
      {
        organizationId: 'org_1',
        subjectUserId: 'subject_1',
        evidenceId: 'evidence_1',
        documentName: 'Waiver',
        action: 'IMPORT',
        actorUserId: 'manager_1',
      },
      database,
    );

    expect(userNotificationsCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'subject_1',
          data: expect.objectContaining({ evidenceId: 'evidence_1' }),
        }),
        expect.objectContaining({
          userId: 'parent_1',
          data: expect.objectContaining({ action: 'IMPORT' }),
        }),
      ]),
    });
  });
});
