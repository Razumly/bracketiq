import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationCustomersTabContent, {
  type OrganizationCustomerListRow,
  type OrganizationCustomerType,
} from '../OrganizationCustomersTabContent';

const customers: OrganizationCustomerListRow[] = [
  {
    key: 'users:user_1',
    type: 'users',
    id: 'user_1',
    name: 'Alex Morgan',
    subtitle: '@alexm',
    events: [{ eventId: 'event_1', eventName: 'Spring League', start: '2026-04-01T18:00:00.000Z' }],
  },
  {
    key: 'teams:team_1',
    type: 'teams',
    id: 'team_1',
    name: 'Harbor Strikers',
    subtitle: 'Open • Volleyball',
    events: [],
  },
];

const baseProps = {
  organizationName: 'Austin Hoops',
  customerSearch: '',
  setCustomerSearch: jest.fn(),
  customerTypeFilters: ['users', 'teams'] as OrganizationCustomerType[],
  setCustomerTypeFilters: jest.fn(),
  resetCustomerFilters: jest.fn(),
  isCustomerFilterDefault: true,
  customers,
  visibleCustomers: customers,
  selectedCustomerKey: null,
  onCustomerSelect: jest.fn(),
  onCustomerClose: jest.fn(),
  renderCustomerAvatar: () => <div aria-hidden="true" />,
  renderCustomerDetail: (customer: OrganizationCustomerListRow | null) => (
    <div>{customer ? `Details for ${customer.name}` : 'No customer selected'}</div>
  ),
  formatEventStart: (start?: string | null) => start ?? 'Unknown date',
  isCustomersLoading: false,
  customersError: null,
  onRefresh: jest.fn(),
  hasMoreCustomers: true,
  customerSentinelRef: createRef<HTMLDivElement>(),
};

describe('OrganizationCustomersTabContent', () => {
  it('renders customer rows and delegates customer selection', async () => {
    const user = userEvent.setup();
    const onCustomerSelect = jest.fn();

    render(
      <OrganizationCustomersTabContent
        {...baseProps}
        onCustomerSelect={onCustomerSelect}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByText('Spring League')).toBeInTheDocument();
    expect(screen.getByText('No events')).toBeInTheDocument();
    expect(screen.getByText('Scroll for more customers.')).toBeInTheDocument();

    await user.click(screen.getAllByText('Harbor Strikers')[0]);

    expect(onCustomerSelect).toHaveBeenCalledWith(customers[1]);
  });

  it('opens details and returns to the same filtered list with row focus restored', async () => {
    const user = userEvent.setup();
    function Workspace() {
      const [selection, select] = useState<string | null>(null);
      const [search, setSearch] = useState('');
      return <OrganizationCustomersTabContent {...baseProps} customerSearch={search} setCustomerSearch={setSearch}
        visibleCustomers={customers.filter((customer) => customer.name.toLowerCase().includes(search.toLowerCase()))}
        selectedCustomerKey={selection} onCustomerSelect={(customer) => select(customer.key)} onCustomerClose={() => select(null)} />;
    }
    render(<Workspace />);
    await user.type(screen.getByRole('textbox', { name: 'Search customers' }), 'Alex');
    const row = screen.getByRole('row', { name: /Alex Morgan/ });
    row.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Details for Alex Morgan')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to all customers' }));
    expect(screen.queryByRole('region', { name: 'Customer details' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search customers' })).toHaveValue('Alex');
    expect(screen.queryByText('Harbor Strikers')).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });
});
