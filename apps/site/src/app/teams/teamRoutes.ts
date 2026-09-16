import type { TeamDetailPageTab } from '@/components/ui/TeamDetailModal';

export const teamDetailTabFromPathSegment = (segment?: string | null): TeamDetailPageTab => {
  const normalized = String(segment ?? '').trim().toLowerCase();
  if (normalized === 'finance') return 'finance';
  if (normalized === 'schedule') return 'schedule';
  if (normalized === 'invitations') return 'invitations';
  return 'roster';
};

export const resolveTeamDetailTabFromPath = (
  pathname: string,
  teamId: string,
): TeamDetailPageTab | null => {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (segments[0] !== 'teams' || segments[1] !== teamId) {
    return null;
  }

  return teamDetailTabFromPathSegment(segments[2]);
};

export const buildTeamManagementPath = (
  teamId: string,
  tab: TeamDetailPageTab = 'roster',
): string => {
  const encodedTeamId = encodeURIComponent(teamId);
  return tab === 'roster' ? `/teams/${encodedTeamId}` : `/teams/${encodedTeamId}/${tab}`;
};
