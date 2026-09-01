"use client";

import { useCallback, useEffect, useState } from "react";
import { Anchor, Alert, Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { formatDisplayDateTime } from "@/lib/dateUtils";
import {
  userNotificationService,
  type UserNotification,
} from "@/lib/userNotificationService";

type DocumentNotificationsPanelProps = {
  userId?: string | null;
};

const getNotificationDate = (value: string): string => (
  formatDisplayDateTime(value) || "Unknown date"
);

const getDocumentViewUrl = (notification: UserNotification): string | null => {
  const value = notification.data?.viewUrl;
  if (typeof value !== "string" || !/^\/api\/documents\/signed\/[^/?#]+\/file$/.test(value)) {
    return null;
  }
  return value;
};

export default function DocumentNotificationsPanel({ userId }: DocumentNotificationsPanelProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await userNotificationService.getDocumentNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load document notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markRead = async (notification: UserNotification) => {
    if (notification.readAt) return;
    setUpdatingId(notification.id);
    try {
      await userNotificationService.updateDocumentNotificationRead(notification.id);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((entry) => (
        entry.id === notification.id ? { ...entry, readAt } : entry
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to mark the notification as read.");
    } finally {
      setUpdatingId(null);
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setIsMarkingAllRead(true);
    try {
      await userNotificationService.updateDocumentNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((entry) => ({ ...entry, readAt: entry.readAt ?? readAt })));
      setUnreadCount(0);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to mark notifications as read.");
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="md" shadow="xs">
      <Group justify="space-between" align="flex-start" gap="md" mb="md">
        <div>
          <Group gap="xs">
            <Text fw={700}>Document notifications</Text>
            {unreadCount > 0 && <Badge color="blue">{unreadCount} unread</Badge>}
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            Updates about signed document evidence for you and your linked family accounts.
          </Text>
        </div>
        <Button
          size="xs"
          variant="light"
          onClick={() => void markAllRead()}
          loading={isMarkingAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </Button>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {isLoading ? (
        <Text size="sm" c="dimmed">Loading document notifications...</Text>
      ) : notifications.length === 0 ? (
        <Text size="sm" c="dimmed">No document notifications.</Text>
      ) : (
        <Stack gap="sm">
          {notifications.map((notification) => (
            <Paper key={notification.id} withBorder p="sm" radius="md" bg={notification.readAt ? undefined : "blue.0"}>
              <Group justify="space-between" align="flex-start" gap="md">
                <div>
                  <Text fw={notification.readAt ? 500 : 700}>{notification.title}</Text>
                  <Text size="sm" mt={2}>{notification.body}</Text>
                  {getDocumentViewUrl(notification) && (
                    <Anchor
                      href={getDocumentViewUrl(notification) as string}
                      target="_blank"
                      rel="noreferrer"
                      size="sm"
                      mt={4}
                    >
                      View document
                    </Anchor>
                  )}
                  <Text size="xs" c="dimmed" mt={4}>{getNotificationDate(notification.createdAt)}</Text>
                </div>
                {!notification.readAt && (
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => void markRead(notification)}
                    loading={updatingId === notification.id}
                  >
                    Mark read
                  </Button>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
