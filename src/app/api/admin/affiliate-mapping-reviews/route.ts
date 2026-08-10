import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { listAffiliateMappingHumanReviewJobs } from '@/server/affiliateImports/sourceMappingHumanReview';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const jobs = await listAffiliateMappingHumanReviewJobs();
    const payload: {
      jobs: typeof jobs;
      total: number;
      sportsCatalog?: unknown;
      currentCatalogSha256?: string | null;
      catalogSha256?: string | null;
    } = { jobs, total: jobs.length };
    if (jobs.metadata) {
      payload.sportsCatalog = jobs.metadata.currentCatalog;
      payload.currentCatalogSha256 = jobs.metadata.currentCatalogSha256;
      payload.catalogSha256 = jobs.metadata.catalogSha256;
    }
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate mapping human-review jobs', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
