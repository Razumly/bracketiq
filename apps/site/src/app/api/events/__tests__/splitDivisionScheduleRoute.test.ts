/** @jest-environment node */

import { NextRequest } from 'next/server';
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  type EventEditorMaintenanceProposal as MaintenanceProposalResponse,
} from '@/contracts/eventEditor';
import type { FieldBlockerCatalog } from '@/server/repositories/fieldSchedulingConflicts';
import {
  Division,
  League,
  Match,
  PlayingField,
  Team,
  TimeSlot,
} from '@/server/scheduler/types';

const requireSessionMock = jest.fn();
const acquireEventLockMock = jest.fn();
const acquireFieldLocksMock = jest.fn();
const acquireTimeSlotLocksMock = jest.fn();
const loadEventWithRelationsMock = jest.fn();
const loadEventScheduleStateMock = jest.fn();
const loadEventProtectedHistoryMock = jest.fn();
const canManageEventMock = jest.fn();
const loadFieldBlockerCatalogMock = jest.fn();
const findFieldConflictsForIntervalMock = jest.fn();
const persistScheduledRosterTeamsMock = jest.fn();
const saveMatchesMock = jest.fn();
const saveEventScheduleMock = jest.fn();
const deletePristineScheduleByEventMock = jest.fn();
const collectPhaseDivisionsMock = jest.fn();
const collectPhaseTeamIdsByDivisionMock = jest.fn();
const persistPhaseParticipantAssignmentsMock = jest.fn();
const loadTeamCheckInsMock = jest.fn();
const rescheduleEventMatchesPreservingLocksMock = jest.fn();
const applyLeagueDivisionPlayoffReassignmentMock = jest.fn();
const isTournamentPoolPlayStandingsEventMock = jest.fn();
const validatePlayoffDivisionReferenceCapacitiesMock = jest.fn();
const collectMatchScheduleChangesMock = jest.fn();
const snapshotMatchScheduleStateMock = jest.fn();
const notifyTeamsOfMatchScheduleUpdateMock = jest.fn();
const refreshBroadcastPresentationForEventMock = jest.fn();

type MaintenanceOperationRow = {
  operationId: string;
  eventId: string;
  actorUserId: string;
  operation: string;
  requestHash: string;
  proposalRevision: string | null;
  proposalJson: unknown;
  revisionBindingJson: unknown;
  status: string;
  acceptanceOperationId: string | null;
  acceptedResponseJson: unknown;
  requestJson: unknown;
};

const operationRows = new Map<string, MaintenanceOperationRow>();
const operationFindUniqueMock = jest.fn();
const operationCreateMock = jest.fn();
const operationUpdateMock = jest.fn();

const prismaMock = {
  $transaction: jest.fn(),
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  divisions: {
    update: jest.fn(),
  },
  eventEditorMaintenanceOperations: {
    findUnique: operationFindUniqueMock,
    create: operationCreateMock,
    update: operationUpdateMock,
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: unknown[]) => acquireEventLockMock(...args),
  acquireFieldLocks: (...args: unknown[]) => acquireFieldLocksMock(...args),
  acquireTimeSlotLocks: (...args: unknown[]) => acquireTimeSlotLocksMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));
jest.mock('@/server/repositories/events', () => ({
  deletePristineScheduleByEvent: (...args: unknown[]) =>
    deletePristineScheduleByEventMock(...args),
  isEventFieldConfigurationError: () => false,
  loadEventWithRelations: (...args: unknown[]) => loadEventWithRelationsMock(...args),
  persistScheduledRosterTeams: (...args: unknown[]) =>
    persistScheduledRosterTeamsMock(...args),
  saveEventSchedule: (...args: unknown[]) => saveEventScheduleMock(...args),
  saveMatches: (...args: unknown[]) => saveMatchesMock(...args),
}));
jest.mock('@/server/events/eventEditorSnapshot', () => ({
  loadEventScheduleState: (...args: unknown[]) => loadEventScheduleStateMock(...args),
}));
jest.mock('@/server/events/eventProtectedHistory', () => ({
  loadEventProtectedHistory: (...args: unknown[]) =>
    loadEventProtectedHistoryMock(...args),
}));
jest.mock('@/server/repositories/fieldSchedulingConflicts', () => ({
  findFieldConflictsForInterval: (...args: unknown[]) =>
    findFieldConflictsForIntervalMock(...args),
  loadFieldBlockerCatalog: (...args: unknown[]) =>
    loadFieldBlockerCatalogMock(...args),
}));
jest.mock('@/server/repositories/eventDivisionPhases', () => ({
  collectPhaseDivisions: (...args: unknown[]) => collectPhaseDivisionsMock(...args),
  collectPhaseTeamIdsByDivision: (...args: unknown[]) =>
    collectPhaseTeamIdsByDivisionMock(...args),
  persistPhaseParticipantAssignments: (...args: unknown[]) =>
    persistPhaseParticipantAssignmentsMock(...args),
}));
jest.mock('@/server/matches/teamCheckIns', () => ({
  loadTeamCheckIns: (...args: unknown[]) => loadTeamCheckInsMock(...args),
}));
jest.mock('@/server/scheduler/reschedulePreservingLocks', () => ({
  rescheduleEventMatchesPreservingLocks: (...args: unknown[]) =>
    rescheduleEventMatchesPreservingLocksMock(...args),
}));
jest.mock('@/server/scheduler/standings', () => ({
  applyLeagueDivisionPlayoffReassignment: (...args: unknown[]) =>
    applyLeagueDivisionPlayoffReassignmentMock(...args),
  isTournamentPoolPlayStandingsEvent: (...args: unknown[]) =>
    isTournamentPoolPlayStandingsEventMock(...args),
  validatePlayoffDivisionReferenceCapacities: (...args: unknown[]) =>
    validatePlayoffDivisionReferenceCapacitiesMock(...args),
}));
jest.mock('@/server/matchScheduleNotifications', () => ({
  collectMatchScheduleChanges: (...args: unknown[]) =>
    collectMatchScheduleChangesMock(...args),
  notifyTeamsOfMatchScheduleUpdate: (...args: unknown[]) =>
    notifyTeamsOfMatchScheduleUpdateMock(...args),
  snapshotMatchScheduleState: (...args: unknown[]) =>
    snapshotMatchScheduleStateMock(...args),
}));
jest.mock('@/server/broadcast/presentation', () => ({
  refreshBroadcastPresentationForEvent: (...args: unknown[]) =>
    refreshBroadcastPresentationForEventMock(...args),
}));

import {
  POST as schedulePost,
  PUT as schedulePut,
} from '@/app/api/events/[eventId]/schedule/route';

type FixtureVariant = 'split' | 'unassigned' | 'missingPlayoffDivisions';

type MaintenanceAcceptedResponse = {
  status: 'ACCEPTED';
  eventId: string;
  operation: 'REBUILD';
  operationId: string;
  proposalRevision: string;
  acceptanceOperationId: string;
};

let fixtureVariant: FixtureVariant = 'split';

const eventId = 'event_1';
const start = new Date('2026-01-03T09:00:00.000Z');
const end = new Date('2026-02-28T13:00:00.000Z');

const divisionFor = (
  key: string,
  name: string,
  fieldId: string,
  teamIds: string[],
): Division => new Division(
  `${eventId}__division__${key}`,
  name,
  [fieldId],
  0,
  4,
  0,
  'LEAGUE',
  [],
  null,
  null,
  null,
  null,
  teamIds,
);

const makeLeague = (variant: FixtureVariant): League => {
  const beginnerTeamIds = variant === 'unassigned'
    ? ['team_beginner_1']
    : variant === 'missingPlayoffDivisions'
      ? ['team_beginner_1', 'team_beginner_2', 'team_beginner_3', 'team_beginner_4']
      : ['team_beginner_1', 'team_beginner_2'];
  const advancedTeamIds = variant === 'missingPlayoffDivisions'
    ? []
    : ['team_advanced_1', 'team_advanced_2'];
  const beginner = divisionFor(
    'beginner',
    'Beginner',
    'field_beginner',
    beginnerTeamIds,
  );
  const advanced = divisionFor(
    'advanced',
    'Advanced',
    'field_advanced',
    advancedTeamIds,
  );
  const divisions = variant === 'missingPlayoffDivisions'
    ? [beginner]
    : [beginner, advanced];
  const teamEntries: Array<[string, Division, string]> = variant === 'missingPlayoffDivisions'
    ? [
        ['team_beginner_1', beginner, 'Beginner Team 1'],
        ['team_beginner_2', beginner, 'Beginner Team 2'],
        ['team_beginner_3', beginner, 'Beginner Team 3'],
        ['team_beginner_4', beginner, 'Beginner Team 4'],
      ]
    : [
        ['team_beginner_1', beginner, 'Beginner Team 1'],
        ['team_beginner_2', beginner, 'Beginner Team 2'],
        ['team_advanced_1', advanced, 'Advanced Team 1'],
        ['team_advanced_2', advanced, 'Advanced Team 2'],
      ];
  const teams = Object.fromEntries(
    teamEntries.map(([id, division, name]): [string, Team] => [
      id,
      new Team({
        id,
        captainId: `captain_${id}`,
        division: variant === 'unassigned' && id === 'team_beginner_2'
          ? new Division('open', 'Open')
          : division,
        name,
        playerIds: [],
      }),
    ]),
  );
  const fields: Record<string, PlayingField> = {
    field_beginner: new PlayingField({
      id: 'field_beginner',
      name: 'Court Beginner',
      divisions: [beginner],
    }),
  };
  const timeSlots: TimeSlot[] = [
    new TimeSlot({
      id: 'slot_beginner',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: new Date('2026-01-03T00:00:00.000Z'),
      endDate: new Date('2026-02-28T00:00:00.000Z'),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 13 * 60,
      fieldIds: ['field_beginner'],
      divisions: [beginner],
    }),
  ];
  if (variant !== 'missingPlayoffDivisions') {
    fields.field_advanced = new PlayingField({
      id: 'field_advanced',
      name: 'Court Advanced',
      divisions: [advanced],
    });
    timeSlots.push(new TimeSlot({
      id: 'slot_advanced',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: new Date('2026-01-03T00:00:00.000Z'),
      endDate: new Date('2026-02-28T00:00:00.000Z'),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 13 * 60,
      fieldIds: ['field_advanced'],
      divisions: [advanced],
    }));
  }
  return new League({
    id: eventId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    name: variant === 'missingPlayoffDivisions'
      ? 'Split Playoffs Missing Divisions'
      : 'Split Division League',
    description: 'Regression coverage for split divisions',
    start,
    end,
    location: 'Main Gym',
    hostId: 'host_1',
    state: 'UNPUBLISHED',
    maxParticipants: 4,
    teamSizeLimit: 2,
    teamSignup: true,
    singleDivision: false,
    registeredTeamIds: Object.keys(teams),
    teams,
    divisions,
    fields,
    timeSlots,
    sportIds: ['sport_1'],
    eventType: 'LEAGUE',
    noFixedEndDateTime: false,
    gamesPerOpponent: 1,
    includePlayoffs: variant === 'missingPlayoffDivisions',
    splitLeaguePlayoffDivisions: variant === 'missingPlayoffDivisions',
    playoffTeamCount: variant === 'missingPlayoffDivisions' ? 3 : 0,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
    usesSets: false,
    setDurationMinutes: 0,
    setsPerMatch: 0,
    pointsToVictory: [],
    matches: {
      existing_match: {
        id: 'existing_match',
        locked: false,
      } as unknown as Match,
    },
  });
};

const maintenanceRequest = (operationId: string) => ({
  contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
  eventId,
  operation: 'REBUILD' as const,
  operationId,
  includePlaceholderTeams: false,
});

const jsonRequest = (
  url: string,
  body: unknown,
  method: 'POST' | 'PUT',
) => new NextRequest(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const routeContext = () => ({
  params: Promise.resolve({ eventId }),
});

describe('event schedule route - split divisions regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    operationRows.clear();
    fixtureVariant = 'split';
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
    prismaMock.events.findUnique.mockResolvedValue({
      id: eventId,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      automatedScheduling: true,
    });
    prismaMock.events.update.mockResolvedValue(undefined);
    prismaMock.divisions.update.mockResolvedValue(undefined);
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    acquireEventLockMock.mockResolvedValue(undefined);
    acquireFieldLocksMock.mockResolvedValue(undefined);
    acquireTimeSlotLocksMock.mockResolvedValue(undefined);
    canManageEventMock.mockResolvedValue(true);
    loadEventWithRelationsMock.mockImplementation(async () => makeLeague(fixtureVariant));
    loadEventScheduleStateMock.mockResolvedValue({
      revision: 'schedule-revision-1',
      hasProtectedHistory: false,
    });
    loadEventProtectedHistoryMock.mockResolvedValue({
      protectedMatchIds: new Set<string>(),
    });
    loadFieldBlockerCatalogMock.mockImplementation(
      async ({ lowerBound }: { lowerBound: Date }): Promise<FieldBlockerCatalog> => ({
        lowerBound,
        intervalsByFieldId: new Map(),
        recurringByFieldId: new Map(),
      }),
    );
    findFieldConflictsForIntervalMock.mockReturnValue([]);
    persistScheduledRosterTeamsMock.mockResolvedValue(undefined);
    saveMatchesMock.mockResolvedValue(undefined);
    saveEventScheduleMock.mockResolvedValue(undefined);
    deletePristineScheduleByEventMock.mockResolvedValue(undefined);
    collectPhaseDivisionsMock.mockReturnValue([]);
    collectPhaseTeamIdsByDivisionMock.mockReturnValue({});
    persistPhaseParticipantAssignmentsMock.mockResolvedValue(undefined);
    loadTeamCheckInsMock.mockResolvedValue([]);
    rescheduleEventMatchesPreservingLocksMock.mockResolvedValue(undefined);
    applyLeagueDivisionPlayoffReassignmentMock.mockReturnValue({
      affectedPlayoffDivisionIds: [],
      teamIdsByPlayoffDivision: {},
      phaseTeamIdsByDivision: {},
    });
    isTournamentPoolPlayStandingsEventMock.mockReturnValue(false);
    validatePlayoffDivisionReferenceCapacitiesMock.mockReturnValue([]);
    collectMatchScheduleChangesMock.mockReturnValue([]);
    snapshotMatchScheduleStateMock.mockReturnValue(new Map());
    notifyTeamsOfMatchScheduleUpdateMock.mockResolvedValue(undefined);
    refreshBroadcastPresentationForEventMock.mockResolvedValue(undefined);
    operationFindUniqueMock.mockImplementation(
      async ({ where }: { where: { operationId: string } }) =>
        operationRows.get(where.operationId) ?? null,
    );
    operationCreateMock.mockImplementation(
      async ({
        data,
      }: {
        data: Omit<MaintenanceOperationRow, 'acceptanceOperationId' | 'acceptedResponseJson'>;
      }) => {
        const row: MaintenanceOperationRow = {
          ...data,
          proposalRevision: data.proposalRevision ?? null,
          revisionBindingJson: data.revisionBindingJson ?? null,
          proposalJson: data.proposalJson ?? null,
          status: data.status ?? 'PROPOSED',
          acceptanceOperationId: null,
          acceptedResponseJson: null,
          requestJson: data.requestJson,
        };
        operationRows.set(row.operationId, row);
        return row;
      },
    );
    operationUpdateMock.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { operationId: string };
        data: Partial<MaintenanceOperationRow>;
      }) => {
        const current = operationRows.get(where.operationId);
        if (!current) throw new Error('Operation not found in test storage');
        const updated = { ...current, ...data };
        operationRows.set(where.operationId, updated);
        return updated;
      },
    );
  });

  it('returns a split-division proposal and persists its exact graph only after acceptance', async () => {
    const request = maintenanceRequest('split-rebuild');
    const proposalResponse = await schedulePost(
      jsonRequest('http://localhost/api/events/event_1/schedule', request, 'POST'),
      routeContext(),
    );
    const proposal = await proposalResponse.json() as MaintenanceProposalResponse;

    expect(proposalResponse.status).toBe(200);
    expect(proposal).toEqual(expect.objectContaining({
      status: 'PROPOSED',
      contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
      eventId,
      operation: 'REBUILD',
      operationId: request.operationId,
      proposalRevision: expect.any(String),
    }));
    expect(proposal.graph.event.divisionDetails.map((division) => ({
      id: division.id,
      name: division.name,
    }))).toEqual([
      { id: 'event_1__division__beginner', name: 'Beginner' },
      { id: 'event_1__division__advanced', name: 'Advanced' },
    ]);
    const expectedDivisionIds = [
      'event_1__division__advanced',
      'event_1__division__beginner',
    ];
    expect(proposal.graph.matches.map((match) => match.division).sort())
      .toEqual(expectedDivisionIds);
    expect(proposal.scheduleOutcome.matches
      .map((match) => match.division)
      .sort()).toEqual(expectedDivisionIds);
    expect(operationCreateMock).toHaveBeenCalledTimes(1);
    expect(operationCreateMock.mock.calls[0][0].data.requestJson).toEqual(request);
    expect(operationRows.get(request.operationId)).toEqual(
      expect.objectContaining({ status: 'PROPOSED' }),
    );
    expect(persistScheduledRosterTeamsMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).not.toHaveBeenCalled();
    expect(saveEventScheduleMock).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    expect(prismaMock.divisions.update).not.toHaveBeenCalled();

    const acceptanceRequest = {
      contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
      eventId: proposal.eventId,
      operation: proposal.operation,
      operationId: proposal.operationId,
      proposalRevision: proposal.proposalRevision,
      acceptanceOperationId: 'split-rebuild-acceptance',
    };
    const acceptanceResponse = await schedulePut(
      jsonRequest(
        'http://localhost/api/events/event_1/schedule',
        acceptanceRequest,
        'PUT',
      ),
      routeContext(),
    );
    const accepted = await acceptanceResponse.json() as MaintenanceAcceptedResponse;

    expect(accepted).toEqual(expect.objectContaining({
      status: 'ACCEPTED',
      eventId,
      operation: 'REBUILD',
      operationId: request.operationId,
      proposalRevision: proposal.proposalRevision,
      acceptanceOperationId: acceptanceRequest.acceptanceOperationId,
    }));
    expect(acceptanceResponse.status).toBe(200);
    expect(persistScheduledRosterTeamsMock).toHaveBeenCalledTimes(1);
    expect(saveMatchesMock).toHaveBeenCalledTimes(1);
    expect(saveEventScheduleMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.divisions.update.mock.calls.map(([input]) => ({
      id: input.where.id,
      teamIds: input.data.teamIds,
    }))).toEqual(proposal.graph.event.divisionDetails.map((division) => ({
      id: division.id,
      teamIds: division.teamIds,
    })));
    const persistedMatches = saveMatchesMock.mock.calls[0][1] as Array<{
      division: { id: string };
    }>;
    expect(persistedMatches.map((match) => match.division.id).sort())
      .toEqual(expectedDivisionIds);
    expect(operationUpdateMock).toHaveBeenCalledWith({
      where: { operationId: request.operationId },
      data: expect.objectContaining({
        status: 'ACCEPTED',
        acceptanceOperationId: acceptanceRequest.acceptanceOperationId,
      }),
    });
  });

  it('rejects unassigned split-division teams without a proposal or schedule writes', async () => {
    fixtureVariant = 'unassigned';
    const request = maintenanceRequest('split-unassigned');
    const response = await schedulePost(
      jsonRequest('http://localhost/api/events/event_1/schedule', request, 'POST'),
      routeContext(),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(String(json.error ?? '')).toContain('Unassigned teams');
    expect(String(json.error ?? '')).toContain('Beginner Team 2');
    expect(String(json.error ?? '')).not.toContain('team_beginner_2');
    expect(prismaMock.divisions.update).not.toHaveBeenCalled();
    expect(operationCreateMock).not.toHaveBeenCalled();
    expect(operationRows.size).toBe(0);
    expect(persistScheduledRosterTeamsMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).not.toHaveBeenCalled();
    expect(saveEventScheduleMock).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('rejects split playoffs without playoff divisions without a proposal or schedule writes', async () => {
    fixtureVariant = 'missingPlayoffDivisions';
    const request = maintenanceRequest('split-playoffs-missing');
    const response = await schedulePost(
      jsonRequest('http://localhost/api/events/event_1/schedule', request, 'POST'),
      routeContext(),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(String(json.error ?? '')).toContain('Split playoff divisions are enabled');
    expect(json.code).toBe('EDITOR_MAINTENANCE_INVALID');
    expect(prismaMock.divisions.update).not.toHaveBeenCalled();
    expect(operationCreateMock).not.toHaveBeenCalled();
    expect(operationRows.size).toBe(0);
    expect(persistScheduledRosterTeamsMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).not.toHaveBeenCalled();
    expect(saveEventScheduleMock).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });
});
