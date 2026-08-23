import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  activateAffiliateSourceAutomation,
  type AffiliateSourceActivationInput,
} from '@/server/affiliateImports/service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const { id } = await params;
    const sourceId = id.trim();
    if (!sourceId) {
      return NextResponse.json({ error: 'Source id is required.' }, { status: 400 });
    }
    const body = await req.json() as Partial<AffiliateSourceActivationInput>;
    const reviewedCandidateIds = Array.isArray(body.reviewedCandidateIds)
      ? body.reviewedCandidateIds.filter((value): value is string => typeof value === 'string')
      : [];
    const candidateReviewEvidenceRefs = Array.isArray(body.candidateReviewEvidenceRefs)
      ? body.candidateReviewEvidenceRefs.filter((value): value is string => typeof value === 'string')
      : [];
    const targets = Array.isArray(body.targets)
      ? body.targets.filter(
          (value): value is Readonly<Record<string, unknown>> => (
            Boolean(value && typeof value === 'object' && !Array.isArray(value))
          ),
        )
      : [];
    const source = await activateAffiliateSourceAutomation(sourceId, session.userId, {
      reviewedCandidateIds,
      candidateReviewEvidenceRefs,
      targets,
    });
    return NextResponse.json({ source }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to activate affiliate supply.';
    const status = message.includes('not found') ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
