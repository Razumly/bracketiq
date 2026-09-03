import { render, screen } from '@testing-library/react';

import OrganizationReviewsTabContent from '../OrganizationReviewsTabContent';

jest.mock('../OrganizationReviewsPanel', () => ({
  __esModule: true,
  default: () => <div>Reviews panel</div>,
}));

describe('OrganizationReviewsTabContent', () => {
  it('delegates the organization tab to the reviews panel', () => {
    render(<OrganizationReviewsTabContent organizationId="org-1" />);

    expect(screen.getByText('Reviews panel')).toBeInTheDocument();
  });
});
