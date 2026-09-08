import { act, renderHook } from '@testing-library/react';
import { organizationService } from '@/lib/organizationService';
import type { Organization } from '@/types';
import { useOrganizationData } from '../useOrganizationData';

jest.mock('@/lib/organizationService', () => ({
  organizationService: { getOrganizationById: jest.fn() },
}));
const getOrganization = jest.mocked(organizationService.getOrganizationById);
const organization = { $id: 'org_1', name: 'Austin Hoops' } as Organization;

function pendingOrganization() {
  let resolve!: (value: Organization) => void;
  const promise = new Promise<Organization>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => { getOrganization.mockReset(); });

describe('Organization data loading', () => {
  it('reports a failed silent Staff refresh without hiding the roster', async () => {
    getOrganization.mockResolvedValueOnce(organization).mockRejectedValueOnce(new Error('Roster refresh failed'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useOrganizationData('staff'));
      await act(async () => { await result.current.loadOrg('org_1'); });
      await act(async () => { await result.current.loadOrg('org_1', { silent: true }); });
      expect(result.current.org).toBe(organization);
      expect(result.current.loading).toBe(false);
      expect(result.current.organizationLoadError).toBe('Roster refresh failed');
    } finally { log.mockRestore(); }
  });

  it('uses data-only loading for an ordinary same-Organization refresh after a save', async () => {
    getOrganization.mockResolvedValueOnce(organization);
    const { result } = renderHook(() => useOrganizationData('teams'));
    await act(async () => { await result.current.loadOrg('org_1'); });
    const pending = pendingOrganization();
    getOrganization.mockReturnValueOnce(pending.promise);
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.loadOrg('org_1'); });
    expect(result.current.loading).toBe(false);
    expect(result.current.organizationLoadingTab).toBe('teams');
    expect(result.current.org).toBe(organization);
    await act(async () => {
      pending.resolve({ ...organization, name: 'Updated club' });
      await refresh;
    });
    expect(result.current.org?.name).toBe('Updated club');
    expect(result.current.organizationLoadingTab).toBeNull();
  });

  it('retains loaded data and reports a refresh failure', async () => {
    getOrganization.mockResolvedValueOnce(organization).mockRejectedValueOnce(new Error('Connection lost'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useOrganizationData('publicPage'));
      await act(async () => { await result.current.loadOrg('org_1'); });
      await act(async () => { await result.current.loadOrg('org_1'); });
      expect(result.current.org).toBe(organization);
      expect(result.current.loading).toBe(false);
      expect(result.current.organizationLoadingTab).toBeNull();
      expect(result.current.organizationLoadError).toBe('Connection lost');
    } finally { log.mockRestore(); }
  });

  it('does not let an older request replace the current Organization', async () => {
    const older = pendingOrganization();
    getOrganization.mockReturnValueOnce(older.promise).mockResolvedValueOnce({ ...organization, $id: 'org_2' });
    const { result } = renderHook(() => useOrganizationData('events'));
    let first!: Promise<void>;
    act(() => { first = result.current.loadOrg('org_1'); });
    await act(async () => { await result.current.loadOrg('org_2'); });
    await act(async () => { older.resolve(organization); await first; });
    expect(result.current.org?.$id).toBe('org_2');
    expect(result.current.loading).toBe(false);
  });

  it('does not show the old Organization when a different Organization fails to load', async () => {
    getOrganization.mockResolvedValueOnce(organization).mockResolvedValueOnce(undefined);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useOrganizationData('overview'));
      await act(async () => { await result.current.loadOrg('org_1'); });
      await act(async () => { await result.current.loadOrg('org_2'); });
      expect(result.current.org).toBeUndefined();
      expect(result.current.organizationLoadError).toContain('not found');
    } finally { log.mockRestore(); }
  });
});
