/** @jest-environment node */

import { resolveEventRegistrationPaymentFailure } from '@/server/billing/eventRegistrationPaymentResolution';

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
});
