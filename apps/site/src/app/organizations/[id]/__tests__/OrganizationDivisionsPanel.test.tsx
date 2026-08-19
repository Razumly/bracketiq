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

  it('does not reload catalogs when the change callback identity changes', async () => {
    const firstOnChanged = jest.fn();
    const { rerender } = render(
      <MantineProvider>
        <OrganizationDivisionsPanel organization={organization} onChanged={firstOnChanged} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(firstOnChanged).toHaveBeenCalledWith([]);
    });

    rerender(
      <MantineProvider>
        <OrganizationDivisionsPanel organization={organization} onChanged={jest.fn()} />
      </MantineProvider>,
    );
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 25);
      await promise;
    });

    expect(listOrganizationDivisionsMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
