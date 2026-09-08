import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefundRequest } from '@/types';
import OrganizationRefundsView from '../OrganizationRefundsView';

it('filters requests locally and prevents approval without a valid payment preview', async () => {
  const user = userEvent.setup();
  const onDecision = jest.fn().mockResolvedValue(undefined);
  const refunds: RefundRequest[] = [
    { $id: 'pending', eventId: 'event', userId: 'sam', reason: 'Schedule conflict', status: 'WAITING' },
    { $id: 'approved', eventId: 'event', userId: 'lee', reason: 'Duplicate', status: 'APPROVED' },
  ];
  render(<OrganizationRefundsView refunds={refunds} events={{ event: 'Summer league' }} users={{ sam: 'Sam', lee: 'Lee' }} teams={{}} processingId={null} onDecision={onDecision} />);
  await user.click(screen.getByRole('button', { name: /Pending/ }));
  expect(screen.queryByRole('button', { name: 'Lee' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Deny' }));
  expect(onDecision).toHaveBeenCalledWith(refunds[0], 'REJECTED');
  await user.click(screen.getByRole('button', { name: 'Clear all' }));
  await user.type(screen.getByRole('textbox', { name: 'Search refund requests' }), 'Lee');
  expect(screen.queryByRole('button', { name: 'Sam' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lee' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
});
