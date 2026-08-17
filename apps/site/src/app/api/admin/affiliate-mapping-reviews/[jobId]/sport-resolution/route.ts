import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  resolveAffiliateMappingSportDecision,
  AffiliateMappingSportResolutionConflictError,
  AffiliateMappingSportResolutionInputError,
} from '@/server/affiliateImports/sourceMappingHumanReview';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ jobId: string }> };

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'A SHA-256 catalog or determination hash is required.');
const rationaleSchema = z.string().trim().min(1).max(2_000);
const selectSchema = z.object({
  action: z.literal('SELECT_SPORTS'),
  expectedCatalogSha256: sha256Schema,
  resolutions: z.array(z.object({
    determinationSha256: sha256Schema,
    canonicalSportNames: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
  }).strict()).min(1).max(50),
  rationale: rationaleSchema,
}).strict();
const resolutionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('REFRESH_CATALOG') }).strict(),
  selectSchema,
  z.object({
    action: z.literal('CONFIRM_EXCLUSIONS'),
    determinationSha256s: z.array(sha256Schema).min(1).max(50),
    rationale: rationaleSchema,
  }).strict(),
]);

const normalizeId = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireRazumlyAdmin(req);
    const jobId = normalizeId((await params).jobId);
    if (!jobId) return NextResponse.json({ error: 'Mapping job id is required.' }, { status: 400 });
    const parsed = resolutionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid sport resolution request.', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await resolveAffiliateMappingSportDecision({
      ...parsed.data,
      jobId,
      actorUserId: session.userId,
    });
    return NextResponse.json({ action: parsed.data.action, job: result }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AffiliateMappingSportResolutionInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AffiliateMappingSportResolutionConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to resolve affiliate mapping sport decision', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
