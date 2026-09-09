import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const siteDir = process.env.MVP_SITE_DIR ?? process.cwd();
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REQUIRED_DATABASE_NAME = /^(?:mvp|test|dev|local|e2e|ci)/i;
const FORBIDDEN_DATABASE_NAME = /(prod|production|live)/i;
const EVENT_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f-]{27}|client_[a-z0-9_]+|mobile_api_editor_contract_[0-9]+_[a-z0-9_]+)$/i;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const RECEIPT_SETTLE_ATTEMPTS = 60;
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
  assert(request && typeof request === 'object', 'Event Editor receipt cleanup request must be an object');
  const eventIds = uniqueIds(request.eventIds ?? [], 'eventIds');
  const operations = Array.isArray(request.operations) ? request.operations : [];
  assert(eventIds.length > 0 || operations.length > 0, 'Event Editor receipt cleanup request must identify a run');
  const normalizedOperations = operations.map((operation, index) => {
    assert(operation && typeof operation === 'object', `operations[${index}] must be an object`);
    const createOperationId = String(operation.createOperationId ?? '').trim();
    assert(createOperationId && ID_PATTERN.test(createOperationId), `operations[${index}] has an invalid create operation id`);
    const eventId = String(operation.eventId ?? '').trim();
    assert(!eventId || EVENT_ID_PATTERN.test(eventId), `operations[${index}] has an invalid event id`);
    const createDispatchStarted = operation.createDispatchStarted;
    const createDispatchTerminal = operation.createDispatchTerminal;
    assert(typeof createDispatchStarted === 'boolean', `operations[${index}].createDispatchStarted must be a boolean`);
    assert(typeof createDispatchTerminal === 'boolean', `operations[${index}].createDispatchTerminal must be a boolean`);
    assert(!createDispatchTerminal || createDispatchStarted, `operations[${index}] cannot complete create before dispatch`);
    return { createOperationId, eventId, createDispatchStarted, createDispatchTerminal };
  });
  const operationIds = uniqueIds(normalizedOperations.map((operation) => operation.createOperationId), 'createOperationIds');
  const allEventIds = uniqueIds(
    [...eventIds, ...normalizedOperations.map((operation) => operation.eventId).filter(Boolean)],
    'eventIds',
  );
  allEventIds.forEach((eventId) => assert(EVENT_ID_PATTERN.test(eventId), `event id ${eventId} is not tied to the generic mobile Event Editor run`));
  return { eventIds: allEventIds, operations: normalizedOperations, operationIds };
};

const readOperationReceipts = async (client, operationIds) => (
  operationIds.length === 0
    ? { rows: [] }
    : await client.query(
      `SELECT "createOperationId" AS id, "eventId" AS eventid,
              "responseJson" AS responsejson
         FROM "EventEditorCreateOperations"
        WHERE "createOperationId" = ANY($1::text[])`,
      [operationIds],
    )
);

const isSettledReceipt = (receipt) => receipt?.responsejson !== null;

const unresolvedOperationIds = (request, operationRows) => {
  const operationById = new Map(operationRows.map((row) => [row.id, row]));
  return request.operations
    .filter((operation) => {
      const receipt = operationById.get(operation.createOperationId);
      return (operation.createDispatchStarted && !receipt && !operation.createDispatchTerminal)
        || Boolean(receipt && !isSettledReceipt(receipt));
    })
    .map((operation) => operation.createOperationId);
};

const resolveOperationReceipts = async (client, request) => {
  let operationResult = { rows: [] };
  for (let attempt = 0; attempt < RECEIPT_SETTLE_ATTEMPTS; attempt += 1) {
    operationResult = await readOperationReceipts(client, request.operationIds);
    const unresolved = unresolvedOperationIds(request, operationResult.rows);
    if (unresolved.length === 0) return operationResult;
    if (attempt + 1 < RECEIPT_SETTLE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RECEIPT_SETTLE_DELAY_MS));
    }
  }
  const unresolved = unresolvedOperationIds(request, operationResult.rows);
  assert(unresolved.length === 0, `Dispatched create receipts did not settle before cleanup: ${unresolved.join(", ")}`);
  return operationResult;
};

const cleanupReceipts = async (client, request) => {
  const operationResult = await resolveOperationReceipts(client, request);
  const operationById = new Map(operationResult.rows.map((row) => [row.id, row]));
  const recoveredEventIds = new Set(request.eventIds);
  for (const operation of request.operations) {
    const receipt = operationById.get(operation.createOperationId);
    if (!receipt) continue;
    if (operation.eventId) {
      assert(
        receipt.eventid === operation.eventId,
        `Create operation ${operation.createOperationId} resolved to an unexpected event id`,
      );
    }
    recoveredEventIds.add(receipt.eventid);
    const deleted = await client.query(
      `DELETE FROM "EventEditorCreateOperations"
             WHERE "createOperationId" = $1 AND "eventId" = $2`,
      [operation.createOperationId, receipt.eventid],
    );
    assert(
      deleted.rowCount === 1,
      `Create operation ${operation.createOperationId} receipt was not deleted by exact operation and event ids`,
    );
  }

  const residualRows = [];
  for (const operation of request.operations) {
    const receiptEventId = operationById.get(operation.createOperationId)?.eventid;
    const eventId = operation.eventId || receiptEventId;
    const residual = eventId
      ? await client.query(
        `SELECT "createOperationId" AS id, "eventId" AS eventid
           FROM "EventEditorCreateOperations"
          WHERE "createOperationId" = $1 OR "eventId" = $2`,
        [operation.createOperationId, eventId],
      )
      : await client.query(
        `SELECT "createOperationId" AS id, "eventId" AS eventid
           FROM "EventEditorCreateOperations"
          WHERE "createOperationId" = $1`,
        [operation.createOperationId],
      );
    residualRows.push(...residual.rows);
  }
  assert(
    residualRows.length === 0,
    `Generic Event Editor receipt cleanup left residual rows: ${JSON.stringify(residualRows)}`,
  );
  return {
    operationIds: request.operationIds,
    eventIds: [...recoveredEventIds],
    residualReceiptRows: residualRows,
  };
};

const runCleanupTransaction = async (client, request) => {
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await cleanupReceipts(client, request);
    await client.query('COMMIT');
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  }
};

const readStdin = async () => {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
};

const main = async () => {
  const databaseUrl = validateDatabaseUrl(process.env.MVP_TEST_DATABASE_URL);
  assert(
    ['1', 'true', 'yes'].includes((process.env.MVP_TEST_DISABLE_OUTBOUND_PROVIDERS ?? '').trim().toLowerCase()),
    'MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 is required',
  );
  const request = parseRequest(await readStdin());
  const { Client } = createRequire(resolve(siteDir, 'package.json'))('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await runCleanupTransaction(client, request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.end();
  }
};

export {
  cleanupReceipts,
  isSettledReceipt,
  parseRequest,
  resolveOperationReceipts,
  runCleanupTransaction,
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
