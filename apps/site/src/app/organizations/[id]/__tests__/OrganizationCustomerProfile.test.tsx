import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganizationCustomerProfile from '../OrganizationCustomerProfile';

it('switches detail content with keyboard navigation and resets for another customer', async () => {
  const user = userEvent.setup();
  const content = (tab: string) => <p>{`Selected ${tab}`}</p>;
  const { rerender } = render(<OrganizationCustomerProfile key="alex" header="Alex" rosterLabel="Teams" renderContent={content} />);
  await user.click(screen.getByRole('tab', { name: 'Billing' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Selected billing');
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Selected documents');
  expect(screen.getByRole('tab', { name: 'Documents' })).toHaveFocus();
  await user.keyboard('{Home}');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Selected overview');
  await user.click(screen.getByRole('tab', { name: 'Billing' }));
  rerender(<OrganizationCustomerProfile key="team" header="Harbor Strikers" rosterLabel="Roster" renderContent={content} />);
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Selected overview');
  await user.click(screen.getByRole('tab', { name: 'Roster' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Selected roster');
});
