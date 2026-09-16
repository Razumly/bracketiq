import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TimeSlots } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { findDollarPrefixedFields } from '@/server/requestParsing';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { normalizeRentalTaxHandling } from '@/lib/taxPolicy';
import {
  assertOneTimeTimeSlotFutureEnd,
  assertValidOneTimeTimeSlots,
  resolveOneTimeTimeSlot,
  TimeSlotValidationError,
} from '@/lib/timeSlotAvailability';
import {
  assertRepeatingTimeSlotsResolvable,
} from '@/lib/repeatingTimeSlotAvailability';
import {
  eventRequiresConfiguredTimeSlot,
  hasWeeklyRepeatingTimeSlot,
  WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE,
} from '@/lib/eventScheduling';
import { repeatingTimeSlotValidationResponse } from '@/server/repeatingTimeSlotValidationResponse';
import {
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromFieldOrOrganization,
} from '@/server/timeZones';
import { deleteOrArchiveTimeSlot, toDeleteOrArchiveResponse } from '@/server/deletion/archivePolicy';
import { canManageScheduledFields, canManageTimeSlot } from '@/server/timeSlotAccess';
import { acquireEventLock, acquireFieldLocks, acquireTimeSlotLocks } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

const TIME_SLOT_MUTABLE_FIELDS = new Set<string>([
  'dayOfWeek',
  'daysOfWeek',
  'repeating',
  'scheduledFieldId',
  'scheduledFieldIds',
  'startTimeMinutes',
  'endTimeMinutes',
  'startDate',
  'endDate',
  'timeZone',
  'price',
  'taxHandling',
  'requiredTemplateIds',
  'hostRequiredTemplateIds',
  'divisions',
]);
const TIME_SLOT_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  'createdAt',
  'updatedAt',
]);

const normalizeDaysOfWeek = (input: { dayOfWeek?: number | null; daysOfWeek?: number[] | null }): number[] => {
  const source = Array.isArray(input.daysOfWeek) && input.daysOfWeek.length
    ? input.daysOfWeek
    : typeof input.dayOfWeek === 'number'
      ? [input.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};


const resolveSlotTimeZone = async (
  scheduledFieldIds: string[],
  explicitTimeZone?: unknown,
  fallbackTimeZone?: unknown,
): Promise<string> => {
  if (!scheduledFieldIds.length) {
    return resolveTimeZone(explicitTimeZone, resolveTimeZone(fallbackTimeZone));
  }

  const fields = await prisma.fields.findMany({
    where: { id: { in: scheduledFieldIds } },
    select: { id: true, lat: true, long: true, organizationId: true },
  });
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const primaryField = scheduledFieldIds.map((id) => fieldById.get(id)).find(Boolean) ?? fields[0] ?? null;
  const organization = primaryField?.organizationId
    ? await prisma.organizations.findUnique({
      where: { id: primaryField.organizationId },
      select: { coordinates: true },
    })
    : null;

  return resolveTimeZone(
    explicitTimeZone,
    resolveTimeZoneFromFieldOrOrganization(
      primaryField as any,
      organization as any,
      resolveTimeZone(fallbackTimeZone),
    ),
  );
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeTemplateIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0),
    ),
  );
};


type SlotPatchRow = Pick<TimeSlots, 'id' | 'startDate' | 'endDate' | 'timeZone' | 'repeating' | 'dayOfWeek' | 'daysOfWeek' | 'scheduledFieldId' | 'scheduledFieldIds' | 'startTimeMinutes' | 'endTimeMinutes' | 'divisions'>;

function normalizePatchMetadata(payload: Record<string, unknown>): void {
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  if (payload.requiredTemplateIds !== undefined) {
    payload.requiredTemplateIds = normalizeTemplateIds(payload.requiredTemplateIds);
  }
  if (payload.hostRequiredTemplateIds !== undefined) {
    payload.hostRequiredTemplateIds = normalizeTemplateIds(payload.hostRequiredTemplateIds);
  }
  if (payload.taxHandling !== undefined) {
    payload.taxHandling = normalizeRentalTaxHandling(payload.taxHandling);
  }

}

function normalizePatchFields(payload: Record<string, unknown>, existingSlot: SlotPatchRow): string[] {
  if (payload.scheduledFieldIds !== undefined || payload.scheduledFieldId !== undefined) {
    const normalized = normalizeFieldIds([
      ...(Array.isArray(payload.scheduledFieldIds) ? payload.scheduledFieldIds : []),
      ...(typeof payload.scheduledFieldId === 'string' ? [payload.scheduledFieldId] : []),
    ]);
    payload.scheduledFieldIds = normalized;
    payload.scheduledFieldId = normalized[0] ?? null;
  }
  const effectiveScheduledFieldIds = normalizeFieldIds(
    payload.scheduledFieldIds !== undefined
      ? payload.scheduledFieldIds
      : ((existingSlot as any).scheduledFieldIds ?? ((existingSlot as any).scheduledFieldId ? [(existingSlot as any).scheduledFieldId] : [])),
  );
  return effectiveScheduledFieldIds;
}

function normalizePatchDates(payload: Record<string, unknown>, effectiveTimeZone: string): void {
  if (payload.timeZone !== undefined || payload.scheduledFieldIds !== undefined || payload.scheduledFieldId !== undefined) {
    payload.timeZone = effectiveTimeZone;
  }
  if (payload.startDate) {
    const parsedDate = parseDateInputInTimeZone(payload.startDate, effectiveTimeZone);
    if (parsedDate) payload.startDate = parsedDate;
  }
  if (payload.endDate !== undefined) {
    if (payload.endDate === null) {
      payload.endDate = null;
    } else {
      const parsedDate = parseDateInputInTimeZone(payload.endDate, effectiveTimeZone);
      if (parsedDate) payload.endDate = parsedDate;
    }
  }

}

function normalizePatchScope(payload: Record<string, unknown>): string[] | null {
  let payloadDivisions: string[] | null = null;
  if (payload.divisions !== undefined) {
    payloadDivisions = normalizeDivisionKeys(payload.divisions);
    delete payload.divisions;
  }
  if (payload.dayOfWeek !== undefined || payload.daysOfWeek !== undefined) {
    const normalizedDays = normalizeDaysOfWeek({
      dayOfWeek: typeof payload.dayOfWeek === 'number' ? payload.dayOfWeek : undefined,
      daysOfWeek: Array.isArray(payload.daysOfWeek) ? payload.daysOfWeek : undefined,
    });
    payload.daysOfWeek = normalizedDays;
    payload.dayOfWeek = normalizedDays[0] ?? null;
  }
  return payloadDivisions;
}

function effectivePatchDates(payload: Record<string, unknown>, existingSlot: SlotPatchRow) {
  const effectiveRepeating = typeof payload.repeating === 'boolean'
    ? payload.repeating
    : existingSlot.repeating;
  const effectiveStartDate = payload.startDate instanceof Date && !Number.isNaN(payload.startDate.getTime())
    ? payload.startDate
    : existingSlot.startDate;
  const currentEndDate = existingSlot.endDate instanceof Date && !Number.isNaN(existingSlot.endDate.getTime())
    ? existingSlot.endDate
    : null;
  const requestedEndDate = payload.endDate instanceof Date && !Number.isNaN(payload.endDate.getTime())
    ? payload.endDate
    : null;
  const endDateCandidate = Object.prototype.hasOwnProperty.call(payload, 'endDate')
    ? requestedEndDate
    : currentEndDate;
  return { effectiveRepeating, effectiveStartDate, endDateCandidate };
}

function validatePatchInterval(payload: Record<string, unknown>, existingSlot: SlotPatchRow, effectiveTimeZone: string, effectiveScheduledFieldIds: string[], payloadDivisions: string[] | null): NextResponse | null {
  if (!effectiveScheduledFieldIds.length) {
    return NextResponse.json(
      {
        error: 'Assign at least one Resource or delete this Time Slot.',
        code: 'INVALID_TIME_SLOT',
      },
      { status: 400 },
    );
  }
  const id = existingSlot.id;
  const { effectiveRepeating, effectiveStartDate, endDateCandidate } = effectivePatchDates(payload, existingSlot);
  if (effectiveRepeating) {
    payload.endDate = endDateCandidate;
    try {
      assertRepeatingTimeSlotsResolvable({
        slots: [{
          ...existingSlot,
          ...payload,
          id,
          repeating: true,
          startDate: effectiveStartDate,
          endDate: payload.endDate,
          timeZone: effectiveTimeZone,
          scheduledFieldId: effectiveScheduledFieldIds[0] ?? null,
          scheduledFieldIds: effectiveScheduledFieldIds,
          divisions: payloadDivisions ?? existingSlot.divisions,
        }],
        eventStart: effectiveStartDate,
        eventEnd: null,
      });
    } catch (error) {
      const repeatingTimeSlotResponse = repeatingTimeSlotValidationResponse(error);
      if (repeatingTimeSlotResponse) {
        return repeatingTimeSlotResponse;
      }
      throw error;
    }
  } else {
    try {
      const resolved = resolveOneTimeTimeSlot({
        ...existingSlot,
        ...payload,
        id,
        repeating: false,
        startDate: effectiveStartDate,
        endDate: endDateCandidate,
        timeZone: effectiveTimeZone,
        scheduledFieldIds: effectiveScheduledFieldIds,
        divisions: payloadDivisions ?? existingSlot.divisions,
      }, effectiveTimeZone);
      assertOneTimeTimeSlotFutureEnd(resolved);
      payload.startDate = resolved.start;
      payload.endDate = resolved.end;
      payload.startTimeMinutes = resolved.startTimeMinutes;
      payload.endTimeMinutes = resolved.endTimeMinutes;
      payload.timeZone = resolved.timeZone;
    } catch (error) {
      if (error instanceof TimeSlotValidationError) {
        return NextResponse.json(
          { error: error.message, code: 'INVALID_TIME_SLOT', slotIds: error.slotIds },
          { status: 400 },
        );
      }
      throw error;
    }
  }
  return null;
}

function buildPatchUpdateData(payload: Record<string, unknown>, payloadDivisions: string[] | null) {
  const updatedAt = new Date();
  const updateData: Record<string, unknown> = { updatedAt };
  const updatableKeys = [
    'dayOfWeek',
    'daysOfWeek',
    'repeating',
    'scheduledFieldId',
    'scheduledFieldIds',
    'startTimeMinutes',
    'endTimeMinutes',
    'startDate',
    'endDate',
    'timeZone',
    'price',
    'taxHandling',
    'requiredTemplateIds',
    'hostRequiredTemplateIds',
  ] as const;
  for (const key of updatableKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      updateData[key] = payload[key];
    }
  }
  if (payloadDivisions !== null) {
    updateData.divisions = payloadDivisions;
  }
  return updateData;
}

function patchedSlotResponse(updated: TimeSlots, payloadDivisions: string[] | null): NextResponse {
    const normalizedDays = normalizeDaysOfWeek({
      dayOfWeek: updated.dayOfWeek ?? undefined,
      daysOfWeek: updated.daysOfWeek ?? undefined,
    });
    const normalizedFieldIds = normalizeFieldIds(
      updated.scheduledFieldIds
        ?? (updated.scheduledFieldId ? [updated.scheduledFieldId] : []),
    );
    const normalizedDivisions = payloadDivisions ?? normalizeDivisionKeys(updated.divisions);
    return NextResponse.json({
      ...updated,
      dayOfWeek: normalizedDays[0] ?? updated.dayOfWeek ?? null,
      daysOfWeek: normalizedDays,
      scheduledFieldId: normalizedFieldIds[0] ?? null,
      scheduledFieldIds: normalizedFieldIds,
      divisions: normalizedDivisions,
    }, { status: 200 });
}

function invalidPatchFields(payload: Record<string, unknown>, isAdmin: boolean): NextResponse | null {
  const unknownPayloadKeys = findUnknownKeys(payload, [...TIME_SLOT_MUTABLE_FIELDS, ...TIME_SLOT_IMMUTABLE_FIELDS]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json({ error: 'Unknown time slot patch fields.', unknownKeys: unknownPayloadKeys }, { status: 400 });
  }
  const immutableKeys = findPresentKeys(payload, TIME_SLOT_IMMUTABLE_FIELDS);
  if (immutableKeys.length && !isAdmin) {
    return NextResponse.json({ error: 'Immutable time slot fields cannot be updated.', fields: immutableKeys }, { status: 403 });
  }
  return null;
}

async function canAssignPatchFields(payload: Record<string, unknown>, session: Awaited<ReturnType<typeof requireSession>>, fieldIds: string[]): Promise<boolean> {
  const changesScheduledFields = payload.scheduledFieldIds !== undefined || payload.scheduledFieldId !== undefined;
  return !changesScheduledFields || canManageScheduledFields(session, fieldIds);
}

function timeSlotPatchErrorResponse(error: unknown): NextResponse | null {
  const repeatingTimeSlotResponse = repeatingTimeSlotValidationResponse(error);
  if (repeatingTimeSlotResponse) {
    return repeatingTimeSlotResponse;
  }
  if (error instanceof TimeSlotValidationError) {
    return NextResponse.json(
      { error: error.message, code: 'INVALID_TIME_SLOT', slotIds: error.slotIds },
      { status: 400 },
    );
  }
  return null;
}

const lockReferencingEvents = async (tx: any, timeSlotId: string): Promise<void> => {
  const lockedEventIds = new Set<string>();
  while (true) {
    const references = await tx.events.findMany({
      where: { timeSlotIds: { has: timeSlotId }, archivedAt: null },
      select: { id: true },
    });
    const unlockedEventIds = references
      .map((event: { id: string }) => event.id)
      .filter((eventId: string) => !lockedEventIds.has(eventId))
      .sort();
    if (!unlockedEventIds.length) {
      return;
    }
    for (const eventId of unlockedEventIds) {
      await acquireEventLock(tx, eventId);
      lockedEventIds.add(eventId);
    }
  }
};

const buildDivisionReferenceLookup = (
  divisions: Array<{ id: string; key: string | null }>,
): Map<string, string> => {
  const lookup = new Map<string, string>();
  divisions.forEach((division) => {
    lookup.set(division.id.trim().toLowerCase(), division.id);
    if (division.key?.trim()) {
      lookup.set(division.key.trim().toLowerCase(), division.id);
    }
  });
  return lookup;
};

const canonicalizeReferencedSlot = (
  eventId: string,
  slotId: string,
  persistedSlotById: Map<string, any>,
  eligibleResourceIds: Set<string>,
  divisionIdByReference: Map<string, string>,
): any => {
  const slot = persistedSlotById.get(slotId);
  if (!slot) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      `Event "${eventId}" references unavailable Time Slot "${slotId}".`,
      { slotIds: [slotId] },
    );
  }
  const resourceIds = normalizeFieldIds([
    ...(Array.isArray(slot.scheduledFieldIds) ? slot.scheduledFieldIds : []),
    ...(typeof slot.scheduledFieldId === 'string' ? [slot.scheduledFieldId] : []),
  ]);
  const unknownResourceId = resourceIds.find(
    (resourceId) => !eligibleResourceIds.has(resourceId),
  );
  if (unknownResourceId) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      `One-Time Time Slot "${slotId}" references unavailable Resource "${unknownResourceId}".`,
      { slotIds: [slotId] },
    );
  }
  const divisionIds = normalizeDivisionKeys(slot.divisions).map(
    (divisionReference) => {
      const divisionId = divisionIdByReference.get(divisionReference);
      if (!divisionId) {
        throw new TimeSlotValidationError(
          'INVALID_ONE_TIME_SLOT',
          `One-Time Time Slot "${slotId}" references unavailable Division "${divisionReference}".`,
          { slotIds: [slotId] },
        );
      }
      return divisionId;
    },
  );
  return {
    ...slot,
    repeating: slot.repeating,
    scheduledFieldId: resourceIds[0] ?? null,
    scheduledFieldIds: resourceIds,
    divisions: divisionIds,
  };
};

const validateReferencedEventSlots = (options: {
  event: any;
  persistedSlotById: Map<string, any>;
  divisionRows: Array<{ eventId: string; id: string; key: string | null }>;
}): void => {
  const eventDivisions = options.divisionRows.filter(
    (division) => division.eventId === options.event.id,
  );
  const divisionIdByReference = buildDivisionReferenceLookup(eventDivisions);
  const canonicalSlots = options.event.timeSlotIds.map((slotId: string) =>
    canonicalizeReferencedSlot(
      options.event.id,
      slotId,
      options.persistedSlotById,
      new Set(options.event.fieldIds),
      divisionIdByReference,
    ),
  );
  const isStandaloneWeekly =
    options.event.eventType === 'WEEKLY_EVENT' &&
    (!options.event.parentEvent || options.event.parentEvent.trim().length === 0);
  if (
    eventRequiresConfiguredTimeSlot(
      options.event.eventType,
      options.event.automatedScheduling,
      options.event.parentEvent,
    ) &&
    canonicalSlots.length === 0
  ) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      `Event "${options.event.id}" requires at least one Time Slot.`,
      { slotIds: [options.event.id] },
    );
  }
  if (isStandaloneWeekly && !hasWeeklyRepeatingTimeSlot(canonicalSlots)) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE,
      { slotIds: [options.event.id] },
    );
  }
  const eventEnd = options.event.noFixedEndDateTime ? null : options.event.end;
  assertValidOneTimeTimeSlots({
    slots: canonicalSlots,
    fallbackTimeZone: options.event.timeZone,
    eventStart: options.event.start,
    eventEnd,
    eligibleResourceIds: options.event.fieldIds,
    eligibleDivisionIds: eventDivisions.map((division) => division.id),
  });
  assertRepeatingTimeSlotsResolvable({
    slots: canonicalSlots,
    eventStart: options.event.start,
    eventEnd,
    eligibleResourceIds: options.event.fieldIds,
  });
};
const buildTimeSlotFieldIdsToLock = (
  existingSlot: SlotPatchRow,
  effectiveScheduledFieldIds: string[],
  referencingEvents: any[],
): string[] => Array.from(new Set([
  ...normalizeFieldIds(existingSlot.scheduledFieldIds ?? (
    existingSlot.scheduledFieldId ? [existingSlot.scheduledFieldId] : []
  )),
  ...effectiveScheduledFieldIds,
  ...referencingEvents.flatMap((event) => event.fieldIds),
])).sort();


const validateTimeSlotEventReferences = async (options: {
  tx: any;
  existingSlot: SlotPatchRow;
  id: string;
  updateData: Record<string, unknown>;
  referencingEvents: any[];
  payloadDivisions: string[] | null;
}): Promise<void> => {
  const allSlotIds = Array.from(new Set(
    options.referencingEvents.flatMap((event) => event.timeSlotIds),
  ));
  const [persistedSlots, divisionRows] = await Promise.all([
    options.tx.timeSlots.findMany({
      where: { id: { in: allSlotIds }, archivedAt: null },
    }),
    options.tx.divisions.findMany({
      where: {
        eventId: { in: options.referencingEvents.map((event) => event.id) },
        role: 'ENTRY',
        status: 'ACTIVE',
      },
      select: { eventId: true, id: true, key: true },
    }),
  ]);
  const persistedSlotById = new Map<string, any>(
    persistedSlots.map((slot: any) => [slot.id, { ...slot }]),
  );
  persistedSlotById.set(options.id, {
    ...options.existingSlot,
    ...options.updateData,
    id: options.id,
    divisions: options.payloadDivisions ?? options.existingSlot.divisions,
  });
  options.referencingEvents.forEach((event) =>
    validateReferencedEventSlots({ event, persistedSlotById, divisionRows }),
  );
};
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'slot',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }
  const obsoleteFields = findDollarPrefixedFields(parsed.payload);
  if (obsoleteFields.length) {
    return NextResponse.json(
      { error: 'Dollar-prefixed fields are not supported.', fields: obsoleteFields },
      { status: 400 },
    );
  }

  const { id } = await params;
  const existingSlot = await prisma.timeSlots.findUnique({
    where: { id },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      timeZone: true,
      repeating: true,
      dayOfWeek: true,
      daysOfWeek: true,
      scheduledFieldId: true,
      scheduledFieldIds: true,
      startTimeMinutes: true,
      endTimeMinutes: true,
      divisions: true,
    },
  });
  if (!existingSlot) {
    return NextResponse.json({ error: 'Time slot not found' }, { status: 404 });
  }
  if (!(await canManageTimeSlot(session, existingSlot))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = { ...(parsed.payload as Record<string, unknown>) };
  const fieldError = invalidPatchFields(payload, Boolean(session.isAdmin));
  if (fieldError) return fieldError;
  normalizePatchMetadata(payload);
  const effectiveScheduledFieldIds = normalizePatchFields(payload, existingSlot);
  if (!(await canAssignPatchFields(payload, session, effectiveScheduledFieldIds))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const effectiveTimeZone = await resolveSlotTimeZone(
    effectiveScheduledFieldIds,
    payload.timeZone,
    (existingSlot as any).timeZone,
  );
  normalizePatchDates(payload, effectiveTimeZone);
  const payloadDivisions = normalizePatchScope(payload);
  const intervalError = validatePatchInterval(payload, existingSlot, effectiveTimeZone, effectiveScheduledFieldIds, payloadDivisions);
  if (intervalError) return intervalError;
  const updateData = buildPatchUpdateData(payload, payloadDivisions);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await lockReferencingEvents(tx, id);
      const referencingEvents = await tx.events.findMany({
        where: { timeSlotIds: { has: id }, archivedAt: null },
        select: {
          eventType: true,
          parentEvent: true,
          automatedScheduling: true,
          id: true,
          start: true,
          end: true,
          noFixedEndDateTime: true,
          timeZone: true,
          fieldIds: true,
          timeSlotIds: true,
        },
      });
      const fieldIdsToLock = buildTimeSlotFieldIdsToLock(
        existingSlot,
        effectiveScheduledFieldIds,
        referencingEvents,
      );
      await acquireFieldLocks(tx, fieldIdsToLock);
      await acquireTimeSlotLocks(tx, [id]);
      if (referencingEvents.length) {
        await validateTimeSlotEventReferences({
          tx,
          existingSlot,
          id,
          updateData,
          referencingEvents,
          payloadDivisions,
        });
      }

      // `updateData` is assembled only from the route's explicit mutable-field allowlist.
      return tx.timeSlots.update({
        where: { id },
        data: updateData as unknown as Parameters<typeof tx.timeSlots.update>[0]['data'],
      });
    });
    return patchedSlotResponse(updated, payloadDivisions);
  } catch (error) {
    const errorResponse = timeSlotPatchErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.timeSlots.findUnique({
    where: { id },
    select: {
      id: true,
      scheduledFieldId: true,
      scheduledFieldIds: true,
      archivedAt: true,
      archivedByUserId: true,
      archiveReason: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canManageTimeSlot(session, existing))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await prisma.$transaction((tx) => deleteOrArchiveTimeSlot({
    client: tx,
    entity: existing,
    actorUserId: session.userId,
    reason: 'delete_requested',
  }));
  return NextResponse.json(toDeleteOrArchiveResponse(result), { status: 200 });
}
