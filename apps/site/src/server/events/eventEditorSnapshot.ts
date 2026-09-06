import crypto from "crypto";
import { EditorImmutableFieldError } from "./eventEditorAuthority";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Event } from "@/types";
import { normalizeBracketTeamCount } from "@/lib/divisionTypes";
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  parseEventEditorSnapshot,
  type EventEditorBootstrapQuery,
  type EventEditorDraft,
  type EventEditorMaintenanceOperation,
  type EventEditorSnapshot,
} from "@/contracts/eventEditor";
import { legacyEventToEditorDraft } from "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters";
import { loadEventStaffSnapshot } from "./eventStaffReconciliation";
import { listRegistrationQuestions } from "@/server/registrationQuestions";
import { buildSeedEventFromTemplate } from "@/server/eventTemplates";
import { hasJoinedEventParticipant } from "./eventRegistrations";
import { loadEventProtectedHistory } from "./eventProtectedHistory";
import { projectEventAuthorityCapabilities } from "@/server/accessControl";
import {
  matchDemandFromPersistedGraph,
  type MatchDemand,
} from "@/server/scheduler/matchGraph";
import {
  generatedPoolsForBracket,
  isTournamentPoolPlayEnabled,
} from "./tournamentPools";

export type EditorActor = {
  userId: string;
  isAdmin?: boolean;
};

export type EditorSnapshotClient = Prisma.TransactionClient | typeof prisma;

export type EventEditorSnapshotContext = {
  client?: EditorSnapshotClient;
  actor?: EditorActor | null;
  mode?: "CREATE" | "EDIT";
  query?: EventEditorBootstrapQuery;
};
type ModelDelegate = {
  findMany?: (args: Record<string, unknown>) => Promise<unknown>;
  findFirst?: (args: Record<string, unknown>) => Promise<unknown>;
  findUnique?: (args: Record<string, unknown>) => Promise<unknown>;
};

const getModelDelegate = (
  client: EditorSnapshotClient,
  model: string,
): ModelDelegate | null => {
  const candidate = (client as unknown as Record<string, unknown>)[model];
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as ModelDelegate;
};

const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, jsonSafe(child)]),
    );
  }
  return value;
};

const editorRevisionFor = (input: unknown): string =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(jsonSafe(input)))
    .digest("hex");
const CREATE_REVISION_SOURCE = Symbol("createRevisionSource");

const setCreateRevisionSource = (
  event: Record<string, unknown>,
  source: unknown,
): Record<string, unknown> => {
  Object.defineProperty(event, CREATE_REVISION_SOURCE, {
    configurable: true,
    value: source,
  });
  return event;
};
const canonicalizeSourceCollection = (values: unknown[]): unknown[] =>
  values
    .map((value) => {
      const record =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : null;
      const identity =
        typeof record?.id === "string"
          ? record.id
          : typeof record?.$id === "string"
            ? record.$id
            : "";
      return {
        value,
        identity,
        serialized: JSON.stringify(jsonSafe(value)),
      };
    })
    .sort((left, right) =>
      `${left.identity}\u0000${left.serialized}`.localeCompare(
        `${right.identity}\u0000${right.serialized}`,
      ),
    )
    .map(({ value }) => value);

const callFindMany = async (
  client: EditorSnapshotClient,
  model: string,
  args: Record<string, unknown>,
): Promise<unknown[]> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findMany !== "function") return [];
  const rows = await delegate.findMany(args);
  return Array.isArray(rows) ? rows : [];
};
export const loadEventScheduleState = async (
  event: Record<string, unknown>,
  eventId: string,
  client: EditorSnapshotClient,
): Promise<{
  sourceType: string | null;
  matchCount: number;
  matchDemand: MatchDemand;
  revision: string;
  hasProtectedHistory: boolean;
}> => {
  const protectedHistory = await loadEventProtectedHistory(eventId, client);
  const {
    matches,
    divisionRows,
    segments,
    incidents,
    receipts,
    checkIns,
    rosters,
    broadcastActions,
    broadcastStates,
    protectedMatchIds,
  } = protectedHistory;

  const matchRows = matches;
  const segmentRows = segments;
  const demandDivisions = divisionRows
    .map((row) => ({
      id: row.id,
      phase: typeof row.phase === "string" ? row.phase : null,
    }))
    .filter((division) => division.id.length > 0);
  const matchDemand = matchDemandFromPersistedGraph(
    matchRows.map((row) => ({
      divisionId: row.division,
      placementState: row.placementState,
      fieldId: row.fieldId,
    })),
    demandDivisions,
  );
  const normalizedSourceType =
    typeof event.sourceType === "string" && event.sourceType.trim()
      ? event.sourceType.trim()
      : null;
  const revision = editorRevisionFor({
    event: projectReadRow(event, [
      "id",
      "eventType",
      "sourceType",
      "start",
      "end",
      "scheduleEndConstraint",
      "generatedScheduleEnd",
      "isAutomatedScheduling",
      "automatedScheduling",
      "timeSlotIds",
      "updatedAt",
    ]),
    matches: [...matchRows].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    segments: [...segmentRows].sort((left, right) =>
      `${left.matchId}:${left.sequence}`.localeCompare(
        `${right.matchId}:${right.sequence}`,
      ),
    ),
    incidents: [...incidents].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    receipts: [...receipts].sort((left, right) =>
      left.clientOperationId.localeCompare(right.clientOperationId),
    ),
    checkIns: [...checkIns].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    rosters: [...rosters].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    broadcastActions: [...broadcastActions].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    broadcastStates: [...broadcastStates].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  });
  return {
    sourceType: normalizedSourceType,
    matchCount: matchRows.length,
    matchDemand,
    revision,
    hasProtectedHistory: protectedMatchIds.size > 0,
  };
};

const callFindFirst = async (
  client: EditorSnapshotClient,
  model: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findFirst !== "function") return null;
  const row = await delegate.findFirst(args);
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
};

const callFindUnique = async (
  client: EditorSnapshotClient,
  model: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findUnique !== "function") return null;
  const row = await delegate.findUnique(args);
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
};
const canonicalReadRow = (
  row: Record<string, unknown>,
): Record<string, unknown> => {
  const id =
    typeof row.id === "string"
      ? row.id
      : typeof row.$id === "string"
        ? row.$id
        : null;
  return {
    ...row,
    ...(id ? { id, $id: id } : {}),
  };
};
const projectReadRow = (
  row: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> =>
  canonicalReadRow(
    Object.fromEntries(
      keys.filter((key) => key in row).map((key) => [key, jsonSafe(row[key])]),
    ),
  );

const EDITOR_FIELD_KEYS = [
  "id",
  "$id",
  "name",
  "location",
  "address",
  "lat",
  "long",
  "heading",
  "inUse",
  "rentalSlotIds",
  "sportIds",
  "createdBy",
  "archivedAt",
  "archivedByUserId",
  "archiveReason",
  "organizationId",
  "facilityId",
  "latitude",
  "longitude",
] as const;

const EDITOR_TIME_SLOT_KEYS = [
  "id",
  "$id",
  "eventId",
  "archivedAt",
  "archivedByUserId",
  "archiveReason",
  "dayOfWeek",
  "daysOfWeek",
  "startTimeMinutes",
  "endTimeMinutes",
  "startDate",
  "endDate",
  "start",
  "end",
  "timeZone",
  "scheduledFieldId",
  "scheduledFieldIds",
  "fieldId",
  "fieldIds",
  "division",
  "divisions",
  "divisionKeys",
  "requiredTemplateIds",
  "hostRequiredTemplateIds",
  "repeating",
  "price",
  "taxHandling",
  "sourceType",
  "rentalBookingId",
  "rentalBookingItemId",
  "rentalLocked",
] as const;
const loadEventResources = async (
  client: EditorSnapshotClient,
  event: Record<string, unknown>,
) => {
  const fieldIds = Array.isArray(event.fieldIds)
    ? event.fieldIds.filter(
        (id: unknown): id is string => typeof id === "string",
      )
    : [];
  const timeSlotIds = Array.isArray(event.timeSlotIds)
    ? event.timeSlotIds.filter(
        (id: unknown): id is string => typeof id === "string",
      )
    : [];
  const [fields, timeSlots] = await Promise.all([
    fieldIds.length
      ? callFindMany(client, "fields", { where: { id: { in: fieldIds } } })
      : Promise.resolve([]),
    timeSlotIds.length
      ? callFindMany(client, "timeSlots", {
          where: { id: { in: timeSlotIds } },
        })
      : Promise.resolve([]),
  ]);
  const inlineFields = Array.isArray(event.fields) ? event.fields : [];
  const inlineTimeSlots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  const toReadRows = (
    rows: unknown[],
    keys: readonly string[],
  ): Record<string, unknown>[] =>
    rows
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object",
      )
      .map((row) => projectReadRow(row, keys));
  return {
    fields: toReadRows(
      fields.length ? fields : inlineFields,
      EDITOR_FIELD_KEYS,
    ),
    timeSlots: toReadRows(
      timeSlots.length ? timeSlots : inlineTimeSlots,
      EDITOR_TIME_SLOT_KEYS,
    ),
  };
};
const EDITOR_DIVISION_KEYS = [
  "id",
  "name",
  "key",
  "kind",
  "role",
  "phase",
  "isSystemGenerated",
  "sortOrder",
  "sourceDivisionId",
  "price",
  "maxParticipants",
  "playoffTeamCount",
  "poolCount",
  "poolTeamCount",
  "playoffPlacementDivisionIds",
  "standingsOverrides",
  "phaseSettings",
  "gamesPerOpponent",
  "restTimeMinutes",
  "usesSets",
  "matchDurationMinutes",
  "setDurationMinutes",
  "setsPerMatch",
  "playoffDoubleElimination",
  "playoffWinnerSetCount",
  "playoffLoserSetCount",
  "playoffWinnerBracketPointsToVictory",
  "playoffLoserBracketPointsToVictory",
  "playoffPrize",
  "playoffFieldCount",
  "playoffRestTimeMinutes",
  "playoffMatchDurationMinutes",
  "playoffSetDurationMinutes",
  "pointsToVictory",
  "standingsConfirmedAt",
  "standingsConfirmedBy",
  "allowPaymentPlans",
  "installmentCount",
  "installmentDueDates",
  "installmentDueRelativeDays",
  "installmentAmounts",
  "divisionTypeId",
  "skillDivisionTypeId",
  "ageDivisionTypeId",
  "ratingType",
  "gender",
  "ageCutoffDate",
  "ageCutoffLabel",
  "ageCutoffSource",
  "fieldIds",
  "teamIds",
] as const;


const loadEventDivisions = async (
  client: EditorSnapshotClient,
  eventId: string | null,
) => {
  if (!eventId) return [];
  const rows = await callFindMany(client, "divisions", {
    where: { eventId, status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    )
    .filter((row) => {
      if (row.isSystemGenerated !== true) return true;
      const isPhase =
        String(row.role ?? "")
          .trim()
          .toUpperCase() === "PHASE" || Boolean(row.phase);
      return !isPhase;
    })
    .map((row) => projectReadRow(row, EDITOR_DIVISION_KEYS));
};

const numericStandingsOverridesFor = (
  row: Record<string, unknown>,
): Record<string, number> | null => {
  if (
    !row.standingsOverrides ||
    typeof row.standingsOverrides !== "object" ||
    Array.isArray(row.standingsOverrides)
  ) {
    return null;
  }
  const entries = Object.entries(
    row.standingsOverrides as Record<string, unknown>,
  ).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
  return entries.length > 0
    ? (Object.fromEntries(entries) as Record<string, number>)
    : null;
};

const playoffConfigFor = (
  row: Record<string, unknown>,
): Record<string, unknown> | null => {
  const explicit = row.playoffConfig;
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    return explicit as Record<string, unknown>;
  }
  if (
    row.kind === "PLAYOFF" &&
    row.standingsOverrides &&
    typeof row.standingsOverrides === "object" &&
    !Array.isArray(row.standingsOverrides)
  ) {
    return row.standingsOverrides as Record<string, unknown>;
  }
  const persistedFields: Record<string, string> = {
    doubleElimination: "playoffDoubleElimination",
    winnerSetCount: "playoffWinnerSetCount",
    loserSetCount: "playoffLoserSetCount",
    winnerBracketPointsToVictory: "playoffWinnerBracketPointsToVictory",
    loserBracketPointsToVictory: "playoffLoserBracketPointsToVictory",
    prize: "playoffPrize",
    fieldCount: "playoffFieldCount",
    restTimeMinutes: "playoffRestTimeMinutes",
    matchDurationMinutes: "playoffMatchDurationMinutes",
    setDurationMinutes: "playoffSetDurationMinutes",
  };
  const config = Object.fromEntries(
    Object.entries(persistedFields)
      .filter(
        ([, sourceKey]) =>
          row[sourceKey] !== undefined && row[sourceKey] !== null,
      )
      .map(([key, sourceKey]) => [key, row[sourceKey]]),
  );
  return Object.keys(config).length > 0 ? config : null;
};

const divisionDetailFor = (row: Record<string, unknown>, index: number) => ({
  id: String(row.id ?? row.$id ?? ""),
  sourceDivisionId:
    typeof row.sourceDivisionId === "string" ? row.sourceDivisionId : null,
  key:
    typeof row.key === "string" && row.key.length > 0
      ? row.key
      : `division-${index + 1}`,
  name: typeof row.name === "string" ? row.name : `Division ${index + 1}`,
  kind: row.kind === "PLAYOFF" ? ("PLAYOFF" as const) : ("LEAGUE" as const),
  isSystemGenerated:
    row.isSystemGenerated === true
      ? true
      : row.isSystemGenerated === false
        ? false
        : undefined,
  poolPlay: Boolean(
    (row.phaseSettings as Record<string, unknown> | null)?.poolPlay,
  ),
  divisionTypeId:
    typeof row.divisionTypeId === "string" ? row.divisionTypeId : "",
  skillDivisionTypeId:
    typeof row.skillDivisionTypeId === "string" ? row.skillDivisionTypeId : "",
  ageDivisionTypeId:
    typeof row.ageDivisionTypeId === "string" ? row.ageDivisionTypeId : "",
  divisionTypeName: "",
  ratingType: typeof row.ratingType === "string" ? row.ratingType : "",
  gender: typeof row.gender === "string" ? row.gender : undefined,
  price: typeof row.price === "number" ? row.price : null,
  maxParticipants:
    typeof row.maxParticipants === "number" ? row.maxParticipants : null,
  playoffTeamCount:
    typeof row.playoffTeamCount === "number" ? row.playoffTeamCount : null,
  poolCount: typeof row.poolCount === "number" ? row.poolCount : null,
  poolTeamCount: typeof row.poolTeamCount === "number" ? row.poolTeamCount : null,
  phaseSettings:
    row.phaseSettings && typeof row.phaseSettings === "object"
      ? row.phaseSettings
      : {},
  playoffPlacementDivisionIds: Array.isArray(row.playoffPlacementDivisionIds)
    ? row.playoffPlacementDivisionIds
    : [],
  standingsOverrides:
    row.kind === "PLAYOFF" ? null : numericStandingsOverridesFor(row),
  playoffConfig: playoffConfigFor(row),
  gamesPerOpponent:
    typeof row.gamesPerOpponent === "number" ? row.gamesPerOpponent : null,
  restTimeMinutes:
    typeof row.restTimeMinutes === "number" ? row.restTimeMinutes : null,
  usesSets: typeof row.usesSets === "boolean" ? row.usesSets : null,
  matchDurationMinutes:
    typeof row.matchDurationMinutes === "number"
      ? row.matchDurationMinutes
      : null,
  setDurationMinutes:
    typeof row.setDurationMinutes === "number" ? row.setDurationMinutes : null,
  setsPerMatch: typeof row.setsPerMatch === "number" ? row.setsPerMatch : null,
  pointsToVictory: Array.isArray(row.pointsToVictory)
    ? row.pointsToVictory
    : [],
  standingsConfirmedAt: row.standingsConfirmedAt ?? null,
  standingsConfirmedBy:
    typeof row.standingsConfirmedBy === "string"
      ? row.standingsConfirmedBy
      : null,
  allowPaymentPlans:
    typeof row.allowPaymentPlans === "boolean" ? row.allowPaymentPlans : null,
  installmentCount:
    typeof row.installmentCount === "number" ? row.installmentCount : null,
  installmentDueDates: Array.isArray(row.installmentDueDates)
    ? row.installmentDueDates
    : [],
  installmentDueRelativeDays: Array.isArray(row.installmentDueRelativeDays)
    ? row.installmentDueRelativeDays
    : [],
  installmentAmounts: Array.isArray(row.installmentAmounts)
    ? row.installmentAmounts
    : [],
  ageCutoffDate: row.ageCutoffDate ?? null,
  ageCutoffLabel:
    typeof row.ageCutoffLabel === "string" ? row.ageCutoffLabel : null,
  ageCutoffSource:
    typeof row.ageCutoffSource === "string" ? row.ageCutoffSource : null,
  fieldIds: Array.isArray(row.fieldIds) ? row.fieldIds : [],
  teamIds: Array.isArray(row.teamIds) ? row.teamIds : [],
});

type EditorDivisionDetail = ReturnType<typeof divisionDetailFor>;

const collapseTournamentPoolDivisions = (
  event: Record<string, unknown>,
  divisions: EditorDivisionDetail[],
): EditorDivisionDetail[] => {
  if (!isTournamentPoolPlayEnabled(event)) return divisions;

  const poolDivisions = divisions.filter(
    (division) => division.kind !== "PLAYOFF",
  );
  const generatedPoolDivisions = poolDivisions.filter(
    (division) => division.isSystemGenerated === true,
  );
  const bracketDivisions = divisions.filter(
    (division) => division.kind === "PLAYOFF",
  );
  const consumedPoolIds = new Set<string>();
  const canonicalDivisions = bracketDivisions.flatMap((bracket) => {
    const pools = generatedPoolsForBracket(generatedPoolDivisions, bracket.id);
    if (pools.length === 0) return [];
    pools.forEach((pool) => consumedPoolIds.add(pool.id));
    const sourcePool = pools[0]!;
    const poolFieldIds = Array.from(
      new Set(pools.flatMap((pool) => pool.fieldIds)),
    );
    const poolTeamIds = Array.from(
      new Set(pools.flatMap((pool) => pool.teamIds)),
    );

    const poolMaxParticipants = pools.reduce(
      (total, pool) =>
        total +
        (typeof pool.maxParticipants === "number" ? pool.maxParticipants : 0),
      0,
    );
    const poolPlayoffTeamCount = pools.reduce(
      (total, pool) =>
        total +
        (typeof pool.playoffTeamCount === "number"
          ? pool.playoffTeamCount
          : 0),
      0,
    );
    const firstPoolTeamCount =
      typeof pools[0]?.maxParticipants === "number"
        ? pools[0].maxParticipants
        : null;
    const uniformPoolTeamCount =
      firstPoolTeamCount !== null &&
      pools.every((pool) => pool.maxParticipants === firstPoolTeamCount)
        ? firstPoolTeamCount
        : null;

    return [
      {
        ...sourcePool,
        id: bracket.id,
        key: bracket.key,
        name: bracket.name,
        kind: "LEAGUE" as const,
        maxParticipants:
          poolMaxParticipants > 0
            ? poolMaxParticipants
            : bracket.maxParticipants,
        playoffTeamCount:
          typeof bracket.playoffTeamCount === "number"
            ? bracket.playoffTeamCount
            : poolPlayoffTeamCount,
        poolCount:
          typeof bracket.poolCount === "number"
            ? bracket.poolCount
            : pools.length,
        poolTeamCount:
          typeof bracket.poolTeamCount === "number"
            ? bracket.poolTeamCount
            : uniformPoolTeamCount,
        phaseSettings: bracket.phaseSettings,
        playoffPlacementDivisionIds: [],
        playoffConfig: bracket.playoffConfig,
        fieldIds: poolFieldIds,
        teamIds: poolTeamIds,
      },
    ];
  });
  if (canonicalDivisions.length === 0) return divisions;

  return [
    ...poolDivisions.filter(
      (division) => !consumedPoolIds.has(division.id),
    ),
    ...canonicalDivisions,
    ...bracketDivisions,
  ];
};
const normalizeTournamentEditorDivisions = (
  event: Record<string, unknown>,
  divisions: EditorDivisionDetail[],
): EditorDivisionDetail[] => {
  const collapsed = collapseTournamentPoolDivisions(event, divisions);
  if (String(event.eventType ?? "").toUpperCase() !== "TOURNAMENT") {
    return collapsed;
  }

  const bracketDivisions = divisions.filter(
    (division) => division.kind === "PLAYOFF",
  );
  const generatedPoolIds = new Set(
    bracketDivisions.flatMap((bracket) =>
      generatedPoolsForBracket(divisions, bracket.id).map((pool) => pool.id),
    ),
  );
  return collapsed.map((division) =>
    generatedPoolIds.has(division.id)
      ? division
      : {
          ...division,
          maxParticipants: normalizeBracketTeamCount(division.maxParticipants),
          playoffTeamCount: normalizeBracketTeamCount(
            division.playoffTeamCount,
          ),
        },
  );
};
const loadCatalogs = async (
  client: EditorSnapshotClient,
  event: Record<string, unknown>,
  query?: EventEditorBootstrapQuery,
) => {
  const sportIds = Array.isArray(event.sportIds)
    ? event.sportIds
    : query?.sportId
      ? [query.sportId]
      : [];
  const organizationId =
    typeof event.organizationId === "string"
      ? event.organizationId
      : query?.organizationId;
  const [sports, organizations, templates, organizationFields] =
    await Promise.all([
      sportIds.length
        ? callFindMany(client, "sports", { where: { id: { in: sportIds } } })
        : Promise.resolve([]),
      organizationId
        ? callFindMany(client, "organizations", {
            where: { id: organizationId },
          })
        : Promise.resolve([]),
      callFindMany(client, "eventTemplates", {
        where: { organizationId: organizationId ?? undefined },
      }),
      callFindMany(client, "fields", {
        where: organizationId ? { organizationId } : { id: { in: [] } },
      }),
    ]);
  const toRecords = (rows: unknown[]): Record<string, unknown>[] =>
    rows
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object",
      )
      .map(canonicalReadRow);
  const selectedFields = toRecords(
    Array.isArray(event.fields) ? event.fields : [],
  );
  const fieldsById = new Map<string, Record<string, unknown>>();
  [...selectedFields, ...toRecords(organizationFields)].forEach((field) => {
    const fieldId =
      typeof field.id === "string"
        ? field.id
        : typeof field.$id === "string"
          ? field.$id
          : null;
    if (fieldId) fieldsById.set(fieldId, field);
  });
  const fieldRows = Array.from(fieldsById.values());
  const facilityIds = Array.from(
    new Set(
      fieldRows
        .map((field) =>
          typeof field.facilityId === "string" ? field.facilityId : null,
        )
        .filter((facilityId): facilityId is string => Boolean(facilityId)),
    ),
  );
  const facilities = facilityIds.length
    ? toRecords(
        await callFindMany(client, "facilities", {
          where: { id: { in: facilityIds } },
        }),
      )
    : [];
  const facilitiesById = new Map(
    facilities
      .map(
        (facility) =>
          [
            typeof facility.id === "string" ? facility.id : "",
            facility,
          ] as const,
      )
      .filter(([facilityId]) => facilityId.length > 0),
  );
  return {
    sports: toRecords(sports),
    organizations: toRecords(organizations),
    fields: fieldRows.map((field) => {
      const facility =
        typeof field.facilityId === "string"
          ? facilitiesById.get(field.facilityId)
          : undefined;
      return facility ? { ...field, facility } : field;
    }),
    templates: toRecords(templates),
  };
};

const loadCapability = async (
  client: EditorSnapshotClient,
  event: Record<string, unknown>,
  actor: EditorActor | null | undefined,
  mode: "CREATE" | "EDIT",
) => {
  const organizationId =
    typeof event.organizationId === "string" ? event.organizationId : null;
  let canUseOnlinePayments = false;
  if (organizationId) {
    const account = await callFindFirst(client, "stripeAccounts", {
      where: { organizationId, accountId: { not: null } },
      select: { accountId: true },
    });
    canUseOnlinePayments = Boolean(account?.accountId);
  }
  const organization =
    event.organization && typeof event.organization === "object"
      ? (event.organization as Record<string, unknown>)
      : null;
  if (!canUseOnlinePayments)
    canUseOnlinePayments = organization?.hasStripeAccount === true;
  const authority = await projectEventAuthorityCapabilities(
    actor ? { ...actor, isAdmin: Boolean(actor.isAdmin) } : null,
    {
      hostId: typeof event.hostId === "string" ? event.hostId : null,
      assistantHostIds: event.assistantHostIds,
      organizationId,
    },
    client,
  );
  return {
    ...authority,
    canManageStaff:
      mode === "CREATE" ? Boolean(actor?.userId) : authority.canManageStaff,
    canEdit: mode === "CREATE" ? Boolean(actor?.userId) : authority.canEdit,
    readOnly: mode === "CREATE" ? !actor?.userId : authority.readOnly,
    readOnlyReason:
      mode === "CREATE" && actor?.userId ? null : authority.readOnlyReason,
    canUseOnlinePayments,
    supportsTeamStaffing: ["LEAGUE", "TOURNAMENT", "EVENT"].includes(
      String(event.eventType ?? "").toUpperCase(),
    ),
  };
};

const maintenanceOperationsFor = ({
  event,
  eventId,
  mode,
  scheduleState,
  capabilities,
  immutable,
}: {
  event: Record<string, unknown>;
  eventId: string | null;
  mode: "CREATE" | "EDIT";
  scheduleState: {
    matchCount: number;
    matchDemand?: MatchDemand;
  };
  capabilities: {
    canEdit: boolean;
    readOnly: boolean;
  };
  immutable: {
    template: boolean;
  };
}): EventEditorMaintenanceOperation[] => {
  if (
    mode !== "EDIT"
    || !eventId
    || event.automatedScheduling !== true
    || !["LEAGUE", "TOURNAMENT"].includes(
      String(event.eventType ?? "").trim().toUpperCase(),
    )
    || capabilities.canEdit !== true
    || capabilities.readOnly !== false
    || immutable.template
  ) {
    return [];
  }

  if (scheduleState.matchCount === 0) {
    return ["BUILD"];
  }
  if ((scheduleState.matchDemand?.unplaced ?? 0) > 0) {
    return ["COMPLETE", "REBUILD"];
  }
  return ["REBUILD"];
};

const asDate = (value: unknown): Date | null => {
  const date =
    value instanceof Date ? new Date(value) : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizedCreateRevisionQuery = (
  query: EventEditorBootstrapQuery,
  event: Record<string, unknown>,
): Record<string, string | null> => {
  const stringValue = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const firstString = (value: unknown): string | null =>
    Array.isArray(value) ? stringValue(value[0]) : null;
  const eventType = stringValue(query.eventType)
    ?? stringValue(event.eventType)
    ?? "EVENT";
  const effectiveStart = asDate(query.start ?? event.start);
  return {
    organizationId: stringValue(query.organizationId) ?? stringValue(event.organizationId),
    eventType: eventType.toUpperCase(),
    sportId: stringValue(query.sportId) ?? firstString(event.sportIds),
    parentEventId: stringValue(query.parentEventId) ?? stringValue(event.parentEvent),
    templateId: stringValue(query.templateId) ?? stringValue(event.sourceTemplateId),
    rentalBookingId:
      stringValue(query.rentalBookingId) ?? stringValue(event.rentalBookingId),
    start: query.templateId ? null : effectiveStart?.toISOString() ?? null,
  };
};

const setNormalizedCreateRevisionSource = (
  event: Record<string, unknown>,
  source: Record<string, unknown>,
  query: EventEditorBootstrapQuery,
): Record<string, unknown> =>
  setCreateRevisionSource(event, {
    ...source,
    query: normalizedCreateRevisionQuery(query, event),
  });

const loadCreateSourceEvent = async (
  query: EventEditorBootstrapQuery,
  client: EditorSnapshotClient,
): Promise<Record<string, unknown>> => {
  let event = emptyEvent(query);
  const revisionSource: Record<string, unknown> = {
    query: { ...query },
  };

  if (
    query.templateId &&
    getModelDelegate(client, "eventTemplates")?.findUnique
  ) {
    const template = await callFindUnique(client, "eventTemplates", {
      where: { id: query.templateId },
    });
    if (template && !template.archivedAt) {
      const [resources, timeSlots, rentalHints, leagueScoringConfig] =
        await Promise.all([
          callFindMany(client, "eventTemplateResources", {
            where: { templateId: query.templateId },
            orderBy: { sortOrder: "asc" },
          }),
          callFindMany(client, "eventTemplateTimeSlots", {
            where: { templateId: query.templateId },
            orderBy: { sortOrder: "asc" },
          }),
          callFindMany(client, "eventTemplateRentalResourceHints", {
            where: { templateId: query.templateId },
          }),
          callFindUnique(client, "eventTemplateLeagueScoringConfigs", {
            where: { eventTemplateId: query.templateId },
          }),
        ]);
      revisionSource.template = {
        template,
        resources: canonicalizeSourceCollection(resources),
        timeSlots: canonicalizeSourceCollection(timeSlots),
        rentalHints: canonicalizeSourceCollection(rentalHints),
        leagueScoringConfig,
      };
      const seeded = buildSeedEventFromTemplate(
        {
          template,
          resources,
          timeSlots,
          rentalHints,
          leagueScoringConfig,
        } as any,
        {
          newEventId: "",
          newStartDate: asDate(query.start ?? event.start) ?? new Date(),
          hostId: "",
        },
      );
      event = {
        ...(seeded as unknown as Record<string, unknown>),
        id: "",
        organizationId: query.organizationId ?? seeded.organizationId ?? null,
        eventType: query.eventType ?? seeded.eventType,
        sportIds: query.sportId ? [query.sportId] : seeded.sportIds,
        sourceTemplateId: query.templateId,
      };
    }
  }

  if (!query.rentalBookingId) {
    return setNormalizedCreateRevisionSource(event, revisionSource, query);
  }

  const [booking, items] = await Promise.all([
    callFindUnique(client, "rentalBookings", {
      where: { id: query.rentalBookingId },
    }),
    callFindMany(client, "rentalBookingItems", {
      where: { bookingId: query.rentalBookingId },
      orderBy: { start: "asc" },
    }),
  ]);
  const rentalItems = items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
  if (!booking || !rentalItems.length) {
    throw new EditorImmutableFieldError("rentalBookingId", "The Rental Booking or its booked resources are missing. Select an available booking.");
  }
  const destinationOrganizationId = typeof booking.renterOrganizationId === "string"
    ? booking.renterOrganizationId : null;
  if (query.organizationId && query.organizationId !== destinationOrganizationId) {
    throw new EditorImmutableFieldError("organizationId", "The selected Organization conflicts with the Rental Booking owner. Use the booking's destination Organization.");
  }

  const fieldIds = Array.from(
    new Set(
      rentalItems
        .map((item) => item.fieldId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const storedFields = await callFindMany(client, "fields", {
    where: { id: { in: fieldIds } },
  });
  const fields = storedFields.filter(
    (field): field is Record<string, unknown> =>
      Boolean(field) && typeof field === "object",
  );
  const fieldById = new Map(
    fields.map((field) => [String(field.id ?? field.$id), field]),
  );
  if (fieldIds.some((id) => !fieldById.has(id))) {
    throw new EditorImmutableFieldError("fields", "A booked Resource is missing. Restore the Resource through the rental workflow.");
  }
  const timeSlots = rentalItems.map((item, index) => {
    const itemId = String(item.id ?? `rental-item-${index + 1}`);
    const fieldId = String(item.fieldId ?? "");
    const start = asDate(item.start) ?? new Date();
    const end = asDate(item.end) ?? start;
    const requiredTemplateIds = Array.isArray(item.requiredTemplateIds)
      ? item.requiredTemplateIds
      : [];
    const hostRequiredTemplateIds = Array.isArray(item.hostRequiredTemplateIds)
      ? item.hostRequiredTemplateIds
      : [];
    return {
      id: String(item.eventTimeSlotId ?? itemId),
      $id: String(item.eventTimeSlotId ?? itemId),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: typeof item.timeZone === "string" ? item.timeZone : "UTC",
      scheduledFieldId: fieldId,
      scheduledFieldIds: fieldId ? [fieldId] : [],
      sourceType: "RENTAL_BOOKING",
      rentalBookingId: query.rentalBookingId,
      rentalBookingItemId: itemId,
      rentalLocked: true,
      price: typeof item.priceCents === "number" ? item.priceCents : undefined,
      requiredTemplateIds,
      hostRequiredTemplateIds,
      field: fieldById.get(fieldId) ?? null,
    };
  });
  const starts = timeSlots
    .map((slot) => asDate(slot.startDate))
    .filter((date): date is Date => Boolean(date));
  const ends = timeSlots
    .map((slot) => asDate(slot.endDate))
    .filter((date): date is Date => Boolean(date));
  const requiredTemplateIds = Array.from(
    new Set(timeSlots.flatMap((slot) => slot.requiredTemplateIds)),
  );
  revisionSource.rental = {
    booking,
    items: canonicalizeSourceCollection(rentalItems),
    fields: canonicalizeSourceCollection(fields),
  };
  return setNormalizedCreateRevisionSource({
    ...event,
    organizationId: destinationOrganizationId,
    rentalBookingId: query.rentalBookingId,
    rentalBookingItemId: String(rentalItems[0].id ?? ""),
    start: (
      starts.sort((left, right) => left.getTime() - right.getTime())[0] ??
      new Date()
    ).toISOString(),
    end: (
      ends.sort((left, right) => right.getTime() - left.getTime())[0] ??
      new Date()
    ).toISOString(),
    noFixedEndDateTime: false,
    fieldIds,
    fields,
    timeSlotIds: timeSlots.map((slot) => slot.id),
    timeSlots,
    requiredTemplateIds,
  }, revisionSource, query);
};

const emptyEvent = (
  query: EventEditorBootstrapQuery = {},
): Record<string, unknown> => {
  const eventType = String(query.eventType ?? "EVENT").trim().toUpperCase();
  const start = (asDate(query.start) ?? new Date()).toISOString();
  const isOneTimeEvent = eventType === "EVENT" || eventType === "TRYOUT";
  const end = isOneTimeEvent
    ? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
    : null;
  return {
    id: "",
    name: "",
    description: "",
    eventType: query.eventType ?? "EVENT",
    sportIds: query.sportId ? [query.sportId] : [],
    start,
    end,
    scheduleEndConstraint: null,
    generatedScheduleEnd: null,
    noFixedEndDateTime: !isOneTimeEvent,
    isAutomatedScheduling: eventType === "LEAGUE" || eventType === "TOURNAMENT" || eventType === "WEEKLY_EVENT",
    location: "",
    address: "",
    coordinates: [0, 0],
    affiliateUrl: "",
    parentEvent: query.parentEventId ?? null,
    organizationId: query.organizationId ?? null,
    hostId: null,
    state: "UNPUBLISHED",
    price: 0,
    registrationPaymentMode: "FREE",
    taxHandling: "INHERIT_ORG",
    organizerManualTaxRateBps: 0,
    manualPaymentLinks: [],
    manualPaymentInstructions: null,
    allowPaymentPlans: false,
    installmentCount: null,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    teamSignup: false,
    singleDivision: eventType === "TRYOUT" ? false : true,
    registrationByDivisionType: false,
    teamSizeLimit: eventType === "TRYOUT" ? 0 : 2,
    minAge: null,
    maxAge: null,
    cancellationRefundHours: null,
    registrationCutoffHours: 0,
    allowTeamSplitDefault: false,
    waitListIds: [],
    freeAgentIds: [],
    divisions: [],
    divisionDetails: [],
    playoffDivisionDetails: [],
    divisionFieldIds: {},
    winnerSetCount: null,
    loserSetCount: null,
    doubleElimination: false,
    includePlayoffs: false,
    splitLeaguePlayoffDivisions: false,
    playoffTeamCount: null,
    pointsToVictory: [],
    usesSets: false,
    setsPerMatch: null,
    setDurationMinutes: null,
    restTimeMinutes: null,
    gamesPerOpponent: null,
    matchRulesOverride: null,
    leagueScoringConfig: null,
    fieldIds: [],
    fields: [],
    timeSlotIds: [],
    timeSlots: [],
    requiredTemplateIds: query.templateId ? [query.templateId] : [],
    immutableFieldIds: [],
    rentalBookingId: query.rentalBookingId ?? null,
    rentalBookingItemId: null,
    staffingPriority: "BEST_AVAILABLE_COVERAGE",
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    teamCheckInMode: "OFF",
    teamCheckInOpenMinutesBefore: 60,
    allowTemporaryMatchPlayers: false,
    autoCreatePointMatchIncidents: false,
    officialIds: [],
    officialPositions: [],
    eventOfficials: [],
    assistantHostIds: [],
    pendingStaffInvites: [],
    tags: [],
  };
};

export const buildEventEditorSnapshot = async (
  event: Record<string, unknown>,
  context: EventEditorSnapshotContext = {},
): Promise<EventEditorSnapshot> => {
  const client = context.client ?? prisma;
  const eventId =
    typeof event.id === "string" && event.id.trim().length > 0
      ? event.id
      : null;
  const mode = context.mode ?? (eventId ? "EDIT" : "CREATE");
  const createScheduleState = {
    sourceType: null,
    matchCount: 0,
    matchDemand: {
      total: 0,
      byDivision: {},
      byPhase: {},
      placed: 0,
      unplaced: 0,
    },
    availableMaintenanceOperations: [] as EventEditorMaintenanceOperation[],
    revision: "new",
    hasProtectedHistory: false,
  } as const;
  const [resources, loadedDivisions, scheduleState, hasJoinedParticipant] =
    await Promise.all([
      loadEventResources(client, event),
      loadEventDivisions(client, eventId),
      mode === "CREATE" || !eventId
        ? Promise.resolve(createScheduleState)
        : loadEventScheduleState(event, eventId, client),
      mode === "EDIT" && eventId
        ? hasJoinedEventParticipant(eventId, client)
        : Promise.resolve(false),
    ]);
  const inlineDivisions = [
    ...(Array.isArray(event.divisionDetails) ? event.divisionDetails : []),
    ...(Array.isArray(event.playoffDivisionDetails)
      ? event.playoffDivisionDetails
      : []),
  ].filter(
    (division): division is Record<string, unknown> =>
      Boolean(division) && typeof division === "object",
  );
  const divisions =
    loadedDivisions.length > 0 ? loadedDivisions : inlineDivisions;
  const loadedDivisionDetails = divisions
    .map(divisionDetailFor)
    .filter((division) => division.id.length > 0);
  const internalDivisionDetails = normalizeTournamentEditorDivisions(
    event,
    loadedDivisionDetails,
  );
  const divisionDetails = internalDivisionDetails.map(
    ({ isSystemGenerated, ...division }) => ({
      ...division,
      ...(isSystemGenerated === false ? { isSystemGenerated: false } : {}),
    }),
  );
  const rentalSlots = resources.timeSlots.filter(
    (slot) =>
      slot &&
      typeof slot === "object" &&
      (Boolean((slot as Record<string, unknown>).rentalLocked) ||
        typeof (slot as Record<string, unknown>).rentalBookingId === "string" ||
        typeof (slot as Record<string, unknown>).rentalBookingItemId ===
          "string"),
  ) as Array<Record<string, unknown>>;
  const rentalBookingId =
    typeof event.rentalBookingId === "string"
      ? event.rentalBookingId
      : typeof context.query?.rentalBookingId === "string"
        ? context.query.rentalBookingId
        : (rentalSlots.find((slot) => typeof slot.rentalBookingId === "string")
            ?.rentalBookingId ?? null);
  const rentalBookingItemId =
    typeof event.rentalBookingItemId === "string"
      ? event.rentalBookingItemId
      : (rentalSlots.find(
          (slot) => typeof slot.rentalBookingItemId === "string",
        )?.rentalBookingItemId ?? null);
  const inlineDivisionIds = Array.isArray(event.divisions)
    ? event.divisions.filter((id): id is string => typeof id === "string")
    : [];
  const inlineDivisionFieldIds =
    event.divisionFieldIds && typeof event.divisionFieldIds === "object"
      ? event.divisionFieldIds
      : {};
  const eventWithResources = {
    ...event,
    isAutomatedScheduling:
      typeof event.isAutomatedScheduling === "boolean"
        ? event.isAutomatedScheduling
        : event.automatedScheduling,
    ...resources,
    immutableFieldIds: Array.from(new Set([
      ...(Array.isArray(event.immutableFieldIds) ? event.immutableFieldIds : []),
      ...rentalSlots.flatMap((slot) => Array.isArray(slot.scheduledFieldIds)
        ? slot.scheduledFieldIds : typeof slot.scheduledFieldId === "string" ? [slot.scheduledFieldId] : []),
    ])),
    divisions: divisionDetails.length
      ? divisionDetails
          .filter((division) => division.kind === "LEAGUE")
          .map((division) => division.id)
      : inlineDivisionIds,
    divisionDetails: divisionDetails.filter(
      (division) => division.kind === "LEAGUE",
    ),
    playoffDivisionDetails: divisionDetails.filter(
      (division) => division.kind === "PLAYOFF",
    ),
    divisionFieldIds: divisionDetails.length
      ? Object.fromEntries(
          divisionDetails.map((division) => [division.id, division.fieldIds]),
        )
      : inlineDivisionFieldIds,
    rentalBookingId,
    rentalBookingItemId,
  };
  const questions = eventId
    ? await listRegistrationQuestions({
        scopeType: "EVENT",
        scopeId: eventId,
        client,
      })
    : [];
  const capabilities = await loadCapability(
    client,
    eventWithResources,
    context.actor,
    mode,
  );
  const staff =
    eventId && capabilities.canManageStaff
      ? await loadEventStaffSnapshot(client, eventId)
      : null;
  const catalogs = await loadCatalogs(
    client,
    eventWithResources,
    context.query,
  );
  const draft = legacyEventToEditorDraft(
    eventWithResources as unknown as Event,
    questions,
  );
  if (staff) {
    const staffDraft = legacyEventToEditorDraft(
      {
        ...eventWithResources,
        assistantHostIds: staff.assistantHostIds,
        officialPositions: staff.officialPositions,
        eventOfficials: staff.eventOfficials,
        officialIds: staff.officialIds,
        pendingStaffInvites: staff.staffInvites,
      } as unknown as Event,
      questions,
    );
    draft.staff = staffDraft.staff;
  }
  const immutableFieldNames = new Set(
    Array.isArray(event.immutableFieldNames)
      ? event.immutableFieldNames.filter(
          (fieldName): fieldName is string => typeof fieldName === "string",
        )
      : [],
  );
  if (hasJoinedParticipant) {
    immutableFieldNames.add("eventType");
    immutableFieldNames.add("teamSignup");
  }
  if (scheduleState.hasProtectedHistory) {
    immutableFieldNames.add("eventType");
  }
  if (mode === "EDIT" && !capabilities.canDelegateHost) {
    immutableFieldNames.add("hostId");
  }
  const immutable = {
    fieldNames: Array.from(immutableFieldNames).sort(),
    rental: Boolean(rentalBookingId || rentalSlots.length > 0),
    template:
      String(event.state ?? "").toUpperCase() === "TEMPLATE" ||
      Boolean(context.query?.templateId),
  };
  const availableMaintenanceOperations =
    maintenanceOperationsFor({
      event,
      eventId,
      mode,
      scheduleState,
      capabilities,
      immutable,
    });
  const createSource =
    mode === "CREATE"
      ? {
          revisionSource:
            Reflect.get(event, CREATE_REVISION_SOURCE) ?? {
              query: context.query ?? {},
              sourceEvent: event,
            },
          immutable,
        }
      : { draft, immutable };
  const revision =
    mode === "CREATE"
      ? editorRevisionFor({ source: "CREATE_EDITOR", ...createSource })
      : editorRevisionFor({ draft });
  const resolvedScheduleState =
    mode === "CREATE"
      ? {
          ...scheduleState,
          availableMaintenanceOperations: [] as EventEditorMaintenanceOperation[],
          revision: editorRevisionFor({
            source: "CREATE_SCHEDULE",
            ...createSource,
          }),
        }
      : {
          ...scheduleState,
          availableMaintenanceOperations,
        };
  const snapshot = {
    contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
    mode,
    eventId,
    editorRevision: revision,
    staffRevision: staff?.revision ?? null,
    draft,
    capabilities,
    catalogs,
    immutable,
    scheduleState: resolvedScheduleState,
    provenance: {
      sourceType: typeof event.sourceType === "string" ? event.sourceType : null,
      sourceId: typeof event.sourceId === "string" ? event.sourceId : null,
      sourceUrl: typeof event.sourceUrl === "string" ? event.sourceUrl : null,
    },
  };
  return parseEventEditorSnapshot(snapshot);
};

export const loadEventEditorSnapshot = async (
  eventId: string,
  context: EventEditorSnapshotContext = {},
): Promise<EventEditorSnapshot> => {
  const client = context.client ?? prisma;
  const event = await client.events.findUnique({ where: { id: eventId } });
  if (!event)
    throw Object.assign(new Error("Event not found."), {
      code: "EDITOR_NOT_FOUND",
    });
  return buildEventEditorSnapshot(event as unknown as Record<string, unknown>, {
    ...context,
    mode: "EDIT",
  });
};
export const loadCreateEventEditorSnapshot = async (
  query: EventEditorBootstrapQuery = {},
  context: Omit<EventEditorSnapshotContext, "mode" | "query"> = {},
): Promise<EventEditorSnapshot> => {
  const client = context.client ?? prisma;
  const event = await loadCreateSourceEvent(query, client);
  return buildEventEditorSnapshot(event, {
    ...context,
    mode: "CREATE",
    query,
  });
};

export const editorRevisionForSnapshot = editorRevisionFor;
export const computeEventEditorRevision = (
  snapshotOwnedState: unknown,
): string => editorRevisionFor(snapshotOwnedState);

export const loadExistingEventEditorSnapshot = async (
  eventId: string,
  actor: EditorActor,
  client?: EditorSnapshotClient,
): Promise<EventEditorSnapshot> =>
  loadEventEditorSnapshot(eventId, { actor, client });
