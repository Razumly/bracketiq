import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PATCH as patchMatch } from '../[matchId]/route';

const terminalCommandSchema = z.object({
  matchId: z.string().trim().min(1),
  update: z.record(z.string(), z.unknown()),
}).strict();

/** Apply one terminal command and return its complete affected Match batch. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const parsed = terminalCommandSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid terminal Match command.' }, { status: 400 });
  const { eventId } = await params;
  const forwarded = new NextRequest(req.url, { method: 'PATCH', headers: req.headers,
    body: JSON.stringify(parsed.data.update) });
  return patchMatch(forwarded, { params: Promise.resolve({ eventId, matchId: parsed.data.matchId }) });
}
