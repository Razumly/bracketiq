/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const loadProjectionMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/server/affiliateImports/affiliateOperationsProjection', () => ({
  loadAffiliateOperationsProjection: (...args: unknown[]) => loadProjectionMock(...args),
}));

import { GET } from '@/app/api/admin/affiliate-operations/route';

describe('/api/admin/affiliate-operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    loadProjectionMock.mockResolvedValue({
      schemaVersion: 2,
      asOf: '2026-08-24T12:00:00.000Z',
      historyRevision: 'revision_1',
      stale: false,
      view: 'overview',
      filters: {},
      contract: { rolloutCohort: 'DEFAULT', contractVersion: 1 },
      sort: { key: '', direction: 'desc' },
      overview: { targetDeficits: [] },
    });
  });

  it('requires Razumly admin access before reading the projection', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/admin/affiliate-operations'));

    expect(response.status).toBe(403);
    expect(loadProjectionMock).not.toHaveBeenCalled();
  });

  it('passes view, bounded pagination, filters, contract, sort, and detail state to one projection read', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/affiliate-operations?view=sources&page=2&pageSize=50&market=Portland&status=PUBLISHED&rolloutCohort=CANARY&contractVersion=3&sort=ageMinutes&direction=asc&anchor=source_1&selectedType=source&selected=source_1',
    ));

    expect(response.status).toBe(200);
    expect(loadProjectionMock).toHaveBeenCalledWith({
      view: 'sources',
      page: 2,
      pageSize: 50,
      targetPage: 1,
      campaignPage: 1,
      discoveryPage: 1,
      historyPage: 1,
      historyPageSize: 25,
      filters: {
        market: 'Portland',
        city: '',
        sport: '',
        profile: '',
        range: '',
        status: 'PUBLISHED',
        lane: '',
        role: '',
        reason: '',
      },
      contract: {
        rolloutCohort: 'CANARY',
        contractVersion: 3,
      },
      sort: {
        key: 'ageMinutes',
        direction: 'asc',
      },
      scrollAnchor: 'source_1',
      selectedType: 'source',
      selectedId: 'source_1',
    });
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 2,
      stale: false,
      asOf: expect.any(String),
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects invalid query values without touching the projection', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/affiliate-operations?view=mutate&pageSize=500',
    ));

    expect(response.status).toBe(400);
    expect(loadProjectionMock).not.toHaveBeenCalled();
  });
});
