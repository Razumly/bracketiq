/** @jest-environment node */

const prismaMock = {
  affiliateOperationalAlerts: {
    findUnique: jest.fn(),
    create: jest.fn(),
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

import { emitAffiliateOperationalAlert } from '@/server/affiliateImports/affiliateOperationalAlerts';

describe('affiliate operational alerts', () => {
  const originalWebhook = process.env.AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL;
  const originalEmail = process.env.AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL = 'https://alerts.example.test/hook';
    delete process.env.AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO;
    prismaMock.affiliateOperationalAlerts.findUnique.mockResolvedValue(null);
    prismaMock.affiliateOperationalAlerts.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
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
});
