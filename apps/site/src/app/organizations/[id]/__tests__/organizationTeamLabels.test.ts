import type { Division, Team } from '@/types';
import { teamDivisionLabel } from '../organizationTeamLabels';

const team = { division: 'd31fa7' } as Team;
const division = { id: 'd31fa7', key: 'u16', name: 'Under 16' } as Division;

describe('Organization team division labels', () => {
  it('resolves an opaque division ID from Organization division data', () => {
    expect(teamDivisionLabel(team, [division])).toBe('Under 16');
    expect(teamDivisionLabel({ ...team, division: 'u16' }, [division])).toBe('Under 16');
  });

  it('shows an explicit failure when a referenced division name is unavailable', () => {
    expect(teamDivisionLabel(team)).toBe('Division name unavailable');
    expect(teamDivisionLabel({ ...team, division: { ...division, name: '' } })).toBe('Division name unavailable');
  });

  it('preserves the default Open label and hydrated division names', () => {
    expect(teamDivisionLabel({ ...team, division: 'Open' })).toBe('Open');
    expect(teamDivisionLabel({ ...team, division })).toBe('Under 16');
  });
});
