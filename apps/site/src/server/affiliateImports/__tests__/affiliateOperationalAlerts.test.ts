/** @jest-environment node */

const prismaMock = {
  affiliateOperationalAlerts: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  affiliateOperationalAlertDeliveries: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};
const deliverWebhookMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => false,
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import {
  emitAffiliateOperationalAlert,
  emitAffiliateOperationalAlerts,
} from '@/server/affiliateImports/affiliateOperationalAlerts';

describe('affiliate operational alerts', () => {
  const originalWebhook = process.env.AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL;
  const originalEmail = process.env.AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL = 'https://alerts.example.test/hook';
    delete process.env.AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO;
    prismaMock.affiliateOperationalAlerts.findUnique.mockResolvedValue(null);
    prismaMock.affiliateOperationalAlerts.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    prismaMock.affiliateOperationalAlerts.findMany.mockResolvedValue([]);
    prismaMock.affiliateOperationalAlerts.createMany.mockResolvedValue({ count: 0 });
    prismaMock.affiliateOperationalAlertDeliveries.findMany.mockResolvedValue([]);
    prismaMock.affiliateOperationalAlertDeliveries.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      createdAt: data.createdAt ?? new Date(),
    }));
    deliverWebhookMock.mockResolvedValue({
      channel: 'webhook',
      status: 'DELIVERED',
      responseCode: 202,
      responseBody: 'accepted',
    });
  });

  afterAll(() => {
    if (originalWebhook === undefined) delete process.env.AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL;
    else process.env.AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL = originalWebhook;
    if (originalEmail === undefined) delete process.env.AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO;
    else process.env.AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO = originalEmail;
  });

  it('records canonical alert and delivery fields in immutable history', async () => {
    const result = await emitAffiliateOperationalAlert({
      eventKey: 'source-refresh-failed:source-1:run-1',
      category: 'AUTOMATIC_REFRESH_FAILURE',
      severity: 'warning',
      title: 'Source refresh failed',
      detail: 'The source did not respond.',
      subjectType: 'AFFILIATE_SOURCE',
      subjectId: 'source-1',
      payload: { category: 'spoofed', customFlag: true },
    }, {
      deliverWebhook: deliverWebhookMock,
      now: () => new Date('2026-08-24T12:00:00.000Z'),
    });

    expect(result.deliveries).toEqual([expect.objectContaining({
      channel: 'webhook',
      status: 'DELIVERED',
      responseCode: 202,
      responseBody: 'accepted',
    })]);
    expect(prismaMock.affiliateOperationalAlerts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        category: 'AUTOMATIC_REFRESH_FAILURE',
        payload: expect.objectContaining({ category: 'AUTOMATIC_REFRESH_FAILURE', customFlag: true }),
      }),
    }));
    expect(prismaMock.affiliateOperationalAlertDeliveries.create.mock.calls.map(([call]) => call.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'IN_FLIGHT' }),
      expect.objectContaining({ status: 'DELIVERED', responseCode: 202, responseBody: 'accepted' }),
    ]));
  });

  it('records a delivery failure alert without sending a daily digest', async () => {
    deliverWebhookMock.mockResolvedValue({
      channel: 'webhook',
      status: 'FAILED',
      responseCode: 503,
      responseBody: 'upstream unavailable',
      errorMessage: 'HTTP 503: upstream unavailable',
    });

    await emitAffiliateOperationalAlert({
      eventKey: 'source-refresh-failed:source-2:run-2',
      category: 'AUTOMATIC_REFRESH_FAILURE',
      severity: 'warning',
      title: 'Source refresh failed',
      detail: 'The source did not respond.',
      subjectType: 'AFFILIATE_SOURCE',
      subjectId: 'source-2',
    }, { deliverWebhook: deliverWebhookMock });

    expect(prismaMock.affiliateOperationalAlerts.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.affiliateOperationalAlerts.create.mock.calls.map(([call]) => call.data.category)).toEqual([
      'AUTOMATIC_REFRESH_FAILURE',
      'ALERT_DELIVERY_FAILURE',
    ]);
    expect(prismaMock.affiliateOperationalAlertDeliveries.create.mock.calls.map(([call]) => call.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'FAILED', responseCode: 503, responseBody: 'upstream unavailable' }),
    ]));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does not send a delivered channel again when the same event is replayed', async () => {
    prismaMock.affiliateOperationalAlerts.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'alert-1' });
    prismaMock.affiliateOperationalAlertDeliveries.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([{
        id: 'delivery-1',
        channel: 'webhook',
        status: 'DELIVERED',
        attempt: 1,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
      }]);

    const input = {
      eventKey: 'source-refresh-failed:source-3:run-3',
      category: 'AUTOMATIC_REFRESH_FAILURE',
      severity: 'warning' as const,
      title: 'Source refresh failed',
      detail: 'The source did not respond.',
    };
    await emitAffiliateOperationalAlert(input, { deliverWebhook: deliverWebhookMock });
    const replay = await emitAffiliateOperationalAlert(input, { deliverWebhook: deliverWebhookMock });

    expect(replay.deliveries).toEqual([]);
    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.affiliateOperationalAlertDeliveries.create).toHaveBeenCalledTimes(2);
  });

  it('increments the immutable delivery attempt on a failed replay', async () => {
    type DeliveryRow = {
      id: string;
      alertId: string;
      channel: string;
      status: string;
      attempt: number;
      createdAt: Date;
    };
    const deliveryRows: DeliveryRow[] = [];
    deliverWebhookMock
      .mockResolvedValueOnce({
        channel: 'webhook',
        status: 'FAILED',
        responseCode: 503,
        responseBody: 'upstream unavailable',
      })
      .mockResolvedValueOnce({
        channel: 'webhook',
        status: 'DELIVERED',
        responseCode: 202,
        responseBody: 'accepted',
      });
    prismaMock.affiliateOperationalAlerts.findUnique.mockResolvedValue({ id: 'alert-4' });
    prismaMock.affiliateOperationalAlertDeliveries.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
      deliveryRows
        .filter((delivery) => (
          delivery.alertId === where.alertId
          && (!where.channel || delivery.channel === where.channel)
        ))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, 1)
    ));
    prismaMock.affiliateOperationalAlertDeliveries.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row: DeliveryRow = {
        id: String(data.id),
        alertId: String(data.alertId),
        channel: String(data.channel),
        status: String(data.status),
        attempt: Number(data.attempt),
        createdAt: new Date(1_000 + deliveryRows.length),
      };
      deliveryRows.push(row);
      return row;
    });
    const input = {
      eventKey: 'source-refresh-failed:source-4:run-4',
      category: 'AUTOMATIC_REFRESH_FAILURE',
      severity: 'warning' as const,
      title: 'Source refresh failed',
      detail: 'The source did not respond.',
    };
    await emitAffiliateOperationalAlert(input, { deliverWebhook: deliverWebhookMock, isDeliveryFailureAlertSuppressed: true });
    await emitAffiliateOperationalAlert(input, { deliverWebhook: deliverWebhookMock, isDeliveryFailureAlertSuppressed: true });

    const completedRows = deliveryRows.filter((delivery) => delivery.status !== 'IN_FLIGHT');
    expect(completedRows.map((delivery) => delivery.attempt)).toEqual([1, 2]);
    expect(completedRows.map((delivery) => delivery.status)).toEqual(['FAILED', 'DELIVERED']);
  });
  it('deduplicates duplicate event keys before persistence and fallback delivery', async () => {
    const firstInput = {
      eventKey: 'source-refresh-failed:source-batch:run-1',
      category: 'AUTOMATIC_REFRESH_FAILURE',
      severity: 'warning' as const,
      title: 'First source refresh failure',
      detail: 'The first payload must win.',
      payload: { payloadMarker: 'first' },
    };
    const duplicateInput = {
      ...firstInput,
      title: 'Second source refresh failure',
      detail: 'The duplicate payload must not win.',
      payload: { payloadMarker: 'second' },
    };
    prismaMock.affiliateOperationalAlerts.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'alert-batch', eventKey: firstInput.eventKey }]);

    await emitAffiliateOperationalAlerts([firstInput, duplicateInput], {
      deliverWebhook: deliverWebhookMock,
      isDeliveryFailureAlertSuppressed: true,
    });

    expect(prismaMock.affiliateOperationalAlerts.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        eventKey: firstInput.eventKey,
        title: firstInput.title,
        payload: expect.objectContaining({ payloadMarker: 'first' }),
      })],
      skipDuplicates: true,
    }));
    expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
    expect(deliverWebhookMock).toHaveBeenCalledWith(firstInput, 'https://alerts.example.test/hook');
    const deliveryRows = prismaMock.affiliateOperationalAlertDeliveries.create.mock.calls.map(([call]) => call.data);
    expect(deliveryRows.filter((row) => row.status === 'IN_FLIGHT')).toHaveLength(1);
    expect(deliveryRows.filter((row) => row.status === 'DELIVERED')).toHaveLength(1);
  });

  it('re-queries the latest delivery under the advisory lock instead of using a batch snapshot', async () => {
    const input = {
      eventKey: 'source-refresh-failed:source-transaction:run-1',
      category: 'AUTOMATIC_REFRESH_FAILURE',
      severity: 'warning' as const,
      title: 'Source refresh failure',
      detail: 'The latest delivery state must win.',
    };
    prismaMock.affiliateOperationalAlerts.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'alert-transaction', eventKey: input.eventKey }]);
    prismaMock.affiliateOperationalAlertDeliveries.findMany.mockResolvedValueOnce([{
      id: 'delivery-stale',
      alertId: 'alert-transaction',
      channel: 'webhook',
      status: 'FAILED',
      attempt: 1,
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
    }]);

    let lockAcquired = false;
    const transactionFindMany = jest.fn(async () => {
      expect(lockAcquired).toBe(true);
      return [{
        id: 'delivery-latest',
        alertId: 'alert-transaction',
        channel: 'webhook',
        status: 'DELIVERED',
        attempt: 2,
        createdAt: new Date('2026-08-24T12:01:00.000Z'),
      }];
    });
    const transactionCreate = jest.fn();
    const executeRaw = jest.fn(async () => {
      lockAcquired = true;
    });
    const transactionClient = {
      $executeRaw: executeRaw,
      affiliateOperationalAlertDeliveries: {
        findMany: transactionFindMany,
        create: transactionCreate,
      },
    };
    const transaction = jest.fn(async (
      callback: (client: typeof transactionClient) => Promise<unknown>,
    ) => callback(transactionClient));

    await emitAffiliateOperationalAlerts([input], {
      db: { ...prismaMock, $transaction: transaction } as never,
      deliverWebhook: deliverWebhookMock,
      isDeliveryFailureAlertSuppressed: true,
    });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(transactionFindMany).toHaveBeenCalledTimes(1);
    expect(transactionFindMany.mock.invocationCallOrder[0]).toBeGreaterThan(executeRaw.mock.invocationCallOrder[0]);
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(deliverWebhookMock).not.toHaveBeenCalled();
  });
});
