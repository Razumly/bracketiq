import { render, screen } from '@testing-library/react';

import OrganizationStaffTabContent from '../OrganizationStaffTabContent';

jest.mock('../RoleRosterManager', () => ({
  __esModule: true,
  default: () => <div>Role roster manager</div>,
}));

const defaultProps = {
  rosterEntries: [],
  searchValue: '',
  onSearchChange: jest.fn(),
  searchResults: [],
  searchLoading: false,
  searchError: null,
  onAddExisting: jest.fn(),
  inviteRows: [],
  onInviteRowsChange: jest.fn(),
  inviteError: null,
  inviting: false,
  staffRoles: [],
  onSendInvites: jest.fn(),
  onRemoveFromRoster: jest.fn(),
  onRoleChange: jest.fn(),
  onCreateRole: jest.fn(),
  onUpdateRole: jest.fn(),
};

describe('OrganizationStaffTabContent', () => {
  it('keeps the roster manager and surfaces roster name errors', () => {
    const { rerender } = render(
      <OrganizationStaffTabContent {...defaultProps} rosterNameError={null} />,
    );

    expect(screen.getByText('Role roster manager')).toBeInTheDocument();
    expect(screen.queryByText('Roster error')).not.toBeInTheDocument();

    rerender(
      <OrganizationStaffTabContent {...defaultProps} rosterNameError="Roster error" />,
    );

    expect(screen.getByText('Roster error')).toBeInTheDocument();
  });
});
