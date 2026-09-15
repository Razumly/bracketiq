import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SportCategoryMultiSelect from '@/components/ui/SportCategoryMultiSelect';
import type { SportCategory } from '@/types';

const categories: SportCategory[] = [{
  $id: 'soccer',
  name: 'Soccer',
  sportIds: ['Indoor Soccer', 'Grass Soccer', 'Beach Soccer', 'Futsal'],
  displayOrder: 10,
  $createdAt: '',
  $updatedAt: '',
}];

const sports = ['Indoor Soccer', 'Grass Soccer', 'Beach Soccer', 'Futsal', 'Basketball'];

describe('SportCategoryMultiSelect', () => {
  it('selects a category as its member Sports and renders shared icons', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SportCategoryMultiSelect
        aria-label="Sports"
        data={sports}
        categories={categories}
        value={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Sports' }));
    expect(screen.getByRole('group', { name: 'Soccer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Soccer' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-sport-icon="indoor-soccer"]')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Soccer/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      'Indoor Soccer',
      'Grass Soccer',
      'Beach Soccer',
      'Futsal',
    ]);
    expect(onChange.mock.lastCall?.[0]).not.toContain('Soccer');
  });

  it('expands children, marks partial selection, and clears to All sports', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <SportCategoryMultiSelect
        aria-label="Sports"
        data={sports}
        categories={categories}
        value={['Indoor Soccer']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Sports' }));
    expect(screen.getByRole('option', { name: /Soccer/ })).toHaveAttribute('aria-selected', 'false');
    await user.click(screen.getByRole('button', { name: 'Expand Soccer' }));
    expect(screen.getByRole('button', { name: 'Collapse Soccer' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Futsal' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Indoor Soccer' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-sport-icon="futsal"]')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'All sports' }));
    expect(onChange).toHaveBeenLastCalledWith([]);


    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sports' }), { key: 'Escape' });
    rerender(
      <SportCategoryMultiSelect
        aria-label="Sports"
        data={sports}
        categories={categories}
        value={[]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Sports' })).toHaveValue('All sports');
  });

  it('supports a keyboard Escape close without changing the selection', () => {
    const onChange = jest.fn();
    render(
      <SportCategoryMultiSelect
        aria-label="Sports"
        data={sports}
        categories={categories}
        value={['Indoor Soccer']}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Sports' });
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });
});
