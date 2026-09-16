import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scheduleReflowRequestSchema } from '@/contracts/scheduleReflow';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { MaintenanceOperationError } from '@/server/scheduler/eventScheduleMaintenance';
import { reflowEventSchedule } from '@/server/scheduler/reflow/eventReflow';
import { ReflowInputError } from '@/server/scheduler/reflow/validateInput';
import { ScheduleError } from '@/server/scheduler/scheduleErrors';
import { TimeSlotValidationError } from '@/lib/timeSlotAvailability';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  try {
    const session = await requireSession(req);
    const request = scheduleReflowRequestSchema.parse(await req.json().catch(() => null));
    if ((await params).eventId !== request.eventId) {
      return NextResponse.json({ code: 'REFLOW_INVALID', error: 'The path and request Event IDs differ.' }, { status: 400 });
    }
    const result = await prisma.$transaction((tx) => reflowEventSchedule({ tx, request,
      actor: { userId: session.userId, isAdmin: session.isAdmin === true },
    }), { maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError || error instanceof ReflowInputError
      || error instanceof ScheduleError || error instanceof TimeSlotValidationError) {
      return NextResponse.json({ code: 'REFLOW_INVALID', error: 'The Reflow input is invalid.' }, { status: 400 });
    }
    if (error instanceof MaintenanceOperationError) {
      const status = error.code === 'EDITOR_MAINTENANCE_UNAUTHORIZED' ? 403
        : error.code === 'EDITOR_MAINTENANCE_NOT_FOUND' ? 404
          : error.code === 'EDITOR_MAINTENANCE_STALE' ? 409 : 400;
      return NextResponse.json({ code: error.code, error: error.message }, { status });
    }
    console.error('Schedule Reflow failed', error);
    return NextResponse.json({ code: 'REFLOW_FAILED', error: 'The Schedule could not be updated.' }, { status: 500 });
  }
}
