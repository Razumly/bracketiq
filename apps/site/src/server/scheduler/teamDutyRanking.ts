import type { Match, Team } from './types';

export const isMatchCompletedForTeamDuty = (match: Match): boolean => {
  const status = String(match.status ?? '').trim().toUpperCase();
  const resultStatus = String(match.resultStatus ?? '').trim().toUpperCase();
  if (
    Boolean(match.winnerEventTeamId)
    && (
      ['COMPLETE', 'COMPLETED', 'FINISHED', 'FINAL'].includes(status)
      || ['COMPLETE', 'COMPLETED', 'FINAL'].includes(resultStatus)
      || Boolean(match.actualEnd)
    )
  ) {
    return true;
  }
  const segments = Array.isArray(match.segments) ? match.segments : [];
  if (!segments.length) {
    return false;
  }
  const team1Wins = segments.filter((segment) => (
    segment.status === 'COMPLETE' && segment.winnerEventTeamId === match.team1?.id
  )).length;
  const team2Wins = segments.filter((segment) => (
    segment.status === 'COMPLETE' && segment.winnerEventTeamId === match.team2?.id
  )).length;
  const setsToWin = Math.ceil(segments.length / 2);
  return team1Wins >= setsToWin || team2Wins >= setsToWin;
};

export const matchHasPlayingTeam = (match: Match, teamId: string): boolean => (
  match.team1?.id === teamId || match.team2?.id === teamId
);

export const matchHasTeamDuty = (match: Match, teamId: string): boolean => (
  match.teamOfficial?.id === teamId
);

export const matchHasTeamActivity = (match: Match, teamId: string): boolean => (
  matchHasPlayingTeam(match, teamId) || matchHasTeamDuty(match, teamId)
);

export const historyEndTime = (match: Match): number => (
  match.actualEnd?.getTime() ?? match.end.getTime()
);

export type RankedTeamDutyCandidate = {
  team: Team;
  rankTier: number;
  latestLossAt: number;
  assignmentCount: number;
  restMs: number;
};

export const rankTeamDutyCandidate = (
  team: Team,
  target: Match,
  matches: Match[],
): RankedTeamDutyCandidate => {
  const completedPlayingMatches = matches
    .filter((match) => (
      match.id !== target.id
      && matchHasPlayingTeam(match, team.id)
      && isMatchCompletedForTeamDuty(match)
      && historyEndTime(match) <= target.start.getTime()
      && Boolean(match.winnerEventTeamId)
    ))
    .sort((left, right) => (
      historyEndTime(right) - historyEndTime(left)
      || left.id.localeCompare(right.id)
    ));
  const latestResult = completedPlayingMatches[0] ?? null;
  const latestResultIsLoss = Boolean(
    latestResult
    && latestResult.winnerEventTeamId
    && latestResult.winnerEventTeamId !== team.id
  );
  const hasRemainingMatch = matches.some((match) => (
    match.id !== target.id
    && matchHasPlayingTeam(match, team.id)
    && !isMatchCompletedForTeamDuty(match)
    && match.start instanceof Date
    && match.start.getTime() >= target.end.getTime()
  ));
  const latestActivityEnd = matches.reduce<number | null>((latest, match) => {
    if (
      match.id === target.id
      || !matchHasTeamActivity(match, team.id)
      || !(match.end instanceof Date)
      || match.end.getTime() > target.start.getTime()
    ) {
      return latest;
    }
    const end = historyEndTime(match);
    return latest == null || end > latest ? end : latest;
  }, null);

  return {
    team,
    rankTier: latestResultIsLoss ? (hasRemainingMatch ? 1 : 0) : 2,
    latestLossAt: latestResultIsLoss && latestResult
      ? historyEndTime(latestResult)
      : Number.NEGATIVE_INFINITY,
    assignmentCount: matches.filter((match) => (
      match.id !== target.id && matchHasTeamDuty(match, team.id)
    )).length,
    restMs: latestActivityEnd == null
      ? Number.POSITIVE_INFINITY
      : target.start.getTime() - latestActivityEnd,
  };
};

export const compareRankedTeamDutyCandidates = (
  left: RankedTeamDutyCandidate,
  right: RankedTeamDutyCandidate,
): number => {
  const tierComparison = left.rankTier - right.rankTier;
  if (tierComparison !== 0) {
    return tierComparison;
  }
  const recentLossComparison = left.rankTier <= 1
    ? right.latestLossAt - left.latestLossAt
    : 0;
  return recentLossComparison
    || left.assignmentCount - right.assignmentCount
    || right.restMs - left.restMs
    || left.team.id.localeCompare(right.team.id);
};

export const rankTeamDutyCandidates = (
  teams: Team[],
  target: Match,
  matches: Match[],
): Team[] => teams
  .map((team) => rankTeamDutyCandidate(team, target, matches))
  .sort(compareRankedTeamDutyCandidates)
  .map(({ team }) => team);
