import type { EventRegistrationPaymentResolutionReason } from '@/contracts/eventParticipants';

export type EventRegistrationPaymentResolution = {
  targetStatus: 'CANCELLED';
  paymentResolutionReason: EventRegistrationPaymentResolutionReason;
};
export type EventRegistrationPaymentTargetStatus = 'ACTIVE' | 'PENDING';

export const resolveEventRegistrationPaymentTargetStatus = ({
  parentBillId,
  billStatus,
}: {
  parentBillId: string | null | undefined;
  billStatus: 'OPEN' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
}): EventRegistrationPaymentTargetStatus => (
  !parentBillId || billStatus === 'PAID' ? 'ACTIVE' : 'PENDING'
);


export const isPermanentEventRegistrationFailure = (
  failureReason: string | undefined,
): failureReason is EventRegistrationPaymentResolutionReason => (
  failureReason === 'capacity_exceeded'
  || failureReason === 'invalid_registration_unit'
);

export const resolveEventRegistrationPaymentFailure = (
  failureReason: string | undefined,
): EventRegistrationPaymentResolution | null => {
  if (!isPermanentEventRegistrationFailure(failureReason)) {
    return null;
  }

  return {
    targetStatus: 'CANCELLED',
    paymentResolutionReason: failureReason,
  };
};
