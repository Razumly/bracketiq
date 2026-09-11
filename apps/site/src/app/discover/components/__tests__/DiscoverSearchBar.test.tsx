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

it('preserves the query and selected tab across controlled collapse and expansion', async () => {
  const user = userEvent.setup();
  const callbacks = { onTabChange: jest.fn(), onSearchTermChange: jest.fn(), onExpandedChange: jest.fn() };
  render(<SearchHarness callbacks={callbacks} />);
  const search = within(screen.getByRole('search', { name: 'Discover search' }));

  expect(search.queryByRole('button', { name: 'Collapse search' })).not.toBeInTheDocument();
  await user.type(search.getByRole('textbox', { name: 'Search by name or keyword' }), 'Evening');
  await user.click(within(search.getByRole('group', { name: 'Search type' })).getByRole('button', { name: 'Teams' }));

  expect(callbacks.onSearchTermChange).toHaveBeenLastCalledWith('Evening');
  expect(callbacks.onTabChange).toHaveBeenLastCalledWith('teams');
  expect(search.getByRole('button', { name: 'Teams' })).toHaveAttribute('aria-pressed', 'true');
  expect(search.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'false');
  await user.keyboard('{Escape}');

  const summary = search.getByRole('button', { name: /^Edit search: Teams, Evening,/ });
  expect(summary).toHaveAttribute('aria-expanded', 'false');
  expect(summary).toHaveFocus();
  expect(callbacks.onExpandedChange).toHaveBeenLastCalledWith(false);
  expect(search.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(summary);

  expect(callbacks.onExpandedChange).toHaveBeenLastCalledWith(true);
  expect(summary).toHaveAttribute('aria-expanded', 'true');
  expect(search.queryByRole('button', { name: 'Collapse search' })).not.toBeInTheDocument();
  expect(search.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveValue('Evening');
  expect(search.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveFocus();
  expect(search.getByRole('button', { name: 'Teams' })).toHaveAttribute('aria-pressed', 'true');
});

it('keeps the summary anchor in place and dismisses the overlay through its backdrop', async () => {
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
  const summary = within(search).getByRole('button', { name: /^Edit search:/ });
  const result = screen.getByRole('button', { name: 'Open result' });
  expect(within(search).queryByRole('textbox')).not.toBeInTheDocument();

  await user.click(summary);

  expect(onExpandedChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveFocus();
  // JSDOM has no layout engine; retain the flow anchor and following result node.
  expect(summary.parentElement).toBe(search);
  expect(search.nextElementSibling).toBe(result);
  expect(summary).toHaveAttribute('aria-hidden', 'true');
  expect(summary).toHaveAttribute('tabindex', '-1');
  const backdrop = search.querySelector('.discover-search-backdrop');
  const panel = document.getElementById(summary.getAttribute('aria-controls')!);
  if (!backdrop || !panel) throw new Error('The expanded search overlay is missing.');

  await user.click(backdrop);

  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  expect(openResult).not.toHaveBeenCalled();
  expect(summary).toHaveFocus();
  expect(panel).toHaveAttribute('aria-hidden', 'true');
  expect(panel).toHaveAttribute('inert');
  expect(within(search).queryByRole('textbox')).not.toBeInTheDocument();
  expect(search.nextElementSibling).toBe(result);

  fireEvent.animationEnd(panel);
  expect(panel).not.toBeInTheDocument();
  expect(backdrop).not.toBeInTheDocument();
  await user.tab();
  expect(result).toHaveFocus();
});

it('collapses after a click outside the search and returns focus to its summary', async () => {
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
  expect(screen.getByRole('button', { name: /^Edit search:/ })).toHaveFocus();
  expect(screen.queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();
});

it('hides a portaled date panel immediately when Escape collapses the search', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);
  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = screen.getByRole('dialog', { name: 'Choose dates' });
  await user.click(within(dates).getByLabelText('Start date'));
  expect(screen.getByRole('textbox', { name: 'Search by name or keyword' })).toBeInTheDocument();

  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'Choose dates' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Edit search:/ })).toHaveFocus();
});

it('keeps a reopened panel active when the previous close animation finishes', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);
  await user.keyboard('{Escape}');
  const summary = screen.getByRole('button', { name: /^Edit search:/ });
  const panel = document.getElementById(summary.getAttribute('aria-controls')!);
  if (!panel) throw new Error('The closing search panel is missing.');

  await user.click(summary);
  fireEvent.animationEnd(panel);

  const query = screen.getByRole('textbox', { name: 'Search by name or keyword' });
  expect(query).toHaveFocus();
  expect(panel).not.toHaveAttribute('inert');
  await user.type(query, 'Late match');
  expect(query).toHaveValue('Late match');
});

it('updates and clears the date range through the responsive date panel', async () => {
  const user = userEvent.setup();
  const callbacks = { setSelectedStartDate: jest.fn(), setSelectedEndDate: jest.fn() };
  render(<SearchHarness callbacks={callbacks} />);
  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = within(screen.getByRole('dialog', { name: 'Choose dates' }));

  fireEvent.change(dates.getByLabelText('Start date'), { target: { value: '2099-09-10' } });
  fireEvent.change(dates.getByLabelText('End date'), { target: { value: '2099-09-12' } });
  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(new Date(2099, 8, 10));
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(new Date(2099, 8, 12));
  expect(dates.getByLabelText('Start date')).toHaveValue('2099-09-10');
  expect(dates.getByLabelText('End date')).toHaveValue('2099-09-12');
  await user.click(dates.getByRole('button', { name: 'Done' }));

  await user.click(screen.getByRole('button', { name: 'When: Sep 10, 2099 – Sep 12, 2099' }));
  await user.click(screen.getByRole('button', { name: 'Clear dates' }));
  expect(callbacks.setSelectedStartDate).toHaveBeenLastCalledWith(null);
  expect(callbacks.setSelectedEndDate).toHaveBeenLastCalledWith(null);
  expect(screen.getByLabelText('Start date')).toHaveValue('');
  expect(screen.getByLabelText('End date')).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'When: Any dates' })).toBeVisible();
});

it('clears the opposite date when either endpoint crosses the range', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);
  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  let dates = within(screen.getByRole('dialog', { name: 'Choose dates' }));

  fireEvent.change(dates.getByLabelText('Start date'), { target: { value: '2099-09-10' } });
  fireEvent.change(dates.getByLabelText('End date'), { target: { value: '2099-09-12' } });
  fireEvent.change(dates.getByLabelText('Start date'), { target: { value: '2099-09-13' } });

  expect(dates.getByLabelText('Start date')).toHaveValue('2099-09-13');
  expect(dates.getByLabelText('End date')).toHaveValue('');
  await user.click(dates.getByRole('button', { name: 'Done' }));
  await user.click(screen.getByRole('button', { name: 'When: From Sep 13, 2099' }));
  dates = within(screen.getByRole('dialog', { name: 'Choose dates' }));
  fireEvent.change(dates.getByLabelText('End date'), { target: { value: '2099-09-09' } });

  expect(dates.getByLabelText('Start date')).toHaveValue('');
  expect(dates.getByLabelText('End date')).toHaveValue('2099-09-09');
  await user.click(dates.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'When: Until Sep 9, 2099' })).toBeVisible();
});

it('keeps event dates out of non-event searches and restores them for Events', async () => {
  const user = userEvent.setup();
  render(<SearchHarness />);
  await user.click(screen.getByRole('button', { name: 'When: Any dates' }));
  const dates = within(screen.getByRole('dialog', { name: 'Choose dates' }));
  fireEvent.change(dates.getByLabelText('Start date'), { target: { value: '2099-09-10' } });
  fireEvent.change(dates.getByLabelText('End date'), { target: { value: '2099-09-12' } });
  await user.click(dates.getByRole('button', { name: 'Done' }));

  for (const target of ['Organizations', 'Rentals', 'Teams']) {
    await user.click(within(screen.getByRole('group', { name: 'Search type' })).getByRole('button', { name: target }));
    const when = screen.getByRole('group', { name: 'When: Events only' });
    expect(within(when).getByText('Events only')).toBeVisible();
    await user.click(when);
    expect(screen.queryByRole('dialog', { name: 'Choose dates' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search', exact: true }));
    const summary = screen.getByRole('button', { name: new RegExp(`^Edit search: ${target},`) });
    expect(within(summary).getByText('Events only')).toBeVisible();
    await user.click(summary);
  }

  await user.click(within(screen.getByRole('group', { name: 'Search type' })).getByRole('button', { name: 'Events' }));
  await user.click(screen.getByRole('button', { name: 'When: Sep 10, 2099 – Sep 12, 2099' }));
  expect(screen.getByLabelText('Start date')).toHaveValue('2099-09-10');
  expect(screen.getByLabelText('End date')).toHaveValue('2099-09-12');
});

it('keeps multiple sport selections in the collapsed search summary', async () => {
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
  await user.click(screen.getByRole('button', { name: 'Edit search: Events, Portland, OR, Any dates, Soccer, Tennis' }));

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
  const summary = screen.getByRole('button', { name: 'Edit search: Events, Night games, Portland, OR, Any dates, All sports' });
  expect(summary).toHaveFocus();
  await user.click(summary);
  expect(screen.getByRole('textbox', { name: 'Search by name or keyword' })).toHaveValue('Night games');
  await user.keyboard('{Enter}');

  expect(onSearch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Edit search: Events, Night games, Portland, OR, Any dates, All sports' })).toHaveFocus();
});
