import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import DocumentNotificationsPanel from '../DocumentNotificationsPanel';

jest.mock('@/lib/userNotificationService', () => ({
  userNotificationService: {
    getDocumentNotifications: jest.fn(),
    updateDocumentNotificationRead: jest.fn(),
    updateDocumentNotificationsRead: jest.fn(),
  },
}));

const userNotificationServiceMock = jest.requireMock('@/lib/userNotificationService').userNotificationService as {
  getDocumentNotifications: jest.Mock;
  updateDocumentNotificationRead: jest.Mock;
  updateDocumentNotificationsRead: jest.Mock;
};

describe('DocumentNotificationsPanel', () => {
  beforeEach(() => {
    userNotificationServiceMock.getDocumentNotifications.mockReset();
    userNotificationServiceMock.updateDocumentNotificationRead.mockReset();
    userNotificationServiceMock.updateDocumentNotificationsRead.mockReset();
  });

  it('given an unread document notification when marked read then updates the notification state', async () => {
    userNotificationServiceMock.getDocumentNotifications.mockResolvedValue({
      notifications: [{
        id: 'notification_1',
        createdAt: '2026-08-24T12:00:00.000Z',
        notificationType: 'documents',
        title: 'Document imported',
        body: 'Your document is ready.',
        data: { viewUrl: '/api/documents/signed/evidence_1/file' },
        readAt: null,
      }],
      unreadCount: 1,
    });

    renderWithMantine(<DocumentNotificationsPanel userId="user_1" />);

    expect(await screen.findByText('Document imported')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View document' })).toHaveAttribute(
      'href',
      '/api/documents/signed/evidence_1/file',
    );
    expect(screen.getByText('1 unread')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => {
      expect(userNotificationServiceMock.updateDocumentNotificationRead).toHaveBeenCalledWith(
        'notification_1',
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('1 unread')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });
});
