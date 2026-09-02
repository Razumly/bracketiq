#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  parseRequest,
  runPurgeTransaction,
} from '../purge-mobile-tournament-test-run.mjs';

const clone = (value) => structuredClone(value);
const cloneTables = (tables) => {
  const entries = tables instanceof Map ? [...tables.entries()] : Object.entries(tables);
  return new Map(entries.map(([name, rows]) => [name, clone(rows)]));
};
const rowsResult = (rows) => ({
  rows: rows.map(clone),
  rowCount: rows.length,
});
const valuesFor = (statement, column, params) => {
  const match = statement.match(new RegExp(`"${column}"\\s*=\\s*ANY\\(\\$(\\d+)::text\\[\\]\\)`));
  return match ? (params[Number(match[1]) - 1] ?? []) : null;
};
const hasValue = (values, value) => Array.isArray(values) && values.includes(value);

class FixtureClient {
  constructor(tables) {
    this.tables = cloneTables(tables);
    this.queryLog = [];
    this.transactionSnapshot = null;
    this.rollbackCount = 0;
    this.commitCount = 0;
  }

  table(name) {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name);
  }

  matchesWhere(statement, row, params) {
    const conditions = [...statement.matchAll(/"([^\"]+)"\s*=\s*ANY\(\$(\d+)::text\[\]\)/g)]
      .map((match) => ({ column: match[1], values: params[Number(match[2]) - 1] ?? [] }));
    if (conditions.length === 0) return false;
    const matches = conditions.map(({ column, values }) => hasValue(values, row[column]));
    return statement.includes(' OR ') ? matches.some(Boolean) : matches.every(Boolean);
  }

  selectRows(statement, params, tableName) {
    const source = this.table(tableName);
    return source.filter((row) => this.matchesWhere(statement, row, params));
  }

  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, ' ').trim();
    this.queryLog.push({ statement, params: clone(params) });
    if (statement === 'BEGIN') {
      this.transactionSnapshot = cloneTables(this.tables);
      return rowsResult([]);
    }
    if (statement === 'COMMIT') {
      this.transactionSnapshot = null;
      this.commitCount += 1;
      return rowsResult([]);
    }
    if (statement === 'ROLLBACK') {
      assert(this.transactionSnapshot, 'ROLLBACK requires an open fixture transaction');
      this.tables = cloneTables(this.transactionSnapshot);
      this.transactionSnapshot = null;
      this.rollbackCount += 1;
      return rowsResult([]);
    }

    const operationMatch = statement.match(/FROM "EventEditorCreateOperations"/);
    if (operationMatch && statement.startsWith('SELECT')) {
      const operations = this.table('EventEditorCreateOperations')
        .filter((row) => hasValue(params[0], row.createOperationId));
      if (statement.includes('COUNT(*)')) return { rows: [{ count: operations.length }], rowCount: 1 };
      return rowsResult(operations.map((row) => ({
        id: row.createOperationId,
        eventid: row.eventId,
        responsejson: row.responseJson ?? null,
        proposaljson: row.proposalJson ?? null,
        proposalstatus: row.proposalStatus,
        emaildelivery: row.emailDelivery,
      })));
    }

    if (statement.startsWith('SELECT to_jsonb')) {
      const tableMatch = statement.match(/FROM "([^"]+)"/);
      assert(tableMatch, `Fixture cannot identify snapshot table: ${statement}`);
      const tableName = tableMatch[1];
      const source = this.table(tableName);
      const rows = statement.includes('"id" = $1')
        ? source.filter((row) => row.id === params[0])
        : statement.includes('"chatId" IN')
          ? source.filter((row) => this.table('ChatGroup')
            .filter((group) => hasValue(params[0], group.teamId) || hasValue(params[1], group.id))
            .some((group) => group.id === row.chatId))
          : source.filter((row) => hasValue(params[0], row.id ?? row.teamId) || hasValue(params[1], row.id));
      return rowsResult(rows.map((row) => ({ row: clone(row) })));
    }

    if (statement.startsWith('SELECT 1 FROM "Events"')) {
      const rows = this.table('Events').filter((row) => row.leagueScoringConfigId === params[0]);
      return rowsResult(rows.map(() => ({ '?column?': 1 })));
    }

    if (statement.startsWith('SELECT COUNT(*)')) {
      const tableMatch = statement.match(/FROM "([^"]+)"/);
      assert(tableMatch, `Fixture cannot identify count table: ${statement}`);
      const tableName = tableMatch[1];
      const count = this.selectRows(statement, params, tableName).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    if (statement.startsWith('SELECT')) {
      const tableMatch = statement.match(/FROM "([^"]+)"/);
      if (!tableMatch) return rowsResult([]);
      const tableName = tableMatch[1];
      const source = this.table(tableName);
      const selected = this.selectRows(statement, params, tableName);
      if (statement.includes('"leagueScoringConfigId" = $1')) {
        return rowsResult(source
          .filter((row) => row.leagueScoringConfigId === params[0])
          .map(() => ({ '?column?': 1 })));
      }
      if (tableName === 'Events') {
        return rowsResult(selected.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          fieldids: row.fieldIds ?? [],
          timeslotids: row.timeSlotIds ?? [],
          leagueconfigid: row.leagueScoringConfigId ?? null,
        })));
      }
      if (tableName === 'Divisions') {
        return rowsResult(selected.map((row) => ({ id: row.id, eventid: row.eventId })));
      }
      return rowsResult(selected.map((row) => ({ id: row.id })));
    }

    if (statement.startsWith('DELETE')) {
      const tableMatch = statement.match(/DELETE FROM "([^"]+)"/);
      assert(tableMatch, `Fixture cannot identify delete table: ${statement}`);
      const tableName = tableMatch[1];
      const source = this.table(tableName);
      let matches;
      if (statement.includes('"chatId" IN')) {
        const chatIds = this.table('ChatGroup')
          .filter((group) => hasValue(params[0], group.teamId))
          .map((group) => group.id);
        matches = source.filter((row) => chatIds.includes(row.chatId));
      } else {
        matches = source.filter((row) => this.matchesWhere(statement, row, params));
      }
      const removed = new Set(matches);
      this.tables.set(tableName, source.filter((row) => !removed.has(row)));
      return { rows: [], rowCount: matches.length };
    }

    throw new Error(`Fixture does not support SQL: ${statement}`);
  }
}

const seededTeam = (id, index) => ({
  id,
  createdAt: `2026-08-01T00:00:0${index}.000Z`,
  updatedAt: `2026-08-01T00:00:0${index}.000Z`,
  archivedAt: null,
  archivedByUserId: null,
  archiveReason: null,
  eventId: null,
  kind: 'REGISTERED',
  playerIds: [`seed-player-${index}`],
  playerRegistrationIds: [],
  division: 'seed-division',
  divisionTypeId: null,
  wins: index,
  losses: 0,
  name: `Seeded Team ${index}`,
  captainId: 'user_host',
  managerId: 'user_host',
  headCoachId: null,
  coachIds: [],
  staffAssignmentIds: [],
  parentTeamId: null,
  pending: [],
  teamSize: 6,
  profileImageId: null,
  sport: 'Indoor Volleyball',
  affiliateUrl: null,
});

const baseFixture = ({
  proposal = false,
  acceptanceDispatched = false,
  createTerminal = false,
  acceptanceTerminal = false,
  attachSeededTeam = false,
  draftEventId = 'mobile_api_tournament_contract_100_tournament_contract',
} = {}) => {
  const eventId = '12345678-1234-1234-1234-123456789abc';
  const operationId = proposal ? 'operation-pending-proposal' : 'operation-accepted';
  const fieldId = `${draftEventId}_field_open`;
  const timeSlotId = `${draftEventId}_slot_1`;
  const divisionId = `${draftEventId}__division__open`;
  const runTeamId = `${eventId}__team__run-owned`;
  const seededTeamIds = ['team_1', 'team_2'];
  const receiptEventId = proposal ? '87654321-4321-4321-4321-abcdefabcdef' : eventId;
  const operation = {
    createOperationId: operationId,
    eventId: receiptEventId,
    responseJson: proposal ? null : { status: 'SAVED', snapshot: { eventId } },
    proposalJson: { status: 'PROPOSED', eventId: receiptEventId },
    proposalStatus: proposal ? 'PENDING' : 'ACCEPTED',
    emailDelivery: proposal ? 'PROPOSED' : 'NOT_REQUESTED',
  };
  const tables = {
    Organizations: [{ id: 'org_1', name: 'Seed Organization', updatedAt: '2026-08-01T00:00:00.000Z' }],
    EventTeams: [
      seededTeam('team_1', 1),
      seededTeam('team_2', 2),
      {
        id: runTeamId,
        eventId,
        kind: 'REGISTERED',
        playerIds: [],
        playerRegistrationIds: [],
        division: divisionId,
        divisionTypeId: null,
        wins: 0,
        losses: 0,
        name: 'Run-Owned Team',
        captainId: 'user_host',
        managerId: 'user_host',
        headCoachId: null,
        coachIds: [],
        staffAssignmentIds: [],
        parentTeamId: null,
        pending: [],
        teamSize: 6,
        profileImageId: null,
        sport: 'Indoor Volleyball',
        affiliateUrl: null,
      },
    ],
    ChatGroup: [
      { id: 'team:team_1', teamId: 'team_1', name: 'Seed Team One Chat', userIds: ['user_host'], hostId: 'user_host' },
      { id: 'team:team_2', teamId: null, name: 'Legacy Seed Team Two Chat', userIds: ['user_host'], hostId: 'user_host' },
      { id: `team:${runTeamId}`, teamId: runTeamId, name: 'Run Team Chat', userIds: ['user_host'], hostId: 'user_host' },
    ],
    Messages: [
      { id: 'seed-message-1', chatId: 'team:team_1', body: 'Seed state one' },
      { id: 'seed-message-2', chatId: 'team:team_2', body: 'Seed state two' },
      { id: 'run-message-1', chatId: `team:${runTeamId}`, body: 'Run state' },
    ],
    Events: proposal ? [] : [{
      id: eventId,
      organizationId: 'org_1',
      fieldIds: [fieldId],
      timeSlotIds: [timeSlotId],
      leagueScoringConfigId: null,
    }],
    Fields: proposal ? [] : [{ id: fieldId }],
    TimeSlots: proposal ? [] : [{ id: timeSlotId }],
    Divisions: proposal ? [] : [{ id: divisionId, eventId }],
    Matches: proposal ? [] : [{ id: 'run-match-1', eventId, team1Id: runTeamId }],
    MatchSegments: proposal ? [] : [{ id: 'run-segment-1', matchId: 'run-match-1', eventId }],
    EventRegistrations: proposal ? [] : [{ id: 'run-registration-1', eventId, eventTeamId: runTeamId }],
    EventDivisionPhaseSources: proposal ? [] : [{ id: 'run-phase-source-1', eventId }],
    EventDivisionPhaseParticipants: proposal ? [] : [{ id: 'run-phase-participant-1', eventId }],
    EventEditorCreateOperations: [operation],
  };
  if (attachSeededTeam) tables.EventTeams[0].eventId = eventId;
  const request = parseRequest(JSON.stringify({
    eventIds: proposal ? [draftEventId] : [eventId],
    seededOrganizationId: 'org_1',
    seededTeamIds,
    operations: [{
      draftEventId,
      resolvedEventId: proposal ? '' : eventId,
      createDispatchStarted: true,
      createDispatchTerminal: createTerminal,
      acceptanceDispatchStarted: acceptanceDispatched,
      acceptanceDispatchTerminal: acceptanceTerminal,
      createOperationId: operationId,
      fieldIds: [fieldId],
      timeSlotIds: [timeSlotId],
      divisionIds: [divisionId],
    }],
  }));
  return { tables, request, eventId, runTeamId, seededTeamIds, operationId };
};

const seededState = (client, seededTeamIds) => {
  const chats = client.table('ChatGroup').filter((row) =>
    seededTeamIds.includes(row.teamId) || seededTeamIds.some((teamId) => row.id === `team:${teamId}`));
  const chatIds = new Set(chats.map((row) => row.id));
  return {
    teams: client.table('EventTeams').filter((row) => seededTeamIds.includes(row.id)),
    chats,
    messages: client.table('Messages').filter((row) => chatIds.has(row.chatId)),
  };
};

const runSuccessfulPurge = async () => {
  const fixture = baseFixture();
  const client = new FixtureClient(fixture.tables);
  const before = seededState(client, fixture.seededTeamIds);
  const result = await runPurgeTransaction(client, fixture.request);
  assert.equal(client.commitCount, 1);
  assert.equal(client.rollbackCount, 0);
  assert.deepEqual(seededState(client, fixture.seededTeamIds), before);
  assert.equal(client.table('Events').length, 0);
  assert.equal(client.table('EventTeams').filter((row) => row.eventId === fixture.eventId).length, 0);
  assert.equal(client.table('ChatGroup').length, before.chats.length);
  assert.equal(client.table('Messages').length, before.messages.length);
  assert.equal(client.table('Matches').length, 0);
  assert.equal(client.table('MatchSegments').length, 0);
  assert.equal(client.table('EventRegistrations').length, 0);
  assert.equal(client.table('EventDivisionPhaseSources').length, 0);
  assert.equal(client.table('EventDivisionPhaseParticipants').length, 0);
  assert.equal(client.table('Fields').length, 0);
  assert.equal(client.table('TimeSlots').length, 0);
  assert.equal(client.table('Divisions').length, 0);
  assert.equal(client.table('EventEditorCreateOperations').length, 0);
  const eventTeamDeletes = client.queryLog.filter(({ statement }) => statement === 'DELETE FROM "EventTeams" WHERE "id" = ANY($1::text[])');
  assert.deepEqual(eventTeamDeletes.map(({ params }) => params), [[[fixture.runTeamId]]]);
  assert(!client.queryLog.some(({ statement }) => statement.includes('FROM "Teams"')));
  assert.equal(result.residual.Events, 0);
  assert.equal(result.residual.EventTeams, 0);
};
const runPartialDraftIdContract = async () => {
  const fixture = baseFixture({
    draftEventId: 'mobile_api_tournament_partial_100_tournament_contract',
  });
  const client = new FixtureClient(fixture.tables);
  const result = await runPurgeTransaction(client, fixture.request);
  assert.equal(result.residual.Events, 0);
  assert.equal(client.commitCount, 1);
  assert.equal(client.table('EventEditorCreateOperations').length, 0);
};


const runPendingProposalRollback = async () => {
  const fixture = baseFixture({ proposal: true });
  const client = new FixtureClient(fixture.tables);
  const before = cloneTables(client.tables);
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };
  try {
    await assert.rejects(
      runPurgeTransaction(client, fixture.request),
      (error) => error instanceof Error
        && error.message.includes('did not settle before cleanup')
        && error.message.includes(fixture.operationId),
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  assert.equal(client.commitCount, 0);
  assert.equal(client.rollbackCount, 1);
  assert.deepEqual(client.tables, before);
};
const runTypedCreateRejectionPurge = async () => {
  const fixture = baseFixture();
  const operation = fixture.request.operations[0];
  const request = parseRequest(JSON.stringify({
    eventIds: [],
    seededOrganizationId: 'org_1',
    seededTeamIds: fixture.seededTeamIds,
    operations: [{
      ...operation,
      resolvedEventId: '',
      createDispatchTerminal: true,
      acceptanceDispatchStarted: false,
      acceptanceDispatchTerminal: false,
    }],
  }));
  fixture.tables.Events = [];
  fixture.tables.Fields = [];
  fixture.tables.TimeSlots = [];
  fixture.tables.Divisions = [];
  fixture.tables.Matches = [];
  fixture.tables.MatchSegments = [];
  fixture.tables.EventRegistrations = [];
  fixture.tables.EventDivisionPhaseSources = [];
  fixture.tables.EventDivisionPhaseParticipants = [];
  fixture.tables.EventEditorCreateOperations[0] = {
    ...fixture.tables.EventEditorCreateOperations[0],
    responseJson: null,
    proposalJson: null,
    proposalStatus: 'NONE',
    emailDelivery: 'PROCESSING',
  };
  const client = new FixtureClient(fixture.tables);
  await runPurgeTransaction(client, request);
  assert.equal(client.commitCount, 1);
  assert.equal(client.rollbackCount, 0);
  assert.equal(client.table('EventEditorCreateOperations').length, 0);
};

const runTypedAcceptanceRejectionPurge = async () => {
  const fixture = baseFixture({
    proposal: true,
    acceptanceDispatched: true,
    acceptanceTerminal: true,
  });
  const client = new FixtureClient(fixture.tables);
  await runPurgeTransaction(client, fixture.request);
  assert.equal(client.commitCount, 1);
  assert.equal(client.rollbackCount, 0);
  assert.equal(client.table('EventEditorCreateOperations').length, 0);
  assert(client.queryLog.some(({ statement }) => statement.endsWith('FOR UPDATE')));
};

const runDurableResultWithProcessingDeliveryPurge = async () => {
  for (const acceptanceDispatched of [false, true]) {
    const fixture = baseFixture({ acceptanceDispatched });
    fixture.tables.EventEditorCreateOperations[0].emailDelivery = 'PROCESSING';
    const client = new FixtureClient(fixture.tables);
    await runPurgeTransaction(client, fixture.request);
    assert.equal(client.commitCount, 1);
    assert.equal(client.rollbackCount, 0);
    assert.equal(client.table('EventEditorCreateOperations').length, 0);
  }
};


const runUnresolvedAcceptanceRollback = async () => {
  const fixture = baseFixture({ proposal: true, acceptanceDispatched: true });
  const client = new FixtureClient(fixture.tables);
  const before = cloneTables(client.tables);
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };
  try {
    await assert.rejects(
      runPurgeTransaction(client, fixture.request),
      (error) => error instanceof Error
        && error.message.includes('did not settle before cleanup')
        && error.message.includes(fixture.operationId),
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  assert.equal(client.commitCount, 0);
  assert.equal(client.rollbackCount, 1);
  assert.deepEqual(client.tables, before);
};

const runSeedAttachmentGuard = async () => {
  const fixture = baseFixture({ attachSeededTeam: true });
  const client = new FixtureClient(fixture.tables);
  await assert.rejects(
    runPurgeTransaction(client, fixture.request),
    (error) => error instanceof Error && error.message.includes('Seeded EventTeams were attached'),
  );
  assert.equal(client.commitCount, 0);
  assert.equal(client.rollbackCount, 1);
};

await runSuccessfulPurge();
await runPartialDraftIdContract();
await runPendingProposalRollback();
await runTypedCreateRejectionPurge();
await runTypedAcceptanceRejectionPurge();
await runDurableResultWithProcessingDeliveryPurge();
await runUnresolvedAcceptanceRollback();
await runSeedAttachmentGuard();
process.stdout.write('Mobile cleanup behavioral contract passed\n');
