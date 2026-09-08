import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ComponentProps } from 'react';
import { apiRequest } from '@/lib/apiClient';
import RoleRosterManager, { type RoleRosterEntry } from '../RoleRosterManager';
import type { OrganizationRole } from '@/types';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: jest.fn(() => false),
}));

jest.mock('@/components/ui/UserCard', () => ({
  __esModule: true,
  default: ({ user }: any) => <div>{user.fullName ?? user.userName ?? user.$id}</div>,
}));

const baseRoles: OrganizationRole[] = [
  {
    $id: 'role_staff',
    organizationId: 'org_1',
    name: 'Staff',
    kind: 'STAFF',
    systemKey: null,
    isSystem: false,
    isDefault: true,
    permissions: [],
  },
];

const hostRole: OrganizationRole = {
  $id: 'role_host',
  organizationId: 'org_1',
  name: 'Host',
  kind: 'HOST',
  systemKey: 'HOST',
  isSystem: true,
  isDefault: true,
  permissions: [],
};

const rosterEntry = (overrides: Partial<RoleRosterEntry> = {}): RoleRosterEntry => ({
  id: 'staff_1', userId: 'user_1', fullName: 'Avery Chen', userName: 'avery',
  email: 'avery@test.com', status: 'pending', types: ['STAFF'],
  roleId: 'role_staff', roleName: 'Staff', canRemove: true, ...overrides,
});

const renderManager = (overrides: Partial<ComponentProps<typeof RoleRosterManager>> = {}) => {
  const props: ComponentProps<typeof RoleRosterManager> = {
    rosterEntries: [],
    searchValue: '',
    onSearchChange: jest.fn(),
    searchResults: [],
    searchLoading: false,
    searchError: null,
    onAddExisting: jest.fn(),
    inviteRows: [{ firstName: '', lastName: '', email: '', types: ['STAFF'], roleId: null }],
    onInviteRowsChange: jest.fn(),
    inviteError: null,
    inviting: false,
    staffRoles: baseRoles,
    onSendInvites: jest.fn(),
    onRemoveFromRoster: jest.fn(),
    onRoleChange: jest.fn(),
    onCreateRole: jest.fn().mockResolvedValue(undefined),
    onUpdateRole: jest.fn().mockResolvedValue(undefined),
    organizationId: 'org_1',
    canManageCompensation: false,
    ...overrides,
  };

  render(
    <MantineProvider>
      <RoleRosterManager {...props} />
    </MantineProvider>,
  );

  return props;
};

describe('RoleRosterManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (apiRequest as jest.Mock).mockResolvedValue({ roleRates: [], staffRates: [] });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('switches to the roles table and updates permission checkboxes immediately', async () => {
    const onUpdateRole = jest.fn().mockResolvedValue(undefined);
    renderManager({ onUpdateRole });

    fireEvent.click(screen.getByText('Roles'));
    fireEvent.click(screen.getByLabelText('Staff Manage staff'));

    await waitFor(() => {
      expect(onUpdateRole).toHaveBeenCalledWith('role_staff', {
        permissions: ['staff.manage'],
      });
    });
  });

  it('adds a required-name draft row and creates the role after a debounce', async () => {
    const onCreateRole = jest.fn().mockResolvedValue(undefined);
    renderManager({ onCreateRole });

    fireEvent.click(screen.getByText('Roles'));
    fireEvent.click(screen.getByText('Add role'));

    expect(screen.getByText('Role name is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New role name'), {
      target: { value: 'Scheduler' },
    });

    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    await waitFor(() => {
      expect(onCreateRole).toHaveBeenCalledWith('Scheduler', []);
    });
  });

  it('retains a failed new role without retrying until the user requests it', async () => {
    let rejectCreation!: (error: Error) => void;
    const onCreateRole = jest.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCreation = reject; }))
      .mockResolvedValueOnce(undefined);
    renderManager({ onCreateRole });
    fireEvent.click(screen.getByText('Roles'));
    fireEvent.click(screen.getByText('Add role'));
    fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'Scheduler' } });
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(screen.getByLabelText('New role name')).toBeDisabled();
    await act(async () => { rejectCreation(new Error('Role creation failed.')); });
    expect(screen.getByLabelText('New role name')).toHaveValue('Scheduler');
    expect(screen.getByText('Role creation failed.')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(onCreateRole).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry role creation' }));
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(onCreateRole).toHaveBeenNthCalledWith(2, 'Scheduler', []);
    expect(screen.queryByLabelText('New role name')).not.toBeInTheDocument();
  });

  it('lets pending staff change their selected role', async () => {
    const schedulerRole: OrganizationRole = {
      $id: 'role_scheduler',
      organizationId: 'org_1',
      name: 'Scheduler',
      kind: 'STAFF',
      systemKey: null,
      isSystem: false,
      isDefault: false,
      permissions: [],
    };

    const { onRoleChange } = renderManager({
      staffRoles: [...baseRoles, schedulerRole],
      rosterEntries: [{
        id: 'staff_pending_1',
        userId: 'user_pending_1',
        fullName: 'Pending Staff',
        userName: 'pending_staff',
        email: 'pending@example.com',
        status: 'pending',
        types: ['STAFF'],
        roleId: 'role_scheduler',
        roleName: 'Scheduler',
        canRemove: true,
      }],
    });

    fireEvent.click(screen.getByDisplayValue('Scheduler'));
    fireEvent.click(screen.getByRole('option', { name: 'Staff' }));
    await waitFor(() => expect(onRoleChange).toHaveBeenCalledWith('user_pending_1', 'role_staff'));
    expect(screen.getByDisplayValue('Staff')).toBeEnabled();
  });

  it('combines local search, role, and status filters and clears them without a request', () => {
    renderManager({
      staffRoles: [hostRole, ...baseRoles],
      rosterEntries: [
        rosterEntry(),
        rosterEntry({ id: 'staff_2', userId: 'user_2', fullName: 'Morgan Lee', userName: 'morgan',
          email: 'morgan@test.com', status: 'active', roleId: 'role_host', roleName: 'Host' }),
      ],
    });
    fireEvent.change(screen.getByLabelText('Search staff'), { target: { value: '  MORGAN@  ' } });
    expect(screen.getByRole('button', { name: 'Morgan Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avery Chen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Filter staff status'));
    fireEvent.click(screen.getByRole('option', { name: 'Pending' }));
    expect(screen.queryByRole('button', { name: 'Morgan Lee' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.click(screen.getByLabelText('Filter staff role'));
    fireEvent.click(screen.getByRole('option', { name: 'Host' }));
    expect(screen.getByRole('button', { name: 'Morgan Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avery Chen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Avery Chen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Morgan Lee' })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('does not roll back a newer roster role after an older request fails', async () => {
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: () => void;
    const onRoleChange = jest.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSecond = resolve; }));
    renderManager({ staffRoles: [hostRole, ...baseRoles], rosterEntries: [rosterEntry()], onRoleChange });
    fireEvent.click(screen.getByPlaceholderText('Select role'));
    fireEvent.click(screen.getByRole('option', { name: 'Host' }));
    fireEvent.click(screen.getByPlaceholderText('Select role'));
    fireEvent.click(screen.getByRole('option', { name: 'Staff' }));
    await act(async () => { resolveSecond(); });
    await act(async () => { rejectFirst(new Error('Old request failed.')); });
    expect(onRoleChange).toHaveBeenNthCalledWith(2, 'user_1', 'role_staff');
    expect(screen.getByDisplayValue('Staff')).toBeInTheDocument();
    expect(screen.queryByLabelText('Saving role')).not.toBeInTheDocument();
  });

  it('updates the selected role immediately and shows a saving indicator', async () => {
    let resolveRoleChange: (() => void) | undefined;
    const onRoleChange = jest.fn(() => new Promise<void>((resolve) => {
      resolveRoleChange = resolve;
    }));

    renderManager({
      staffRoles: [hostRole, ...baseRoles],
      onRoleChange,
      rosterEntries: [{
        id: 'staff_pending_1',
        userId: 'user_pending_1',
        fullName: 'Pending Staff',
        userName: 'pending_staff',
        email: 'pending@example.com',
        status: 'pending',
        types: ['STAFF'],
        roleId: 'role_staff',
        roleName: 'Staff',
        canRemove: true,
      }],
    });

    fireEvent.click(screen.getByPlaceholderText('Select role'));
    fireEvent.click(screen.getByRole('option', { name: 'Host' }));

    expect(onRoleChange).toHaveBeenCalledWith('user_pending_1', 'role_host');
    expect(screen.getByDisplayValue('Host')).toBeInTheDocument();
    expect(screen.getByLabelText('Saving role')).toBeInTheDocument();

    await act(async () => {
      resolveRoleChange?.();
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Saving role')).not.toBeInTheDocument();
    });
  });

  it('loads and saves effective-dated role compensation defaults', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce({
        roleRates: [{
          id: 'role_rate_1',
          organizationId: 'org_1',
          organizationRoleId: 'role_staff',
          wageType: 'HOURLY',
          amountCents: 2500,
          effectiveFrom: '2026-06-01T00:00:00.000Z',
          effectiveTo: null,
        }],
        staffRates: [],
      })
      .mockResolvedValueOnce({ rate: { id: 'role_rate_2' } })
      .mockResolvedValueOnce({
        roleRates: [{
          id: 'role_rate_2',
          organizationId: 'org_1',
          organizationRoleId: 'role_staff',
          wageType: 'HOURLY',
          amountCents: 3000,
          effectiveFrom: '2026-06-09T00:00:00.000Z',
          effectiveTo: null,
        }],
        staffRates: [],
      });

    renderManager({ canManageCompensation: true });

    fireEvent.click(screen.getByText('Compensation'));

    expect(await screen.findByText('$25.00/hr')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Staff default amount'), {
      target: { value: '30' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save default' }));
    });

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/compensation', {
        method: 'POST',
        body: expect.objectContaining({
          targetType: 'ROLE',
          targetId: 'role_staff',
          wageType: 'HOURLY',
          amountCents: 3000,
          effectiveFrom: expect.any(String),
          effectiveTo: null,
        }),
      });
    });
  });
});
