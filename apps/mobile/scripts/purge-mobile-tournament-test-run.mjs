import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const siteDir = process.env.MVP_SITE_DIR ?? process.cwd();
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REQUIRED_DATABASE_NAME = /^(?:mvp|test|dev|local|e2e|ci)/i;
const FORBIDDEN_DATABASE_NAME = /(prod|production|live)/i;
const DRAFT_EVENT_ID_PATTERN = /^mobile_api_tournament_(?:contract|partial)_[0-9]+_tournament_contract$/;
const SERVER_EVENT_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f-]{27}|client_[a-z0-9_]+)$/i;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const RECEIPT_SETTLE_ATTEMPTS = 360;
const RECEIPT_SETTLE_DELAY_MS = 100;

const uniqueIds = (values, label) => {
  assert(Array.isArray(values), `${label} must be an array`);
  const ids = [...new Set(values.map((value) => String(value).trim()))];
  assert(ids.every((value) => value.length > 0 && ID_PATTERN.test(value)), `${label} contains an invalid identifier`);
  return ids;
};

const validateDatabaseUrl = (raw) => {
  assert(typeof raw === 'string' && raw.trim(), 'MVP_TEST_DATABASE_URL is required');
  const url = new URL(raw);
  assert(['postgres', 'postgresql'].includes(url.protocol.replace(':', '')), 'MVP_TEST_DATABASE_URL must use PostgreSQL');
  assert(LOOPBACK_HOSTS.has((url.hostname || '').toLowerCase()), 'MVP_TEST_DATABASE_URL must use a loopback host');
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  assert(REQUIRED_DATABASE_NAME.test(databaseName) || ['test', 'dev', 'local', 'e2e', 'ci'].some((term) => databaseName.toLowerCase().includes(term)) || databaseName.toLowerCase() === 'bracketiq_repeating_time_slots', 'MVP_TEST_DATABASE_URL must name an mvp/test/dev/local/e2e/ci database');
  assert(!FORBIDDEN_DATABASE_NAME.test(databaseName), 'MVP_TEST_DATABASE_URL must not target a production database');
  const forbiddenParameters = new Set(['connectionstring', 'host', 'hostaddr', 'port', 'socket', 'target_session_attrs']);
  for (const key of url.searchParams.keys()) {
    assert(!forbiddenParameters.has(key.toLowerCase()), `MVP_TEST_DATABASE_URL must not override ${key}`);
  }
  return raw.trim();
};

const parseRequest = (raw) => {
  const request = JSON.parse(raw);
  assert(request && typeof request === 'object', 'Purge request must be an object');
  const eventIds = uniqueIds(request.eventIds ?? [], 'eventIds');
  const operations = Array.isArray(request.operations) ? request.operations : [];
  assert(eventIds.length > 0 || operations.length > 0, 'Purge request must identify a run');
  const seededOrganizationId = String(request.seededOrganizationId ?? '').trim();
  assert(seededOrganizationId && ID_PATTERN.test(seededOrganizationId), 'seededOrganizationId is required');
  const seededTeamIds = uniqueIds(request.seededTeamIds ?? [], 'seededTeamIds');
  assert(seededTeamIds.length > 0, 'seededTeamIds is required');
  const normalizedOperations = operations.map((operation, index) => {
    assert(operation && typeof operation === 'object', `operations[${index}] must be an object`);
    const draftEventId = String(operation.draftEventId ?? '').trim();
    assert(draftEventId && DRAFT_EVENT_ID_PATTERN.test(draftEventId), `operations[${index}] has an invalid draft event id`);
    const resolvedEventId = String(operation.resolvedEventId ?? '').trim();
    assert(!resolvedEventId || SERVER_EVENT_ID_PATTERN.test(resolvedEventId), `operations[${index}] has an invalid resolved event id`);
    const createDispatchStarted = operation.createDispatchStarted;
    const createDispatchTerminal = operation.createDispatchTerminal;
    const acceptanceDispatchStarted = operation.acceptanceDispatchStarted;
    const acceptanceDispatchTerminal = operation.acceptanceDispatchTerminal;
    assert(typeof createDispatchStarted === 'boolean', `operations[${index}].createDispatchStarted must be a boolean`);
    assert(typeof createDispatchTerminal === 'boolean', `operations[${index}].createDispatchTerminal must be a boolean`);
    assert(typeof acceptanceDispatchStarted === 'boolean', `operations[${index}].acceptanceDispatchStarted must be a boolean`);
    assert(typeof acceptanceDispatchTerminal === 'boolean', `operations[${index}].acceptanceDispatchTerminal must be a boolean`);
    assert(!createDispatchTerminal || createDispatchStarted, `operations[${index}] cannot complete create before dispatch`);
    assert(!acceptanceDispatchStarted || (createDispatchStarted && !createDispatchTerminal), `operations[${index}] cannot dispatch acceptance before a non-terminal create`);
    assert(!acceptanceDispatchTerminal || acceptanceDispatchStarted, `operations[${index}] cannot complete acceptance before dispatch`);
    const createOperationId = String(operation.createOperationId ?? '').trim();
    assert(createOperationId && ID_PATTERN.test(createOperationId), `operations[${index}] has an invalid create operation id`);
    return {
      draftEventId,
      resolvedEventId,
      createDispatchStarted,
      createDispatchTerminal,
      acceptanceDispatchStarted,
      acceptanceDispatchTerminal,
      createOperationId,
      fieldIds: uniqueIds(operation.fieldIds ?? [], `operations[${index}].fieldIds`),
      timeSlotIds: uniqueIds(operation.timeSlotIds ?? [], `operations[${index}].timeSlotIds`),
      divisionIds: uniqueIds(operation.divisionIds ?? [], `operations[${index}].divisionIds`),
    };
  });
  const allEventIds = uniqueIds(
    [...eventIds, ...normalizedOperations.map((operation) => operation.draftEventId), ...normalizedOperations.map((operation) => operation.resolvedEventId).filter(Boolean)],
    'eventIds',
  );
  for (const eventId of allEventIds) {
    assert(DRAFT_EVENT_ID_PATTERN.test(eventId) || SERVER_EVENT_ID_PATTERN.test(eventId), `event id ${eventId} is not a mobile Tournament run id`);
  }
  const operationIds = uniqueIds(normalizedOperations.map((operation) => operation.createOperationId), 'createOperationIds');
  const fieldIds = uniqueIds(normalizedOperations.flatMap((operation) => operation.fieldIds), 'fieldIds');
  const timeSlotIds = uniqueIds(normalizedOperations.flatMap((operation) => operation.timeSlotIds), 'timeSlotIds');
  const divisionIds = uniqueIds(normalizedOperations.flatMap((operation) => operation.divisionIds), 'divisionIds');
  for (const operation of normalizedOperations) {
    for (const id of operation.fieldIds) assert(id.startsWith(`${operation.draftEventId}_field_`), `Field ${id} is not owned by ${operation.draftEventId}`);
    for (const id of operation.timeSlotIds) assert(id.startsWith(`${operation.draftEventId}_slot_`), `Time slot ${id} is not owned by ${operation.draftEventId}`);
    for (const id of operation.divisionIds) assert(id.startsWith(`${operation.draftEventId}__division__`), `Division ${id} is not owned by ${operation.draftEventId}`);
  }
  return { eventIds: allEventIds, operations: normalizedOperations, operationIds, fieldIds, timeSlotIds, divisionIds, seededOrganizationId, seededTeamIds };
};

const idsParam = (ids) => ids;
const has = (ids) => ids.length > 0;
const rows = (result) => result.rows;
const idsFromRows = (result) => result.rows.map((row) => row.id);
const deleteByIds = async (client, table, ids) => {
  if (!has(ids)) return 0;
  const result = await client.query(`DELETE FROM "${table}" WHERE "id" = ANY($1::text[])`, [idsParam(ids)]);
  return result.rowCount ?? 0;
};
const deleteByEventIds = async (client, table, eventIds) => {
  if (!has(eventIds)) return 0;
  const result = await client.query(`DELETE FROM "${table}" WHERE "eventId" = ANY($1::text[])`, [idsParam(eventIds)]);
  return result.rowCount ?? 0;
};
const readOperationReceipts = async (client, operationIds) => (
  operationIds.length === 0
    ? { rows: [] }
    : await client.query(
      `SELECT "createOperationId" AS id, "eventId" AS eventid,
              "responseJson" AS responsejson, "proposalJson" AS proposaljson,
              "proposalStatus" AS proposalstatus, "emailDelivery" AS emaildelivery
         FROM "EventEditorCreateOperations"
        WHERE "createOperationId" = ANY($1::text[])`,
      [operationIds],
    )
);
const isPendingProposalReceipt = (receipt) => (
  receipt.proposaljson !== null
  && receipt.proposalstatus === 'PENDING'
  && receipt.emaildelivery === 'PROPOSED'
);
const isTerminalFailedCreateReceipt = (receipt, operation) => (
  operation.createDispatchTerminal
  && !operation.acceptanceDispatchStarted
  && !operation.acceptanceDispatchTerminal
  && SERVER_EVENT_ID_PATTERN.test(receipt.eventid)
  && receipt.responsejson === null
  && receipt.proposaljson === null
  && receipt.proposalstatus === 'NONE'
  && receipt.emaildelivery === 'PROCESSING'
);
const isSettledReceipt = (receipt, operation) => {
  if (!receipt) return false;
  if (isTerminalFailedCreateReceipt(receipt, operation)) return true;
  if (isPendingProposalReceipt(receipt)) {
    return operation.acceptanceDispatchStarted && operation.acceptanceDispatchTerminal;
  }
  if (operation.acceptanceDispatchTerminal) {
    return receipt.responsejson !== null
      && receipt.proposalstatus === 'ACCEPTED';
  }
  if (operation.acceptanceDispatchStarted) {
    return receipt.responsejson !== null
      && receipt.proposalstatus === 'ACCEPTED';
  }
  return receipt.responsejson !== null;
};
const unresolvedOperationIds = (request, operationRows) => {
  const operationById = new Map(operationRows.map((row) => [row.id, row]));
  return request.operations
    .filter((operation) => {
      const receipt = operationById.get(operation.createOperationId);
      const terminalOutcome = operation.createDispatchTerminal || operation.acceptanceDispatchTerminal;
      return (operation.createDispatchStarted && !receipt && !terminalOutcome)
        || Boolean(receipt && !isSettledReceipt(receipt, operation));
    })
    .map((operation) => operation.createOperationId);
};
const lockOperationReceipts = async (client, request) => {
  const result = request.operationIds.length === 0
    ? { rows: [] }
    : await client.query(
      `SELECT "createOperationId" AS id, "eventId" AS eventid,
              "responseJson" AS responsejson, "proposalJson" AS proposaljson,
              "proposalStatus" AS proposalstatus, "emailDelivery" AS emaildelivery
         FROM "EventEditorCreateOperations"
        WHERE "createOperationId" = ANY($1::text[])
        FOR UPDATE`,
      [request.operationIds],
    );
  const unresolved = unresolvedOperationIds(request, result.rows);
  assert(unresolved.length === 0, `Operation receipts changed while cleanup was polling: ${unresolved.join(", ")}`);
  const operationById = new Map(result.rows.map((row) => [row.id, row]));
  for (const operation of request.operations) {
    const receipt = operationById.get(operation.createOperationId);
    if (!receipt || !isPendingProposalReceipt(receipt)) continue;
    assert(
      operation.acceptanceDispatchStarted && operation.acceptanceDispatchTerminal,
      `Acceptance receipt ${operation.createOperationId} is still pending or in flight`,
    );
    assert(
      receipt.id === operation.createOperationId,
      `Acceptance receipt ${operation.createOperationId} is not owned by the requested operation`,
    );
    assert(
      SERVER_EVENT_ID_PATTERN.test(receipt.eventid),
      `Acceptance receipt ${operation.createOperationId} has no server-owned event id`,
    );
  }
  return result;
};

const resolveOperationReceipts = async (client, request) => {
  let operationResult = { rows: [] };
  for (let attempt = 0; attempt < RECEIPT_SETTLE_ATTEMPTS; attempt += 1) {
    operationResult = await readOperationReceipts(client, request.operationIds);
    const unresolved = unresolvedOperationIds(request, operationResult.rows);
    if (unresolved.length === 0) return lockOperationReceipts(client, request);
    if (attempt + 1 < RECEIPT_SETTLE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RECEIPT_SETTLE_DELAY_MS));
    }
  }
  const unresolved = unresolvedOperationIds(request, operationResult.rows);
  assert(unresolved.length === 0, `Dispatched create or acceptance operation receipts did not settle before cleanup: ${unresolved.join(", ")}`);
  return lockOperationReceipts(client, request);
};

const assertOwnedResources = (request, eventRows, operationRows) => {
  const byEventId = new Map(eventRows.map((row) => [row.id, row]));
  const operationById = new Map(operationRows.map((row) => [row.id, row]));
  for (const operation of request.operations) {
    const receipt = operationById.get(operation.createOperationId);
    const eventId = receipt?.eventid || operation.draftEventId;
    const event = byEventId.get(eventId);
    if (!event) continue;
    for (const fieldId of operation.fieldIds) assert((event.fieldids ?? []).includes(fieldId), `Field ${fieldId} is not listed by event ${event.id}`);
    for (const timeSlotId of operation.timeSlotIds) assert((event.timeslotids ?? []).includes(timeSlotId), `Time slot ${timeSlotId} is not listed by event ${event.id}`);
  }
};

const snapshotSeededRows = async (client, request) => {
  const organization = await client.query(
    `SELECT to_jsonb(o) AS row FROM "Organizations" o WHERE "id" = $1`,
    [request.seededOrganizationId],
  );
  const eventTeams = await client.query(
    `SELECT to_jsonb(t) AS row FROM "EventTeams" t WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
    [request.seededTeamIds],
  );
  const chatGroupIds = request.seededTeamIds.map((teamId) => `team:${teamId}`);
  const chatGroups = await client.query(
    `SELECT to_jsonb(g) AS row FROM "ChatGroup" g
       WHERE "teamId" = ANY($1::text[]) OR "id" = ANY($2::text[])
       ORDER BY "id"`,
    [request.seededTeamIds, chatGroupIds],
  );
  const messages = await client.query(
    `SELECT to_jsonb(m) AS row FROM "Messages" m
       WHERE "chatId" IN (
         SELECT "id" FROM "ChatGroup"
          WHERE "teamId" = ANY($1::text[]) OR "id" = ANY($2::text[])
       )
       ORDER BY "id"`,
    [request.seededTeamIds, chatGroupIds],
  );
  assert(organization.rowCount === 1, `Seeded organization ${request.seededOrganizationId} was not found`);
  assert(eventTeams.rowCount === request.seededTeamIds.length, 'One or more seeded EventTeams were not found');
  return {
    organization: organization.rows[0].row,
    eventTeams: eventTeams.rows.map((row) => row.row),
    chatGroups: chatGroups.rows.map((row) => row.row),
    messages: messages.rows.map((row) => row.row),
  };
};

const purge = async (client, request) => {
  const operationResult = await resolveOperationReceipts(client, request);
  const operationById = new Map(operationResult.rows.map((row) => [row.id, row]));
  for (const operation of request.operations) {
    const receipt = operationById.get(operation.createOperationId);
    if (operation.resolvedEventId) {
      assert(receipt, `Create operation ${operation.createOperationId} has no receipt for resolved event id`);
      assert(operation.resolvedEventId === receipt.eventid, `Create operation ${operation.createOperationId} resolved to an unexpected event id`);
    }
    if (!receipt) continue;
    assert(SERVER_EVENT_ID_PATTERN.test(receipt.eventid), `Create operation ${operation.createOperationId} has an invalid event id`);
  }
  const receiptOperationIds = operationResult.rows.map((row) => row.id);
  const trustedEventIds = new Set([
    ...request.operations.map((operation) => operation.draftEventId),
    ...operationResult.rows.map((row) => row.eventid),
  ]);
  for (const eventId of request.eventIds) {
    assert(trustedEventIds.has(eventId) || DRAFT_EVENT_ID_PATTERN.test(eventId), `Event ${eventId} is not tied to a prepared Tournament create operation`);
  }
  const runEventIds = [...new Set([
    ...request.eventIds,
    ...operationResult.rows.map((row) => row.eventid),
  ])];
  const eventResult = await client.query(
    `SELECT "id", "organizationId", "fieldIds" AS fieldids, "timeSlotIds" AS timeslotids, "leagueScoringConfigId" AS leagueconfigid
       FROM "Events" WHERE "id" = ANY($1::text[])`,
    [runEventIds],
  );
  const eventRows = rows(eventResult);
  assertOwnedResources(request, eventRows, operationResult.rows);

  const seededBefore = await snapshotSeededRows(client, request);
  const actualEventIds = [...new Set(eventRows.map((row) => row.id))];
  const fieldIds = request.fieldIds;
  const timeSlotIds = request.timeSlotIds;
  const divisionIds = request.divisionIds;

  const eventTeamResult = await client.query(
    `SELECT "id" FROM "EventTeams" WHERE "eventId" = ANY($1::text[])`,
    [runEventIds],
  );
  const seededTeamIdSet = new Set(request.seededTeamIds);
  const eventTeamIds = idsFromRows(eventTeamResult);
  const attachedSeededTeamIds = eventTeamIds.filter((id) => seededTeamIdSet.has(id));
  assert(
    attachedSeededTeamIds.length === 0,
    `Seeded EventTeams were attached to the requested Tournament run: ${attachedSeededTeamIds.join(", ")}`,
  );
  const matchResult = await client.query(
    `SELECT "id" FROM "Matches" WHERE "eventId" = ANY($1::text[])`,
    [runEventIds],
  );
  const matchIds = idsFromRows(matchResult);
  const segmentResult = await client.query(
    `SELECT "id" FROM "MatchSegments" WHERE "matchId" = ANY($1::text[]) OR "eventId" = ANY($2::text[])`,
    [matchIds, runEventIds],
  );
  const segmentIds = idsFromRows(segmentResult);
  const overlayResult = await client.query(`SELECT "id" FROM "BroadcastOverlays" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  const overlayIds = idsFromRows(overlayResult);
  const registrationResult = await client.query(`SELECT "id" FROM "EventRegistrations" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  const registrationIds = idsFromRows(registrationResult);
  const signedDocumentResult = await client.query(`SELECT "id" FROM "SignedDocuments" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  const signedDocumentIds = idsFromRows(signedDocumentResult);
  const satisfactionResult = await client.query(`SELECT "id" FROM "DocumentRequirementSatisfactions" WHERE "scopeId" = ANY($1::text[])`, [runEventIds]);
  const satisfactionIds = idsFromRows(satisfactionResult);
  const divisionResult = await client.query(`SELECT "id", "eventId" AS eventid FROM "Divisions" WHERE "id" = ANY($1::text[])`, [divisionIds]);
  for (const division of divisionResult.rows) {
    assert(runEventIds.includes(division.eventid), `Division ${division.id} is not owned by the requested Tournament run`);
  }
  const bookingResult = await client.query(`SELECT "id" FROM "RentalBookings" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  const bookingIds = idsFromRows(bookingResult);
  const billResult = await client.query(`SELECT "id" FROM "Bills" WHERE "eventId" = ANY($1::text[]) OR "slotId" = ANY($2::text[])`, [runEventIds, timeSlotIds]);
  const billIds = idsFromRows(billResult);
  const billPaymentResult = billIds.length === 0
    ? { rows: [] }
    : await client.query(`SELECT "id" FROM "BillPayments" WHERE "billId" = ANY($1::text[])`, [billIds]);
  const billPaymentIds = idsFromRows(billPaymentResult);
  const staffAssignmentResult = await client.query(`SELECT "id" FROM "StaffScheduleAssignments" WHERE "timeSlotId" = ANY($1::text[])`, [timeSlotIds]);
  const staffAssignmentIds = idsFromRows(staffAssignmentResult);
  const staffItemResult = await client.query(
    `SELECT "id" FROM "StaffPayRunItem"
      WHERE "eventId" = ANY($1::text[]) OR "eventTeamId" = ANY($2::text[])
         OR "eventStaffAssignmentId" IN (SELECT "id" FROM "EventStaffAssignments" WHERE "eventId" = ANY($1::text[]))
         OR "staffScheduleAssignmentId" = ANY($3::text[])`,
    [runEventIds, eventTeamIds, staffAssignmentIds],
  );
  const staffItemIds = idsFromRows(staffItemResult);
  const runChatGroupResult = await client.query(
    `SELECT "id" FROM "ChatGroup"
       WHERE "teamId" = ANY($1::text[]) OR "id" = ANY($2::text[])`,
    [eventTeamIds, eventTeamIds.map((teamId) => `team:${teamId}`)],
  );
  const runChatGroupIds = idsFromRows(runChatGroupResult);

  const deleted = {};
  const record = (table, count) => { deleted[table] = count; };
  record('DocumentRequirementSatisfactionEvidence', await client.query(`DELETE FROM "DocumentRequirementSatisfactionEvidence" WHERE "satisfactionId" = ANY($1::text[]) OR "signedDocumentId" = ANY($2::text[])`, [satisfactionIds, signedDocumentIds]).then((result) => result.rowCount ?? 0));
  record('DocumentEvidenceAuditEvents', await client.query(`DELETE FROM "DocumentEvidenceAuditEvents" WHERE "signedDocumentId" = ANY($1::text[])`, [signedDocumentIds]).then((result) => result.rowCount ?? 0));
  record('BoldSignSyncOperations', await deleteByEventIds(client, 'BoldSignSyncOperations', runEventIds));
  record('SignedDocuments', await deleteByEventIds(client, 'SignedDocuments', runEventIds));
  record('DocumentRequirementSatisfactions', await deleteByIds(client, 'DocumentRequirementSatisfactions', satisfactionIds));
  record('RegistrationQuestionResponses', await client.query(`DELETE FROM "RegistrationQuestionResponses" WHERE "scopeId" = ANY($1::text[])`, [runEventIds]).then((result) => result.rowCount ?? 0));
  record('RegistrationQuestions', await client.query(`DELETE FROM "RegistrationQuestions" WHERE "scopeId" = ANY($1::text[])`, [runEventIds]).then((result) => result.rowCount ?? 0));
  record('ParentChildLinks', await client.query(`DELETE FROM "ParentChildLinks" WHERE "parentId" = ANY($1::text[]) OR "childId" = ANY($1::text[])`, [registrationIds]).then((result) => result.rowCount ?? 0));
  record('DiscountCodeRedemptions', await client.query(`DELETE FROM "DiscountCodeRedemptions" WHERE "registrationId" = ANY($1::text[])`, [registrationIds]).then((result) => result.rowCount ?? 0));
  record('DiscountCodeReservations', await client.query(`DELETE FROM "DiscountCodeReservations" WHERE "registrationId" = ANY($1::text[])`, [registrationIds]).then((result) => result.rowCount ?? 0));
  record('EventRegistrations', await deleteByEventIds(client, 'EventRegistrations', runEventIds));
  record('MatchOperationReceipts', await deleteByEventIds(client, 'MatchOperationReceipts', runEventIds));
  record('MatchRosterEntries', await deleteByEventIds(client, 'MatchRosterEntries', runEventIds));
  record('TeamCheckIns', await deleteByEventIds(client, 'TeamCheckIns', runEventIds));
  record('MatchIncidents', await client.query(`DELETE FROM "MatchIncidents" WHERE "eventId" = ANY($1::text[]) OR "matchId" = ANY($2::text[])`, [runEventIds, matchIds]).then((result) => result.rowCount ?? 0));
  record('MatchSegments', await deleteByIds(client, 'MatchSegments', segmentIds));
  record('Matches', await deleteByEventIds(client, 'Matches', runEventIds));
  record('EventDivisionPhaseParticipants', await deleteByEventIds(client, 'EventDivisionPhaseParticipants', runEventIds));
  record('EventDivisionPhaseSources', await deleteByEventIds(client, 'EventDivisionPhaseSources', runEventIds));
  record('EventTeamStaffAssignments', await client.query(`DELETE FROM "EventTeamStaffAssignments" WHERE "eventTeamId" = ANY($1::text[])`, [eventTeamIds]).then((result) => result.rowCount ?? 0));
  record('TeamInviteEventSyncs', await deleteByEventIds(client, 'TeamInviteEventSyncs', runEventIds));
  record('TeamStaffLaborEntries', await client.query(`DELETE FROM "TeamStaffLaborEntries" WHERE "eventId" = ANY($1::text[]) OR "eventTeamId" = ANY($2::text[])`, [runEventIds, eventTeamIds]).then((result) => result.rowCount ?? 0));
  record('FinancialLineItems', await client.query(`DELETE FROM "FinancialLineItems" WHERE "eventId" = ANY($1::text[]) OR "eventTeamId" = ANY($2::text[])`, [runEventIds, eventTeamIds]).then((result) => result.rowCount ?? 0));
  record('StaffPayRunItem', await deleteByIds(client, 'StaffPayRunItem', staffItemIds));
  record('EventStaffAssignments', await deleteByEventIds(client, 'EventStaffAssignments', runEventIds));
  record('StaffScheduleAssignments', await deleteByIds(client, 'StaffScheduleAssignments', staffAssignmentIds));
  record('EventOfficials', await deleteByEventIds(client, 'EventOfficials', runEventIds));
  record('Invites', await deleteByEventIds(client, 'Invites', runEventIds));
  record('RefundRequests', await deleteByEventIds(client, 'RefundRequests', runEventIds));
  record('BillPaymentProofs', await client.query(`DELETE FROM "BillPaymentProofs" WHERE "billId" = ANY($1::text[]) OR "billPaymentId" = ANY($2::text[]) OR "eventId" = ANY($3::text[])`, [billIds, billPaymentIds, runEventIds]).then((result) => result.rowCount ?? 0));
  record('BillPayments', await deleteByIds(client, 'BillPayments', billPaymentIds));
  record('Bills', await deleteByIds(client, 'Bills', billIds));
  record('PaymentIntents', await deleteByEventIds(client, 'PaymentIntents', runEventIds));
  record('RentalBookingItems', await client.query(`DELETE FROM "RentalBookingItems" WHERE "bookingId" = ANY($1::text[]) OR "eventId" = ANY($2::text[]) OR "eventTimeSlotId" = ANY($3::text[]) OR "fieldId" = ANY($4::text[])`, [bookingIds, runEventIds, timeSlotIds, fieldIds]).then((result) => result.rowCount ?? 0));
  record('RentalBookings', await deleteByIds(client, 'RentalBookings', bookingIds));
  record('EventTagAssignments', await deleteByEventIds(client, 'EventTagAssignments', runEventIds));
  record('BroadcastOverlayActions', await client.query(`DELETE FROM "BroadcastOverlayActions" WHERE "overlayId" = ANY($1::text[]) OR "eventId" = ANY($2::text[])`, [overlayIds, runEventIds]).then((result) => result.rowCount ?? 0));
  record('BroadcastOverlayAccessTokens', await deleteByIds(client, 'BroadcastOverlayAccessTokens', (await client.query(`SELECT "id" FROM "BroadcastOverlayAccessTokens" WHERE "overlayId" = ANY($1::text[])`, [overlayIds])).rows.map((row) => row.id)));
  record('BroadcastOverlayStates', await client.query(`DELETE FROM "BroadcastOverlayStates" WHERE "overlayId" = ANY($1::text[]) OR "eventId" = ANY($2::text[])`, [overlayIds, runEventIds]).then((result) => result.rowCount ?? 0));
  record('BroadcastOverlays', await deleteByIds(client, 'BroadcastOverlays', overlayIds));
  record('ChatMessages', await deleteByIds(client, 'Messages', (await client.query(
    `SELECT "id" FROM "Messages" WHERE "chatId" = ANY($1::text[])`,
    [runChatGroupIds],
  )).rows.map((row) => row.id)));
  record('ChatGroups', await deleteByIds(client, 'ChatGroup', runChatGroupIds));
  record('EventTeams', await deleteByIds(client, 'EventTeams', eventTeamIds));
  record('Divisions', await deleteByEventIds(client, 'Divisions', runEventIds));
  record('TimeSlots', await deleteByIds(client, 'TimeSlots', timeSlotIds));
  record('Fields', await deleteByIds(client, 'Fields', fieldIds));
  record('EventEditorCreateOperations', await client.query(`DELETE FROM "EventEditorCreateOperations" WHERE "createOperationId" = ANY($1::text[])`, [receiptOperationIds]).then((result) => result.rowCount ?? 0));
  record('Events', await deleteByIds(client, 'Events', actualEventIds));

  for (const leagueConfigId of eventRows.map((row) => row.leagueconfigid).filter(Boolean)) {
    const usage = await client.query(`SELECT 1 FROM "Events" WHERE "leagueScoringConfigId" = $1 LIMIT 1`, [leagueConfigId]);
    if (usage.rowCount === 0) record('LeagueScoringConfigs', (deleted.LeagueScoringConfigs ?? 0) + await deleteByIds(client, 'LeagueScoringConfigs', [leagueConfigId]));
  }

  const residual = {};
  const count = async (name, sql, params = []) => {
    const result = await client.query(sql, params);
    residual[name] = Number(result.rows[0].count);
  };
  await count('Events', `SELECT COUNT(*)::int AS count FROM "Events" WHERE "id" = ANY($1::text[])`, [runEventIds]);
  await count('Matches', `SELECT COUNT(*)::int AS count FROM "Matches" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  await count('EventRegistrations', `SELECT COUNT(*)::int AS count FROM "EventRegistrations" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  await count('Divisions', `SELECT COUNT(*)::int AS count FROM "Divisions" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  await count('EventTeams', `SELECT COUNT(*)::int AS count FROM "EventTeams" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  await count('EventDivisionPhaseSources', `SELECT COUNT(*)::int AS count FROM "EventDivisionPhaseSources" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  await count('EventDivisionPhaseParticipants', `SELECT COUNT(*)::int AS count FROM "EventDivisionPhaseParticipants" WHERE "eventId" = ANY($1::text[])`, [runEventIds]);
  await count('Fields', `SELECT COUNT(*)::int AS count FROM "Fields" WHERE "id" = ANY($1::text[])`, [fieldIds]);
  await count('TimeSlots', `SELECT COUNT(*)::int AS count FROM "TimeSlots" WHERE "id" = ANY($1::text[])`, [timeSlotIds]);
  await count('EventEditorCreateOperations', `SELECT COUNT(*)::int AS count FROM "EventEditorCreateOperations" WHERE "createOperationId" = ANY($1::text[]) OR "eventId" = ANY($2::text[])`, [request.operationIds, runEventIds]);
  assert(Object.values(residual).every((value) => value === 0), `Tournament purge left run-owned rows: ${JSON.stringify(residual)}`);

  const seededAfter = await snapshotSeededRows(client, request);
  assert.deepStrictEqual(seededAfter, seededBefore, 'Tournament purge changed the seeded organization, EventTeams, or chat rows');
  return { deleted, residual, seededOrganizationRows: 1, seededTeamRows: request.seededTeamIds.length };
};

const readStdin = async () => {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
};

const runPurgeTransaction = async (client, request) => {
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await purge(client, request);
    await client.query('COMMIT');
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  }
};

const main = async () => {
  const databaseUrl = validateDatabaseUrl(process.env.MVP_TEST_DATABASE_URL);
  assert(['1', 'true', 'yes'].includes((process.env.MVP_TEST_DISABLE_OUTBOUND_PROVIDERS ?? '').trim().toLowerCase()), 'MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 is required');
  const request = parseRequest(await readStdin());
  const { Client } = createRequire(resolve(siteDir, 'package.json'))('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await runPurgeTransaction(client, request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.end();
  }
};

export {
  parseRequest,
  purge,
  runPurgeTransaction,
  validateDatabaseUrl,
};

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
