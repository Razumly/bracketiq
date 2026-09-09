/** @jest-environment node */

import {
  resolveEventRegistrationPaymentFailure,
  resolveEventRegistrationPaymentTargetStatus,
} from '@/server/billing/eventRegistrationPaymentResolution';

describe('event registration payment resolution', () => {
  it('returns a cancellation resolution for a permanent capacity failure', () => {
    expect(resolveEventRegistrationPaymentFailure('capacity_exceeded')).toEqual({
      targetStatus: 'CANCELLED',
      paymentResolutionReason: 'capacity_exceeded',
    });
  });

  it('returns no resolution for a retryable or unrelated failure', () => {
    expect(resolveEventRegistrationPaymentFailure('retryable_error')).toBeNull();
    expect(resolveEventRegistrationPaymentFailure(undefined)).toBeNull();
  });

  it('activates a split registration when its parent bill is fully paid', () => {
    expect(resolveEventRegistrationPaymentTargetStatus({
      parentBillId: 'bill_parent_1',
      billStatus: 'PAID',
    })).toBe('ACTIVE');
    expect(resolveEventRegistrationPaymentTargetStatus({
      parentBillId: 'bill_parent_1',
      billStatus: 'OPEN',
    })).toBe('PENDING');
  });
});
