'use client';

import type { ComponentProps } from 'react';

import RentalReservationCheckout from '@/components/rentals/RentalReservationCheckout';
import FieldsTabContent from './FieldsTabContent';

type FieldsTabContentProps = ComponentProps<typeof FieldsTabContent>;
type RentalReservationCheckoutProps = ComponentProps<typeof RentalReservationCheckout>;

export type OrganizationFacilitiesTabContentProps = Omit<
  FieldsTabContentProps,
  'onRentalSelectionReady'
> & Pick<RentalReservationCheckoutProps, 'rentalOrderSlug'>;

export default function OrganizationFacilitiesTabContent({
  organization,
  organizationId,
  currentUser,
  rentalOrderSlug,
  ...fieldsProps
}: OrganizationFacilitiesTabContentProps) {
  return (
    <RentalReservationCheckout
      organization={organization}
      currentUser={currentUser}
      rentalOrderSlug={rentalOrderSlug}
    >
      {({ onRentalSelectionReady }) => (
        <FieldsTabContent
          organization={organization}
          organizationId={organizationId}
          currentUser={currentUser}
          {...fieldsProps}
          onRentalSelectionReady={onRentalSelectionReady}
        />
      )}
    </RentalReservationCheckout>
  );
}
