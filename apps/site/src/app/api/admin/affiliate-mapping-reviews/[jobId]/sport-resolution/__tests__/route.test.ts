/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const resolveDecisionMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/server/affiliateImports/sourceMappingHumanReview', () => ({
  resolveAffiliateMappingSportDecision: (...args: unknown[]) => resolveDecisionMock(...args),
  AffiliateMappingSportResolutionConflictError: class extends Error { readonly status = 409; },
  AffiliateMappingSportResolutionInputError: class extends Error { readonly status = 400; },
}));

import { POST } from '@/app/api/admin/affiliate-mapping-reviews/[jobId]/sport-resolution/route';

const routeParams = (jobId = 'mapping_1') => ({ params: Promise.resolve({ jobId }) });

const request = (body: unknown) => new NextRequest('http://localhost/api/admin/affiliate-mapping-reviews/mapping_1/sport-resolution', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/admin/affiliate-mapping-reviews/[jobId]/sport-resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    resolveDecisionMock.mockResolvedValue({ id: 'mapping_1', status: 'QUEUED' });
  });

  it('requires Razumly admin authentication', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const response = await POST(request({ action: 'REFRESH_CATALOG' }), routeParams());

    expect(response.status).toBe(403);
    expect(resolveDecisionMock).not.toHaveBeenCalled();
  });

  it('passes the authenticated actor and exact selection payload to the service', async () => {
    const response = await POST(request({
      action: 'SELECT_SPORTS',
      expectedCatalogSha256: 'a'.repeat(64),
      resolutions: [{ determinationSha256: 'b'.repeat(64), canonicalSportNames: ['Indoor Soccer'] }],
      rationale: 'The stored indoor-board citation identifies the exact surface.',
    }), routeParams());

    expect(response.status).toBe(202);
    expect(resolveDecisionMock).toHaveBeenCalledWith({
      action: 'SELECT_SPORTS',
      expectedCatalogSha256: 'a'.repeat(64),
      resolutions: [{ determinationSha256: 'b'.repeat(64), canonicalSportNames: ['Indoor Soccer'] }],
      rationale: 'The stored indoor-board citation identifies the exact surface.',
      jobId: 'mapping_1',
      actorUserId: 'admin_1',
    });
  });

  it('rejects unknown fields and malformed selection hashes before mutation', async () => {
    const response = await POST(request({
      action: 'SELECT_SPORTS',
      expectedCatalogSha256: 'not-a-hash',
      resolutions: [],
      rationale: 'selection',
      actorUserId: 'forged',
    }), routeParams());

    expect(response.status).toBe(400);
    expect(resolveDecisionMock).not.toHaveBeenCalled();
  });
});
