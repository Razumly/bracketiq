import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { InvitationEvidenceReview } from '../InvitationEvidenceReview';

describe('invitation evidence review', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
  it('loads evidence on demand and shows that released evidence was removed', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ evidence: {
      inviteId: 'invite', status: 'DECLINED', finalizedAt: '2026-01-01T00:00:00Z', senderName: 'Taylor Morgan',
      playerName: 'Jordan Lee', teamName: 'River City', deliveries: [],
    } }) } as Response).mockResolvedValueOnce({ ok: true, json: async () => ({ evidence: null }) } as Response);
    render(<MantineProvider><InvitationEvidenceReview reportId="report" reportStatus="OPEN" /></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'View invitation evidence' }));
    expect(await screen.findByText('Team: River City')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View invitation evidence' }));
    expect(await screen.findByText('Invitation evidence was removed under the retention policy.')).toBeInTheDocument();
    expect(screen.queryByText('Team: River City')).not.toBeInTheDocument();
  });
});
