import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, type AuthContext } from '@/lib/permissions';
import { parseDateInput } from '@/server/requestParsing';
import { BillPaymentsStatusEnum, BillsStatusEnum } from '@/generated/prisma/enums';
import { type Prisma } from '@/generated/prisma/client';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { canManageOrganization, hasOrgPermission } from '@/server/accessControl';
import { listOrganizationUsersScopeEvents } from '@/server/organizationUsersAccess';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  ownerType: z.enum(['USER', 'TEAM']),
  ownerId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(200),
  totalAmountCents: z.number(),
  paidAmountCents: z.number().nonnegative(),
  dueDate: z.string().trim().min(1),
}).strict();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const canManageCustomerBilling = async (
  session: AuthContext,
  organization: { id: string; ownerId: string },
): Promise<boolean> => {
  if (session.isAdmin || await canManageOrganization(session, organization)) {
    return true;
  }
  return hasOrgPermission(session, organization, ORG_PERMISSIONS.BILLING_MANAGE)
    || hasOrgPermission(session, organization, ORG_PERMISSIONS.PAYMENTS_MANAGE);
};

const customerBelongsToOrganization = async (params: {
  organizationId: string;
  ownerType: 'USER' | 'TEAM';
  ownerId: string;
}): Promise<boolean> => {
  const scopeEvents = await listOrganizationUsersScopeEvents(params.organizationId);
  if (params.ownerType === 'TEAM') {
    if (scopeEvents.some((event) => event.teamIds.includes(params.ownerId))) {
      return true;
    }
    const canonicalTeam = await prisma.canonicalTeams.findFirst({
      where: { id: params.ownerId, organizationId: params.organizationId },
      select: { id: true },
    });
    return Boolean(canonicalTeam);
  }

  if (scopeEvents.some((event) => event.userIds.includes(params.ownerId))) {
    return true;
  }

  const canonicalTeams = await prisma.canonicalTeams.findMany({
    where: { organizationId: params.organizationId },
    select: { id: true },
  });
  if (!canonicalTeams.length) {
    return false;
  }
  const registration = await prisma.teamRegistrations.findFirst({
    where: {
      teamId: { in: canonicalTeams.map((team) => team.id) },
      userId: params.ownerId,
      status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
    },
    select: { id: true },
  });
  return Boolean(registration);
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id: organizationId } = await params;
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }
  if (!(await canManageCustomerBilling(session, organization))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const ownerId = normalizeId(parsed.data.ownerId);
  if (!ownerId) {
    return NextResponse.json({ error: 'ownerId is required.' }, { status: 400 });
  }
  if (!await customerBelongsToOrganization({ organizationId, ownerType: parsed.data.ownerType, ownerId })) {
    return NextResponse.json({ error: 'Customer is not part of this organization.' }, { status: 404 });
  }

  const totalAmountCents = Math.round(parsed.data.totalAmountCents);
  const paidAmountCents = Math.round(parsed.data.paidAmountCents);
  if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
    return NextResponse.json({ error: 'totalAmountCents must be greater than 0.' }, { status: 400 });
  }
  if (!Number.isFinite(paidAmountCents) || paidAmountCents < 0 || paidAmountCents > totalAmountCents) {
    return NextResponse.json({ error: 'paidAmountCents must be between 0 and totalAmountCents.' }, { status: 400 });
  }
  const dueDate = parseDateInput(parsed.data.dueDate);
  if (!dueDate) {
    return NextResponse.json({ error: 'dueDate must be a valid date.' }, { status: 400 });
  }

  const now = new Date();
  const remainingAmountCents = totalAmountCents - paidAmountCents;
  const billStatus = remainingAmountCents === 0 ? BillsStatusEnum.PAID : BillsStatusEnum.OPEN;
  const paymentStatus = paidAmountCents === totalAmountCents
    ? BillPaymentsStatusEnum.PAID
    : paidAmountCents > 0
      ? BillPaymentsStatusEnum.PARTIAL
      : BillPaymentsStatusEnum.PENDING;
  const billId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const result = await prisma.$transaction(async (tx) => {
    const billData: Prisma.BillsUncheckedCreateInput = {
      id: billId,
      createdAt: now,
      updatedAt: now,
      ownerType: parsed.data.ownerType,
      ownerId,
      organizationId,
      eventId: null,
      slotId: null,
      occurrenceDate: null,
      totalAmountCents,
      paidAmountCents,
      nextPaymentDue: remainingAmountCents > 0 ? dueDate : null,
      nextPaymentAmountCents: remainingAmountCents > 0 ? remainingAmountCents : null,
      parentBillId: null,
      allowSplit: false,
      status: billStatus,
      paymentPlanEnabled: false,
      createdBy: session.userId,
      sourceType: 'MANUAL_CUSTOMER_BILL',
      sourceId: null,
      lineItems: [{
        id: 'line_1',
        type: 'OTHER',
        label: parsed.data.label,
        amountCents: totalAmountCents,
      }],
    };
    const bill = await tx.bills.create({ data: billData });
    const paymentData: Prisma.BillPaymentsUncheckedCreateInput = {
      id: paymentId,
      createdAt: now,
      updatedAt: now,
      billId,
      sequence: 1,
      dueDate,
      amountCents: totalAmountCents,
      status: paymentStatus,
      paidAt: paidAmountCents > 0 ? now : null,
      paymentIntentId: null,
      payerUserId: parsed.data.ownerType === 'USER' ? ownerId : null,
      paidAmountCents,
      refundedAmountCents: 0,
      taxAmountCents: 0,
      stripeProcessingFeeCents: 0,
      stripeTaxServiceFeeCents: 0,
    };
    const payment = await tx.billPayments.create({ data: paymentData });
    return { bill, payment };
  });

  return NextResponse.json({ bill: result.bill, payment: result.payment }, { status: 201 });
}
