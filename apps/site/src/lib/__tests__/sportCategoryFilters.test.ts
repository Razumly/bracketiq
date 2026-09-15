import {
  buildSportCategoryGroups,
  getSportSelectionLabels,
  isSportCategoryPartiallySelected,
  isSportCategorySelected,
  toggleSportCategorySelection,
} from '@/lib/sportCategoryFilters';
import type { SportCategory } from '@/types';

const sports = [
  'Indoor Soccer',
  'Grass Soccer',
  'Beach Soccer',
  'Futsal',
  'Basketball',
];

const soccer: SportCategory = {
  $id: 'soccer',
  name: 'Soccer',
  sportIds: ['Indoor Soccer', 'Grass Soccer', 'Beach Soccer', 'Futsal', 'missing-sport'],
  displayOrder: 10,
  $createdAt: '',
  $updatedAt: '',
};

const basketball: SportCategory = {
  $id: 'basketball',
  name: 'Basketball',
  sportIds: ['Basketball'],
  displayOrder: 20,
  $createdAt: '',
  $updatedAt: '',
};

describe('sport category filters', () => {
  it('expands a category to current member Sport names', () => {
    expect(toggleSportCategorySelection([], soccer, sports)).toEqual([
      'Indoor Soccer',
      'Grass Soccer',
      'Beach Soccer',
      'Futsal',
    ]);
  });

  it('removes all members when a fully selected category is toggled', () => {
    const selected = ['Indoor Soccer', 'Grass Soccer', 'Beach Soccer', 'Futsal', 'Basketball'];
    expect(toggleSportCategorySelection(selected, soccer, sports)).toEqual(['Basketball']);
    expect(isSportCategorySelected(soccer, selected, sports)).toBe(true);
  });

  it('reports partial selection without treating the category label as a Sport', () => {
    const selected = ['Indoor Soccer'];
    expect(isSportCategorySelected(soccer, selected, sports)).toBe(false);
    expect(isSportCategoryPartiallySelected(soccer, selected, sports)).toBe(true);
    expect(toggleSportCategorySelection(selected, soccer, sports)).toEqual([
      'Indoor Soccer',
      'Grass Soccer',
      'Beach Soccer',
      'Futsal',
    ]);
  });

  it('ignores category members that are not in the current Sport catalog', () => {
    const groups = buildSportCategoryGroups(sports, [soccer]);
    expect(groups[0]?.sports.map((sport) => sport.name)).toEqual([
      'Indoor Soccer',
      'Grass Soccer',
      'Beach Soccer',
      'Futsal',
    ]);
  });

  it('compresses complete category selections for display summaries', () => {
    const selected = ['Indoor Soccer', 'Grass Soccer', 'Beach Soccer', 'Futsal', 'Basketball'];
    expect(getSportSelectionLabels(selected, sports, [soccer, basketball])).toEqual(['Soccer', 'Basketball']);
    expect(getSportSelectionLabels(['Indoor Soccer'], sports, [soccer])).toEqual(['Indoor Soccer']);
  });
});
