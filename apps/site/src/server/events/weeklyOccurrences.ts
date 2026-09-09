import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  enumerateRepeatingTimeSlotOccurrences,
  REPEATING_TIME_SLOT_VALIDATION_WINDOW_DAYS,
  RepeatingTimeSlotValidationError,
  resolveRepeatingTimeSlotOccurrence,
} from '@/lib/repeatingTimeSlotAvailability';
import type {
  RepeatingTimeSlotIntervalInput,
  ResolvedRepeatingTimeSlot,
} from '@/lib/repeatingTimeSlotAvailability';
import { acquireEventLock } from '@/server/repositories/locks';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type WeeklyEventLike = {
  id: string;
  start: Date;
  end: Date | null;
  eventType?: unknown;
  parentEvent?: unknown;
  timeSlotIds?: unknown;
  archivedAt?: unknown;
};

export type WeeklyOccurrenceInput = {
  slotId?: string | null;
  occurrenceDate?: string | null;
};

export type ResolvedWeeklyOccurrence = {
  slotId: string;
  occurrenceDate: string;
  slot: RepeatingTimeSlotIntervalInput;
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

const resolveValidatedSlotOccurrence = (
  slot: RepeatingTimeSlotIntervalInput,
  occurrenceDate: string,
): { ok: true; value: ResolvedRepeatingTimeSlot } | { ok: false; error: string } => {
  try {
    return { ok: true, value: resolveRepeatingTimeSlotOccurrence(slot, occurrenceDate) };
  } catch (error) {
    if (error instanceof RepeatingTimeSlotValidationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
};

export const resolveWeeklyOccurrenceStartAt = (
  slot: RepeatingTimeSlotIntervalInput,
  occurrenceDate: string,
): Date | null => {
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


type WeeklyParentEventLike = Pick<WeeklyEventLike, 'eventType' | 'parentEvent' | 'archivedAt'>;

export const isWeeklyParentEvent = (event: WeeklyParentEventLike | null | undefined): boolean => {
  const normalizedType = typeof event?.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
  return normalizedType === 'WEEKLY_EVENT' && !normalizeId(event?.parentEvent);
};

export const isActiveWeeklyParentEvent = (event: WeeklyParentEventLike | null | undefined): boolean =>
  isWeeklyParentEvent(event) && !event?.archivedAt;

export const isArchivedWeeklyParentEvent = (event: WeeklyParentEventLike | null | undefined): boolean =>
  isWeeklyParentEvent(event) && Boolean(event?.archivedAt);

export const WEEKLY_EVENT_ARCHIVED_ERROR = 'This weekly event is archived and no longer available.';

export type EventMutationRecord = {
  id: string;
  hostId: string | null | undefined;
  start: Date;
  end: Date | null;
  minAge: number | null;
  maxAge: number | null;
  sportIds: string[];
  registrationByDivisionType: boolean | null;
  eventType?: string | null;
  teamSignup?: boolean | null;
  parentEvent?: string | null;
  archivedAt?: Date | null;
  [key: string]: any;
};

export type LockedEventMutationTarget = {
  event: EventMutationRecord;
  parentEvent: EventMutationRecord | null;
};

export class EventMutationArchivedError extends Error {
  readonly code = 'EVENT_ARCHIVED';
  readonly status = 409;

  constructor() {
    super(WEEKLY_EVENT_ARCHIVED_ERROR);
    this.name = 'EventMutationArchivedError';
  }
}

export const acquireEventMutationTarget = async (
  client: PrismaLike,
  eventId: string,
): Promise<LockedEventMutationTarget | null> => {
  const requestedEvent = await client.events.findUnique({
    where: { id: eventId },
  });
  if (!requestedEvent) {
    return null;
  }

  await acquireEventLock(client, requestedEvent.id);
  const event = typeof client.$queryRaw === 'function'
    ? await client.events.findUnique({
      where: { id: requestedEvent.id },
    })
    : requestedEvent;
  if (!event) {
    return null;
  }

  const parentEventId = normalizeId(event.parentEvent);
  if (!parentEventId || parentEventId === event.id) {
    return { event, parentEvent: null };
  }

  await acquireEventLock(client, parentEventId);
  const parentEvent = await client.events.findUnique({
    where: { id: parentEventId },
  });
  return { event, parentEvent };
};

export const assertEventMutationTargetActive = (
  target: LockedEventMutationTarget | null,
): LockedEventMutationTarget | null => {
  if (target && (target.event.archivedAt || target.parentEvent?.archivedAt)) {
    throw new EventMutationArchivedError();
  }
  return target;
};
export const resolveNextWeeklyOccurrence = (options: {
  slots: readonly RepeatingTimeSlotIntervalInput[];
  eventStart: Date;
  eventEnd?: Date | null;
  anchor?: Date;
}): ResolvedRepeatingTimeSlot | null => {
  if (!(options.eventStart instanceof Date) || Number.isNaN(options.eventStart.getTime())) {
    return null;
  }

  const anchor = options.anchor instanceof Date && !Number.isNaN(options.anchor.getTime())
    ? options.anchor
    : new Date();
  const lowerBound = new Date(Math.max(options.eventStart.getTime(), anchor.getTime()));
  const configuredEnd = options.eventEnd instanceof Date && !Number.isNaN(options.eventEnd.getTime())
    ? options.eventEnd
    : null;
  if (configuredEnd && configuredEnd.getTime() <= lowerBound.getTime()) {
    return null;
  }

  const horizonEnd = new Date(
    lowerBound.getTime() + REPEATING_TIME_SLOT_VALIDATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const windowEnd = configuredEnd && configuredEnd.getTime() < horizonEnd.getTime()
    ? configuredEnd
    : horizonEnd;
  if (windowEnd.getTime() <= lowerBound.getTime()) {
    return null;
  }

  let nextOccurrence: ResolvedRepeatingTimeSlot | null = null;
  for (const slot of options.slots) {
    if (!slot || slot.repeating === false) {
      continue;
    }
    try {
      const occurrences = enumerateRepeatingTimeSlotOccurrences({
        slot,
        windowStart: lowerBound,
        windowEnd,
      });
      occurrences.forEach((occurrence) => {
        if (occurrence.start.getTime() < lowerBound.getTime()) {
          return;
        }
        if (configuredEnd && occurrence.end.getTime() > configuredEnd.getTime()) {
          return;
        }
        if (!nextOccurrence || occurrence.start.getTime() < nextOccurrence.start.getTime()) {
          nextOccurrence = occurrence;
        }
      });
    } catch (error) {
      if (!(error instanceof RepeatingTimeSlotValidationError)) {
        throw error;
      }
    }
  }

  return nextOccurrence;
};


export const resolveWeeklyOccurrence = async (
  params: {
    event: WeeklyEventLike;
    occurrence: WeeklyOccurrenceInput;
    allowArchivedEvent?: boolean;
  },
  client: PrismaLike = prisma,
): Promise<{ ok: true; value: ResolvedWeeklyOccurrence } | { ok: false; error: string }> => {
  if (
    !isWeeklyParentEvent(params.event)
    || (
      params.allowArchivedEvent !== true
      && !isActiveWeeklyParentEvent(params.event)
    )
  ) {
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

  const slotLookup = client.timeSlots;
  const slot: RepeatingTimeSlotIntervalInput | null = typeof slotLookup.findFirst === 'function'
    ? await slotLookup.findFirst({
      where: {
        id: slotId,
        archivedAt: null,
      },
    })
    : await slotLookup.findUnique({
      where: { id: slotId },
    });
  if (!slot || (slot as RepeatingTimeSlotIntervalInput & { archivedAt?: unknown }).archivedAt) {
    return { ok: false, error: 'Selected weekly timeslot was not found.' };
  }

  const resolvedSlot = resolveValidatedSlotOccurrence(slot, occurrenceDate);
  if (!resolvedSlot.ok) {
    return { ok: false, error: resolvedSlot.error };
  }
  if (resolvedSlot.value.start.getTime() < params.event.start.getTime()) {
    return { ok: false, error: 'Selected weekly occurrence starts before the event start.' };
  }
  if (
    params.event.end
    && Number.isFinite(params.event.end.getTime())
    && resolvedSlot.value.end.getTime() > params.event.end.getTime()
  ) {
    return { ok: false, error: 'Selected weekly occurrence ends after the event planned end.' };
  }

  const divisionIds = normalizeIdList(slot.divisions);
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
