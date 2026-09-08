import { filterFieldCalendarItems, type FieldCalendarFilterItem } from '../FieldCalendarFilter';
import FieldCalendarFilter from '../FieldCalendarFilter';
import { getIndexedEntityColorPair } from '@/lib/entityColors';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const items: FieldCalendarFilterItem[] = [
  { id: 'field_1', label: 'Court Alpha', detail: 'North Gym' },
  { id: 'field_2', label: 'Court Beta', detail: 'South Gym' },
  { id: 'pitch_1', label: 'Main Pitch', detail: 'Outdoor' },
];

describe('filterFieldCalendarItems', () => {
  it('keeps the last selection and selects only enabled resources through All', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldCalendarFilter items={[...items, { id: 'closed', label: 'Closed court', disabled: true }]} selectedIds={['field_1']} onSelectedIdsChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Court Alpha/ }));
    expect(onChange).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Search fields' }), 'South');
    await user.click(screen.getByRole('button', { name: /Court Beta/ }));
    expect(onChange).toHaveBeenLastCalledWith(['field_1', 'field_2']);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenLastCalledWith(['field_1', 'field_2', 'pitch_1']);
  });

  it('returns all items when the query is blank', () => {
    expect(filterFieldCalendarItems(items, '   ')).toBe(items);
  });

  it('matches field labels case-insensitively', () => {
    expect(filterFieldCalendarItems(items, 'court').map((item) => item.id)).toEqual(['field_1', 'field_2']);
  });

  it('matches field details and ids', () => {
    expect(filterFieldCalendarItems(items, 'north').map((item) => item.id)).toEqual(['field_1']);
    expect(filterFieldCalendarItems(items, 'pitch_1').map((item) => item.id)).toEqual(['pitch_1']);
  });

  it('uses ordered reference colors for field swatches', () => {
    const { container } = renderWithMantine(
      <FieldCalendarFilter
        items={[
          { id: 'field_1', label: 'Court Alpha', colorMatchKey: 'field_1' },
          { id: 'field_2', label: 'Court Beta', colorMatchKey: 'field_2' },
        ]}
        selectedIds={['field_1']}
        onSelectedIdsChange={() => undefined}
        colorReferenceList={['field_1', 'field_2']}
      />,
    );

    const swatches = container.querySelectorAll('.field-calendar-filter__swatch');
    expect(swatches[0]).toHaveStyle(`background-color: ${getIndexedEntityColorPair(0).bg}`);
    expect(swatches[1]).toHaveStyle(`background-color: ${getIndexedEntityColorPair(1).bg}`);
  });
});
