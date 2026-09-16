import { buildSportSkillFilterOptions } from '../DivisionDiscoveryFilters';

const groups = [
  {
    sportId: 'Grass Soccer',
    sportName: 'Grass Soccer',
    skills: [
      { id: 'premier', name: 'Premier' },
      { id: 'open', name: 'Open' },
    ],
  },
  {
    sportId: 'Indoor Volleyball',
    sportName: 'Indoor Volleyball',
    skills: [
      { id: 'aa', name: 'AA' },
      { id: 'open', name: 'Open' },
    ],
  },
];

describe('buildSportSkillFilterOptions', () => {
  it('only returns skills for the selected sport', () => {
    expect(buildSportSkillFilterOptions(groups, ['Grass Soccer'])).toEqual([
      { value: 'open', label: 'Open' },
      { value: 'premier', label: 'Premier' },
    ]);
  });

  it('returns no skills when no non-blank sport is selected', () => {
    expect(buildSportSkillFilterOptions(groups, [])).toEqual([]);
    expect(buildSportSkillFilterOptions(groups, ['', '  '])).toEqual([]);
  });

  it('returns no skills when multiple sports are selected', () => {
    expect(buildSportSkillFilterOptions(groups, ['Indoor Volleyball', 'Grass Soccer'])).toEqual([]);
  });

  it('normalizes sport keys and deduplicates normalized skill options', () => {
    const normalizedGroups = [
      {
        sportId: 'grass-soccer',
        sportName: ' Grass Soccer ',
        skills: [
          { id: ' PREMIER ', name: ' Premier ' },
          { id: ' OPEN ', name: ' Open ' },
          { id: 'open', name: 'Open' },
          { id: ' ', name: 'Invalid skill' },
        ],
      },
    ];
    const options = [
      { value: 'open', label: 'Open' },
      { value: 'premier', label: 'Premier' },
    ];

    expect(buildSportSkillFilterOptions(normalizedGroups, [' GRASS-SOCCER '])).toEqual(options);
    expect(buildSportSkillFilterOptions(normalizedGroups, ['', ' GRASS SOCCER ', 'grass soccer', ' '])).toEqual(options);
  });
});
