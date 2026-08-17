jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

type ApiRequestFn = typeof import('@/lib/apiClient').apiRequest;

const loadSportsService = async () => {
  const [{ sportsService }, { apiRequest }] = await Promise.all([
    import('@/lib/sportsService'),
    import('@/lib/apiClient'),
  ]);

  return {
    sportsService,
    apiRequestMock: apiRequest as jest.MockedFunction<ApiRequestFn>,
  };
};

describe('sportsService', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  it('preserves match rules templates and official position templates from the sports API', async () => {
    const { sportsService, apiRequestMock } = await loadSportsService();

    apiRequestMock.mockResolvedValue({
      sports: [
        {
          id: 'Indoor Soccer',
          name: 'Indoor Soccer',
          resourceLabelSingular: 'Field',
          resourceLabelPlural: 'Fields',
          createdAt: '2026-07-14T10:00:00.000Z',
          updatedAt: '2026-07-14T10:05:00.000Z',
          officialPositionTemplates: [
            { name: 'Referee', count: 2 },
          ],
          matchRulesTemplate: {
            scoringModel: 'PERIODS',
            segmentCount: 2,
            segmentLabel: 'Half',
            supportsDraw: true,
            canUseOvertime: true,
            canUseShootout: true,
            supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
            autoCreatePointIncidentType: 'GOAL',
            pointIncidentRequiresParticipant: true,
          },
          usePointsForWin: true,
        },
      ],
    });

    const [sport] = await sportsService.getAll(true);

    expect(sport.matchRulesTemplate).toEqual({
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
      supportsDraw: true,
      canUseOvertime: true,
      canUseShootout: true,
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: true,
    });
    expect(sport.officialPositionTemplates).toEqual([
      { name: 'Referee', count: 2 },
    ]);
    expect(sport).toEqual(expect.objectContaining({
      $id: 'Indoor Soccer',
      $createdAt: '2026-07-14T10:00:00.000Z',
      $updatedAt: '2026-07-14T10:05:00.000Z',
      resourceLabelSingular: 'Field',
      resourceLabelPlural: 'Fields',
    }));
  });

  it('hydrates cached sports with preserved match rules templates', async () => {
    localStorage.setItem('sports-cache-v5', JSON.stringify({
      timestamp: Date.now(),
      items: [
        {
          $id: 'Hockey',
          name: 'Hockey',
          resourceLabelSingular: 'Rink',
          resourceLabelPlural: 'Rinks',
          officialPositionTemplates: [
            { name: 'Scorekeeper', count: 1 },
          ],
          matchRulesTemplate: {
            scoringModel: 'PERIODS',
            segmentCount: 3,
            segmentLabel: 'Period',
            supportsOvertime: true,
            supportsShootout: true,
            canUseOvertime: true,
            canUseShootout: true,
          },
        },
      ],
    }));

    const { sportsService } = await loadSportsService();
    const [sport] = sportsService.getCached({ allowStale: true }) ?? [];

    expect(sport.matchRulesTemplate).toEqual({
      scoringModel: 'PERIODS',
      segmentCount: 3,
      segmentLabel: 'Period',
      supportsOvertime: true,
      supportsShootout: true,
      canUseOvertime: true,
      canUseShootout: true,
    });
    expect(sport.officialPositionTemplates).toEqual([
      { name: 'Scorekeeper', count: 1 },
    ]);
  });

  it('deduplicates case and whitespace variants from the sports API', async () => {
    const { sportsService, apiRequestMock } = await loadSportsService();

    apiRequestMock.mockResolvedValue({
      sports: [
        {
          $id: 'sport_indoor_volleyball_duplicate',
          name: ' indoor volleyball ',
          resourceLabelSingular: 'Court',
          resourceLabelPlural: 'Courts',
          matchRulesTemplate: { scoringModel: 'SETS' },
        },
        {
          $id: 'Indoor Volleyball',
          name: 'Indoor Volleyball',
          resourceLabelSingular: 'Court',
          resourceLabelPlural: 'Courts',
          matchRulesTemplate: null,
        },
      ],
    });

    const sports = await sportsService.getAll(true);

    expect(sports).toHaveLength(1);
    expect(sports[0]).toEqual(expect.objectContaining({
      $id: 'Indoor Volleyball',
      name: 'Indoor Volleyball',
    }));
  });

  it('ignores the prior cache version whose mapped booleans can distort canonical selection', async () => {
    localStorage.setItem('sports-cache-v4', JSON.stringify({
      timestamp: Date.now(),
      items: [
        {
          $id: 'legacy-cache-row',
          name: 'Legacy Cached Sport',
          usePointsForWin: false,
          usePointsForDraw: false,
        },
      ],
    }));

    const { sportsService } = await loadSportsService();

    expect(sportsService.getCached({ allowStale: true })).toBeNull();
  });

  it('deduplicates a current-version local-storage payload before returning it', async () => {
    localStorage.setItem('sports-cache-v5', JSON.stringify({
      timestamp: Date.now(),
      items: [
        {
          $id: 'sport_indoor_soccer_duplicate',
          name: ' INDOOR SOCCER ',
          resourceLabelSingular: 'Field',
          resourceLabelPlural: 'Fields',
          matchRulesTemplate: { scoringModel: 'PERIODS' },
        },
        {
          $id: 'Indoor Soccer',
          name: 'Indoor Soccer',
          resourceLabelSingular: 'Field',
          resourceLabelPlural: 'Fields',
          matchRulesTemplate: null,
        },
      ],
    }));

    const { sportsService } = await loadSportsService();
    const sports = sportsService.getCached({ allowStale: true }) ?? [];

    expect(sports).toHaveLength(1);
    expect(sports[0]).toEqual(expect.objectContaining({
      $id: 'Indoor Soccer',
      name: 'Indoor Soccer',
    }));
  });

  it('rejects blank Resource Labels at the network boundary', async () => {
    const { sportsService, apiRequestMock } = await loadSportsService();
    apiRequestMock.mockResolvedValue({
      sports: [{
        id: 'Indoor Volleyball',
        name: 'Indoor Volleyball',
        resourceLabelSingular: '',
        resourceLabelPlural: 'Courts',
      }],
    });

    await expect(sportsService.getAll(true)).rejects.toThrow(
      'Sport.resourceLabelSingular must be a trimmed, nonblank string with at most 40 characters.',
    );
  });
});
