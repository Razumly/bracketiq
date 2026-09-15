import type { RefundRequest } from '@/types';

export function formatRefundMoney(amountCents: number | undefined, currency: string | undefined): string {
  if (amountCents === undefined || !Number.isSafeInteger(amountCents) || amountCents < 0 || !currency) {
    return 'Unavailable';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.trim().toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return 'Unavailable';
  }
}

export function refundRequestedAmount(refund: RefundRequest): string {
  return formatRefundMoney(
    refund.requestedAmountCents ?? refund.approvalPreview?.refundableAmountCents,
    refund.currency ?? refund.approvalPreview?.currency,
  );
}

export function refundApprovalUnavailableReason(preview: RefundRequest['approvalPreview']): string | null {
  if (!preview?.isValid || !Number.isInteger(preview.scopeVersion) || preview.scopeVersion <= 0 || !preview.scopeHash?.trim()) {
    return 'Approval preview unavailable. Reload the requests before approval.';
  }
  if (!Number.isSafeInteger(preview.refundableAmountCents) || preview.refundableAmountCents <= 0) {
    return 'No refundable amount is available for approval.';
  }
  return null;
}
