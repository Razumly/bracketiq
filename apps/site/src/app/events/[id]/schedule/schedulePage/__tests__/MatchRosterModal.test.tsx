import { act, fireEvent, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import type { Match } from '@/types';
import type { MatchRosterResponse } from '@/lib/matchRosterService';
import { matchRosterService } from '@/lib/matchRosterService';
import MatchRosterModal from '../MatchRosterModal';

jest.mock('@/lib/matchRosterService', () => ({ matchRosterService: { getRosters: jest.fn(), updateRoster: jest.fn() } }));
const getRosters = jest.mocked(matchRosterService.getRosters);
const payload = (name: string): MatchRosterResponse => ({
  allowMatchRosterEdits: true, allowTemporaryMatchPlayers: true,
  rosters: [{ eventTeamId: 'team', teamName: 'River Crew', canEdit: false, entries: [{
    id: null, source: 'BASE', status: 'ACTIVE', userId: name, firstName: name, lastName: 'River', userName: null, email: null,
    documentReadiness: { isMinorAtEvent: false, documents: { signedCount: 0, requiredCount: 1 },
      requiredDocuments: [{ key: 'waiver', templateId: 'version', title: 'Waiver', type: 'TEXT', signerContext: 'participant', signerLabel: 'Participant', signOnce: false, status: 'UNSIGNED' }] },
  }] }],
});
const modal = (id: string) => <MantineProvider><MatchRosterModal opened eventId="event" match={{ $id: id } as Match} team={null} onClose={() => {}} /></MantineProvider>;

beforeEach(() => jest.resetAllMocks());

it('shows missing signatures to officials without edit actions', async () => {
  getRosters.mockResolvedValue(payload('Alex'));
  renderWithMantine(modal('match'));
  expect(await screen.findByText('Alex River')).toBeInTheDocument();
  expect(screen.getByText('Missing: Waiver (Participant)')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  expect(screen.queryByText('Add temporary player')).not.toBeInTheDocument();
});

it('ignores an old response after another match is opened', async () => {
  let resolveOld!: (response: MatchRosterResponse) => void;
  getRosters.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(payload('Jamie'));
  const view = renderWithMantine(modal('old'));
  view.rerender(modal('new'));
  expect(await screen.findByText('Jamie River')).toBeInTheDocument();
  await act(async () => resolveOld(payload('Alex')));
  expect(screen.queryByText('Alex River')).not.toBeInTheDocument();
  expect(screen.getByText('Jamie River')).toBeInTheDocument();
});

it('clears private roster data when the next match read is denied', async () => {
  getRosters.mockResolvedValueOnce(payload('Alex')).mockRejectedValueOnce(new Error('Forbidden'));
  const view = renderWithMantine(modal('old'));
  await screen.findByText('Alex River');
  view.rerender(modal('new'));
  expect(await screen.findByText('Failed to load match roster.')).toBeInTheDocument();
  expect(screen.queryByText('Alex River')).not.toBeInTheDocument();
});

it('does not clear another match form when an old mutation completes', async () => {
  const editable = payload('Alex');
  editable.rosters![0].canEdit = true;
  getRosters.mockResolvedValue(editable);
  let resolveMutation!: (response: MatchRosterResponse) => void;
  jest.mocked(matchRosterService.updateRoster).mockReturnValue(new Promise((resolve) => { resolveMutation = resolve; }));
  const view = renderWithMantine(modal('old'));
  await screen.findByText('Alex River');
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Old' } });
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Player' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Player' }));
  view.rerender(modal('new'));
  await screen.findByText('Alex River');
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'New' } });
  await act(async () => resolveMutation({}));
  expect(screen.getByLabelText('First name')).toHaveValue('New');
});
