import { extractDivisionTokenFromId, inferDivisionDetails, parseDivisionToken } from '@/lib/divisionTypes';
import { Team, getUserAvatarUrl, getTeamAvatarUrl } from '@/types';
import type { TeamPlayerRegistration } from '@/types';
import { Paper, Group, Avatar, Text, Badge } from '@/components/organization/organization-operation-ui';

interface TeamCardProps {
  team: Team;
  showTeamMetadata?: boolean;
  actions?: React.ReactNode;
  actionsPlacement?: 'header' | 'below';
  onClick?: () => void;
  className?: string;
}

const ACTIVE_PLAYER_REGISTRATION_STATUSES = new Set(['ACTIVE', 'PENDING', 'STARTED']);

const isActivePlayerRegistration = (registration: TeamPlayerRegistration): boolean => (
  ACTIVE_PLAYER_REGISTRATION_STATUSES.has(String(registration.status ?? '').trim().toUpperCase())
);

export default function TeamCard({
  team,
  showTeamMetadata = true,
  actions,
  actionsPlacement = 'header',
  onClick,
  className = ''
}: TeamCardProps) {
  const toNonNegativeInteger = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.trunc(value));
  };

  const currentSize = toNonNegativeInteger(team.currentSize)
    ?? (Array.isArray(team.players) ? team.players.length : null)
    ?? (Array.isArray(team.playerIds) ? team.playerIds.length : 0);
  const teamSize = toNonNegativeInteger(team.teamSize);
  const hasCapacity = teamSize !== null && teamSize > 0;
  const isFull = team.isFull === true || (hasCapacity && currentSize >= teamSize);
  const spotsLeft = hasCapacity ? Math.max(teamSize - currentSize, 0) : null;
  const isAffiliateTeam = typeof team.affiliateUrl === 'string' && team.affiliateUrl.trim().length > 0;
  const showRegistrationCapacity = !isAffiliateTeam && team.openRegistration === true && hasCapacity;
  const hasPendingInvites = Array.isArray(team.pending) && team.pending.length > 0;

  const visibleMembers = (team.players ?? []).filter((player) => {
    if (player.isIdentityHidden) {
      return false;
    }

    const normalizedHandle = player.userName?.trim().toLowerCase();
    return normalizedHandle !== 'hidden';
  });
  const visibleMembersPreview = visibleMembers.slice(0, 5);
  const hiddenVisibleMemberCount = Math.max(visibleMembers.length - visibleMembersPreview.length, 0);
  const jerseyNumberByUserId = new Map(
    (team.playerRegistrations ?? [])
      .filter((registration) => registration.userId && isActivePlayerRegistration(registration))
      .map((registration) => [registration.userId, registration.jerseyNumber ?? null] as const),
  );

  const resolveLabel = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };
  const looksLikeDivisionId = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.includes('__division__')) return true;
    if (normalized.startsWith('division_') || normalized.startsWith('div_')) return true;
    return false;
  };

  const divisionObject = typeof team.division === 'object' && team.division !== null
    ? team.division
    : null;

  const divisionLabelFromObjectName = resolveLabel(divisionObject?.name);
  const divisionLabelFromObjectSkillLevel = resolveLabel(divisionObject?.skillLevel);
  const divisionLabelFromObjectId = (() => {
    const divisionId = resolveLabel(divisionObject?.id);
    if (!divisionId) return null;
    const inferred = inferDivisionDetails({
      identifier: divisionId,
      sportInput: team.sport,
    });
    return resolveLabel(inferred.divisionTypeName) ?? inferred.defaultName;
  })();

  const divisionLabelFromString = (() => {
    const rawDivision = resolveLabel(typeof team.division === 'string' ? team.division : null);
    if (!rawDivision) return null;

    if (!looksLikeDivisionId(rawDivision)) {
      return rawDivision;
    }

    const divisionToken = extractDivisionTokenFromId(rawDivision);
    const parsedToken = divisionToken ? parseDivisionToken(divisionToken) : null;
    if (!parsedToken) {
      return null;
    }

    return inferDivisionDetails({
      identifier: rawDivision,
      sportInput: team.sport,
    }).defaultName;
  })();

  const divisionLabel = divisionLabelFromObjectName
    ?? divisionLabelFromObjectSkillLevel
    ?? divisionLabelFromObjectId
    ?? divisionLabelFromString
    ?? 'Division';
  const renderedActions = actions ? (
    <div
      style={{
        flex: actionsPlacement === 'header' ? '0 1 auto' : undefined,
        marginLeft: actionsPlacement === 'header' ? 'auto' : undefined,
        maxWidth: '100%',
        minWidth: 0,
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {actions}
    </div>
  ) : null;
  const hasBelowActions = actionsPlacement === 'below' && Boolean(renderedActions);
  const hasBodyContent = hasBelowActions || visibleMembers.length > 0 || hasPendingInvites || showRegistrationCapacity || isAffiliateTeam;
  const headerMarginBottom = hasBodyContent ? (hasBelowActions ? 'xs' : 'sm') : 0;

  return (
    <Paper withBorder radius="md" p="md" className={className} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <Group align="flex-start" justify="space-between" mb={headerMarginBottom} wrap="wrap">
        <Group gap="sm" align={showTeamMetadata ? 'flex-start' : 'center'} wrap="nowrap" style={{ flex: '1 1 220px', minWidth: 0 }}>
          <Avatar src={getTeamAvatarUrl(team, 56)} alt={team.name || 'Team'} name={team.name || 'Team'} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="lg" className="truncate">{team.name || 'Unnamed Team'}</Text>
            {showTeamMetadata ? (
              <Group gap={6} mt={4}>
                <Text size="sm" c="dimmed">{divisionLabel}</Text>
                {team.sport && <Badge variant="light" color="blue" size="xs">{team.sport}</Badge>}
              </Group>
            ) : null}
          </div>
        </Group>
        {actionsPlacement === 'header' ? renderedActions : null}
      </Group>

      {hasBelowActions ? (
        <div className="mb-3">
          {renderedActions}
        </div>
      ) : null}

      {visibleMembers.length > 0 && (
        <Group justify="space-between" mb="xs">
          <Group gap={6}>
            <Text size="sm" c="dimmed">Roster:</Text>
            <Group gap={0} className="-space-x-2">
              {visibleMembersPreview.map((player) => (
                <Avatar
                  key={player.$id}
                  src={getUserAvatarUrl(player, 32, jerseyNumberByUserId.get(player.$id))}
                  alt={player.fullName}
                  size="sm"
                  name={player.fullName}
                />
              ))}
              {hiddenVisibleMemberCount > 0 && (
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs">+{hiddenVisibleMemberCount}</span>
              )}
            </Group>
          </Group>
        </Group>
      )}

      {(hasPendingInvites || showRegistrationCapacity || isAffiliateTeam) && (
        <Group justify="space-between" className="border-t border-border pt-3">
          <Group gap={8}>
            {hasPendingInvites && (
              <Text size="xs" c="orange" fw={600}>{team.pending.length} pending</Text>
            )}
          </Group>
          {isAffiliateTeam ? (
            <Text size="xs" c="blue" fw={600}>
              External registration
            </Text>
          ) : showRegistrationCapacity ? (
            <Text size="xs" c={isFull ? 'red' : 'green'} fw={600}>
              {isFull
                ? 'Team Full'
                : `${spotsLeft ?? 0} ${(spotsLeft ?? 0) === 1 ? 'spot' : 'spots'} left`}
            </Text>
          ) : null}
        </Group>
      )}
    </Paper>
  );
}
