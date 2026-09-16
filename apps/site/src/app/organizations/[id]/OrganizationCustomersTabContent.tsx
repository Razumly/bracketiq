'use client';

import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import { ArrowLeft, CalendarDays, Search, Users, UserRound, RefreshCw } from 'lucide-react';
import { Badge, Button, Chip, Group, Stack, Table, Text, TextInput } from '@/components/organization/organization-operation-ui';
import { OrganizationLoadingRows, OrganizationLoadingValue, useOrganizationDataLoading } from '@/components/organization/OrganizationDataLoading';
import { OrganizationStatStrip, OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import OrganizationCustomerDetailPanel from './OrganizationCustomerDetailPanel';

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
  isCustomerFilterDefault: boolean;
  customers: OrganizationCustomerListRow[];
  visibleCustomers: OrganizationCustomerListRow[];
  selectedCustomerKey: string | null;
  onCustomerSelect: (customer: OrganizationCustomerListRow) => void;
  onCustomerClose: () => void;
  renderCustomerAvatar: (
    name: string,
    profileImageId: string | null | undefined,
    type: OrganizationCustomerType,
    size: number,
  ) => ReactNode;
  renderCustomerDetail: (customer: OrganizationCustomerListRow | null) => ReactNode;
  formatEventStart: (start?: string | null) => ReactNode;
  isCustomersLoading: boolean;
  customersError: string | null;
  onRefresh: () => void | Promise<void>;
  hasMoreCustomers: boolean;
  customerSentinelRef: RefObject<HTMLDivElement | null>;
};


function CustomerListRow({ customer, selected, onSelect, renderCustomerAvatar, formatEventStart }: {
  customer: OrganizationCustomerListRow;
  selected: boolean;
  onSelect: () => void;
  renderCustomerAvatar: OrganizationCustomersTabContentProps['renderCustomerAvatar'];
  formatEventStart: OrganizationCustomersTabContentProps['formatEventStart'];
}) {
  const latest = [...customer.events].sort((a, b) => Date.parse(b.start ?? '') - Date.parse(a.start ?? ''))[0];
  return (
    <Table.Tr className="org-customer-list-row" data-customer-key={customer.key} data-selected={selected ? 'true' : undefined} tabIndex={0} aria-selected={selected} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}>
      <Table.Td><Group gap="sm" wrap="nowrap">{renderCustomerAvatar(customer.name, customer.profileImageId, customer.type, 32)}<span className="org-customer-row-identity"><Text size="sm" fw={600}>{customer.name}</Text><span className="org-customer-compact-type">{customer.type === 'teams' ? 'Team' : 'User'}</span></span></Group></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{customer.subtitle || '—'}</Text></Table.Td>
      <Table.Td><Badge variant="light" color={customer.type === 'teams' ? 'blue' : 'gray'}>{customer.type === 'teams' ? 'Team' : 'User'}</Badge></Table.Td>
      <Table.Td><Text size="sm">{customer.events.length} registrations</Text></Table.Td>
      <Table.Td>{latest ? <Stack gap={2}><Text size="xs">{latest.eventName}</Text><Text size="xs" c="dimmed">{formatEventStart(latest.start)}</Text></Stack> : <Text size="xs" c="dimmed">No events</Text>}</Table.Td>
    </Table.Tr>
  );
}

export default function OrganizationCustomersTabContent({
  customerSearch, setCustomerSearch, customerTypeFilters, setCustomerTypeFilters,
  resetCustomerFilters, isCustomerFilterDefault, customers, visibleCustomers, selectedCustomerKey,
  onCustomerSelect, onCustomerClose, renderCustomerAvatar, renderCustomerDetail, formatEventStart,
  isCustomersLoading, customersError, onRefresh, hasMoreCustomers, customerSentinelRef,
}: OrganizationCustomersTabContentProps) {
  const isLoading = useOrganizationDataLoading(isCustomersLoading);
  const selectedCustomer = customers.find((customer) => customer.key === selectedCustomerKey) ?? null;
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousSelection = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCustomerKey) detailRef.current?.focus({ preventScroll: true });
    else if (previousSelection.current) {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-customer-key]');
      const row = Array.from(rows ?? []).find((entry) => entry.dataset.customerKey === previousSelection.current);
      row?.focus({ preventScroll: true });
    }
    previousSelection.current = selectedCustomerKey;
  }, [selectedCustomerKey]);
  const userCount = customers.filter((customer) => customer.type === 'users').length;
  const toggleType = (type: OrganizationCustomerType, checked: boolean) => {
    setCustomerTypeFilters((current) => checked ? [...new Set([...current, type])] : current.filter((value) => value !== type));
  };
  return (
    <section className="org-section org-customers">
      <OrganizationTabHeading title="Customers" description="Manage athletes, teams, and registration activity">
        <Button variant="outline" onClick={() => void onRefresh()} loading={isCustomersLoading} leftSection={<RefreshCw />}>Refresh</Button>
      </OrganizationTabHeading>
      <OrganizationStatStrip loading={isLoading} items={[
        { label: 'customers loaded', value: customers.length, icon: <Users /> },
        { label: 'users', value: userCount, icon: <UserRound /> },
        { label: 'teams', value: customers.length - userCount, icon: <Users /> },
        { label: 'registrations', value: customers.reduce((count, customer) => count + customer.events.length, 0), icon: <CalendarDays /> },
      ]} />
      <div className="org-filter-toolbar">
        <TextInput aria-label="Search customers" placeholder="Search" value={customerSearch} onChange={(event) => setCustomerSearch(event.currentTarget.value)} leftSection={<Search className="size-4" />} />
        <Button variant="subtle" onClick={resetCustomerFilters} disabled={isCustomerFilterDefault}>Reset</Button>
      </div>
      <div className="org-customer-type-tabs" aria-label="Customer type filters">
        <Chip aria-label="All customer types" checked={customerTypeFilters.length === 2} onChange={() => setCustomerTypeFilters(['users', 'teams'])}>All <OrganizationLoadingValue loading={isLoading}>{customers.length}</OrganizationLoadingValue></Chip>
        <Chip aria-label="User customers" checked={customerTypeFilters.includes('users')} onChange={(checked) => toggleType('users', checked)}>Users <OrganizationLoadingValue loading={isLoading}>{userCount}</OrganizationLoadingValue></Chip>
        <Chip aria-label="Team customers" checked={customerTypeFilters.includes('teams')} onChange={(checked) => toggleType('teams', checked)}>Teams <OrganizationLoadingValue loading={isLoading}>{customers.length - userCount}</OrganizationLoadingValue></Chip>
      </div>
      {customersError && <Text role="alert" c="red" size="sm">{customersError}</Text>}
      <div className="org-customer-workspace" data-detail-open={selectedCustomer ? 'true' : undefined}>
        <div className="org-reference-table org-customer-list" ref={listRef}>
            <Table.ScrollContainer minWidth={selectedCustomer ? 0 : 650}>
              <Table highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Contact</Table.Th><Table.Th>Type</Table.Th><Table.Th>Registrations</Table.Th><Table.Th>Last event</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody aria-busy={isLoading}>
                  {isLoading ? <OrganizationLoadingRows columns={5} label="customers" /> : <>
                  {visibleCustomers.map((customer) => <CustomerListRow key={customer.key} customer={customer} selected={selectedCustomerKey === customer.key} onSelect={() => onCustomerSelect(customer)} renderCustomerAvatar={renderCustomerAvatar} formatEventStart={formatEventStart} />)}
                  {!customersError && visibleCustomers.length === 0 && <Table.Tr><Table.Td colSpan={5}><p className="org-empty-copy">No customers found for the selected filters.</p></Table.Td></Table.Tr>}
                  </>}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          <div className="org-table-footer"><span><OrganizationLoadingValue loading={isLoading}>{visibleCustomers.length} of {customers.length}</OrganizationLoadingValue> loaded customers</span>{!isLoading && hasMoreCustomers && <div ref={customerSentinelRef}>Scroll for more customers.</div>}</div>
        </div>
        {selectedCustomer && <aside ref={detailRef} tabIndex={-1} aria-label={`${selectedCustomer.name} workspace`} className="org-customer-preview">
          <Button variant="subtle" onClick={onCustomerClose} leftSection={<ArrowLeft className="size-4" />}>Back to all customers</Button>
          <OrganizationCustomerDetailPanel>{renderCustomerDetail(selectedCustomer)}</OrganizationCustomerDetailPanel>
        </aside>}
      </div>
    </section>
  );
}
