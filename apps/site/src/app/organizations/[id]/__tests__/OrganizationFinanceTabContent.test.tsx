import { render, screen } from '@testing-library/react';

import OrganizationFinanceTabContent from '../OrganizationFinanceTabContent';

jest.mock('../OrganizationFinancePanel', () => ({
  __esModule: true,
  default: () => <div>Finance panel</div>,
}));

describe('OrganizationFinanceTabContent', () => {
  it('delegates the organization tab to the finance panel', () => {
    render(
      <OrganizationFinanceTabContent
        organizationId="org-1"
        isActive
        canManage
      />,
    );

    expect(screen.getByText('Finance panel')).toBeInTheDocument();
  });
});
