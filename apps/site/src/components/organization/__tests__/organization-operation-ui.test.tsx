import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Button, Collapse, DatePickerInput, DateTimePicker, MultiSelect, NumberInput, PillsInput, Popover, Select, TextInput } from '../organization-operation-ui';

describe('organization operation filters', () => {
  it('does not select Today before the minimum date', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const crossesMonth = tomorrow.getMonth() !== today.getMonth() || tomorrow.getFullYear() !== today.getFullYear();
    render(<DatePickerInput aria-label="Start date" value={null} minDate={tomorrow} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Start date' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    if (crossesMonth) await user.click(screen.getByRole('button', { name: /next month/i }));
    await user.click(screen.getByRole('button', { name: tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }));
    expect(onChange).toHaveBeenCalledWith(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()));
  });

  it('preserves local time in DateTimePicker string values', async () => {
    const user = userEvent.setup();
    render(<DateTimePicker aria-label="Start time" value="2030-01-02T13:45" onChange={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Start time' }));

    expect(screen.getByLabelText('Start time time')).toHaveValue('13:45');
  });

  it.each(['outside', 'Escape'])('restores the selected label after dismissal with %s', async (method) => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<><Select aria-label="Event type" value="EVENT" data={['EVENT', 'TOURNAMENT']} onChange={onChange} /><button>Outside</button></>);
    const input = screen.getByRole('combobox', { name: 'Event type' });
    await user.clear(input);
    await user.type(input, 'TOUR');
    expect(input).toHaveValue('TOUR');
    if (method === 'outside') await user.click(screen.getByRole('button', { name: 'Outside' }));
    else await user.keyboard('{Escape}');
    expect(input).toHaveValue('EVENT');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(input);
    expect(screen.getByRole('option', { name: 'EVENT' })).toBeVisible();
  });

  it('reopens a dismissed Select when typing resumes in the focused input', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Event type" value="EVENT" data={['EVENT', 'TOURNAMENT']} />);
    const input = screen.getByRole('combobox', { name: 'Event type' });
    await user.click(input);
    await user.keyboard('{Escape}');
    await user.clear(input);
    await user.type(input, 'TOUR');
    expect(input).toHaveValue('TOUR');
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('EVENT');
  });
  it('restores a clearable Select to its empty value', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Select aria-label="Event type" value="EVENT" data={['EVENT', 'TOURNAMENT']} clearable onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
  it('selects an option with ArrowDown and Enter', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Select aria-label="Sport" data={['Soccer', 'Tennis']} value={null} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Sport' });

    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Soccer');
  });
  it('scrolls the active Select option into view', async () => {
    const user = userEvent.setup();
    const scrollIntoView = jest.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });

    try {
      render(<Select aria-label="Sport" data={Array.from({ length: 30 }, (_, index) => `Sport ${index + 1}`)} value={null} />);
      const input = screen.getByRole('combobox', { name: 'Sport' });
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView });
    }
  });


  it('associates field help and errors with the input', () => {
    render(<TextInput label="Event name" description="Use a clear name." error="Event name is required" />);
    const input = screen.getByRole('textbox', { name: 'Event name' });
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy).toHaveLength(2);
    expect(describedBy.every((id) => document.getElementById(id))).toBe(true);
  });


  it('preserves decimal editing while the controlled value updates', async () => {
    const user = userEvent.setup();
    function ControlledNumberInput() {
      const [value, setValue] = useState<number | string>(0);
      return <NumberInput aria-label="Duration" value={value} onChange={setValue} />;
    }

    render(<ControlledNumberInput />);
    const input = screen.getByRole('textbox', { name: 'Duration' });
    await user.clear(input);
    await user.type(input, '1.');

    expect(input).toHaveValue('1.');

    await user.type(input, '50');

    expect(input).toHaveValue('1.50');
  });
  it('preserves strict bounds and clamps blur bounds', async () => {
    const user = userEvent.setup();
    function BoundedInputs() {
      const [strictValue, setStrictValue] = useState<number | string>(5);
      const [blurValue, setBlurValue] = useState<number | string>(5);
      return (
        <>
          <NumberInput aria-label="Strict value" value={strictValue} min={1} max={10} clampBehavior="strict" onChange={setStrictValue} />
          <NumberInput aria-label="Blur value" value={blurValue} min={1} max={10} clampBehavior="blur" onChange={setBlurValue} />
        </>
      );
    }

    render(<BoundedInputs />);
    const strictInput = screen.getByRole('textbox', { name: 'Strict value' });
    const blurInput = screen.getByRole('textbox', { name: 'Blur value' });
    await user.clear(strictInput);
    await user.type(strictInput, '100');
    expect(strictInput).toHaveValue('10');
    await user.clear(blurInput);
    await user.type(blurInput, '100');
    expect(blurInput).toHaveValue('100');
    await user.tab();
    expect(blurInput).toHaveValue('10');
  });
  it('rejects invalid numeric text without emitting NaN', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumberInput aria-label="Points" value={5} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Points' });

    await user.type(input, 'a');

    expect(input).toHaveValue('5');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('clears the form value when a nonnumeric draft blurs', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumberInput aria-label="Teams" value={3} clampBehavior="none" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Teams' });

    await user.clear(input);
    await user.type(input, '-');
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(input).toHaveValue('');
  });




  it('marks collapsed content as hidden and inert', () => {
    const { container } = render(<Collapse in={false}><button type="button">Hidden action</button></Collapse>);
    const collapsed = container.firstElementChild;

    expect(collapsed).toHaveAttribute('aria-hidden', 'true');
    expect(collapsed).toHaveAttribute('inert');
  });
  it('associates a PillsInput label with its editable field', () => {
    render(<PillsInput label="Tags"><PillsInput.Field /></PillsInput>);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    const label = screen.getByText('Tags');

    expect(input).toHaveAttribute('id');
    expect(label).toHaveAttribute('for', input.getAttribute('id'));
  });

  it('does not auto-toggle a controlled Popover target', async () => {
    const user = userEvent.setup();
    function ControlledPopover() {
      const [opened, setOpened] = useState(false);
      return (
        <Popover opened={opened} onChange={setOpened}>
          <Popover.Target><Button onClick={() => setOpened(true)}>Open</Button></Popover.Target>
          <Popover.Dropdown>Content</Popover.Dropdown>
        </Popover>
      );
    }

    render(<ControlledPopover />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Content')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Content')).toBeVisible();
  });




  it.each(['outside', 'Escape'])('clears uncommitted MultiSelect search after %s dismissal', async (method) => {
    const user = userEvent.setup();
    render(<><MultiSelect aria-label="Resources" data={['Court A', 'Court B']} value={['Court A']} /><button>Outside</button></>);
    const input = screen.getByRole('combobox', { name: 'Resources' });
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Court B');
    expect(input).toHaveValue('Court B');
    if (method === 'outside') await user.click(screen.getByRole('button', { name: 'Outside' }));
    else await user.keyboard('{Escape}');
    expect(input).toHaveValue('Court A');
    if (method === 'Escape') {
      await user.clear(input);
      await user.type(input, 'Court B');
      expect(screen.getByRole('listbox')).toBeVisible();
      await user.keyboard('{Escape}');
      expect(input).toHaveValue('Court A');
    }
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

  it('renders a branded calendar and restores focus after Escape dismissal', async () => {
    const user = userEvent.setup();
    render(<DatePickerInput aria-label="Start date" value={null} onChange={jest.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Start date' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Start date' })).toBeVisible();
    expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next month/i })).toBeInTheDocument();
    expect(screen.queryByRole('gridcell')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous month/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Start date' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
