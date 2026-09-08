import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OrganizationManagementShell } from '../OrganizationManagementShell';
import type { OrganizationTabOption } from '@/app/organizations/[id]/organizationTabs';
import OrganizationEventTemplatesTabContent from '@/app/organizations/[id]/OrganizationEventTemplatesTabContent';

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
  it('keeps refresh errors and retry available for an empty Organization', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    render(<OrganizationManagementShell
      organization={organization} status="ready" availableTabs={availableTabs}
      activeTab="overview" onTabChange={jest.fn()} isOverviewEmpty
      errorMessage="Connection lost" onRetry={onRetry}
    />);
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('changes the active section from desktop navigation without clipping the tab list', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();

    renderReadyShell('overview', onTabChange);

    await user.click(screen.getByRole('tab', { name: 'Reviews' }));

    expect(onTabChange.mock.calls[0]?.[0]).toBe('reviews');
  });

  it('keeps tab filters and focus through an organization refresh', async () => {
    const user = userEvent.setup();
    const content = (loading: boolean) => (
      <OrganizationManagementShell
        organization={organization}
        status="ready"
        availableTabs={availableTabs}
        activeTab="eventTemplates"
        onTabChange={jest.fn()}
        isTabLoading={loading}
      >
        <OrganizationEventTemplatesTabContent
          eventTemplates={[{ id: 'saturday', name: 'Saturday League' }, { id: 'sunday', name: 'Sunday League' }]}
          isLoading={false}
          error={null}
          onRefresh={jest.fn()}
          onCreateEvent={jest.fn()}
        />
      </OrganizationManagementShell>
    );
    const { rerender } = render(content(false));
    const search = screen.getByRole('textbox', { name: 'Search event templates' });
    await user.type(search, 'Saturday');
    rerender(content(true));
    expect(search).toHaveFocus();
    expect(search).toHaveValue('Saturday');
    expect(screen.getByRole('status', { name: 'Loading event templates' })).toBeInTheDocument();
    expect(screen.queryByText('Saturday League')).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'Sunday');
    rerender(content(false));
    expect(search).toHaveFocus();
    expect(screen.getByText('Sunday League')).toBeInTheDocument();
    expect(screen.queryByText('Saturday League')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Sort templates' }));
    rerender(content(true));
    expect(screen.getByRole('option', { name: 'Name', exact: true })).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Name', exact: true }));
    rerender(content(false));
    expect(screen.getByRole('combobox', { name: 'Sort templates' })).toHaveValue('Name');
  });

  it('opens a searchable mobile section drawer and closes after selecting a section', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();

    renderReadyShell('overview', onTabChange);

    await user.click(screen.getByRole('button', { name: 'Overview' }));

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
