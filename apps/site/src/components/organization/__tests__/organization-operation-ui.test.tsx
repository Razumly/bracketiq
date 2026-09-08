import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button, DatePickerInput, Popover, Select } from '../organization-operation-ui';

describe('organization operation filters', () => {
  it('does not select Today before the minimum date', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    render(<DatePickerInput aria-label="Start date" value={null} minDate={tomorrow} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Start date' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }));
    expect(onChange).toHaveBeenCalledWith(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()));
  });

  it.each(['outside', 'Escape'])('restores the selected label after dismissal with %s', async (method) => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<><Select aria-label="Event type" value="EVENT" data={['EVENT', 'TOURNAMENT']} onChange={onChange} /><button>Outside</button></>);
    const input = screen.getByRole('combobox', { name: 'Event type' });
    await user.clear(input);
    await user.type(input, 'TOUR');
    if (method === 'outside') await user.click(screen.getByRole('button', { name: 'Outside' }));
    else await user.keyboard('{Escape}');
    expect(input).toHaveValue('EVENT');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(input);
    expect(screen.getByRole('option', { name: 'EVENT' })).toBeVisible();
  });

  it('prevents changing a disabled date', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<DatePickerInput aria-label="Start date" value={new Date(2030, 0, 1)} onChange={onChange} clearable disabled />);

    await user.click(screen.getByRole('button', { name: 'Start date' }));
    const clear = screen.queryByRole('button', { name: 'Clear date' });
    if (clear) await user.click(clear);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dismisses a popover outside its surface and with Escape', async () => {
    const user = userEvent.setup();
    render(<><Popover><Popover.Target><Button>Filters</Button></Popover.Target><Popover.Dropdown>Filter content</Popover.Dropdown></Popover><button>Outside</button></>);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('Filter content')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByText('Filter content')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Filter content')).not.toBeInTheDocument();
  });

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
    expect(screen.queryByRole('gridcell')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /2026/ }).length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Start date' })).not.toBeInTheDocument();
  });
});
