import {
  applySportResourceLabels,
  getDefaultSportResourceLabels,
  resolveEventResourceLabels,
} from '@/lib/sportResourceLabels';

const SPORTS = new Map([
  ['volleyball', { resourceLabelSingular: 'Court', resourceLabelPlural: 'Courts' }],
  ['soccer', { resourceLabelSingular: 'Field', resourceLabelPlural: 'Fields' }],
]);

describe('Sport Resource Labels', () => {
  it('assigns deterministic labels to existing volleyball and soccer Sports', () => {
    expect(getDefaultSportResourceLabels('Indoor Volleyball')).toEqual({
      resourceLabelSingular: 'Court',
      resourceLabelPlural: 'Courts',
    });
    expect(getDefaultSportResourceLabels('Grass Soccer')).toEqual({
      resourceLabelSingular: 'Field',
      resourceLabelPlural: 'Fields',
    });
    expect(getDefaultSportResourceLabels('Custom Sport')).toEqual({
      resourceLabelSingular: 'Resource',
      resourceLabelPlural: 'Resources',
    });
  });

  it('uses the Sport labels for a single-Sport Event', () => {
    expect(resolveEventResourceLabels({
      sportIds: ['volleyball'],
      sportsById: SPORTS,
    })).toEqual({ singular: 'Court', plural: 'Courts' });
  });

  it('uses generic labels for a multi-Sport Event and scoped labels for one Resource', () => {
    expect(resolveEventResourceLabels({
      sportIds: ['volleyball', 'soccer'],
      sportsById: SPORTS,
    })).toEqual({ singular: 'Resource', plural: 'Resources' });
    expect(resolveEventResourceLabels({
      sportIds: ['volleyball', 'soccer'],
      sportsById: SPORTS,
      resourceSportIds: ['soccer'],
    })).toEqual({ singular: 'Field', plural: 'Fields' });
  });

  it('localizes canonical Resource diagnostics without changing their evidence', () => {
    expect(applySportResourceLabels(
      'Resource "court-1" overlaps another Resource.',
      { singular: 'Court', plural: 'Courts' },
    )).toBe('Court "court-1" overlaps another Court.');
  });
});
