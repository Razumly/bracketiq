import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiscoverFilterBar, { FilterOptionList } from '../DiscoverFilterBar';
import type { DivisionDiscoveryFilterOptions, DivisionDiscoveryFilterValue } from '../DivisionDiscoveryFilters';
import type { SportCategory } from '@/types';

const divisionFilters: DivisionDiscoveryFilterValue = {
  genders: [],
  skillDivisionTypeIds: [],
  ageDivisionTypeIds: [],
  priceMinDollars: null,
  priceMaxDollars: null,
};

const divisionOptions: DivisionDiscoveryFilterOptions = {
  loading: false,
  error: null,
  genders: [],
  ages: [],
  skillOptions: [],
};

const sportCategories: SportCategory[] = [{
  $id: 'soccer',
  name: 'Soccer',
  sportIds: ['Soccer'],
  displayOrder: 10,
  $createdAt: '',
  $updatedAt: '',
}];

it('omits the duplicate sports control when the search container owns it', () => {
  render(
    <DiscoverFilterBar
      location={null}
      selectedSports={[]}
      setSelectedSports={jest.fn()}
      sports={['Soccer']}
      sportCategories={sportCategories}
      sportsLoading={false}
      sportsError={null}
      showSports={false}
      showAllFilters
      selectedEventTypes={['EVENT']}
      setSelectedEventTypes={jest.fn()}
      eventTypeOptions={['EVENT']}
      selectedTags={[]}
      setSelectedTags={jest.fn()}
      eventTags={[]}
      eventTagsLoading={false}
      eventTagsError={null}
      maxDistance={null}
      setMaxDistance={jest.fn()}
      defaultMaxDistance={50}
      divisionFilters={divisionFilters}
      setDivisionFilters={jest.fn()}
      divisionOptions={divisionOptions}
      activeFilterCount={0}
      resetFilters={jest.fn()}
    />,
  );

  expect(screen.queryByRole('combobox', { name: 'Sports' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'All sports', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Dates', exact: true })).not.toBeInTheDocument();
});

it('keeps searchable division option lists filterable before selection', async () => {
  const user = userEvent.setup();
  const onAgeChange = jest.fn();
  const onSkillChange = jest.fn();

  render(
    <div>
      <FilterOptionList
        options={[
          { value: 'u10', label: '10U' },
          { value: 'adult', label: 'Adult' },
        ]}
        value={[]}
        allLabel="Any age group"
        searchable
        searchLabel="Search age groups"
        onChange={onAgeChange}
      />
      <FilterOptionList
        options={[
          { value: 'recreational', label: 'Recreational' },
          { value: 'competitive', label: 'Competitive' },
        ]}
        value={[]}
        allLabel="Any skill level"
        searchable
        searchLabel="Search skill levels"
        onChange={onSkillChange}
      />
    </div>,
  );

  await user.type(screen.getByRole('textbox', { name: 'Search age groups' }), 'adult');
  expect(screen.getByRole('button', { name: 'Adult', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '10U', exact: true })).not.toBeInTheDocument();

  await user.type(screen.getByRole('textbox', { name: 'Search skill levels' }), 'competitive');
  expect(screen.getByRole('button', { name: 'Competitive', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Recreational', exact: true })).not.toBeInTheDocument();
});
