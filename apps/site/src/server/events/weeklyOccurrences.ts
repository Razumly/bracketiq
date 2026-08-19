import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  RepeatingTimeSlotValidationError,
  resolveRepeatingTimeSlotOccurrence,
} from '@/lib/repeatingTimeSlotAvailability';


type PrismaLike = PrismaClient | Prisma.TransactionClient;

type WeeklyEventLike = {
  id: string;
  eventType?: unknown;
  parentEvent?: unknown;
  timeSlotIds?: unknown;
};

export type WeeklyOccurrenceInput = {
  slotId?: string | null;
  occurrenceDate?: string | null;
};

export type ResolvedWeeklyOccurrence = {
  slotId: string;
  occurrenceDate: string;
  slot: any;
  divisionIds: string[];
};

export const WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR = 'This weekly occurrence has already started. Joining is closed.';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

const normalizeOccurrenceDateInternal = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return normalized;
};

export const normalizeOccurrenceDate = (value: unknown): string | null => normalizeOccurrenceDateInternal(value);

export const occurrenceDateFromDate = (value: Date): string => value.toISOString().slice(0, 10);

const matchesSlotOccurrenceDate = (slot: any, occurrenceDate: string): boolean => {
  try {
    resolveRepeatingTimeSlotOccurrence(slot, occurrenceDate);
    return true;
  } catch (error) {
    if (error instanceof RepeatingTimeSlotValidationError) {
      return false;
    }
    throw error;
  }
};

export const resolveWeeklyOccurrenceStartAt = (slot: any, occurrenceDate: string): Date | null => {
  try {
    return resolveRepeatingTimeSlotOccurrence(slot, occurrenceDate).start;
  } catch (error) {
    if (error instanceof RepeatingTimeSlotValidationError) {
      return null;
    }
    throw error;
  }
};

export const isWeeklyOccurrenceJoinClosed = (
  occurrence: Pick<ResolvedWeeklyOccurrence, 'slot' | 'occurrenceDate'> | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!occurrence) {
    return false;
  }

  const startsAt = resolveWeeklyOccurrenceStartAt(occurrence.slot, occurrence.occurrenceDate);
  if (!startsAt) {
    return false;
  }
  return now.getTime() >= startsAt.getTime();
};

export const isWeeklyParentEvent = (event: WeeklyEventLike | null | undefined): boolean => {
  const normalizedType = typeof event?.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
  return normalizedType === 'WEEKLY_EVENT' && !normalizeId(event?.parentEvent);
};

export const resolveWeeklyOccurrence = async (
  params: {
    event: WeeklyEventLike;
    occurrence: WeeklyOccurrenceInput;
  },
  client: PrismaLike = prisma,
): Promise<{ ok: true; value: ResolvedWeeklyOccurrence } | { ok: false; error: string }> => {
  if (!isWeeklyParentEvent(params.event)) {
    return { ok: false, error: 'Weekly occurrence context is only available on parent weekly events.' };
  }

  const slotId = normalizeId(params.occurrence.slotId);
  const occurrenceDate = normalizeOccurrenceDateInternal(params.occurrence.occurrenceDate);
  if (!slotId || !occurrenceDate) {
    return { ok: false, error: 'slotId and occurrenceDate are required for weekly event actions.' };
  }

  const eventSlotIds = normalizeIdList(params.event.timeSlotIds);
  if (!eventSlotIds.includes(slotId)) {
    return { ok: false, error: 'Selected weekly occurrence does not belong to this event.' };
  }

  const slot = await client.timeSlots.findUnique({
    where: { id: slotId },
  });
  if (!slot) {
    return { ok: false, error: 'Selected weekly timeslot was not found.' };
  }

  if (!matchesSlotOccurrenceDate(slot, occurrenceDate)) {
    return { ok: false, error: 'Selected date is not valid for the chosen weekly timeslot.' };
  }

  const divisionIds = normalizeIdList((slot as any).divisions);
  const divisionRows = await client.divisions.findMany({
    where: {
      eventId: params.event.id,
      scope: 'EVENT',
      status: 'ACTIVE',
      role: 'ENTRY',
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: { id: true },
  }) ?? [];
  const fallbackDivisionIds = normalizeIdList(
    divisionRows.map((row: { id?: string | null }) => row.id),
  );
  return {
    ok: true,
    value: {
      slotId,
      occurrenceDate,
      slot,
      divisionIds: divisionIds.length ? divisionIds : fallbackDivisionIds,
    },
  };
};
