export type PermanentEventRegistrationFailureReason =
  | 'capacity_exceeded'
  | 'invalid_registration_unit';

export type EventRegistrationPaymentResolution = {
  targetStatus: 'CANCELLED';
  paymentResolutionReason: PermanentEventRegistrationFailureReason;
};

export const isPermanentEventRegistrationFailure = (
  failureReason: string | undefined,
): failureReason is PermanentEventRegistrationFailureReason => (
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
