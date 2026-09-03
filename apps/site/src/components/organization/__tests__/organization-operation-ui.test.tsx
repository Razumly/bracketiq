import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DatePickerInput, Select } from '../organization-operation-ui';

describe('organization operation filters', () => {
  it('dismisses a select when the user clicks outside it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Select aria-label="Event type" data={['EVENT', 'TOURNAMENT']} />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Event type' }));
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders a branded calendar and dismisses it with Escape', async () => {
    const user = userEvent.setup();
    render(<DatePickerInput aria-label="Start date" value={null} onChange={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Start date' }));
    expect(screen.getByRole('dialog', { name: 'Start date' })).toBeVisible();
    expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next month/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Start date' })).not.toBeInTheDocument();
  });
});
