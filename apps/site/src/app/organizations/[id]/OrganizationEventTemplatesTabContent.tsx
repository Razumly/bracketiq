'use client';

import { Button, Group, Paper, Stack, Text, Title } from '@/components/organization/organization-operation-ui';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';

export type OrganizationEventTemplateSummary = {
  id: string;
  name: string;
  eventType?: string | null;
  sportId?: string | null;
};

type OrganizationEventTemplatesTabContentProps = {
  eventTemplates: OrganizationEventTemplateSummary[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onCreateEvent: (templateId: string) => void;
};

export default function OrganizationEventTemplatesTabContent({
  eventTemplates,
  isLoading,
  error,
  onRefresh,
  onCreateEvent,
}: OrganizationEventTemplatesTabContentProps) {
  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Group justify="space-between" mb="md" wrap="wrap">
        <Title order={5}>Event Templates</Title>
        <Button variant="default" onClick={() => void onRefresh()} loading={isLoading}>
          Refresh
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Organization-scoped templates for creating new events.
      </Text>
      {error && (
        <Text size="sm" c="red" mb="md">
          {error}
        </Text>
      )}
      {isLoading ? (
        <Text size="sm" c="dimmed">Loading event templates...</Text>
      ) : eventTemplates.length > 0 ? (
        <ResponsiveCardGrid>
          {eventTemplates.map((eventTemplate) => (
            <Paper key={eventTemplate.id} withBorder radius="md" p="md" className="org-tab-item">
              <Stack gap="sm">
                <div>
                  <Text fw={700}>{eventTemplate.name}</Text>
                  {eventTemplate.eventType && (
                    <Text size="xs" c="dimmed" mt={4}>
                      {eventTemplate.eventType}
                    </Text>
                  )}
                </div>
                <Button size="xs" variant="light" onClick={() => onCreateEvent(eventTemplate.id)}>
                  Create event
                </Button>
              </Stack>
            </Paper>
          ))}
        </ResponsiveCardGrid>
      ) : (
        <Text size="sm" c="dimmed">No event templates yet.</Text>
      )}
    </Paper>
  );
}
