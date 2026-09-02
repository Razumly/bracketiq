import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OrganizationManagementShell } from '../OrganizationManagementShell';
import type { OrganizationTabOption } from '@/app/organizations/[id]/organizationTabs';

const organization = {
  $id: 'org_1',
  name: 'Austin Hoops',
  location: 'Austin, TX',
  sports: ['Basketball'],
};

const availableTabs: OrganizationTabOption[] = [
  { label: 'Overview', value: 'overview' },
  { label: 'Reviews', value: 'reviews' },
  { label: 'Events', value: 'events' },
  { label: 'Finance', value: 'finance' },
];

const renderReadyShell = (activeTab: OrganizationTabOption['value'] = 'overview', onTabChange = jest.fn()) => render(
  <OrganizationManagementShell
    organization={organization}
    status="ready"
    availableTabs={availableTabs}
    activeTab={activeTab}
    onTabChange={onTabChange}
  >
    <p>Overview content</p>
  </OrganizationManagementShell>,
);

describe('OrganizationManagementShell', () => {
  it('changes the active section from desktop navigation without clipping the tab list', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();

    renderReadyShell('overview', onTabChange);

    await user.click(screen.getByRole('tab', { name: 'Reviews' }));

    expect(onTabChange.mock.calls[0]?.[0]).toBe('reviews');
  });

  it('opens a searchable mobile section drawer and closes after selecting a section', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();

    renderReadyShell('overview', onTabChange);

    await user.click(screen.getByRole('button', { name: /Organization sections Overview/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Find an Organization section' });
    await user.type(search, 'finance');
    expect(screen.getByRole('button', { name: /Finance/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Finance/i }));

    expect(onTabChange).toHaveBeenCalledWith('finance');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('provides a recovery action for a permission-denied section', async () => {
    const user = userEvent.setup();
    const onBackToOrganizations = jest.fn();

    render(
      <OrganizationManagementShell
        organization={organization}
        status="permission-denied"
        availableTabs={availableTabs}
        activeTab="finance"
        onTabChange={jest.fn()}
        onBackToOrganizations={onBackToOrganizations}
      />,
    );

    expect(screen.getByRole('heading', { name: 'You do not have permission' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to My organizations/i }));

    expect(onBackToOrganizations).toHaveBeenCalledTimes(1);
  });

  it('renders accessible loading and retry states', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    const { rerender } = render(
      <OrganizationManagementShell
        status="loading"
        availableTabs={availableTabs}
        activeTab="overview"
        onTabChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Loading Organization overview')).toBeInTheDocument();

    rerender(
      <OrganizationManagementShell
        status="error"
        availableTabs={availableTabs}
        activeTab="overview"
        onTabChange={jest.fn()}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not offer profile editing in the empty state without edit permission', () => {
    render(
      <OrganizationManagementShell
        organization={organization}
        status="ready"
        availableTabs={availableTabs}
        activeTab="overview"
        onTabChange={jest.fn()}
        isOverviewEmpty
        onEditOrganization={jest.fn()}
        canEditOrganization={false}
      />,
    );

    expect(screen.getByTestId('organization-overview-empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete profile' })).not.toBeInTheDocument();
  });
});
