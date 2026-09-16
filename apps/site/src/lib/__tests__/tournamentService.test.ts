import { tournamentService } from '@/lib/tournamentService';
import { apiRequest } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('tournamentService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('normalizes match ids returned by the API', async () => {
    apiRequestMock.mockResolvedValue({
      match: { id: 'match_1' },
    });

    const result = await tournamentService.updateMatch('event_1', 'match_1', {
      team1Points: [],
      team2Points: [],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/event_1/matches/match_1',
      expect.objectContaining({ method: 'PATCH', timeoutMs: 60_000 }),
    );
    expect(result.$id).toBe('match_1');
  });

  it('uses the extended timeout when finalizing a match', async () => {
    apiRequestMock.mockImplementation(async (_path, options) => {
      const command = options?.body as { matchId: string; update: { clientOperationId: string } };
      return {
        match: { id: command.matchId },
        terminalResult: { contractVersion: 1, operationId: command.update.clientOperationId,
          eventId: 'event_1', matchId: command.matchId, status: 'REPLAYED',
          event: { id: 'event_1', end: '2026-09-04T10:00:00.000Z', generatedScheduleEnd: null },
          matches: [], affectedMatchIds: [], protectedMatchIds: [], placementChanges: [], assignmentChanges: [],
          warnings: [], exploredStates: 0 },
      } as never;
    });

    await tournamentService.completeMatch('event_1', 'match_1', {
      team1Points: [25],
      team2Points: [21],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/event_1/matches/terminal',
      expect.objectContaining({
        method: 'PATCH',
        timeoutMs: 60_000,
        body: expect.objectContaining({
          matchId: 'match_1',
          update: expect.objectContaining({ finalize: true, terminalContractVersion: 1,
            clientOperationId: expect.any(String) }),
        }),
      }),
    );
  });
});
