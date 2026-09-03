'use client';

import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';

import {
  Badge,
  Button,
  Chip,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@/components/organization/organization-operation-ui';
import { buildOrganizationUsersSubtitle } from './organizationUsersCopy';

export type OrganizationCustomerType = 'users' | 'teams';

export type OrganizationCustomerEvent = {
  eventId: string;
  eventName: string;
  start?: string | null;
};

export type OrganizationCustomerListRow = {
  key: string;
  type: OrganizationCustomerType;
  id: string;
  name: string;
  subtitle?: string;
  profileImageId?: string | null;
  events: OrganizationCustomerEvent[];
};

export type OrganizationCustomersTabContentProps = {
  organizationName?: string | null;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  customerTypeFilters: OrganizationCustomerType[];
  setCustomerTypeFilters: Dispatch<SetStateAction<OrganizationCustomerType[]>>;
  resetCustomerFilters: () => void;
  customerFilterIsDefault: boolean;
  customers: OrganizationCustomerListRow[];
  visibleCustomers: OrganizationCustomerListRow[];
  selectedCustomerKey: string | null;
  onCustomerSelect: (customer: OrganizationCustomerListRow) => void;
  renderCustomerAvatar: (
    name: string,
    profileImageId: string | null | undefined,
    type: OrganizationCustomerType,
    size: number,
  ) => ReactNode;
  renderCustomerDetail: (customer: OrganizationCustomerListRow | null) => ReactNode;
  formatEventStart: (start?: string | null) => ReactNode;
  customersLoading: boolean;
  customersError: string | null;
  onRefresh: () => void | Promise<void>;
  hasMoreCustomers: boolean;
  customerSentinelRef: RefObject<HTMLDivElement | null>;
};

const CustomerListRow = ({
  customer,
  selected,
  onSelect,
  renderCustomerAvatar,
  formatEventStart,
}: {
  customer: OrganizationCustomerListRow;
  selected: boolean;
  onSelect: () => void;
  renderCustomerAvatar: OrganizationCustomersTabContentProps['renderCustomerAvatar'];
  formatEventStart: OrganizationCustomersTabContentProps['formatEventStart'];
}) => {
  const condensedEvents = customer.events.slice(0, 3);

  return (
    <Table.Tr
      className="org-customer-list-row"
      data-selected={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <Table.Td>
        <Group gap="sm" align="center" className="min-w-0">
          {renderCustomerAvatar(customer.name, customer.profileImageId, customer.type, 40)}
          <Stack gap={2} className="min-w-0">
            <Group gap={6}>
              <Text fw={600} truncate>{customer.name}</Text>
              <Badge size="xs" variant="light" color={customer.type === 'teams' ? 'blue' : 'gray'}>
                {customer.type === 'teams' ? 'Team' : 'User'}
              </Badge>
            </Group>
            {customer.subtitle && <Text size="xs" c="dimmed" truncate>{customer.subtitle}</Text>}
          </Stack>
        </Group>
      </Table.Td>
      <Table.Td>
        {condensedEvents.length > 0 ? (
          <Stack gap={4}>
            {condensedEvents.map((event) => (
              <Stack key={`${customer.key}-${event.eventId}`} gap={0}>
                <Text size="sm" fw={500} lineClamp={2}>{event.eventName}</Text>
                <Text size="xs" c="dimmed">{formatEventStart(event.start)}</Text>
              </Stack>
            ))}
            {customer.events.length > condensedEvents.length && (
              <Text size="xs" c="dimmed">
                +{customer.events.length - condensedEvents.length} more
              </Text>
            )}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">No events</Text>
        )}
      </Table.Td>
    </Table.Tr>
  );
};

export default function OrganizationCustomersTabContent({
  organizationName,
  customerSearch,
  setCustomerSearch,
  customerTypeFilters,
  setCustomerTypeFilters,
  resetCustomerFilters,
  customerFilterIsDefault,
  customers,
  visibleCustomers,
  selectedCustomerKey,
  onCustomerSelect,
  renderCustomerAvatar,
  renderCustomerDetail,
  formatEventStart,
  customersLoading,
  customersError,
  onRefresh,
  hasMoreCustomers,
  customerSentinelRef,
}: OrganizationCustomersTabContentProps) {
  const showUserCustomers = customerTypeFilters.includes('users');
  const showTeamCustomers = customerTypeFilters.includes('teams');
  const selectedCustomer = customers.find((customer) => customer.key === selectedCustomerKey) ?? null;

  const toggleCustomerTypeFilter = (type: OrganizationCustomerType, checked: boolean) => {
    setCustomerTypeFilters((current) => {
      if (checked) {
        return current.includes(type) ? current : [...current, type];
      }
      return current.filter((value) => value !== type);
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={5}>Customers</Title>
          <Text size="sm" c="dimmed">{buildOrganizationUsersSubtitle(organizationName)}</Text>
        </Stack>
        <Button
          variant="default"
          onClick={() => { void onRefresh(); }}
          loading={customersLoading}
        >
          Refresh
        </Button>
      </Group>

      {customersError && (
        <Text size="sm" c="red">
          {customersError}
        </Text>
      )}

      {customersLoading ? (
        <Text size="sm" c="dimmed">Loading customers...</Text>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Paper withBorder p={0} radius="lg" className="overflow-hidden">
              <div className="discover-filter-panel p-4">
                <Group justify="space-between" align="center" mb="md">
                  <Text fw={700} size="sm">Filters</Text>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={resetCustomerFilters}
                    disabled={customerFilterIsDefault}
                  >
                    Reset
                  </Button>
                </Group>
                <Stack gap="lg">
                  <Group gap="xs" aria-label="Customer type filters">
                    <Chip
                      aria-label="All customer types"
                      checked={showUserCustomers && showTeamCustomers}
                      onChange={(checked) => setCustomerTypeFilters(checked ? ['users', 'teams'] : [])}
                    >
                      All
                    </Chip>
                    <Chip
                      aria-label="User customers"
                      checked={showUserCustomers}
                      onChange={(checked) => toggleCustomerTypeFilter('users', checked)}
                    >
                      Users
                    </Chip>
                    <Chip
                      aria-label="Team customers"
                      checked={showTeamCustomers}
                      onChange={(checked) => toggleCustomerTypeFilter('teams', checked)}
                    >
                      Teams
                    </Chip>
                  </Group>
                  <TextInput
                    aria-label="Search customers"
                    placeholder="Search customers..."
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.currentTarget.value)}
                  />
                </Stack>
              </div>
            </Paper>
          </aside>

          <div className="min-w-0 grid gap-4 xl:grid-cols-[minmax(24rem,0.9fr)_minmax(32rem,1.35fr)]">
            <Paper withBorder p={0} radius="md" className="org-customer-table-card overflow-hidden">
              <div style={{ overflowX: 'auto' }}>
                <Table withColumnBorders highlightOnHover style={{ minWidth: '100%', tableLayout: 'fixed' }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: '42%' }}>Customer</Table.Th>
                      <Table.Th style={{ width: '58%' }}>Events</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {customers.length > 0 ? (
                      visibleCustomers.map((customer) => (
                        <CustomerListRow
                          key={customer.key}
                          customer={customer}
                          selected={selectedCustomer?.key === customer.key}
                          onSelect={() => onCustomerSelect(customer)}
                          renderCustomerAvatar={renderCustomerAvatar}
                          formatEventStart={formatEventStart}
                        />
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={2}>
                          <Text size="sm" c="dimmed">No customers found for the selected filters.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </div>
              {hasMoreCustomers && (
                <Group ref={customerSentinelRef} justify="center" py="sm">
                  <Text size="xs" c="dimmed">Scroll for more customers.</Text>
                </Group>
              )}
            </Paper>

            <Paper withBorder p="md" radius="md" className="org-customer-detail-panel min-w-0 xl:sticky xl:top-24 xl:self-start">
              <ScrollArea.Autosize mah={720} type="auto">
                {renderCustomerDetail(selectedCustomer)}
              </ScrollArea.Autosize>
            </Paper>
          </div>
        </div>
      )}
    </Stack>
  );
}
