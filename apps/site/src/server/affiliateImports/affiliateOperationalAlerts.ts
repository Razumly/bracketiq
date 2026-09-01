import { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '@/generated/prisma/client';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';

export type AffiliateOperationalAlertDatabase = Pick<
  PrismaClient,
  'affiliateOperationalAlerts' | 'affiliateOperationalAlertDeliveries'
> & {
  $transaction?: <T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
};

export type AffiliateOperationalAlertDependencies = Readonly<{
  db?: AffiliateOperationalAlertDatabase;
  fetchImpl?: typeof fetch;
  deliverWebhook?: (
    input: AffiliateOperationalAlertInput,
    url: string,
  ) => Promise<AffiliateOperationalAlertDeliveryResult>;
  now?: () => Date;
  isDeliveryEnabled?: boolean;
  isDeliveryFailureAlertSuppressed?: boolean;
}>;

export type AffiliateOperationalAlertSeverity = 'critical' | 'warning' | 'info';
export type AffiliateOperationalAlertChannel = 'webhook' | 'email';

export type AffiliateOperationalAlertDeliveryResult = {
  channel: AffiliateOperationalAlertChannel;
  status: 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED';
  responseCode?: number;
  responseBody?: string;
  errorMessage?: string;
};

export type AffiliateOperationalAlertWriter = (
  input: AffiliateOperationalAlertInput,
  dependencies?: AffiliateOperationalAlertDependencies,
) => Promise<{ alertId: string; deliveries: readonly AffiliateOperationalAlertDeliveryResult[] }>;

type AlertSeverity = AffiliateOperationalAlertSeverity;

type AlertChannel = AffiliateOperationalAlertChannel;

type AlertDeliveryResult = AffiliateOperationalAlertDeliveryResult;





export type AffiliateOperationalAlertInput = Readonly<{
  eventKey: string;
  category: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  subjectType?: string | null;
  subjectId?: string | null;
  rolloutCohort?: string | null;
  contractVersion?: number | null;
  supplySourceId?: string | null;
  coverageCellId?: string | null;
  demandId?: string | null;
  waveId?: string | null;
  queue?: string | null;
  lifecycleGeneration?: number | null;
  claimGeneration?: number | null;
  workerId?: string | null;
  attempt?: number | null;
  previousState?: string | null;
  nextState?: string | null;
  reasonCodes?: readonly string[];
  evidenceRefs?: readonly string[];
  inputHash?: string | null;
  outputHash?: string | null;
  payload?: Record<string, unknown>;
}>;


const readEnv = (name: string): string | null => process.env[name]?.trim() || null;

const normalizeOptionalAlertValue = <T>(value: T | null | undefined): T | null => value ?? null;


const normalizedAlertFields = (input: AffiliateOperationalAlertInput) => ({
  eventKey: input.eventKey,
  category: input.category,
  severity: input.severity,
  title: input.title,
  detail: input.detail,
  subjectType: normalizeOptionalAlertValue(input.subjectType),
  subjectId: normalizeOptionalAlertValue(input.subjectId),
  rolloutCohort: normalizeOptionalAlertValue(input.rolloutCohort),
  contractVersion: normalizeOptionalAlertValue(input.contractVersion),
  supplySourceId: normalizeOptionalAlertValue(input.supplySourceId),
  coverageCellId: normalizeOptionalAlertValue(input.coverageCellId),
  demandId: normalizeOptionalAlertValue(input.demandId),
  waveId: normalizeOptionalAlertValue(input.waveId),
  queue: normalizeOptionalAlertValue(input.queue),
  lifecycleGeneration: normalizeOptionalAlertValue(input.lifecycleGeneration),
  claimGeneration: normalizeOptionalAlertValue(input.claimGeneration),
  workerId: normalizeOptionalAlertValue(input.workerId),
  attempt: normalizeOptionalAlertValue(input.attempt),
  previousState: normalizeOptionalAlertValue(input.previousState),
  nextState: normalizeOptionalAlertValue(input.nextState),
  reasonCodes: [...(input.reasonCodes ?? [])],
  evidenceRefs: [...(input.evidenceRefs ?? [])],
  inputHash: normalizeOptionalAlertValue(input.inputHash),
  outputHash: normalizeOptionalAlertValue(input.outputHash),
});

const alertPayload = (input: AffiliateOperationalAlertInput): Record<string, unknown> => ({
  ...input.payload,
  ...normalizedAlertFields(input),
});

const alertCreateData = (input: AffiliateOperationalAlertInput) => ({
  id: createId(),
  ...normalizedAlertFields(input),
  payload: alertPayload(input) as Prisma.InputJsonValue,
});
const deduplicateAlertInputs = (
  inputs: readonly AffiliateOperationalAlertInput[],
): AffiliateOperationalAlertInput[] => {
  const seenEventKeys = new Set<string>();
  const uniqueInputs: AffiliateOperationalAlertInput[] = [];
  for (const input of inputs) {
    if (seenEventKeys.has(input.eventKey)) continue;
    seenEventKeys.add(input.eventKey);
    uniqueInputs.push(input);
  }
  return uniqueInputs;
};


type PersistedAffiliateOperationalAlert = Readonly<{
  id: string;
  eventKey: string;
}>;

const persistAlert = async (
  input: AffiliateOperationalAlertInput,
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<PersistedAffiliateOperationalAlert> => {
  const db = dependencies.db ?? prisma;
  const existing = await db.affiliateOperationalAlerts.findUnique({ where: { eventKey: input.eventKey } });
  if (existing) return existing;
  try {
    return await db.affiliateOperationalAlerts.create({
      data: alertCreateData(input),
    });
  } catch (error) {
    const raced = await db.affiliateOperationalAlerts.findUnique({ where: { eventKey: input.eventKey } });
    if (raced) return raced;
    throw error;
  }
};


const persistAlerts = async (
  inputs: readonly AffiliateOperationalAlertInput[],
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<ReadonlyMap<string, PersistedAffiliateOperationalAlert>> => {
  const db = dependencies.db ?? prisma;
  const uniqueInputs = deduplicateAlertInputs(inputs);
  if (uniqueInputs.length === 0) return new Map();
  const findMany = db.affiliateOperationalAlerts.findMany;
  const createMany = db.affiliateOperationalAlerts.createMany;
  if (typeof findMany !== 'function' || typeof createMany !== 'function') {
    const rows = await Promise.all(uniqueInputs.map((input) => persistAlert(input, dependencies)));
    return new Map(rows.map((row) => [row.eventKey, row]));
  }
  const eventKeys = uniqueInputs.map((input) => input.eventKey);
  const existing = await findMany({
    where: { eventKey: { in: eventKeys } },
  });
  const existingKeys = new Set(existing.map((row) => row.eventKey));
  const missingInputs = uniqueInputs.filter((input) => !existingKeys.has(input.eventKey));
  if (missingInputs.length > 0) {
    await createMany({
      data: missingInputs.map(alertCreateData),
      skipDuplicates: true,
    });
  }
  const rows = await findMany({
    where: { eventKey: { in: eventKeys } },
  });
  return new Map(rows.map((row) => [row.eventKey, row]));
};

const deliveryId = (): string => createId();

type DeliverySnapshot = Readonly<{
  alertId: string;
  channel: AlertChannel;
  status: string;
  attempt: number;
  createdAt: Date;
}>;

const deliverySnapshotKey = (alertId: string, channel: AlertChannel): string =>
  `${alertId}:${channel}`;

const loadDeliverySnapshots = async (
  alertIds: readonly string[],
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<ReadonlyMap<string, DeliverySnapshot>> => {
  if (alertIds.length === 0) return new Map();
  const db = dependencies.db ?? prisma;
  const rows = await db.affiliateOperationalAlertDeliveries.findMany({
    where: {
      alertId: { in: [...alertIds] },
      channel: { in: ['webhook', 'email'] },
    },
    orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
    select: { alertId: true, channel: true, status: true, attempt: true, createdAt: true },
  });
  const snapshots = new Map<string, DeliverySnapshot>();
  for (const row of rows) {
    const channel = row.channel as AlertChannel;
    if (channel !== 'webhook' && channel !== 'email') continue;
    const key = deliverySnapshotKey(row.alertId, channel);
    if (!snapshots.has(key)) snapshots.set(key, { ...row, channel });
  }
  return snapshots;
};

const loadLatestDeliveryAttempt = async (
  alertId: string,
  channel: AlertChannel,
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<number> => {
  const db = dependencies.db ?? prisma;
  const [latestDelivery] = await db.affiliateOperationalAlertDeliveries.findMany({
    where: { alertId, channel },
    orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    select: { attempt: true },
  });
  return latestDelivery?.attempt ?? 0;
};


type DeliveryClaim = Readonly<{ alertId: string; channel: AlertChannel; attempt: number }>;

const IN_FLIGHT_DELIVERY_TIMEOUT_MS = 30_000;

type DeliveryDatabase = Pick<AffiliateOperationalAlertDatabase, 'affiliateOperationalAlertDeliveries'>;

type ClaimDeliverySnapshot = Pick<DeliverySnapshot, 'status' | 'attempt' | 'createdAt'>;

const loadClaimDelivery = async (
  database: DeliveryDatabase,
  alertId: string,
  channel: AlertChannel,
): Promise<ClaimDeliverySnapshot | undefined> => {
  const [previous] = await database.affiliateOperationalAlertDeliveries.findMany({
    where: { alertId, channel },
    orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    select: { attempt: true, status: true, createdAt: true },
  });
  return previous;
};

const hasActiveDeliveryClaim = (
  previous: ClaimDeliverySnapshot | DeliverySnapshot | undefined,
  now: Date,
): boolean => (
  previous?.status === 'IN_FLIGHT'
  && now.getTime() - previous.createdAt.getTime() < IN_FLIGHT_DELIVERY_TIMEOUT_MS
);

const createDeliveryClaim = async (
  database: DeliveryDatabase,
  alertId: string,
  channel: AlertChannel,
  now: Date,
  preloadedDelivery?: DeliverySnapshot,
): Promise<DeliveryClaim | null> => {
  const previous = preloadedDelivery ?? (
    await loadClaimDelivery(database, alertId, channel)
  );
  if (previous?.status === 'DELIVERED') return null;
  if (hasActiveDeliveryClaim(previous, now)) return null;
  const row = await database.affiliateOperationalAlertDeliveries.create({
    data: {
      id: deliveryId(),
      alertId,
      channel,
      status: 'IN_FLIGHT',
      attempt: (previous?.attempt ?? 0) + 1,
      deliveredAt: null,
      responseCode: null,
      responseBody: null,
      errorMessage: null,
    },
  });
  return { alertId, channel, attempt: row.attempt };
};

const claimDeliveryInTransaction = (
  db: AffiliateOperationalAlertDatabase,
  transaction: NonNullable<AffiliateOperationalAlertDatabase['$transaction']>,
  alertId: string,
  channel: AlertChannel,
  now: Date,
): Promise<DeliveryClaim | null> => {
  const runTransaction = transaction as (
    callback: (transaction: Prisma.TransactionClient) => Promise<DeliveryClaim | null>,
  ) => Promise<DeliveryClaim | null>;
  return runTransaction.call(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-alert:${alertId}:${channel}`}))`;
    return createDeliveryClaim(tx, alertId, channel, now);
  });
};

const claimDelivery = async (
  alertId: string,
  channel: AlertChannel,
  dependencies: AffiliateOperationalAlertDependencies,
  previousDelivery?: DeliverySnapshot,
): Promise<DeliveryClaim | null> => {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now?.() ?? new Date();
  const transaction = db.$transaction;
  if (typeof transaction !== 'function') {
    return createDeliveryClaim(db, alertId, channel, now, previousDelivery);
  }
  return claimDeliveryInTransaction(db, transaction, alertId, channel, now);
};

const completeDelivery = async (
  claim: DeliveryClaim,
  result: AlertDeliveryResult,
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<void> => {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now?.() ?? new Date();
  await db.affiliateOperationalAlertDeliveries.create({
    data: {
      id: deliveryId(),
      alertId: claim.alertId,
      channel: claim.channel,
      status: result.status,
      attempt: claim.attempt,
      deliveredAt: result.status === 'DELIVERED' ? now : null,
      responseCode: result.responseCode ?? null,
      responseBody: result.responseBody ?? null,
      errorMessage: result.errorMessage ?? null,
    },
  });
};


const deliverChannel = async (
  alertId: string,
  channel: AlertChannel,
  deliver: () => Promise<AlertDeliveryResult>,
  dependencies: AffiliateOperationalAlertDependencies,
  previousDelivery?: DeliverySnapshot,
): Promise<AlertDeliveryResult | null> => {
  const claim = await claimDelivery(alertId, channel, dependencies, previousDelivery);
  if (!claim) return null;
  const result = await deliver();
  await completeDelivery(claim, result, dependencies);
  return result;
};



const deliverWebhook = async (
  input: AffiliateOperationalAlertInput,
  url: string,
  fetchImpl: typeof fetch,
): Promise<AlertDeliveryResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alertPayload(input)),
      signal: controller.signal,
    });
    const responseBody = await response.text().catch(() => '');
    if (!response.ok) {
      return {
        channel: 'webhook',
        status: 'FAILED',
        responseCode: response.status,
        responseBody: responseBody.slice(0, 500),
        errorMessage: `HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
      };
    }
    return { channel: 'webhook', status: 'DELIVERED', responseCode: response.status, responseBody: responseBody.slice(0, 500) };
  } catch (error) {
    return {
      channel: 'webhook',
      status: 'FAILED',
      errorMessage: error instanceof Error && error.name === 'AbortError' ? 'Webhook delivery timed out' : error instanceof Error ? error.message : 'Webhook delivery failed',
    };
  } finally {
    clearTimeout(timeout);
  }
};

const deliverEmail = async (
  input: AffiliateOperationalAlertInput,
  recipient: string,
): Promise<AlertDeliveryResult> => {
  try {
    await sendEmail({
      to: recipient,
      subject: `[BracketIQ] ${input.severity.toUpperCase()}: ${input.title}`,
      text: [
        input.detail,
        `Category: ${input.category}`,
        `Event: ${input.eventKey}`,
        input.subjectId ? `Subject: ${input.subjectId}` : null,
        input.reasonCodes?.length ? `Reasons: ${input.reasonCodes.join(', ')}` : null,
      ].filter(Boolean).join('\n'),
    });
    return { channel: 'email', status: 'DELIVERED' };
  } catch (error) {
    return { channel: 'email', status: 'FAILED', errorMessage: error instanceof Error ? error.message : 'Email delivery failed' };
  }
};

type ConfiguredAlertDelivery = Readonly<{
  channel: AlertChannel;
  deliver: () => Promise<AlertDeliveryResult>;
}>;

const configuredAlertDeliveries = (
  input: AffiliateOperationalAlertInput,
  dependencies: AffiliateOperationalAlertDependencies,
): ConfiguredAlertDelivery[] => {
  const webhookUrl = readEnv('AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL');
  const emailRecipient = readEnv('AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO')
    ?? readEnv('ADMIN_NOTIFICATION_EMAIL_TO');
  const fetchImpl: typeof fetch | undefined = dependencies.fetchImpl ?? globalThis.fetch;
  const webhookDelivery = dependencies.deliverWebhook
    ?? (fetchImpl
      ? ((alertInput: AffiliateOperationalAlertInput, url: string) => deliverWebhook(alertInput, url, fetchImpl))
      : undefined);
  const configured: ConfiguredAlertDelivery[] = [];
  if (webhookUrl && webhookDelivery) {
    configured.push({
      channel: 'webhook',
      deliver: () => webhookDelivery(input, webhookUrl),
    });
  }
  if (emailRecipient && isEmailEnabled()) {
    configured.push({
      channel: 'email',
      deliver: () => deliverEmail(input, emailRecipient),
    });
  }
  return configured;
};

const deliverConfiguredAlertChannels = async (
  alert: PersistedAffiliateOperationalAlert,
  configured: readonly ConfiguredAlertDelivery[],
  dependencies: AffiliateOperationalAlertDependencies,
  deliverySnapshots?: ReadonlyMap<string, DeliverySnapshot>,
): Promise<AlertDeliveryResult[]> => {
  const deliveries: AlertDeliveryResult[] = [];
  for (const channel of configured) {
    const delivery = await deliverChannel(
      alert.id,
      channel.channel,
      channel.deliver,
      dependencies,
      deliverySnapshots?.get(deliverySnapshotKey(alert.id, channel.channel)),
    );
    if (delivery) deliveries.push(delivery);
  }
  return deliveries;
};

const recordUnconfiguredAlertDelivery = async (
  alert: PersistedAffiliateOperationalAlert,
  dependencies: AffiliateOperationalAlertDependencies,
  deliverySnapshots?: ReadonlyMap<string, DeliverySnapshot>,
): Promise<AlertDeliveryResult | null> => {
  const notConfigured: AlertDeliveryResult = {
    channel: 'webhook',
    status: 'NOT_CONFIGURED',
    errorMessage: 'No operational alert channel is configured',
  };
  return deliverChannel(
    alert.id,
    notConfigured.channel,
    async () => notConfigured,
    dependencies,
    deliverySnapshots?.get(deliverySnapshotKey(alert.id, notConfigured.channel)),
  );
};

const emitDeliveryFailureAlerts = async (
  input: AffiliateOperationalAlertInput,
  alert: PersistedAffiliateOperationalAlert,
  deliveries: readonly AlertDeliveryResult[],
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<void> => {
  if (dependencies.isDeliveryFailureAlertSuppressed) return;
  for (const delivery of deliveries) {
    if (delivery.status !== 'FAILED') continue;
    await emitAffiliateOperationalAlert({
      eventKey: `alert-delivery-failure:${input.eventKey}:${delivery.channel}`,
      category: 'ALERT_DELIVERY_FAILURE',
      severity: 'critical',
      title: 'Operational alert delivery failed',
      detail: `${input.title}: ${delivery.errorMessage ?? 'Unknown delivery failure'}`,
      subjectType: 'ALERT',
      subjectId: alert.id,
      reasonCodes: ['ALERT_DELIVERY_FAILED'],
      payload: { channel: delivery.channel, sourceEventKey: input.eventKey },
    }, { ...dependencies, isDeliveryFailureAlertSuppressed: true });
  }
};

const deliverPersistedOperationalAlert = async (
  input: AffiliateOperationalAlertInput,
  alert: PersistedAffiliateOperationalAlert,
  dependencies: AffiliateOperationalAlertDependencies,
  deliverySnapshots?: ReadonlyMap<string, DeliverySnapshot>,
): Promise<{ alertId: string; deliveries: readonly AlertDeliveryResult[] }> => {
  if (dependencies.isDeliveryEnabled === false) {
    return { alertId: alert.id, deliveries: [] };
  }
  const configured = configuredAlertDeliveries(input, dependencies);
  const deliveries = await deliverConfiguredAlertChannels(
    alert,
    configured,
    dependencies,
    deliverySnapshots,
  );
  if (configured.length === 0) {
    const delivery = await recordUnconfiguredAlertDelivery(
      alert,
      dependencies,
      deliverySnapshots,
    );
    if (delivery) deliveries.push(delivery);
  }
  await emitDeliveryFailureAlerts(input, alert, deliveries, dependencies);
  return { alertId: alert.id, deliveries };
};

export const emitAffiliateOperationalAlert: AffiliateOperationalAlertWriter = async (
  input,
  dependencies = {},
): Promise<{ alertId: string; deliveries: readonly AlertDeliveryResult[] }> => {
  const alert = await persistAlert(input, dependencies);
  return deliverPersistedOperationalAlert(input, alert, dependencies);
};

const deliverBatchAlert = async (
  input: AffiliateOperationalAlertInput,
  alertsByEventKey: ReadonlyMap<string, PersistedAffiliateOperationalAlert>,
  dependencies: AffiliateOperationalAlertDependencies,
  deliverySnapshots: ReadonlyMap<string, DeliverySnapshot>,
): Promise<void> => {
  const alert = alertsByEventKey.get(input.eventKey);
  if (!alert) throw new Error(`Operational alert persistence returned no row for ${input.eventKey}`);
  await deliverPersistedOperationalAlert(input, alert, dependencies, deliverySnapshots);
};

const deliverBatchAlerts = async (
  inputs: readonly AffiliateOperationalAlertInput[],
  alertsByEventKey: ReadonlyMap<string, PersistedAffiliateOperationalAlert>,
  dependencies: AffiliateOperationalAlertDependencies,
): Promise<void> => {
  const deliverySnapshots = await loadDeliverySnapshots(
    Array.from(alertsByEventKey.values()).map((alert) => alert.id),
    dependencies,
  );
  await Promise.all(inputs.map((input) => (
    deliverBatchAlert(input, alertsByEventKey, dependencies, deliverySnapshots)
  )));
};

export const emitAffiliateOperationalAlerts = async (
  inputs: readonly AffiliateOperationalAlertInput[],
  dependencies: AffiliateOperationalAlertDependencies = {},
): Promise<void> => {
  const uniqueInputs = deduplicateAlertInputs(inputs);
  const alertsByEventKey = await persistAlerts(uniqueInputs, dependencies);
  if (dependencies.isDeliveryEnabled === false || alertsByEventKey.size === 0) return;
  await deliverBatchAlerts(uniqueInputs, alertsByEventKey, dependencies);
};
