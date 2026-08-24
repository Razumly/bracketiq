import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  activateAffiliateSourceAutomation,
  type AffiliateSourceActivationInput,
} from '@/server/affiliateImports/service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    if (!session.isAdmin) {
      throw new Response('Forbidden', { status: 403 });
    }
    const { id } = await params;
    const sourceId = id.trim();
    if (!sourceId) {
      return NextResponse.json({ error: 'Source id is required.' }, { status: 400 });
    }
    const body = await req.json() as Partial<AffiliateSourceActivationInput>;
    const candidateReviewId = typeof body.candidateReviewId === 'string'
      ? body.candidateReviewId.trim()
      : '';
    if (!candidateReviewId) {
      return NextResponse.json({ error: 'Candidate review id is required.' }, { status: 400 });
    }
    const source = await activateAffiliateSourceAutomation(sourceId, session.userId, {
      candidateReviewId,
    });
    return NextResponse.json({ source }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to activate affiliate supply.';
    const status = message.includes('not found') ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
