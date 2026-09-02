import crypto from "node:crypto";
import { normalizeEntityId } from "@/lib/organizationEventAccess";
import type { Prisma } from "@/generated/prisma/client";
import type {
  EventEditorRevisionBinding,
} from "@/contracts/eventEditor";
import {
  loadFieldBlockerCatalog,
  type FieldBlockerCatalog,
  type FieldBlockerInterval,
  type FieldBlockerRecurrence,
  type FieldSchedulingConflictSource,
  type PrismaLike as FieldBlockerPrismaLike,
} from "@/server/repositories/fieldSchedulingConflicts";
import type { League, Tournament } from "@/server/scheduler/types";

export type MaintenanceRevisionClient = Prisma.TransactionClient;
export type MaintenanceRevisionActor = {
  userId: string;
  isAdmin: boolean;
};
export type MaintenanceEditorSnapshot = {
  editorRevision: string;
  staffRevision: string | null;
};
export type MaintenanceRevisionBindingOptions = {
  includeCheckIns?: boolean;
  automatedScheduling?: boolean;
  snapshot?: MaintenanceEditorSnapshot | null;
  loadEditorSnapshot?: (
    eventId: string,
    actor: MaintenanceRevisionActor,
    client: MaintenanceRevisionClient,
  ) => Promise<MaintenanceEditorSnapshot>;
  computeRevision?: (input: unknown) => string;
};

type MaintenanceRevisionModel =
  | "fields"
  | "timeSlots"
  | "rentalBookings"
  | "rentalBookingItems"
  | "divisions";

type MaintenanceRevisionResourceIds = {
  fieldIds: string[];
  timeSlotIds: string[];
  bookingIds: string[];
  bookingItemIds: string[];
  divisionIds: string[];
  rentalBookingId: string | null;
};

const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.startsWith("$"))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, jsonSafe(entry)]),
    );
  }
  return value;
};

const hash = (value: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(jsonSafe(value))).digest("hex");

const computeRevisionFor = (
  computeRevision: ((input: unknown) => string) | undefined,
  value: unknown,
): string => (computeRevision ? computeRevision(value) : hash(value));

const recordFor = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

const revisionScalarRecord = (
  value: unknown,
  excludedKeys: ReadonlySet<string>,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key, entry]) => (
        !excludedKeys.has(key)
        && (
          entry === null
          || typeof entry === "string"
          || typeof entry === "number"
          || typeof entry === "boolean"
          || entry instanceof Date
          || (Array.isArray(entry)
            && entry.every((item) => (
              item === null
              || typeof item === "string"
              || typeof item === "number"
              || typeof item === "boolean"
            )))
        )
      ))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};

const fieldRevisionFor = (
  field: unknown,
  computeRevision?: (input: unknown) => string,
): string => computeRevisionFor(
  computeRevision,
  revisionScalarRecord(field, new Set(["matches", "divisions"])),
);

const timeSlotRevisionFor = (
  slot: unknown,
  computeRevision?: (input: unknown) => string,
): string => computeRevisionFor(
  computeRevision,
  revisionScalarRecord(slot, new Set(["field", "divisions", "matches"])),
);

const revisionEventFor = (event: League | Tournament): Record<string, unknown> =>
  revisionScalarRecord(
    event,
    new Set([
      "matches",
      "fields",
      "teams",
      "players",
      "officials",
      "divisions",
      "playoffDivisions",
      "timeSlots",
      "eventOfficials",
      "officialPositions",
      "pendingStaffInvites",
      "registrations",
      "waitList",
      "freeAgents",
    ]),
  );

const addResourceId = (target: Set<string>, value: unknown): void => {
  const normalized = normalizeEntityId(value);
  if (normalized) target.add(normalized);
};

const addResourceIds = (target: Set<string>, value: unknown): void => {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => addResourceId(target, entry));
};

const schedulingCollectionFor = (
  value: unknown,
  excludedKeys: ReadonlySet<string> = new Set(["matches"]),
): unknown[] => {
  const entries = Array.isArray(value)
    ? value
    : Object.values(recordFor(value));
  return entries
    .map((entry) => Object.fromEntries(
      Object.entries(recordFor(entry))
        .filter(([key]) => !excludedKeys.has(key)),
    ))
    .sort((left, right) => {
      const leftRecord = recordFor(left);
      const rightRecord = recordFor(right);
      return [
        String(leftRecord.id ?? ""),
        JSON.stringify(left),
      ].join("\u0000").localeCompare([
        String(rightRecord.id ?? ""),
        JSON.stringify(right),
      ].join("\u0000"));
    });
};

const revisionRowsFor = (
  rows: Map<string, unknown>,
  ids: string[],
  model: MaintenanceRevisionModel,
  computeRevision?: (input: unknown) => string,
): Record<string, string> => Object.fromEntries(
  ids.map((id) => [
    id,
    computeRevisionFor(computeRevision, {
      model,
      id,
      row: rows.get(id) ?? null,
    }),
  ]),
);

export const maintenanceRevisionResourceIdsFor = (
  event: League | Tournament,
  matchRows: unknown[] = [],
): MaintenanceRevisionResourceIds => {
  const eventRecord = recordFor(event);
  const fieldIds = new Set<string>();
  const timeSlotIds = new Set<string>();
  const bookingIds = new Set<string>();
  const bookingItemIds = new Set<string>();
  const divisionIds = new Set<string>();
  Object.keys(event.fields ?? {}).forEach((fieldId) => addResourceId(fieldIds, fieldId));
  addResourceIds(fieldIds, eventRecord.fieldIds);
  Object.values(event.fields ?? {}).forEach((field) => {
    const fieldRecord = recordFor(field);
    addResourceId(fieldIds, fieldRecord.id ?? fieldRecord.$id);
  });
  addResourceIds(timeSlotIds, eventRecord.timeSlotIds);
  const timeSlots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  timeSlots.forEach((slot) => {
    const slotRecord = recordFor(slot);
    addResourceId(timeSlotIds, slotRecord.id ?? slotRecord.$id);
    addResourceId(fieldIds, slotRecord.scheduledFieldId);
    addResourceId(fieldIds, slotRecord.fieldId);
    addResourceIds(fieldIds, slotRecord.scheduledFieldIds);
    addResourceIds(fieldIds, slotRecord.fieldIds);
    addResourceId(bookingIds, slotRecord.rentalBookingId);
    addResourceId(bookingItemIds, slotRecord.rentalBookingItemId);
  });
  addResourceId(bookingIds, eventRecord.rentalBookingId);
  addResourceId(bookingItemIds, eventRecord.rentalBookingItemId);
  addResourceIds(divisionIds, eventRecord.divisions);
  addResourceIds(divisionIds, eventRecord.divisionIds);
  const details = [
    ...((eventRecord.divisionDetails as unknown[]) ?? []),
    ...((eventRecord.playoffDivisionDetails as unknown[]) ?? []),
  ];
  details.forEach((division) => {
    const divisionRecord = recordFor(division);
    addResourceId(divisionIds, divisionRecord.id ?? divisionRecord.$id);
    addResourceId(divisionIds, divisionRecord.sourceDivisionId);
  });
  matchRows.forEach((row) => {
    const matchRecord = recordFor(row);
    addResourceId(fieldIds, matchRecord.fieldId);
    addResourceIds(fieldIds, matchRecord.fieldIds);
    addResourceId(timeSlotIds, matchRecord.timeSlotId);
    addResourceIds(timeSlotIds, matchRecord.timeSlotIds);
    addResourceId(bookingIds, matchRecord.rentalBookingId);
    addResourceIds(bookingIds, matchRecord.rentalBookingIds);
    addResourceId(bookingItemIds, matchRecord.rentalBookingItemId);
    addResourceIds(bookingItemIds, matchRecord.rentalBookingItemIds);
    addResourceId(divisionIds, matchRecord.division);
    addResourceId(divisionIds, matchRecord.phaseDivisionId);
    addResourceId(divisionIds, matchRecord.sourceDivisionId);
  });
  const sortedBookingIds = Array.from(bookingIds).sort();
  return {
    fieldIds: Array.from(fieldIds).sort(),
    timeSlotIds: Array.from(timeSlotIds).sort(),
    bookingIds: sortedBookingIds,
    bookingItemIds: Array.from(bookingItemIds).sort(),
    divisionIds: Array.from(divisionIds).sort(),
    rentalBookingId:
      normalizeEntityId(eventRecord.rentalBookingId)
      ?? sortedBookingIds[0]
      ?? null,
  };
};
export type MaintenanceLockResourceIds = Omit<
  MaintenanceRevisionResourceIds,
  "divisionIds" | "rentalBookingId"
>;

export const maintenanceLockResourceIdsFor = (
  event: League | Tournament,
  matchRows: unknown[] = [],
): MaintenanceLockResourceIds => {
  const resources = maintenanceRevisionResourceIdsFor(event, matchRows);
  return {
    fieldIds: resources.fieldIds,
    timeSlotIds: resources.timeSlotIds,
    bookingIds: resources.bookingIds,
    bookingItemIds: resources.bookingItemIds,
  };
};

const readRows = async (
  client: MaintenanceRevisionClient,
  model: MaintenanceRevisionModel,
  ids: string[],
): Promise<unknown[]> => {
  if (!ids.length) return [];
  const delegate = (client as unknown as Record<string, unknown>)[model] as {
    findMany?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof delegate?.findMany !== "function") return [];
  const rows = await delegate.findMany({ where: { id: { in: ids } } });
  return Array.isArray(rows) ? rows : [];
};

const readMatchRelations = async (
  client: MaintenanceRevisionClient,
  eventId: string,
): Promise<unknown[]> => {
  const delegate = (client as unknown as Record<string, unknown>).matches as {
    findMany?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof delegate?.findMany !== "function") return [];
  const rows = await delegate.findMany({
    where: { eventId },
    select: { fieldId: true, division: true },
  });
  return Array.isArray(rows) ? rows : [];
};
export const loadMaintenanceLockResourceIdsFor = async (
  event: League | Tournament,
  client: MaintenanceRevisionClient,
): Promise<MaintenanceLockResourceIds> => {
  const matchRows = await readMatchRelations(client, event.id);
  return maintenanceLockResourceIdsFor(event, matchRows);
};

const readCheckIns = async (
  client: MaintenanceRevisionClient,
  eventId: string,
): Promise<unknown[]> => {
  const delegate = (client as unknown as Record<string, unknown>).teamCheckIns as {
    findMany?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof delegate?.findMany !== "function") return [];
  const rows = await delegate.findMany({ where: { eventId } });
  return Array.isArray(rows)
    ? [...rows].sort((left, right) =>
      String(recordFor(left).id ?? "").localeCompare(String(recordFor(right).id ?? "")),
    )
    : [];
};

const maintenanceScheduleWindowFor = (
  event: League | Tournament,
): { start: Date; end: Date } => {
  const eventRecord = recordFor(event);
  const rawStart = eventRecord.start;
  const start = rawStart instanceof Date
    ? new Date(rawStart.getTime())
    : new Date(
      typeof rawStart === "string" || typeof rawStart === "number"
        ? rawStart
        : NaN,
    );
  const normalizedStart = Number.isFinite(start.getTime()) ? start : new Date(0);
  const hasExplicitEndConstraint =
    eventRecord.scheduleEndConstraint !== null
    && eventRecord.scheduleEndConstraint !== undefined;
  const generatedEnd =
    !hasExplicitEndConstraint
    && (
      eventRecord.generatedScheduleEnd !== null
      && eventRecord.generatedScheduleEnd !== undefined
      || eventRecord.noFixedEndDateTime === true
    );
  const generatedScheduleEnd = eventRecord.generatedScheduleEnd ?? eventRecord.end;
  const endCandidates = (
    generatedEnd
      ? [generatedScheduleEnd]
      : [
        hasExplicitEndConstraint
          ? eventRecord.scheduleEndConstraint
          : eventRecord.end,
      ]
  )
    .map((value) => (
      value instanceof Date
        ? new Date(value.getTime())
        : typeof value === "string" || typeof value === "number"
          ? new Date(value)
          : null
    ))
    .filter((value): value is Date =>
      Boolean(value && Number.isFinite(value.getTime())),
    );
  const end = endCandidates.reduce(
    (latest, candidate) =>
      candidate.getTime() > latest.getTime() ? candidate : latest,
    new Date(normalizedStart.getTime() + 24 * 60 * 60 * 1000),
  );
  return {
    start: normalizedStart,
    end: end.getTime() > normalizedStart.getTime()
      ? end
      : new Date(normalizedStart.getTime() + 24 * 60 * 60 * 1000),
  };
};

const fieldBlockerSourceKey = (
  source: FieldSchedulingConflictSource,
): string => JSON.stringify({
  ...source,
  daysOfWeek: [...source.daysOfWeek].sort((left, right) => left - right),
  scheduledFieldIds: [...source.scheduledFieldIds].sort(),
});

const fieldBlockerIntervalKey = (interval: FieldBlockerInterval): string => [
  interval.start.toISOString(),
  interval.end.toISOString(),
  fieldBlockerSourceKey(interval.source),
].join("\u0000");

const fieldBlockerRecurrenceKey = (
  recurrence: FieldBlockerRecurrence,
): string => {
  const daysOfWeek = Array.isArray(recurrence.slot.daysOfWeek)
    ? recurrence.slot.daysOfWeek.map(Number).sort((left, right) => left - right)
    : [];
  const scheduledFieldIds = Array.isArray(recurrence.slot.scheduledFieldIds)
    ? recurrence.slot.scheduledFieldIds.map(String).sort()
    : [];
  return [
    fieldBlockerSourceKey(recurrence.source),
    JSON.stringify({ ...recurrence.slot, daysOfWeek, scheduledFieldIds }),
  ].join("\u0000");
};

const serializeFieldBlockerCatalog = (
  catalog: FieldBlockerCatalog,
): Record<string, unknown> => ({
  lowerBound: catalog.lowerBound.toISOString(),
  intervalsByFieldId: Array.from(catalog.intervalsByFieldId.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, intervals]) => ({
      fieldId,
      intervals: [...intervals]
        .sort((left, right) => fieldBlockerIntervalKey(left).localeCompare(fieldBlockerIntervalKey(right)))
        .map((interval) => ({
          start: interval.start.toISOString(),
          end: interval.end.toISOString(),
          source: interval.source,
        })),
    })),
  recurringByFieldId: Array.from(catalog.recurringByFieldId.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, recurrences]) => ({
      fieldId,
      recurrences: [...recurrences]
        .sort((left, right) => fieldBlockerRecurrenceKey(left).localeCompare(fieldBlockerRecurrenceKey(right)))
        .map((recurrence) => ({ source: recurrence.source, slot: recurrence.slot })),
    })),
});

const schedulingInputRevisionFor = (
  event: League | Tournament,
  automatedScheduling: boolean | undefined,
  resourceRevisions: {
    fieldRevisions: Record<string, string>;
    timeSlotRevisions: Record<string, string>;
    divisionRevisions: Record<string, string>;
  },
  computeRevision?: (input: unknown) => string,
): string => {
  const input: Record<string, unknown> = {
    event: revisionEventFor(event),
    teams: schedulingCollectionFor(
      (event as unknown as Record<string, unknown>).teams,
      new Set(["matches", "players", "playerRegistrations"]),
    ),
    divisions: schedulingCollectionFor((event as unknown as Record<string, unknown>).divisions),
    playoffDivisions: schedulingCollectionFor((event as unknown as Record<string, unknown>).playoffDivisions),
    officials: schedulingCollectionFor((event as unknown as Record<string, unknown>).officials),
    officialPositions: schedulingCollectionFor((event as unknown as Record<string, unknown>).officialPositions),
    eventOfficials: schedulingCollectionFor((event as unknown as Record<string, unknown>).eventOfficials),
    retainedFieldRevisions: resourceRevisions.fieldRevisions,
    retainedTimeSlotRevisions: resourceRevisions.timeSlotRevisions,
    retainedDivisionRevisions: resourceRevisions.divisionRevisions,
  };
  if (automatedScheduling !== undefined) input.automatedScheduling = automatedScheduling;
  return computeRevisionFor(computeRevision, input);
};

export const maintenanceRevisionBindingFor = (
  event: League | Tournament,
  scheduleRevision: string,
  computeRevision?: (input: unknown) => string,
): EventEditorRevisionBinding => {
  const fields = Object.values(event.fields ?? {});
  const timeSlots = event.timeSlots ?? [];
  const fieldRevisions = Object.fromEntries(
    fields.map((field) => [field.id, fieldRevisionFor(field, computeRevision)]),
  );
  const timeSlotRevisions = Object.fromEntries(
    timeSlots.map((slot) => [slot.id, timeSlotRevisionFor(slot, computeRevision)]),
  );
  const editorRevision = computeRevisionFor(computeRevision, {
    event: revisionEventFor(event),
    fields: fieldRevisions,
    timeSlots: timeSlotRevisions,
    scheduleRevision,
  });
  return {
    editorRevision,
    staffRevision: null,
    scheduleRevision,
    fieldRevisions,
    timeSlotRevisions,
    rentalBookingRevision: null,
    rentalBookingRevisions: {},
    rentalBookingItemRevisions: {},
    availabilityRevision: computeRevisionFor(computeRevision, {
      scheduleRevision,
      fieldRevisions,
      timeSlotRevisions,
    }),
  };
};

export const loadMaintenanceRevisionBinding = async (
  event: League | Tournament,
  scheduleRevision: string,
  actor: MaintenanceRevisionActor,
  client: MaintenanceRevisionClient,
  options: MaintenanceRevisionBindingOptions = {},
): Promise<EventEditorRevisionBinding> => {
  const matchRows = await readMatchRelations(client, event.id);
  const resourceIds = maintenanceRevisionResourceIdsFor(event, matchRows);
  const { start: scheduleWindowStart, end: scheduleWindowEnd } =
    maintenanceScheduleWindowFor(event);
  let editorSnapshot = options.snapshot ?? null;
  if (!editorSnapshot && options.loadEditorSnapshot) {
    try {
      editorSnapshot = await options.loadEditorSnapshot(event.id, actor, client);
    } catch (error) {
      if (recordFor(error).code === "EDITOR_NOT_FOUND") {
        throw Object.assign(new Error("Event not found."), { code: "EDITOR_NOT_FOUND" });
      }
      throw error;
    }
  }
  const [
    fieldRows,
    timeSlotRows,
    rentalBookingRows,
    rentalBookingItemRows,
    divisionRows,
    blockerCatalog,
  ] = await Promise.all([
    readRows(client, "fields", resourceIds.fieldIds),
    readRows(client, "timeSlots", resourceIds.timeSlotIds),
    readRows(client, "rentalBookings", resourceIds.bookingIds),
    readRows(client, "rentalBookingItems", resourceIds.bookingItemIds),
    readRows(client, "divisions", resourceIds.divisionIds),
    loadFieldBlockerCatalog({
      client: client as unknown as FieldBlockerPrismaLike,
      fieldIds: resourceIds.fieldIds,
      lowerBound: scheduleWindowStart,
      excludeEventId: event.id,
    }),
  ]);
  const checkIns = options.includeCheckIns
    ? await readCheckIns(client, event.id)
    : [];
  const rowsById = (rows: unknown[]): Map<string, unknown> => new Map(
    rows
      .map((row) => {
        const id = normalizeEntityId(recordFor(row).id);
        return id ? [id, row] as const : null;
      })
      .filter((entry): entry is readonly [string, unknown] => Boolean(entry)),
  );
  const fieldRowsById = rowsById(fieldRows);
  const timeSlotRowsById = rowsById(timeSlotRows);
  const rentalBookingRowsById = rowsById(rentalBookingRows);
  const rentalBookingItemRowsById = rowsById(rentalBookingItemRows);
  const divisionRowsById = rowsById(divisionRows);
  const computeRevision = options.computeRevision;
  const fieldRevisions = revisionRowsFor(
    fieldRowsById,
    resourceIds.fieldIds,
    "fields",
    computeRevision,
  );
  const timeSlotRevisions = revisionRowsFor(
    timeSlotRowsById,
    resourceIds.timeSlotIds,
    "timeSlots",
    computeRevision,
  );
  const rentalBookingRevisions = revisionRowsFor(
    rentalBookingRowsById,
    resourceIds.bookingIds,
    "rentalBookings",
    computeRevision,
  );
  const rentalBookingItemRevisions = revisionRowsFor(
    rentalBookingItemRowsById,
    resourceIds.bookingItemIds,
    "rentalBookingItems",
    computeRevision,
  );
  const divisionRevisions = revisionRowsFor(
    divisionRowsById,
    resourceIds.divisionIds,
    "divisions",
    computeRevision,
  );
  const serializedBlockers = serializeFieldBlockerCatalog(blockerCatalog);
  const baseBinding = maintenanceRevisionBindingFor(
    event,
    scheduleRevision,
    computeRevision,
  );
  const availabilityRevision = computeRevisionFor(computeRevision, {
    scheduleRevision,
    windowStart: scheduleWindowStart.toISOString(),
    windowEnd: scheduleWindowEnd.toISOString(),
    fields: resourceIds.fieldIds
      .map((id) => ({ id, row: fieldRowsById.get(id) ?? null }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    timeSlots: resourceIds.timeSlotIds
      .map((id) => ({ id, row: timeSlotRowsById.get(id) ?? null }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    rentalBookings: resourceIds.bookingIds
      .map((id) => ({ id, row: rentalBookingRowsById.get(id) ?? null }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    rentalBookingItems: resourceIds.bookingItemIds
      .map((id) => ({ id, row: rentalBookingItemRowsById.get(id) ?? null }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    blockers: serializedBlockers,
    checkIns,
  });
  const editorRevision = computeRevisionFor(computeRevision, {
    snapshotEditorRevision: editorSnapshot?.editorRevision ?? baseBinding.editorRevision,
    schedulingInputRevision: schedulingInputRevisionFor(
      event,
      options.automatedScheduling,
      { fieldRevisions, timeSlotRevisions, divisionRevisions },
      computeRevision,
    ),
  });
  return {
    editorRevision,
    staffRevision: editorSnapshot?.staffRevision ?? baseBinding.staffRevision,
    scheduleRevision,
    fieldRevisions,
    timeSlotRevisions,
    rentalBookingRevision: resourceIds.rentalBookingId
      ? rentalBookingRevisions[resourceIds.rentalBookingId] ?? null
      : null,
    rentalBookingRevisions,
    rentalBookingItemRevisions,
    availabilityRevision,
  };
};
