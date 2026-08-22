/** @jest-environment node */

import {
  loadEventProtectedHistory,
} from '../eventProtectedHistory';

const buildClient = () => ({
  matches: { findMany: jest.fn() },
  divisions: { findMany: jest.fn() },
  matchSegments: { findMany: jest.fn() },
  matchIncidents: { findMany: jest.fn() },
  matchOperationReceipts: { findMany: jest.fn() },
  teamCheckIns: { findMany: jest.fn() },
  matchRosterEntries: { findMany: jest.fn() },
  broadcastOverlayActions: { findMany: jest.fn() },
  broadcastOverlayStates: { findMany: jest.fn() },
});

describe('loadEventProtectedHistory', () => {
  it('does not protect an unstarted match from roster, check-in, receipt, incident, or broadcast rows', async () => {
    const client = buildClient();
    client.matches.findMany.mockResolvedValue([{
      id: 'match_unstarted',
      status: 'SCHEDULED',
      resultStatus: null,
      resultType: null,
      actualStart: null,
      actualEnd: null,
      winnerEventTeamId: null,
      team1Points: [],
      team2Points: [],
    }]);
    client.teamCheckIns.findMany.mockResolvedValue([{ matchId: 'match_unstarted' }]);
    client.matchRosterEntries.findMany.mockResolvedValue([{ matchId: 'match_unstarted' }]);
    client.matchOperationReceipts.findMany.mockResolvedValue([{ matchId: 'match_unstarted' }]);
    client.matchIncidents.findMany.mockResolvedValue([{ matchId: 'match_unstarted' }]);
    client.broadcastOverlayActions.findMany.mockResolvedValue([{ matchId: 'match_unstarted' }]);
    client.broadcastOverlayStates.findMany.mockResolvedValue([{ activeMatchId: 'match_unstarted' }]);

    const history = await loadEventProtectedHistory('event_1', client);

    expect(history.protectedMatchIds).toEqual(new Set());
  });

  it('protects a match when it has started or has a result', async () => {
    const client = buildClient();
    client.matches.findMany.mockResolvedValue([
      {
        id: 'match_started',
        status: 'IN_PROGRESS',
        resultStatus: null,
        resultType: null,
        actualStart: new Date('2026-08-21T18:00:00.000Z'),
        actualEnd: null,
        winnerEventTeamId: null,
        team1Points: [],
        team2Points: [],
      },
      {
        id: 'match_result',
        status: 'NOT_STARTED',
        resultStatus: 'FINAL',
        resultType: 'WIN',
        actualStart: null,
        actualEnd: null,
        winnerEventTeamId: 'team_1',
        team1Points: [21],
        team2Points: [18],
      },
    ]);

    const history = await loadEventProtectedHistory('event_1', client);

    expect(history.protectedMatchIds).toEqual(new Set(['match_started', 'match_result']));
  });
});
