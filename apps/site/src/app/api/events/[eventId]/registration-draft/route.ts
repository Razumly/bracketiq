import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { registrationDraftSaveSchema, registrationDraftScopeSchema } from '@/lib/contracts/eventRegistrationDraft';
import { deleteRegistrationDraft, readRegistrationDraft, RegistrationDraftError, saveRegistrationDraft } from '@/server/events/eventRegistrationDrafts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ eventId: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  if (error instanceof RegistrationDraftError) {
    return NextResponse.json({ error: error.message, state: error.state }, { status: error.status });
  }
  throw error;
}

export async function GET(req: NextRequest, context: Context) {
  try {
    const session = await requireSession(req);
    const { eventId } = await context.params;
    const parsed = registrationDraftScopeSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid registration scope.' }, { status: 400 });
    return NextResponse.json(await readRegistrationDraft({ accountId: session.userId, eventId, ...parsed.data }));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
    const session = await requireSession(req);
    const { eventId } = await context.params;
    const parsed = registrationDraftSaveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid registration progress.', details: parsed.error.flatten() }, { status: 400 });
    const { slotId, occurrenceDate, ...input } = parsed.data;
    const state = await prisma.$transaction((tx) => saveRegistrationDraft({
      accountId: session.userId, eventId, slotId, occurrenceDate,
    }, input, tx));
    return NextResponse.json(state);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(req: NextRequest, context: Context) {
  try {
    const session = await requireSession(req);
    const { eventId } = await context.params;
    const parsed = registrationDraftScopeSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid registration scope.' }, { status: 400 });
    await deleteRegistrationDraft({ accountId: session.userId, eventId, ...parsed.data });
    return NextResponse.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
