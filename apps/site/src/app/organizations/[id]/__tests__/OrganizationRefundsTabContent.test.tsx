import { render, screen, waitFor } from '@testing-library/react';

import OrganizationRefundsTabContent from '../OrganizationRefundsTabContent';

jest.mock('@/lib/refundRequestService', () => ({
  __esModule: true,
  refundRequestService: { listRefundRequests: jest.fn(), updateRefundStatus: jest.fn() },
}));
jest.mock('@/lib/eventService', () => ({ eventService: { getEventById: jest.fn() } }));
jest.mock('@/lib/userService', () => ({ userService: { getUsersByIds: jest.fn() } }));
jest.mock('@/lib/organizationService', () => ({ organizationService: { getOrganizationsByIds: jest.fn() } }));

const { refundRequestService } = jest.requireMock('@/lib/refundRequestService') as {
  refundRequestService: { listRefundRequests: jest.Mock; updateRefundStatus: jest.Mock };
};
const { eventService } = jest.requireMock('@/lib/eventService') as {
  eventService: { getEventById: jest.Mock };
};
const { userService } = jest.requireMock('@/lib/userService') as {
  userService: { getUsersByIds: jest.Mock };
};
const { organizationService } = jest.requireMock('@/lib/organizationService') as {
  organizationService: { getOrganizationsByIds: jest.Mock };
};

describe('OrganizationRefundsTabContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refundRequestService.listRefundRequests.mockResolvedValue([
      {
        $id: 'refund-1',
        eventId: 'event-1',
        userId: 'user-1',
        hostId: 'host-1',
        organizationId: 'org-1',
        reason: 'Duplicate registration',
        status: 'WAITING',
        $createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    eventService.getEventById.mockResolvedValue({ $id: 'event-1', name: 'Winter Open' });
    userService.getUsersByIds.mockResolvedValue([
      { $id: 'user-1', firstName: 'Test', lastName: 'User' },
      { $id: 'host-1', firstName: 'Host', lastName: 'User' },
    ]);
    organizationService.getOrganizationsByIds.mockResolvedValue([{ $id: 'org-1', name: 'Test Organization' }]);
  });

  it('loads the organization-scoped refund list through the organization tab', async () => {
    render(<OrganizationRefundsTabContent organizationId="org-1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: undefined,
      hostId: undefined,
    }));

    expect(await screen.findByText('Organization Refund Requests')).toBeInTheDocument();
    expect(await screen.findByText('Winter Open')).toBeInTheDocument();
    expect(screen.getByText('Duplicate registration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });
});
