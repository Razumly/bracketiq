import { NextRequest, NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  findFieldConflictsForDraftSlot,
  getFieldConflictLowerBound,
  loadFieldBlockerCatalog,
  serializeFieldSchedulingConflict,
  type FieldBlockerInterval,
  type FieldConflictDraftContext,
  type FieldConflictDraftSlot,
} from "@/server/repositories/fieldSchedulingConflicts";
import { canManageEvent } from "@/server/accessControl";
import { canManageScheduledFields } from "@/server/timeSlotAccess";
import { isPublicEventState } from "@/server/eventVisibility";
import { normalizeTimeSlotFieldIds } from "@/server/timeSlotCanonical";
import type { FieldSchedulingConflictBatchRequest } from "@/contracts/fieldSchedulingConflicts";
import { repeatingTimeSlotValidationResponse } from "@/server/repeatingTimeSlotValidationResponse";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const optionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
};

const optionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const normalizeDraftSlot = (
  value: unknown,
): FieldConflictDraftSlot | null => {
  const row = asRecord(value);
  const key = optionalString(row.key);
  if (!key || typeof row.repeating !== "boolean") return null;
  const scheduledFieldIds = normalizeTimeSlotFieldIds(row);
  const daysOfWeek = Array.isArray(row.daysOfWeek)
    ? row.daysOfWeek
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : undefined;
  const dayOfWeek = optionalNumber(row.dayOfWeek);
  return {
    key,
    $id: optionalString(row.$id),
    scheduledFieldId: optionalString(row.scheduledFieldId),
    scheduledFieldIds,
    dayOfWeek,
    daysOfWeek,
    startDate: optionalString(row.startDate),
    endDate: optionalString(row.endDate),
    timeZone: optionalString(row.timeZone),
    startTimeMinutes: optionalNumber(row.startTimeMinutes),
    endTimeMinutes: optionalNumber(row.endTimeMinutes),
    repeating: row.repeating,
  };
};

const normalizeContext = (body: JsonRecord): FieldConflictDraftContext => ({
  eventId: optionalString(body.eventId) ?? null,
  eventType: optionalString(body.eventType) ?? null,
  parentEvent: optionalString(body.parentEvent) ?? null,
  eventStart: optionalString(body.eventStart) ?? null,
  eventEnd: optionalString(body.eventEnd) ?? null,
  hasNoFixedEventEnd: optionalBoolean(body.hasNoFixedEventEnd) ?? false,
});

type ConflictSession = {
  userId: string;
  isAdmin: boolean;
};

const conflictSourceEventId = (
  conflict: FieldBlockerInterval,
): string | null => {
  const source = conflict.source;
  if (!source) return null;
  return optionalString(source.eventId) ?? optionalString(source.parentId) ?? null;
};

const loadVisibleConflictEventIds = async (
  session: ConflictSession,
  conflicts: FieldBlockerInterval[],
): Promise<Set<string>> => {
  const eventIds = Array.from(
    new Set(
      conflicts
        .map(conflictSourceEventId)
        .filter((eventId): eventId is string => Boolean(eventId)),
    ),
  );
  if (!eventIds.length) return new Set();

  const eventRows = await prisma.events.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      state: true,
      archivedAt: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  const visibleEventIds = new Set<string>();
  await Promise.all(
    eventRows.map(async (event) => {
      if (event.archivedAt) return;
      if (
        isPublicEventState(event.state)
        || await canManageEvent(session, event, prisma)
      ) {
        visibleEventIds.add(event.id);
      }
    }),
  );
  return visibleEventIds;
};


export async function POST(req: NextRequest) {
  const session = await getOptionalSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = asRecord(await req.json().catch(() => null));
  const rawSlots = Array.isArray(body.slots) ? body.slots : [];
  if (!rawSlots.length) {
    return NextResponse.json(
      { error: "At least one Time Slot is required." },
      { status: 400 },
    );
  }
  const slots = rawSlots.map(normalizeDraftSlot);
  if (slots.some((slot): slot is null => slot === null)) {
    return NextResponse.json({ error: "Invalid Time Slot input." }, { status: 400 });
  }
  const canonicalSlots = slots as FieldConflictDraftSlot[];
  const context = normalizeContext(body);
  const fieldIds = Array.from(
    new Set(canonicalSlots.flatMap((slot) => normalizeTimeSlotFieldIds(slot))),
  );
  if (!fieldIds.length) {
    return NextResponse.json(
      { error: "Time Slots require at least one scheduled Field." },
      { status: 400 },
    );
  }
  if (!(await canManageScheduledFields(session, fieldIds))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lowerBound = getFieldConflictLowerBound(canonicalSlots, context);
  if (!lowerBound) {
    return NextResponse.json(
      { error: "Time Slots require a valid start date." },
      { status: 400 },
    );
  }

  try {
    const catalog = await loadFieldBlockerCatalog({
      fieldIds,
      lowerBound,
      excludeEventId: context.eventId,
    });
    const conflictIntervals = canonicalSlots.flatMap((slot) =>
      findFieldConflictsForDraftSlot(catalog, slot, context).map((conflict) => ({
        slotKey: slot.key,
        conflict,
      })),
    );
    const visibleEventIds = await loadVisibleConflictEventIds(
      session,
      conflictIntervals.map(({ conflict }) => conflict),
    );
    const conflicts = conflictIntervals.map(({ slotKey, conflict }) => {
      const canViewSource = !conflict.source
        || visibleEventIds.has(conflictSourceEventId(conflict) ?? "");
      return serializeFieldSchedulingConflict(slotKey, conflict, { canViewSource });
    });

    return NextResponse.json({ conflicts }, { status: 200 });
  } catch (error) {
    const validationResponse = repeatingTimeSlotValidationResponse(error);
    if (validationResponse) return validationResponse;
    console.error("Field conflict lookup failed", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export type FieldConflictRouteRequest = FieldSchedulingConflictBatchRequest;
