import { Check, Clock } from 'lucide-react';
import { Button, Loader } from '@/components/organization/organization-operation-ui';
import { formatPrice, type FeeBreakdown } from '@/types';
import type { PaymentModalCopy } from './paymentModalCopy';

type PaymentResultViewProps = {
  view: 'success' | 'pending';
  reloading: boolean;
  copy: PaymentModalCopy;
  onClose: () => void;
  closeLabel?: string;
  orderName?: string;
  orderDetail?: string;
  originalPrice?: number;
  feeBreakdown?: FeeBreakdown;
};

export function PaymentOrderSummary({
  feeBreakdown,
  originalPrice,
  totalLabel = 'Total today',
}: {
  feeBreakdown: FeeBreakdown;
  originalPrice?: number;
  totalLabel?: string;
}) {
  const tax = feeBreakdown.taxAmount ?? 0;
  const addedFees = feeBreakdown.totalCharge - feeBreakdown.eventPrice - tax;
  const discount = Math.max(0, (originalPrice ?? feeBreakdown.eventPrice) - feeBreakdown.eventPrice);
  return (
    <div className="space-y-4 text-left">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Price</dt><dd className="tabular-nums">{formatPrice(feeBreakdown.eventPrice + discount)}</dd></div>
        {discount > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">−{formatPrice(discount)}</dd></div>}
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Processing fees</dt><dd className="tabular-nums">{addedFees > 0 ? formatPrice(addedFees) : 'Included'}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{formatPrice(tax)}</dd></div>
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 font-semibold"><dt>{totalLabel}</dt><dd className="text-2xl tabular-nums">{formatPrice(feeBreakdown.totalCharge)}</dd></div>
      </dl>
      <details className="text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer content-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{addedFees > 0 ? 'Fee details' : 'Included fee details'}</summary>
        <dl className="space-y-2 pb-2">
          <div className="flex justify-between gap-4"><dt>Processing fee</dt><dd className="tabular-nums">{formatPrice(feeBreakdown.processingFee)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Stripe fee</dt><dd className="tabular-nums">{formatPrice(feeBreakdown.stripeFee)}</dd></div>
        </dl>
      </details>
    </div>
  );
}

const resultContent = {
  success: {
    Icon: Check,
    tone: 'border-ring bg-secondary',
    title: 'Payment successful',
    description: 'Stripe confirmed your payment.',
  },
  pending: {
    Icon: Clock,
    tone: 'border-border bg-muted',
    title: 'Payment pending',
    description: 'Your bank payment is processing. This purchase is not complete until Stripe confirms payment. Do not pay again while it is pending.',
  },
};

export function PaymentResultView({
  view,
  reloading,
  copy,
  onClose,
  closeLabel = 'Close',
  orderName,
  orderDetail,
  originalPrice,
  feeBreakdown,
}: PaymentResultViewProps) {
  const { Icon, tone, title, description } = resultContent[view];
  return (
    <div className="space-y-6">
      <div className={`org-radius-surface flex items-start gap-4 border p-5 ${tone}`} role="status">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-current"><Icon aria-hidden="true" className="size-6" /></span>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">{title}</h3>
          {orderName && <p className="font-medium">{orderName}</p>}
          {orderDetail && <p className="text-sm text-muted-foreground">{orderDetail}</p>}
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {feeBreakdown && <PaymentOrderSummary feeBreakdown={feeBreakdown} originalPrice={originalPrice} totalLabel={view === 'success' ? 'Paid today' : 'Payment pending'} />}
      {reloading && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader size="sm" /><span>{copy.reloadingMessage}</span></div>}
      <Button onClick={onClose}>{closeLabel}</Button>
    </div>
  );
}
