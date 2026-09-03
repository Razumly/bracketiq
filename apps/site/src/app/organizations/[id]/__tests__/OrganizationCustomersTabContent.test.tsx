import { createRef } from 'react';
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
  selectedCustomerKey: customers[0].key,
  onCustomerSelect: jest.fn(),
  renderCustomerAvatar: (name: string) => <div>{name}</div>,
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
    expect(screen.getByText('Details for Alex Morgan')).toBeInTheDocument();

    await user.click(screen.getAllByText('Harbor Strikers')[0]);

    expect(onCustomerSelect).toHaveBeenCalledWith(customers[1]);
  });
});
