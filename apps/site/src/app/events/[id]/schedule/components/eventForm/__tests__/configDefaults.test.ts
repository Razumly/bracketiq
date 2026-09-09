import { derivePoolTeamCount } from '../configDefaults';

describe('derivePoolTeamCount', () => {
    it('does not derive a pool team count when the pool count is blank', () => {
        expect(derivePoolTeamCount(3, null)).toBeUndefined();
    });

    it('derives a pool team count for a valid divisible configuration', () => {
        expect(derivePoolTeamCount(6, 2)).toBe(3);
    });
});
