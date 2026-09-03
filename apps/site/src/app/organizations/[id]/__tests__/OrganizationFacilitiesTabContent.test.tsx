import { render, screen } from '@testing-library/react';

import OrganizationFacilitiesTabContent from '../OrganizationFacilitiesTabContent';

jest.mock('@/components/rentals/RentalReservationCheckout', () => ({
  __esModule: true,
  default: ({ children }: { children: (props: { onRentalSelectionReady: jest.Mock }) => React.ReactNode }) => (
    <div>{children({ onRentalSelectionReady: jest.fn() })}</div>
  ),
}));

jest.mock('../FieldsTabContent', () => ({
  __esModule: true,
  default: () => <div>Fields tab content</div>,
}));

describe('OrganizationFacilitiesTabContent', () => {
  it('composes the rental checkout and fields surfaces', () => {
    render(
      <OrganizationFacilitiesTabContent
        organization={{ $id: 'org-1', name: 'Test Organization' } as never}
        organizationId="org-1"
        currentUser={null}
        rentalOrderSlug="test-organization"
        canManageFields
      />,
    );

    expect(screen.getByText('Fields tab content')).toBeInTheDocument();
  });
});
