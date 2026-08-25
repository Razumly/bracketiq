import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { AffiliateOperationsProjectionIncompleteError, loadAffiliateOperationsProjection } from '@/server/affiliateImports/affiliateOperationsProjection';
import { AFFILIATE_OPERATIONS_DETAIL_TYPES, AFFILIATE_OPERATIONS_VIEWS, type AffiliateOperationsDetailType, type AffiliateOperationsFilters } from '@/types/affiliateOperations';

export const dynamic = 'force-dynamic';

const affiliateOperationsRangeSchema = z.string().trim().max(200).refine(
  (value) => !value || ['24h', '7d', '30d'].includes(value) || !Number.isNaN(Date.parse(value)),
  'Range must be empty, 24h, 7d, 30d, or an ISO timestamp.',
);

const querySchema = z.object({
  view: z.enum(AFFILIATE_OPERATIONS_VIEWS).default('overview'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
  targetPage: z.coerce.number().int().min(1).max(10_000).default(1),
  campaignPage: z.coerce.number().int().min(1).max(10_000).default(1),
  discoveryPage: z.coerce.number().int().min(1).max(10_000).default(1),
  historyPage: z.coerce.number().int().min(1).max(10_000).default(1),
  historyPageSize: z.coerce.number().int().min(1).max(50).default(25),
  selectedType: z.enum(AFFILIATE_OPERATIONS_DETAIL_TYPES).nullable().default(null),
  selected: z.string().trim().min(1).max(200).nullable().default(null),
  market: z.string().trim().max(200).default(''),
  city: z.string().trim().max(200).default(''),
  sport: z.string().trim().max(200).default(''),
  profile: z.string().trim().max(200).default(''),
  range: affiliateOperationsRangeSchema.default(''),
  status: z.string().trim().max(200).default(''),
  lane: z.string().trim().max(200).default(''),
  role: z.string().trim().max(200).default(''),
  reason: z.string().trim().max(200).default(''),
  rolloutCohort: z.string().trim().min(1).max(100).default('DEFAULT'),
  contractVersion: z.coerce.number().int().positive().nullable().default(null),
  sort: z.string().trim().max(100).default(''),
  direction: z.enum(['asc', 'desc']).default('desc'),
  anchor: z.string().trim().max(200).nullable().default(null),
});

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid affiliate operations query.', details: parsed.error.flatten() }, { status: 400 });
    }
    const query = parsed.data;
    const filters: AffiliateOperationsFilters = {
      market: query.market,
      city: query.city,
      sport: query.sport,
      profile: query.profile,
      range: query.range,
      status: query.status,
      lane: query.lane,
      role: query.role,
      reason: query.reason,
    };
    const projection = await loadAffiliateOperationsProjection({
      view: query.view,
      page: query.page,
      pageSize: query.pageSize,
      historyPage: query.historyPage,
      historyPageSize: query.historyPageSize,
      targetPage: query.targetPage,
      campaignPage: query.campaignPage,
      discoveryPage: query.discoveryPage,
      filters,
      contract: {
        rolloutCohort: query.rolloutCohort,
        contractVersion: query.contractVersion,
      },
      sort: {
        key: query.sort,
        direction: query.direction,
      },
      scrollAnchor: query.anchor,
      selectedType: query.selectedType as AffiliateOperationsDetailType | null,
      selectedId: query.selected,
    });
    return NextResponse.json(projection, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (
      typeof AffiliateOperationsProjectionIncompleteError === 'function'
      && error instanceof AffiliateOperationsProjectionIncompleteError
    ) {
      return NextResponse.json({ error: error.message, incomplete: true }, { status: 503 });
    }
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate operations projection', error);
    return NextResponse.json({ error: 'Affiliate operations projection is unavailable.' }, { status: 500 });
  }
}
