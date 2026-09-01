import { resolveRequiredSignerRoles } from '@/lib/templateSignerTypes';

describe('resolveRequiredSignerRoles', () => {
  it('uses the configured role labels when they contain usable values', () => {
    expect(resolveRequiredSignerRoles([' Parent/Guardian ', 'Child'], 'PARTICIPANT')).toEqual([
      'Parent/Guardian',
      'Child',
    ]);
  });

  it('derives all roles for a combined signer requirement when configured roles are empty', () => {
    expect(resolveRequiredSignerRoles([], 'PARENT_GUARDIAN_CHILD')).toEqual([
      'Parent/Guardian',
      'Child',
    ]);
  });

  it('ignores blank configured roles before falling back to the signer type', () => {
    expect(resolveRequiredSignerRoles([' ', '', null], 'CHILD')).toEqual(['Child']);
  });
});
