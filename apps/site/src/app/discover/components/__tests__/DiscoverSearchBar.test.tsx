import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiscoverSearchBar, { type DiscoverSearchBarProps } from '../DiscoverSearchBar';

type SearchCallbacks = Pick<DiscoverSearchBarProps,
  'onSearch' | 'onTabChange' | 'onSearchTermChange' | 'onExpandedChange'
  | 'setSelectedStartDate' | 'setSelectedEndDate' | 'setSelectedSports'
>;

function SearchHarness({
  callbacks = {},
  initialExpanded = true,
}: {
  callbacks?: Partial<SearchCallbacks>;
  initialExpanded?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DiscoverSearchBarProps['activeTab']>('events');
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(initialExpanded);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [sports, setSports] = useState<string[]>([]);

  return (
    <DiscoverSearchBar
      activeTab={activeTab}
      onTabChange={(tab) => { setActiveTab(tab); callbacks.onTabChange?.(tab); }}
      searchTerm={searchTerm}
      onSearchTermChange={(value) => { setSearchTerm(value); callbacks.onSearchTermChange?.(value); }}
      expanded={expanded}
      onExpandedChange={(value) => { setExpanded(value); callbacks.onExpandedChange?.(value); }}
      locationControls={<button type="button">Choose location</button>}
      locationLabel="Portland, OR"
      selectedStartDate={startDate}
      setSelectedStartDate={(value) => { setStartDate(value); callbacks.setSelectedStartDate?.(value); }}
      selectedEndDate={endDate}
      setSelectedEndDate={(value) => { setEndDate(value); callbacks.setSelectedEndDate?.(value); }}
      selectedSports={sports}
      setSelectedSports={(value) => { setSports(value); callbacks.setSelectedSports?.(value); }}
      sports={['Soccer', 'Tennis']}
      sportsLoading={false}
      sportsError={null}
      onSearch={() => { callbacks.onSearch?.(); setExpanded(false); }}
    />
  );
}
const dateKey = (date: Date): string => (
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
);

const relativeDate = (days: number): Date => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value;
};

const dateLabel = (date: Date): string => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(date);

const getDayButton = (calendar: HTMLElement, date: Date): HTMLElement => {
  const dayCell = within(calendar).getAllByRole('gridcell').find((entry) => (
    entry.getAttribute('data-day') === dateKey(date)
    && entry.getAttribute('data-outside') !== 'true'
  ));
  if (!dayCell) throw new Error(`Calendar day ${dateKey(date)} is not rendered.`);
  return within(dayCell).getByRole('button');
};

it('hides a portaled date panel immediately when Escape collapses the search', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);
  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(within(dates).getByRole('button', { name: /^Select start date/ }));
  expect(screen.getByRole('textbox', { name: 'Search by name or keyword' })).toBeInTheDocument();

  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'Choose dates' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Search', exact: true })).toHaveFocus();
});

it('selects a start date, then an end date, and highlights the range', async () => {
  const user = userEvent.setup();
  const callbacks = { setSelectedStartDate: jest.fn(), setSelectedEndDate: jest.fn() };
  const startDate = relativeDate(1);
  const middleDate = relativeDate(2);
  const endDate = relativeDate(3);
  render(<SearchHarness callbacks={callbacks} />);

  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  expect(within(dates).getByText('Select a start date', { exact: true })).toBeInTheDocument();
  expect(within(dates).getAllByRole('gridcell')
    .filter((cell) => cell.getAttribute('data-outside') === 'true')
    .every((cell) => !cell.querySelector('button'))).toBe(true);
  expect(within(dates).getByRole('button', { name: /^Select start date/ })).toHaveAttribute('aria-pressed', 'true');

  await user.click(getDayButton(dates, startDate));
  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(startDate);
  expect(within(dates).getByText('Select an end date', { exact: true })).toBeInTheDocument();
  expect(getDayButton(dates, startDate)).toHaveAttribute('data-selected-single', 'true');
  expect(getDayButton(dates, relativeDate(2)).parentElement).toHaveClass('discover-date-preview-forward-1');
  expect(getDayButton(dates, relativeDate(3)).parentElement).toHaveClass('discover-date-preview-forward-2');
  expect(getDayButton(dates, relativeDate(4)).parentElement).toHaveClass('discover-date-preview-forward-3');

  await user.click(getDayButton(dates, endDate));
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(endDate);
  expect(within(dates).getByText('Select a start date', { exact: true })).toBeInTheDocument();
  expect(getDayButton(dates, startDate)).toHaveAttribute('data-range-start', 'true');
  expect(getDayButton(dates, middleDate)).toHaveAttribute('data-range-middle', 'true');
  expect(getDayButton(dates, endDate)).toHaveAttribute('data-range-end', 'true');
  expect(screen.getByRole('button', {
    name: `When: ${dateLabel(startDate)} – ${dateLabel(endDate)}`,
  })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Clear dates' }));
  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(null);
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(null);
  expect(within(dates).queryByRole('button', { name: 'Clear dates' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'When: Any dates' })).toBeInTheDocument();
});

it('switches to end selection and supports an end-only date', async () => {
  const user = userEvent.setup();
  const callbacks = { setSelectedStartDate: jest.fn(), setSelectedEndDate: jest.fn() };
  const endDate = relativeDate(2);
  render(<SearchHarness callbacks={callbacks} />);

  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(within(dates).getByRole('button', { name: /^Select end date/ }));
  expect(within(dates).getByText('Select an end date', { exact: true })).toBeInTheDocument();

  await user.click(getDayButton(dates, endDate));
  expect(callbacks.setSelectedStartDate).not.toHaveBeenCalled();
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(endDate);
  expect(within(dates).getByText('Select a start date', { exact: true })).toBeInTheDocument();
  expect(getDayButton(dates, endDate)).toHaveAttribute('data-selected-single', 'true');
  expect(getDayButton(dates, relativeDate(1)).parentElement).toHaveClass('discover-date-preview-backward-1');
  expect(getDayButton(dates, relativeDate(0)).parentElement).toHaveClass('discover-date-preview-backward-2');
  expect(getDayButton(dates, relativeDate(-1)).parentElement).toHaveClass('discover-date-preview-backward-3');
  expect(within(dates).getByRole('button', { name: /^Select start date/ })).toHaveAttribute('aria-pressed', 'true');
});

it('removes a selected marker when it is clicked again', async () => {
  const user = userEvent.setup();
  const callbacks = { setSelectedStartDate: jest.fn(), setSelectedEndDate: jest.fn() };
  const startDate = relativeDate(1);
  const endDate = relativeDate(2);
  render(<SearchHarness callbacks={callbacks} />);

  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(getDayButton(dates, startDate));
  await user.click(getDayButton(dates, startDate));

  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('button', { name: 'When: Any dates' })).toBeInTheDocument();
  expect(within(dates).getByText('Select a start date', { exact: true })).toBeInTheDocument();

  await user.click(within(dates).getByRole('button', { name: /^Select end date/ }));
  await user.click(getDayButton(dates, endDate));
  await user.click(getDayButton(dates, endDate));

  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('button', { name: 'When: Any dates' })).toBeInTheDocument();
  expect(within(dates).getByText('Select an end date', { exact: true })).toBeInTheDocument();
});

it('keeps past dates selectable', async () => {
  const user = userEvent.setup();
  const callbacks = { setSelectedStartDate: jest.fn(), setSelectedEndDate: jest.fn() };
  const pastDate = relativeDate(-2);
  render(<SearchHarness callbacks={callbacks} />);

  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(getDayButton(dates, pastDate));

  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(pastDate);
  expect(getDayButton(dates, pastDate)).toHaveAttribute('data-selected-single', 'true');
});

it('clears the opposite date when either endpoint crosses the range', async () => {
  const user = userEvent.setup();
  const callbacks = { setSelectedStartDate: jest.fn(), setSelectedEndDate: jest.fn() };
  const initialStartDate = relativeDate(1);
  const initialEndDate = relativeDate(3);
  const laterStartDate = relativeDate(4);
  const earlierEndDate = relativeDate(0);
  render(<SearchHarness callbacks={callbacks} />);

  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(getDayButton(dates, initialStartDate));
  await user.click(getDayButton(dates, initialEndDate));
  await user.click(within(dates).getByRole('button', { name: /^Select start date/ }));
  await user.click(getDayButton(dates, laterStartDate));

  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(laterStartDate);
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(null);
  expect(within(dates).getByText('Select an end date', { exact: true })).toBeInTheDocument();

  await user.click(within(dates).getByRole('button', { name: /^Select end date/ }));
  await user.click(getDayButton(dates, earlierEndDate));

  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(null);
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(earlierEndDate);
  expect(within(dates).getByText('Select a start date', { exact: true })).toBeInTheDocument();
});

it('keeps event dates out of non-event searches and restores them for Events', async () => {
  const user = userEvent.setup();
  const startDate = relativeDate(1);
  const endDate = relativeDate(3);
  render(<SearchHarness />);

  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  let dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(getDayButton(dates, startDate));
  await user.click(getDayButton(dates, endDate));

  for (const target of ['Organizations', 'Rentals', 'Teams']) {
    await user.click(within(screen.getByRole('group', { name: 'Search type' })).getByRole('button', { name: target }));
    const when = screen.getByRole('group', { name: 'When: Events only' });
    expect(within(when).getByText('Events only')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Choose dates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Select start date/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Select end date/ })).not.toBeInTheDocument();
  }

  await user.click(within(screen.getByRole('group', { name: 'Search type' })).getByRole('button', { name: 'Events' }));
  await user.click(screen.getByRole('button', {
    name: `When: ${dateLabel(startDate)} – ${dateLabel(endDate)}`,
  }));
  dates = screen.getByRole('dialog', { name: 'Choose dates' });
  expect(within(dates).getByRole('button', {
    name: `Select start date: ${dateLabel(startDate)}`,
  })).toBeInTheDocument();
  expect(within(dates).getByRole('button', {
    name: `Select end date: ${dateLabel(endDate)}`,
  })).toBeInTheDocument();
});

it('preserves the query and selected tab across controlled collapse and expansion', async () => {
  const user = userEvent.setup();
  const callbacks = { onTabChange: jest.fn(), onSearchTermChange: jest.fn(), onExpandedChange: jest.fn() };
  render(<SearchHarness callbacks={callbacks} />);
  const search = within(screen.getByRole('search', { name: 'Discover search' }));

  await user.type(search.getByRole('textbox', { name: 'Search by name or keyword' }), 'Evening');
  await user.click(within(search.getByRole('group', { name: 'Search type' })).getByRole('button', { name: 'Teams' }));

  expect(callbacks.onSearchTermChange).toHaveBeenLastCalledWith('Evening');
  expect(callbacks.onTabChange).toHaveBeenLastCalledWith('teams');
  expect(search.getByRole('button', { name: 'Teams' })).toHaveAttribute('aria-pressed', 'true');
  expect(search.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'false');
  await user.keyboard('{Escape}');

  const searchButton = search.getByRole('button', { name: 'Search', exact: true });
  expect(searchButton).toHaveFocus();
  expect(callbacks.onExpandedChange).toHaveBeenLastCalledWith(false);
  expect(search.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(searchButton);

  expect(callbacks.onExpandedChange).toHaveBeenLastCalledWith(true);
  expect(search.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveValue('Evening');
  expect(search.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveFocus();
  expect(search.getByRole('button', { name: 'Teams' })).toHaveAttribute('aria-pressed', 'true');
});

it('keeps the shared controls in place and expands from the surface background', async () => {
  const user = userEvent.setup();
  const onExpandedChange = jest.fn();
  const openResult = jest.fn();
  render(
    <>
      <SearchHarness initialExpanded={false} callbacks={{ onExpandedChange }} />
      <button type="button" onClick={openResult}>Open result</button>
    </>,
  );
  const search = screen.getByRole('search', { name: 'Discover search' });
  const surface = search.querySelector('.discover-search-surface');
  const whereSection = search.querySelector('[data-section="where"]');
  const result = screen.getByRole('button', { name: 'Open result' });
  if (!surface || !whereSection) throw new Error('The collapsed search surface is missing.');
  expect(within(search).queryByRole('textbox')).not.toBeInTheDocument();

  await user.click(surface);

  expect(onExpandedChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveFocus();
  expect(search.querySelector('[data-section="where"]')).toBe(whereSection);
  const backdrop = search.querySelector('.discover-search-backdrop');
  const panel = search.querySelector('.discover-search-panel');
  if (!backdrop || !panel) throw new Error('The expanded search overlay is missing.');

  await user.click(backdrop);

  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  expect(openResult).not.toHaveBeenCalled();
  expect(within(search).getByRole('button', { name: 'Search', exact: true })).toHaveFocus();
  expect(panel).toHaveAttribute('data-state', 'closing');
  expect(within(search).queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();

  fireEvent.animationEnd(panel);
  expect(panel).toHaveAttribute('data-state', 'closed');
  expect(search.querySelector('.discover-search-backdrop')).not.toBeInTheDocument();
  await user.tab();
  expect(result).toHaveFocus();
});

it('selects a section when its surface label is clicked', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);

  const search = screen.getByRole('search', { name: 'Discover search' });
  const whereSection = search.querySelector('[data-section="where"]');
  if (!whereSection) throw new Error('The Where section is missing.');

  await user.click(within(whereSection).getByText('Where'));

  expect(whereSection).toHaveClass('is-active');
});

it('collapses after a click outside the search and returns focus to its Search control', async () => {
  const user = userEvent.setup();
  const onExpandedChange = jest.fn();
  render(
    <>
      <SearchHarness callbacks={{ onExpandedChange }} />
      <button type="button">Outside search</button>
    </>,
  );

  await user.click(screen.getByRole('button', { name: 'Outside search' }));

  expect(onExpandedChange).toHaveBeenCalledTimes(1);
  expect(onExpandedChange).toHaveBeenCalledWith(false);
  expect(screen.getByRole('button', { name: 'Search', exact: true })).toHaveFocus();
  expect(screen.queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();
});


it('keeps a reopened panel active when the previous close animation finishes', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);
  await user.keyboard('{Escape}');
  const searchButton = screen.getByRole('button', { name: 'Search', exact: true });
  const panel = screen.getByRole('search', { name: 'Discover search' }).querySelector('.discover-search-panel');
  if (!panel) throw new Error('The closing search panel is missing.');

  await user.click(searchButton);
  fireEvent.animationEnd(panel);

  const query = screen.getByRole('textbox', { name: 'Search by name or keyword' });
  expect(query).toHaveFocus();
  await user.type(query, 'Late match');
  expect(query).toHaveValue('Late match');
});




it('keeps multiple sport selections in the collapsed search controls', async () => {
  const user = userEvent.setup();
  const setSelectedSports = jest.fn();
  render(<SearchHarness callbacks={{ setSelectedSports }} />);
  await user.click(screen.getByRole('combobox', { name: 'Sport' }));
  await user.click(screen.getByRole('option', { name: 'Soccer' }));
  await user.click(screen.getByRole('option', { name: 'Tennis' }));

  expect(setSelectedSports).toHaveBeenLastCalledWith(['Soccer', 'Tennis']);
  expect(screen.getByRole('option', { name: 'Soccer' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('option', { name: 'Tennis' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Search', exact: true }));

  expect(screen.getByRole('combobox', { name: 'Sport' })).toHaveValue('Soccer, Tennis');
});

it('submits with the Search button and Enter while retaining the query', async () => {
  const user = userEvent.setup();
  const onSearch = jest.fn();
  render(<SearchHarness callbacks={{ onSearch }} />);
  await user.type(screen.getByRole('textbox', { name: 'Search by name or keyword' }), 'Night games');
  expect(onSearch).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Search', exact: true }));

  expect(onSearch).toHaveBeenCalledTimes(1);
  const searchButton = screen.getByRole('button', { name: 'Search', exact: true });
  expect(searchButton).toHaveFocus();
  await user.click(searchButton);
  expect(screen.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveValue('Night games');
  await user.keyboard('{Enter}');

  expect(onSearch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Search', exact: true })).toHaveFocus();
});
