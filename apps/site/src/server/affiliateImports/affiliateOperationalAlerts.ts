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

const normalizedAlertFields = (input: AffiliateOperationalAlertInput) => ({
  eventKey: input.eventKey,
  category: input.category,
  severity: input.severity,
  title: input.title,
  detail: input.detail,
  subjectType: input.subjectType ?? null,
  subjectId: input.subjectId ?? null,
  rolloutCohort: input.rolloutCohort ?? null,
  contractVersion: input.contractVersion ?? null,
  supplySourceId: input.supplySourceId ?? null,
  coverageCellId: input.coverageCellId ?? null,
  demandId: input.demandId ?? null,
  waveId: input.waveId ?? null,
  queue: input.queue ?? null,
  lifecycleGeneration: input.lifecycleGeneration ?? null,
  claimGeneration: input.claimGeneration ?? null,
  workerId: input.workerId ?? null,
  attempt: input.attempt ?? null,
  previousState: input.previousState ?? null,
  nextState: input.nextState ?? null,
  reasonCodes: [...(input.reasonCodes ?? [])],
  evidenceRefs: [...(input.evidenceRefs ?? [])],
  inputHash: input.inputHash ?? null,
  outputHash: input.outputHash ?? null,
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
  const uniqueInputs = Array.from(
    new Map(inputs.map((input) => [input.eventKey, input])).values(),
  );
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

const recordDelivery = async (
  alertId: string,
  channel: AlertChannel,
  result: AlertDeliveryResult,
  dependencies: AffiliateOperationalAlertDependencies,
  previousDelivery?: DeliverySnapshot,
): Promise<void> => {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now?.() ?? new Date();
  const previousAttempt = previousDelivery
    ? previousDelivery.attempt
    : (
      await db.affiliateOperationalAlertDeliveries.findMany({
        where: { alertId, channel },
        orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { attempt: true },
      })
    )[0]?.attempt ?? 0;
  await db.affiliateOperationalAlertDeliveries.create({
    data: {
      id: deliveryId(),
      alertId,
      channel,
      status: result.status,
      attempt: previousAttempt + 1,
      deliveredAt: result.status === 'DELIVERED' ? now : null,
      responseCode: result.responseCode ?? null,
      responseBody: result.responseBody ?? null,
      errorMessage: result.errorMessage ?? null,
    },
  });
};

type DeliveryClaim = Readonly<{ alertId: string; channel: AlertChannel; attempt: number }>;

const IN_FLIGHT_DELIVERY_TIMEOUT_MS = 30_000;

const claimDelivery = async (
  alertId: string,
  channel: AlertChannel,
  dependencies: AffiliateOperationalAlertDependencies,
  previousDelivery?: DeliverySnapshot,
): Promise<DeliveryClaim | null> => {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now?.() ?? new Date();
  const createClaim = async (
    database: typeof db,
    preloadedDelivery?: DeliverySnapshot,
  ): Promise<DeliveryClaim | null> => {
    const previous = preloadedDelivery ?? (
      await database.affiliateOperationalAlertDeliveries.findMany({
        where: { alertId, channel },
        orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { attempt: true, status: true, createdAt: true },
      })
    )[0];
    if (previous?.status === 'DELIVERED') return null;
    if (
      previous?.status === 'IN_FLIGHT'
      && now.getTime() - previous.createdAt.getTime() < IN_FLIGHT_DELIVERY_TIMEOUT_MS
    ) {
      return null;
    }
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
  const transaction = db.$transaction as ((
    callback: (transaction: Prisma.TransactionClient) => Promise<DeliveryClaim | null>,
  ) => Promise<DeliveryClaim | null>) | undefined;
  if (typeof transaction !== 'function') return createClaim(db, previousDelivery);
  return transaction.call(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-alert:${alertId}:${channel}`}))`;
    return createClaim(tx);
  });
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

const deliverPersistedOperationalAlert = async (
  input: AffiliateOperationalAlertInput,
  alert: PersistedAffiliateOperationalAlert,
  dependencies: AffiliateOperationalAlertDependencies,
  deliverySnapshots?: ReadonlyMap<string, DeliverySnapshot>,
): Promise<{ alertId: string; deliveries: readonly AlertDeliveryResult[] }> => {
  if (dependencies.isDeliveryEnabled === false) {
    return { alertId: alert.id, deliveries: [] };
  }
  const webhookUrl = readEnv('AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL');
  const emailRecipient = readEnv('AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO') ?? readEnv('ADMIN_NOTIFICATION_EMAIL_TO');
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const webhookDelivery = dependencies.deliverWebhook
    ?? ((alertInput: AffiliateOperationalAlertInput, url: string) => deliverWebhook(alertInput, url, fetchImpl));
  const deliveries: AlertDeliveryResult[] = [];
  const isWebhookConfigured = Boolean(webhookUrl && (dependencies.deliverWebhook || fetchImpl));
  const isEmailConfigured = Boolean(emailRecipient && isEmailEnabled());
  if (isWebhookConfigured) {
    const delivery = await deliverChannel(
      alert.id,
      'webhook',
      () => webhookDelivery(input, webhookUrl as string),
      dependencies,
      deliverySnapshots?.get(deliverySnapshotKey(alert.id, 'webhook')),
    );
    if (delivery) deliveries.push(delivery);
  }
  if (isEmailConfigured) {
    const delivery = await deliverChannel(
      alert.id,
      'email',
      () => deliverEmail(input, emailRecipient as string),
      dependencies,
      deliverySnapshots?.get(deliverySnapshotKey(alert.id, 'email')),
    );
    if (delivery) deliveries.push(delivery);
  }
  if (deliveries.length === 0 && !isWebhookConfigured && !isEmailConfigured) {
    const notConfigured: AlertDeliveryResult = { channel: 'webhook', status: 'NOT_CONFIGURED', errorMessage: 'No operational alert channel is configured' };
    deliveries.push(notConfigured);
    await recordDelivery(
      alert.id,
      notConfigured.channel,
      notConfigured,
      dependencies,
      deliverySnapshots?.get(deliverySnapshotKey(alert.id, notConfigured.channel)),
    );
  }
  for (const delivery of deliveries) {
    if (delivery.status === 'FAILED' && !dependencies.isDeliveryFailureAlertSuppressed) {
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
  }
  return { alertId: alert.id, deliveries };
};

export const emitAffiliateOperationalAlert: AffiliateOperationalAlertWriter = async (
  input,
  dependencies = {},
): Promise<{ alertId: string; deliveries: readonly AlertDeliveryResult[] }> => {
  const alert = await persistAlert(input, dependencies);
  return deliverPersistedOperationalAlert(input, alert, dependencies);
};

export const emitAffiliateOperationalAlerts = async (
  inputs: readonly AffiliateOperationalAlertInput[],
  dependencies: AffiliateOperationalAlertDependencies = {},
): Promise<void> => {
  const alertsByEventKey = await persistAlerts(inputs, dependencies);
  if (dependencies.isDeliveryEnabled === false || alertsByEventKey.size === 0) return;
  const deliverySnapshots = await loadDeliverySnapshots(
    Array.from(alertsByEventKey.values()).map((alert) => alert.id),
    dependencies,
  );
  await Promise.all(inputs.map(async (input) => {
    const alert = alertsByEventKey.get(input.eventKey);
    if (!alert) throw new Error(`Operational alert persistence returned no row for ${input.eventKey}`);
    await deliverPersistedOperationalAlert(input, alert, dependencies, deliverySnapshots);
  }));
};
