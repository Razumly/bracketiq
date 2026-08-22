/** @jest-environment node */

import { NextRequest } from 'next/server';

const stripeInvoicesUpdateMock = jest.fn();
const stripeSubscriptionsRetrieveMock = jest.fn();
const syncManagedOrganizationStripeAccountMock = jest.fn();
const StripeMock = jest.fn(() => ({
  invoices: {
    update: (...args: any[]) => stripeInvoicesUpdateMock(...args),
  },
  subscriptions: {
    retrieve: (...args: any[]) => stripeSubscriptionsRetrieveMock(...args),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
}));

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  subscriptions: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  products: {
    findUnique: jest.fn(),
  },
  stripeAccounts: {
    findFirst: jest.fn(),
  },
  events: {
    update: jest.fn(),
  },
  eventRegistrations: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
const acquireEventLockAndLoadStructureMock = jest.fn();
const claimOrCreateEventTeamSnapshotMock = jest.fn();
const syncDivisionTeamMembershipFromRegistrationsMock = jest.fn();
jest.mock('@/server/events/eventRegistrations', () => {
  const actual = jest.requireActual('@/server/events/eventRegistrations');
  return {
    ...actual,
    acquireEventLockAndLoadStructure: (...args: any[]) => acquireEventLockAndLoadStructureMock(...args),
    syncDivisionTeamMembershipFromRegistrations: (...args: unknown[]) => syncDivisionTeamMembershipFromRegistrationsMock(...args),
  };
});
jest.mock('@/server/teams/teamMembership', () => {
  const actual = jest.requireActual('@/server/teams/teamMembership');
  return {
    ...actual,
    claimOrCreateEventTeamSnapshot: (...args: unknown[]) => claimOrCreateEventTeamSnapshotMock(...args),
  };
});

const sendPurchaseReceiptEmailMock = jest.fn();
const sendPaymentFailureEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));
jest.mock('@/server/purchaseReceipts', () => ({
  sendPurchaseReceiptEmail: (...args: any[]) => sendPurchaseReceiptEmailMock(...args),
  sendPaymentFailureEmail: (...args: any[]) => sendPaymentFailureEmailMock(...args),
}));
jest.mock('@/server/organizationStripeVerification', () => ({
  syncManagedOrganizationStripeAccount: (...args: any[]) => syncManagedOrganizationStripeAccountMock(...args),
}));

import { POST } from '@/app/api/billing/webhook/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const buildPaymentIntentEvent = ({
  type = 'payment_intent.succeeded',
  intentId,
  metadata,
  amount = 5000,
  amountReceived = amount,
}: {
  type?: string;
  intentId: string;
  metadata: Record<string, string>;
  amount?: number;
  amountReceived?: number;
}) => ({
  type,
  data: {
    object: {
      id: intentId,
      metadata,
      amount,
      amount_received: amountReceived,
    },
  },
});

const buildPaymentIntentSucceededEvent = (params: {
  intentId: string;
  metadata: Record<string, string>;
  amount?: number;
  amountReceived?: number;
}) => buildPaymentIntentEvent({ ...params, type: 'payment_intent.succeeded' });

const buildDisputeClosedEvent = (params: {
  disputeId: string;
  paymentIntentId: string;
  status?: string;
}) => ({
  type: 'charge.dispute.closed',
  data: {
    object: {
      id: params.disputeId,
      status: params.status ?? 'lost',
      payment_intent: params.paymentIntentId,
    },
  },
});

describe('POST /api/billing/webhook', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;
  const originalWebhookBypass = process.env.STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV;

  beforeEach(() => {
    jest.clearAllMocks();
    acquireEventLockAndLoadStructureMock.mockImplementation(async () => {
      const rows = await prismaMock.$queryRaw();
      const event = rows?.[0] as { id?: string; eventType?: string | null; teamSignup?: boolean | null } | undefined;
      return event
        ? {
          id: event.id ?? 'event_1',
          eventType: event.eventType ?? null,
          teamSignup: event.teamSignup ?? null,
        }
        : null;
    });
    claimOrCreateEventTeamSnapshotMock.mockResolvedValue({ id: 'slot_pool_a_2' });
    syncDivisionTeamMembershipFromRegistrationsMock.mockResolvedValue(undefined);
    sendPurchaseReceiptEmailMock.mockResolvedValue({ sent: true });
    sendPaymentFailureEmailMock.mockResolvedValue({ sent: true });
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV = 'true';
    stripeInvoicesUpdateMock.mockResolvedValue({});
    stripeSubscriptionsRetrieveMock.mockResolvedValue({
      id: 'sub_123',
      metadata: {
        purchase_type: 'product_subscription',
        product_id: 'product_1',
        user_id: 'user_1',
        organization_id: 'org_1',
      },
      items: {
        data: [
          {
            metadata: { line_type: 'product_base' },
            price: { unit_amount: 2500 },
          },
          {
            metadata: { line_type: 'platform_fee' },
            price: { unit_amount: 303 },
          },
        ],
      },
    });

    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      totalAmountCents: 5000,
      status: 'OPEN',
      parentBillId: null,
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.bills.update.mockResolvedValue({});
    prismaMock.bills.create.mockResolvedValue({ id: 'bill_created_1' });

    prismaMock.billPayments.findUnique.mockResolvedValue({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PENDING',
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'bill_payment_1',
        amountCents: 5000,
        status: 'PAID',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        paymentIntentId: 'pi_bill_1',
      },
    ]);
    prismaMock.billPayments.update.mockResolvedValue({});
    prismaMock.billPayments.findFirst.mockResolvedValue(null);
    prismaMock.billPayments.create.mockResolvedValue({ id: 'bill_payment_created_1' });

    prismaMock.subscriptions.findFirst.mockResolvedValue(null);
    prismaMock.subscriptions.create.mockResolvedValue({});
    prismaMock.products.findUnique.mockResolvedValue({
      id: 'product_1',
      priceCents: 1200,
      period: 'MONTH',
      organizationId: 'org_1',
    });
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_connected_123' });
    prismaMock.events.update.mockResolvedValue({});
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prismaMock.eventRegistrations.create.mockResolvedValue({});
    prismaMock.eventRegistrations.update.mockResolvedValue({});
    prismaMock.eventRegistrations.updateMany.mockResolvedValue({ count: 0 });
    syncManagedOrganizationStripeAccountMock.mockResolvedValue({ verificationStatus: 'PENDING' });
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: true,
        teamIds: ['team_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);

    prismaMock.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        bills: {
          findUnique: prismaMock.bills.findUnique,
          findMany: prismaMock.bills.findMany,
          update: prismaMock.bills.update,
          create: prismaMock.bills.create,
        },
        billPayments: {
          findUnique: prismaMock.billPayments.findUnique,
          findMany: prismaMock.billPayments.findMany,
          findFirst: prismaMock.billPayments.findFirst,
          update: prismaMock.billPayments.update,
          create: prismaMock.billPayments.create,
        },
        events: {
          update: prismaMock.events.update,
        },
        eventRegistrations: {
          findUnique: prismaMock.eventRegistrations.findUnique,
          create: prismaMock.eventRegistrations.create,
          update: prismaMock.eventRegistrations.update,
          updateMany: prismaMock.eventRegistrations.updateMany,
        },
        $queryRaw: (...args: any[]) => {
          const query = args[0]?.join?.('') ?? '';
          return query.includes('"Bills"') ? Promise.resolve([]) : prismaMock.$queryRaw(...args);
        },
      };
      return callback(tx);
    });
  });

  afterAll(() => {
    if (originalStripeSecret == null) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    if (originalWebhookBypass == null) delete process.env.STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV;
    else process.env.STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV = originalWebhookBypass;
  });


  it('rejects unsigned webhook payloads when verification is not explicitly bypassed', async () => {
    delete process.env.STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV;

    const response = await POST(jsonPost(buildPaymentIntentSucceededEvent({
      intentId: 'pi_forged',
      metadata: { billId: 'bill_1', billPaymentId: 'bill_payment_1' },
    })));

    expect(response.status).toBe(503);
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
    expect(prismaMock.bills.update).not.toHaveBeenCalled();
  });

  it('does not revive a voided parent installment after a team bill split', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'VOID',
    });

    const response = await POST(jsonPost(buildPaymentIntentSucceededEvent({
      intentId: 'pi_voided_parent_1',
      metadata: { billId: 'bill_1', billPaymentId: 'bill_payment_1' },
    })));

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
    expect(prismaMock.bills.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('creates a paid bill and bill payment for an instant event purchase and sends a receipt', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_1' });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: true,
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce(null);

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          organization_id: 'org_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          organizationId: 'org_1',
          totalAmountCents: 4700,
          paidAmountCents: 4700,
          status: 'PAID',
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_instant_1',
          amountCents: 4700,
          status: 'PAID',
          paymentIntentId: 'pi_event_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_1',
          registrantId: 'team_1',
          registrantType: 'TEAM',
          rosterRole: 'WAITLIST',
        }),
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event_1__team__team_1',
          eventId: 'event_1',
          registrantId: 'team_1',
          registrantType: 'TEAM',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'event',
        userId: 'user_1',
        teamId: 'team_1',
        eventId: 'event_1',
        billId: 'bill_instant_1',
        billPaymentId: 'bill_payment_instant_1',
      }),
    );
  });

  it('creates a paid bill for event_payment metadata without activating registration', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_event_payment_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_event_payment_1' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_payment_1',
        metadata: {
          purchase_type: 'event_payment',
          user_id: 'manager_1',
          team_id: 'team_1',
          event_id: 'event_1',
          organization_id: 'org_1',
          event_name: 'Spring Volleyball',
          fees_included_in_price: 'true',
          amount_cents: '4500',
          mvp_fee_cents: '45',
          stripe_fee_cents: '170',
          total_charge_cents: '4500',
        },
        amount: 4500,
        amountReceived: 4500,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          organizationId: 'org_1',
          totalAmountCents: 4500,
          paidAmountCents: 4500,
          status: 'PAID',
          lineItems: [
            { id: 'line_1', type: 'EVENT', label: 'Spring Volleyball', amountCents: 4500 },
          ],
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_event_payment_1',
          amountCents: 4500,
          status: 'PAID',
          paymentIntentId: 'pi_event_payment_1',
          payerUserId: 'manager_1',
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.updateMany).not.toHaveBeenCalled();
  });

  it('syncs managed organization verification when Stripe sends account.updated', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    prismaMock.stripeAccounts.findFirst.mockResolvedValueOnce({ organizationId: 'org_1' });

    const response = await POST(
      jsonPost({
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_org_123',
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(syncManagedOrganizationStripeAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        accountId: 'acct_org_123',
      }),
    );
  });

  it('skips event registration activation when reservation metadata is present but registration is missing', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_missing_res_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_missing_res_1' });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: true,
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce(null);

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_missing_reservation_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          organization_id: 'org_1',
          registration_id: 'event_1__team__team_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
  });

  it('activates an existing weekly team reservation using occurrence-aware registration ids', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_weekly_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_weekly_1' });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        teamSignup: true,
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({ status: 'PENDING' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_weekly_team_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'weekly_parent',
          organization_id: 'org_1',
          registration_id: 'weekly_parent__team__team_1__slot_1__2026-04-14',
          occurrence_slot_id: 'slot_1',
          occurrence_date: '2026-04-14',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'weekly_parent',
          ownerType: 'TEAM',
          ownerId: 'team_1',
          slotId: 'slot_1',
          occurrenceDate: '2026-04-14',
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'weekly_parent__team__team_1__slot_1__2026-04-14' },
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
  });

  it('claims the specifically reserved Placeholder Team and synchronizes Entry and Phase membership on paid ACTIVE acceptance', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_tournament_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_tournament_1' });
    const reservation = {
      id: 'event_1__team__slot_pool_a_2',
      status: 'STARTED',
      registrantId: 'slot_pool_a_2',
      eventTeamId: 'slot_pool_a_2',
      parentId: 'canonical_team_1',
      divisionId: 'entry_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
    };
    type EventTeamState = {
      id: string;
      kind: string;
      parentTeamId: string | null;
      division: string;
      seed: number;
    };
    const eventTeams: EventTeamState[] = [
      { id: 'slot_pool_a_1', kind: 'PLACEHOLDER', parentTeamId: null, division: 'pool_a', seed: 1 },
      { id: 'slot_pool_a_2', kind: 'PLACEHOLDER', parentTeamId: null, division: 'pool_a', seed: 2 },
    ];
    const divisionMembership: { entryOpen: string[]; poolA: string[] } = {
      entryOpen: [],
      poolA: [],
    };
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'TOURNAMENT',
        teamSignup: true,
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce(reservation);
    prismaMock.eventRegistrations.update.mockImplementationOnce(async ({ data }: {
      data: { status?: string };
    }) => {
      if (data.status) reservation.status = data.status;
      return reservation;
    });
    claimOrCreateEventTeamSnapshotMock.mockImplementationOnce(async ({
      eventTeamId,
      canonicalTeamId,
    }: {
      eventTeamId: string;
      canonicalTeamId: string;
    }) => {
      const reservedTeam = eventTeams.find((team) => team.id === eventTeamId);
      if (!reservedTeam) throw new Error('Reserved Placeholder Team not found.');
      reservedTeam.kind = 'REGISTERED';
      reservedTeam.parentTeamId = canonicalTeamId;
      return reservedTeam;
    });
    syncDivisionTeamMembershipFromRegistrationsMock.mockImplementationOnce(async () => {
      divisionMembership.entryOpen = ['slot_pool_a_2'];
      divisionMembership.poolA = ['slot_pool_a_2'];
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_tournament_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'slot_pool_a_2',
          event_registration_parent_id: 'canonical_team_1',
          event_id: 'event_1',
          registration_id: 'event_1__team__slot_pool_a_2',
          event_registration_division_id: 'entry_open',
          event_registration_division_type_id: 'open',
          event_registration_division_type_key: 'c_skill_open',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(reservation.status).toBe('ACTIVE');
    expect(eventTeams).toEqual([
      { id: 'slot_pool_a_1', kind: 'PLACEHOLDER', parentTeamId: null, division: 'pool_a', seed: 1 },
      { id: 'slot_pool_a_2', kind: 'REGISTERED', parentTeamId: 'canonical_team_1', division: 'pool_a', seed: 2 },
    ]);
    expect(divisionMembership).toEqual({
      entryOpen: ['slot_pool_a_2'],
      poolA: ['slot_pool_a_2'],
    });
  });

  it('keeps payment durable while rolling back a failed paid claim, then finishes the same reservation on retry', async () => {
    const reservation = {
      id: 'event_1__team__slot_pool_a_2',
      status: 'STARTED',
      registrantId: 'slot_pool_a_2',
      eventTeamId: 'slot_pool_a_2',
      parentId: 'canonical_team_1',
      divisionId: 'entry_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
    };
    const reservedPlaceholder: {
      id: string;
      kind: string;
      parentTeamId: string | null;
      division: string;
      seed: number;
    } = {
      id: 'slot_pool_a_2',
      kind: 'PLACEHOLDER',
      parentTeamId: null,
      division: 'pool_a',
      seed: 2,
    };
    const activationUpdateMock = jest.fn(async ({ data }: {
      data: { status?: string };
    }) => {
      if (data.status) reservation.status = data.status;
      return reservation;
    });
    const transactionClient = {
      bills: {
        create: prismaMock.bills.create,
      },
      billPayments: {
        findFirst: prismaMock.billPayments.findFirst,
        create: prismaMock.billPayments.create,
      },
      events: {
        update: prismaMock.events.update,
      },
      eventRegistrations: {
        findUnique: jest.fn().mockResolvedValue(reservation),
        create: prismaMock.eventRegistrations.create,
        update: activationUpdateMock,
        updateMany: prismaMock.eventRegistrations.updateMany,
      },
      $queryRaw: prismaMock.$queryRaw,
    };
    prismaMock.$transaction.mockImplementation(async (
      callback: (tx: typeof transactionClient) => Promise<unknown>,
    ) => {
      const reservationStatusBefore = reservation.status;
      const placeholderBefore = { ...reservedPlaceholder };
      try {
        return await callback(transactionClient);
      } catch (error) {
        reservation.status = reservationStatusBefore;
        Object.assign(reservedPlaceholder, placeholderBefore);
        throw error;
      }
    });
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'event_1',
        eventType: 'TOURNAMENT',
        teamSignup: true,
      },
    ]);
    claimOrCreateEventTeamSnapshotMock.mockImplementationOnce(async ({
      eventTeamId,
      canonicalTeamId,
    }: {
      eventTeamId: string;
      canonicalTeamId: string;
    }) => {
      if (eventTeamId !== reservedPlaceholder.id) {
        throw new Error('Webhook attempted to claim a different Placeholder Team.');
      }
      reservedPlaceholder.kind = 'REGISTERED';
      reservedPlaceholder.parentTeamId = canonicalTeamId;
      return reservedPlaceholder;
    });
    syncDivisionTeamMembershipFromRegistrationsMock.mockImplementationOnce(async () => {
      throw new Error('Phase membership synchronization failed.');
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_tournament_atomic_failure',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'slot_pool_a_2',
          event_registration_parent_id: 'canonical_team_1',
          event_id: 'event_1',
          registration_id: 'event_1__team__slot_pool_a_2',
          event_registration_division_id: 'entry_open',
          event_registration_division_type_id: 'open',
          event_registration_division_type_key: 'c_skill_open',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      received: false,
      retryable: true,
      error: 'Event registration finalization failed.',
    });
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PAID',
        paymentIntentId: 'pi_tournament_atomic_failure',
      }),
    }));
    expect(reservation.status).toBe('STARTED');
    expect(reservedPlaceholder).toEqual({
      id: 'slot_pool_a_2',
      kind: 'PLACEHOLDER',
      parentTeamId: null,
      division: 'pool_a',
      seed: 2,
    });

    prismaMock.billPayments.findFirst.mockResolvedValue({
      id: 'bill_payment_created_1',
      billId: 'bill_created_1',
      status: 'PAID',
    });
    claimOrCreateEventTeamSnapshotMock.mockImplementationOnce(async ({
      eventTeamId,
      canonicalTeamId,
    }: {
      eventTeamId: string;
      canonicalTeamId: string;
    }) => {
      if (eventTeamId !== reservedPlaceholder.id) {
        throw new Error('Webhook retried a different Placeholder Team.');
      }
      reservedPlaceholder.kind = 'REGISTERED';
      reservedPlaceholder.parentTeamId = canonicalTeamId;
      return reservedPlaceholder;
    });

    const retryResponse = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_tournament_atomic_failure',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'slot_pool_a_2',
          event_registration_parent_id: 'canonical_team_1',
          event_id: 'event_1',
          registration_id: 'event_1__team__slot_pool_a_2',
          event_registration_division_id: 'entry_open',
          event_registration_division_type_id: 'open',
          event_registration_division_type_key: 'c_skill_open',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(retryResponse.status).toBe(200);
    expect(reservation.status).toBe('ACTIVE');
    expect(reservedPlaceholder).toEqual({
      id: 'slot_pool_a_2',
      kind: 'REGISTERED',
      parentTeamId: 'canonical_team_1',
      division: 'pool_a',
      seed: 2,
    });
    expect(prismaMock.billPayments.create).toHaveBeenCalledTimes(1);
  });

  it('uses weekly bill occurrence fields when activating a paid existing bill registration', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_weekly_1',
      billId: 'bill_weekly_1',
      status: 'PENDING',
    });
    prismaMock.bills.findUnique
      .mockResolvedValueOnce({
        id: 'bill_weekly_1',
        totalAmountCents: 4700,
        status: 'OPEN',
        parentBillId: null,
      })
      .mockResolvedValueOnce({
        ownerType: 'TEAM',
        ownerId: 'team_1',
        eventId: 'weekly_parent',
        organizationId: 'org_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-04-14',
        lineItems: [],
      });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        teamSignup: true,
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({ status: 'STARTED' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_weekly_bill_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          bill_id: 'bill_weekly_1',
          bill_payment_id: 'bill_payment_weekly_1',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'weekly_parent__team__team_1__slot_1__2026-04-14' },
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      }),
    );
  });



  it('marks an async event registration payment as pending when the payment intent is processing', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: false,
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({ status: 'STARTED' });

    const response = await POST(
      jsonPost(buildPaymentIntentEvent({
        type: 'payment_intent.processing',
        intentId: 'pi_event_processing_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          event_id: 'event_1',
          registration_id: 'event_1__self__user_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 0,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'USER',
          ownerId: 'user_1',
          eventId: 'event_1',
          paidAmountCents: 0,
          status: 'PENDING',
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PROCESSING',
          paymentIntentId: 'pi_event_processing_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__self__user_1' },
        data: expect.objectContaining({
          status: 'PENDING',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('marks a pending event registration payment failed when the payment intent fails', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: false,
      },
    ]);
    prismaMock.eventRegistrations.updateMany.mockResolvedValueOnce({ count: 1 });

    const response = await POST(
      jsonPost(buildPaymentIntentEvent({
        type: 'payment_intent.payment_failed',
        intentId: 'pi_event_failed_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          event_id: 'event_1',
          registration_id: 'event_1__self__user_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 0,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'event_1__self__user_1',
          status: { in: ['STARTED', 'PENDING'] },
        }),
        data: expect.objectContaining({
          status: 'PAYMENT_FAILED',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
    expect(sendPaymentFailureEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      purchaseType: 'event',
      paymentIntentId: 'pi_event_failed_1',
      userId: 'user_1',
      eventId: 'event_1',
    }));
  });


  it('reopens a paid bill when Stripe later reports the same payment intent failed', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_failed_late_1',
      billId: 'bill_failed_late_1',
      status: 'PAID',
      amountCents: 5141,
      paymentIntentId: 'pi_failed_late_1',
    });
    prismaMock.bills.findUnique.mockResolvedValueOnce({
      id: 'bill_failed_late_1',
      paymentPlanEnabled: false,
    });

    const response = await POST(
      jsonPost(buildPaymentIntentEvent({
        type: 'payment_intent.payment_failed',
        intentId: 'pi_failed_late_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_failed_late_1',
          bill_payment_id: 'bill_payment_failed_late_1',
          user_id: 'user_1',
        },
        amount: 5141,
        amountReceived: 0,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_payment_failed_late_1' },
        data: expect.objectContaining({
          status: 'FAILED',
          paidAt: null,
          paymentIntentId: 'pi_failed_late_1',
        }),
      }),
    );
    expect(prismaMock.bills.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_failed_late_1' },
        data: expect.objectContaining({
          paidAmountCents: 0,
          status: 'OPEN',
          nextPaymentAmountCents: 5141,
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('reopens a paid bill when a disputed payment intent is lost', async () => {
    prismaMock.billPayments.findFirst.mockResolvedValueOnce({
      id: 'bill_payment_disputed_1',
      billId: 'bill_disputed_1',
      status: 'PAID',
    });
    prismaMock.bills.findUnique.mockResolvedValueOnce({
      id: 'bill_disputed_1',
      totalAmountCents: 5141,
      status: 'PAID',
      parentBillId: null,
    });
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'bill_payment_disputed_1',
        amountCents: 5141,
        status: 'DISPUTED',
        dueDate: new Date('2026-05-19T00:00:00.000Z'),
        paymentIntentId: 'pi_disputed_1',
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValueOnce([]);

    const response = await POST(
      jsonPost(buildDisputeClosedEvent({
        disputeId: 'du_lost_1',
        paymentIntentId: 'pi_disputed_1',
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_payment_disputed_1' },
        data: expect.objectContaining({
          status: 'DISPUTED',
          paidAt: null,
        }),
      }),
    );
    expect(prismaMock.bills.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_disputed_1' },
        data: expect.objectContaining({
          paidAmountCents: 0,
          status: 'OPEN',
          nextPaymentAmountCents: 5141,
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('is idempotent for repeated instant webhook events by payment intent id', async () => {
    prismaMock.billPayments.findFirst.mockResolvedValueOnce({
      id: 'bill_payment_existing_1',
      billId: 'bill_existing_1',
      status: 'PAID',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_duplicate_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          amount_cents: '4500',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.bills.create).not.toHaveBeenCalled();
    expect(prismaMock.billPayments.create).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('creates a paid bill for a single-purchase product without creating a subscription record', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_product_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_product_1' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_product_1',
        metadata: {
          purchase_type: 'product',
          user_id: 'user_1',
          organization_id: 'org_1',
          product_id: 'product_1',
          product_name: 'Day pass',
          amount_cents: '2000',
        },
        amount: 2150,
        amountReceived: 2150,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'USER',
          ownerId: 'user_1',
          organizationId: 'org_1',
          totalAmountCents: 2150,
          paidAmountCents: 2150,
          status: 'PAID',
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              type: 'PRODUCT',
              label: 'Day pass',
            }),
          ]),
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_product_1',
          amountCents: 2150,
          status: 'PAID',
          paymentIntentId: 'pi_product_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.subscriptions.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.subscriptions.create).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'product',
        productId: 'product_1',
        billId: 'bill_product_1',
        billPaymentId: 'bill_payment_product_1',
      }),
    );
  });

  it('marks bill installments paid and sends a receipt on first successful bill payment', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PENDING',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_bill_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_1',
          bill_payment_id: 'bill_payment_1',
          user_id: 'user_1',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_payment_1' },
        data: expect.objectContaining({
          status: 'PAID',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'bill',
        billId: 'bill_1',
        billPaymentId: 'bill_payment_1',
      }),
    );
  });

  it('does not send duplicate receipt emails when bill payment is already marked paid', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PAID',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_bill_already_paid_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_1',
          bill_payment_id: 'bill_payment_1',
          user_id: 'user_1',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('configures renewal invoices for connected-account destination charges on invoice.created', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const response = await POST(
      jsonPost({
        type: 'invoice.created',
        data: {
          object: {
            id: 'in_123',
            status: 'draft',
            total: 2978,
            parent: {
              subscription_details: {
                subscription: 'sub_123',
              },
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(stripeSubscriptionsRetrieveMock).toHaveBeenCalledWith('sub_123', {
      expand: ['items.data.price'],
    });
    expect(stripeInvoicesUpdateMock).toHaveBeenCalledWith('in_123', {
      application_fee_amount: 478,
      transfer_data: {
        destination: 'acct_connected_123',
      },
    });
  });
});
