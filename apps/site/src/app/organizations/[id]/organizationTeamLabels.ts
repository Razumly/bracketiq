import type { Division, Team } from '@/types';

export function teamDivisionLabel(team: Team, divisions: readonly Division[] = []): string {
  if (typeof team.division === 'object') return team.division.name?.trim() || 'Division name unavailable';
  const value = team.division.trim();
  if (!value) return 'No division assigned';
  const division = divisions.find((candidate) => [candidate.id, candidate.key, candidate.name].includes(value));
  if (division?.name.trim()) return division.name.trim();
  // Team creation uses Open as the default division label.
  if (value.toLowerCase() === 'open') return 'Open';
  return 'Division name unavailable';
}
