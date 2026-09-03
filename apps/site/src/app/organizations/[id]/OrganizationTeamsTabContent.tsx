'use client';

import {
  Button,
  Group,
  Paper,
  SimpleGrid,
  Text,
  Title,
} from '@/components/organization/organization-operation-ui';
import TeamCard from '@/components/ui/TeamCard';
import type { Team } from '@/types';

export type OrganizationTeamsTabContentProps = {
  teams?: Team[] | null;
  isTeamManagementAllowed?: boolean;
  onCreateTeam: () => void;
  onTeamClick: (team: Team) => void;
};

export default function OrganizationTeamsTabContent({
  teams,
  isTeamManagementAllowed = false,
  onCreateTeam,
  onTeamClick,
}: OrganizationTeamsTabContentProps) {
  const visibleTeams = teams ?? [];

  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Group justify="space-between" mb="md">
        <Title order={5}>Teams</Title>
        {isTeamManagementAllowed && (
          <Button onClick={onCreateTeam}>Create Team</Button>
        )}
      </Group>
      {visibleTeams.length > 0 ? (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {visibleTeams.map((team) => (
            <TeamCard
              key={team.$id}
              team={team}
              className="org-tab-item"
              onClick={() => onTeamClick(team)}
            />
          ))}
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">No teams yet.</Text>
      )}
    </Paper>
  );
}
