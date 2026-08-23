import { apiRequest } from '@/lib/apiClient';

export type UserNotification = {
  id: string;
  createdAt: string;
  notificationType: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
};

type UserNotificationListResponse = {
  notifications: UserNotification[];
  unreadCount: number;
};

type UserNotificationMutationResponse = {
  updatedCount?: number;
};

class UserNotificationService {
  async listDocumentNotifications(limit = 50): Promise<{
    notifications: UserNotification[];
    unreadCount: number;
  }> {
    const response = await apiRequest<UserNotificationListResponse>(
      `/api/notifications?type=documents&limit=${encodeURIComponent(String(limit))}`,
    );
    if (!Array.isArray(response.notifications) || !Number.isInteger(response.unreadCount)) {
      throw new Error('Invalid document notification response.');
    }
    return {
      notifications: response.notifications,
      unreadCount: response.unreadCount,
    };
  }

  async markRead(notificationId: string): Promise<void> {
    await apiRequest<UserNotificationMutationResponse>('/api/notifications', {
      method: 'PATCH',
      body: { notificationId },
    });
  }

  async markAllDocumentsRead(): Promise<void> {
    await apiRequest<UserNotificationMutationResponse>('/api/notifications', {
      method: 'PATCH',
      body: { markAllRead: true, type: 'documents' },
    });
  }
}

export const userNotificationService = new UserNotificationService();
