import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, type AuthContext } from '@/lib/permissions';
import { BillPaymentsStatusEnum, BillsStatusEnum } from '@/generated/prisma/enums';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { canManageOrganization, hasOrgPermission } from '@/server/accessControl';
import { parseDateInput } from '@/server/requestParsing';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  label: z.string().trim().min(1).max(200),
  totalAmountCents: z.number(),
  paidAmountCents: z.number().nonnegative(),
  dueDate: z.string().trim().min(1),
}).strict();

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> },
) {
  const session = await requireSession(req);
  const { id: organizationId, billId } = await params;
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

  const bill = await prisma.bills.findUnique({
    where: { id: billId },
    select: {
      id: true,
      organizationId: true,
      eventId: true,
      sourceType: true,
      totalAmountCents: true,
      paidAmountCents: true,
    },
  });
  if (!bill || bill.organizationId !== organizationId) {
    return NextResponse.json({ error: 'Bill not found.' }, { status: 404 });
  }
  if (bill.eventId || (bill.sourceType && bill.sourceType !== 'MANUAL_CUSTOMER_BILL')) {
    return NextResponse.json({ error: 'Only customer bills can be edited from this page.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
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

  const existingPayments = await prisma.billPayments.findMany({
    where: { billId: bill.id },
    orderBy: { sequence: 'asc' },
  });
  if (existingPayments.length !== 1) {
    return NextResponse.json({ error: 'Only single-payment customer bills can be edited here.' }, { status: 400 });
  }
  const existingPayment = existingPayments[0];
  if (existingPayment.paymentIntentId) {
    return NextResponse.json({ error: 'Bills with online payments cannot be edited here.' }, { status: 400 });
  }
  if (paidAmountCents < existingPayment.refundedAmountCents) {
    return NextResponse.json({ error: 'Paid amount cannot be less than the refunded amount.' }, { status: 400 });
  }

  const now = new Date();
  const remainingAmountCents = totalAmountCents - paidAmountCents;
  const billStatus = remainingAmountCents === 0 ? BillsStatusEnum.PAID : BillsStatusEnum.OPEN;
  const paymentStatus = paidAmountCents === totalAmountCents
    ? BillPaymentsStatusEnum.PAID
    : paidAmountCents > 0
      ? BillPaymentsStatusEnum.PARTIAL
      : BillPaymentsStatusEnum.PENDING;
  const payment = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.billPayments.update({
      where: { id: existingPayment.id },
      data: {
        updatedAt: now,
        dueDate,
        amountCents: totalAmountCents,
        status: paymentStatus,
        paidAt: paidAmountCents > 0 ? existingPayment.paidAt ?? now : null,
        paidAmountCents,
      },
    });
    await tx.bills.update({
      where: { id: bill.id },
      data: {
        updatedAt: now,
        totalAmountCents,
        paidAmountCents,
        nextPaymentDue: remainingAmountCents > 0 ? dueDate : null,
        nextPaymentAmountCents: remainingAmountCents > 0 ? remainingAmountCents : null,
        status: billStatus,
        lineItems: [{
          id: 'line_1',
          type: 'OTHER',
          label: parsed.data.label,
          amountCents: totalAmountCents,
        }],
      },
    });
    return updatedPayment;
  });

  const updatedBill = await prisma.bills.findUnique({ where: { id: bill.id } });
  return NextResponse.json({ bill: updatedBill, payment }, { status: 200 });
}
