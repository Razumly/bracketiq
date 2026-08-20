import { MantineProvider } from '@mantine/core';
import { act, render, waitFor } from '@testing-library/react';

import type { Organization } from '@/types';

const listOrganizationDivisionsMock = jest.fn();

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    listOrganizationDivisions: (...args: unknown[]) => listOrganizationDivisionsMock(...args),
  },
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => ({ sports: [] }),
}));

import OrganizationDivisionsPanel from '@/app/organizations/[id]/OrganizationDivisionsPanel';

const organization = {
  $id: 'org_1',
  divisions: [],
} as unknown as Organization;

describe('OrganizationDivisionsPanel loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listOrganizationDivisionsMock.mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ genders: [], ages: [], sportSkills: [] }),
    }) as jest.Mock;
  });

  it('does not reload catalogs and uses the latest callback when only its identity changes', async () => {
    const { promise: divisionsPromise, resolve: resolveDivisions } = Promise.withResolvers<never[]>();
    listOrganizationDivisionsMock.mockReturnValue(divisionsPromise);
    const firstOnChanged = jest.fn();
    const latestOnChanged = jest.fn();
    const { rerender } = render(
      <MantineProvider>
        <OrganizationDivisionsPanel organization={organization} onChanged={firstOnChanged} />
      </MantineProvider>,
    );

    expect(listOrganizationDivisionsMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender(
      <MantineProvider>
        <OrganizationDivisionsPanel organization={organization} onChanged={latestOnChanged} />
      </MantineProvider>,
    );
    await act(async () => {
      resolveDivisions([]);
      await divisionsPromise;
    });

    await waitFor(() => {
      expect(latestOnChanged).toHaveBeenCalledWith([]);
    });
    expect(firstOnChanged).not.toHaveBeenCalled();
    expect(listOrganizationDivisionsMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
