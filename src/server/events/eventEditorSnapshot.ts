import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import type { Event } from '@/types';
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  parseEventEditorSnapshot,
  type EventEditorBootstrapQuery,
  type EventEditorDraft,
  type EventEditorSnapshot,
} from '@/contracts/eventEditor';
import { legacyEventToEditorDraft } from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import { loadEventStaffSnapshot } from './eventStaffReconciliation';
import { listRegistrationQuestions } from '@/server/registrationQuestions';
import { buildEventDraftFromTemplate } from '@/server/eventTemplates';

export type EditorActor = {
  userId: string;
  isAdmin?: boolean;
};

export type EditorSnapshotClient = Prisma.TransactionClient | typeof prisma;

export type EventEditorSnapshotContext = {
  client?: EditorSnapshotClient;
  actor?: EditorActor | null;
  mode?: 'CREATE' | 'EDIT';
  query?: EventEditorBootstrapQuery;
};
type ModelDelegate = {
  findMany?: (args: Record<string, unknown>) => Promise<unknown>;
  findFirst?: (args: Record<string, unknown>) => Promise<unknown>;
  findUnique?: (args: Record<string, unknown>) => Promise<unknown>;
};

const getModelDelegate = (client: EditorSnapshotClient, model: string): ModelDelegate | null => {
  const candidate = (client as unknown as Record<string, unknown>)[model];
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as ModelDelegate;
};

const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, jsonSafe(child)]));
  }
  return value;
};

const editorRevisionFor = (input: unknown): string => crypto
  .createHash('sha256')
  .update(JSON.stringify(jsonSafe(input)))
  .digest('hex');

const callFindMany = async (client: EditorSnapshotClient, model: string, args: Record<string, unknown>): Promise<unknown[]> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findMany !== 'function') return [];
  const rows = await delegate.findMany(args);
  return Array.isArray(rows) ? rows : [];
};

const callFindFirst = async (client: EditorSnapshotClient, model: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findFirst !== 'function') return null;
  const row = await delegate.findFirst(args);
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
};

const callFindUnique = async (client: EditorSnapshotClient, model: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
  const delegate = getModelDelegate(client, model);
  if (typeof delegate?.findUnique !== 'function') return null;
  const row = await delegate.findUnique(args);
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
};
const canonicalReadRow = (row: Record<string, unknown>): Record<string, unknown> => {
  const id = typeof row.id === 'string'
    ? row.id
    : typeof row.$id === 'string'
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
): Record<string, unknown> => canonicalReadRow(Object.fromEntries(
  keys
    .filter((key) => key in row)
    .map((key) => [key, jsonSafe(row[key])]),
));

const EDITOR_FIELD_KEYS = [
  'id', '$id', 'name', 'location', 'address', 'lat', 'long', 'heading', 'inUse',
  'rentalSlotIds', 'sportIds', 'createdBy', 'archivedAt', 'archivedByUserId',
  'archiveReason', 'organizationId', 'facilityId', 'latitude', 'longitude',
] as const;

const EDITOR_TIME_SLOT_KEYS = [
  'id', '$id', 'eventId', 'archivedAt', 'archivedByUserId', 'archiveReason',
  'dayOfWeek', 'daysOfWeek', 'startTimeMinutes', 'endTimeMinutes', 'startDate',
  'endDate', 'start', 'end', 'timeZone', 'scheduledFieldId', 'scheduledFieldIds',
  'fieldId', 'fieldIds', 'division', 'divisions', 'divisionKeys', 'requiredTemplateIds',
  'hostRequiredTemplateIds', 'repeating', 'price', 'taxHandling', 'sourceType',
  'rentalBookingId', 'rentalBookingItemId', 'rentalLocked',
] as const;
const loadEventResources = async (client: EditorSnapshotClient, event: Record<string, unknown>) => {
  const fieldIds = Array.isArray(event.fieldIds) ? event.fieldIds.filter((id: unknown): id is string => typeof id === 'string') : [];
  const timeSlotIds = Array.isArray(event.timeSlotIds) ? event.timeSlotIds.filter((id: unknown): id is string => typeof id === 'string') : [];
  const [fields, timeSlots] = await Promise.all([
    fieldIds.length
      ? callFindMany(client, 'fields', { where: { id: { in: fieldIds } } })
      : Promise.resolve([]),
    timeSlotIds.length
      ? callFindMany(client, 'timeSlots', { where: { id: { in: timeSlotIds } } })
      : Promise.resolve([]),
  ]);
  const inlineFields = Array.isArray(event.fields) ? event.fields : [];
  const inlineTimeSlots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  const toReadRows = (rows: unknown[], keys: readonly string[]): Record<string, unknown>[] => rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => projectReadRow(row, keys));
  return {
    fields: toReadRows(fields.length ? fields : inlineFields, EDITOR_FIELD_KEYS),
    timeSlots: toReadRows(timeSlots.length ? timeSlots : inlineTimeSlots, EDITOR_TIME_SLOT_KEYS),
  };
};
const EDITOR_DIVISION_KEYS = [
  'id', 'name', 'key', 'kind', 'sortOrder', 'sourceDivisionId', 'price',
  'maxParticipants', 'playoffTeamCount', 'playoffPlacementDivisionIds',
  'standingsOverrides', 'phaseSettings', 'gamesPerOpponent', 'restTimeMinutes',
  'usesSets', 'matchDurationMinutes', 'setDurationMinutes', 'setsPerMatch',
  'playoffDoubleElimination', 'playoffWinnerSetCount', 'playoffLoserSetCount',
  'playoffWinnerBracketPointsToVictory', 'playoffLoserBracketPointsToVictory',
  'playoffPrize', 'playoffFieldCount', 'playoffRestTimeMinutes',
  'playoffMatchDurationMinutes', 'playoffSetDurationMinutes',
  'pointsToVictory', 'standingsConfirmedAt', 'standingsConfirmedBy',
  'allowPaymentPlans', 'installmentCount',
  'installmentDueDates', 'installmentDueRelativeDays', 'installmentAmounts',
  'divisionTypeId', 'skillDivisionTypeId', 'ageDivisionTypeId', 'ratingType',
  'gender', 'ageCutoffDate', 'ageCutoffLabel', 'ageCutoffSource', 'fieldIds',
  'teamIds',
] as const;

const loadEventDivisions = async (client: EditorSnapshotClient, eventId: string | null) => {
  if (!eventId) return [];
  const rows = await callFindMany(client, 'divisions', {
    where: { eventId, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => projectReadRow(row, EDITOR_DIVISION_KEYS));
};

const numericStandingsOverridesFor = (row: Record<string, unknown>): Record<string, number> | null => {
  if (!row.standingsOverrides || typeof row.standingsOverrides !== 'object' || Array.isArray(row.standingsOverrides)) {
    return null;
  }
  const entries = Object.entries(row.standingsOverrides as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value));
  return entries.length > 0
    ? Object.fromEntries(entries) as Record<string, number>
    : null;
};

const playoffConfigFor = (row: Record<string, unknown>): Record<string, unknown> | null => {
  const explicit = row.playoffConfig;
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    return explicit as Record<string, unknown>;
  }
  if (row.kind === 'PLAYOFF' && row.standingsOverrides && typeof row.standingsOverrides === 'object' && !Array.isArray(row.standingsOverrides)) {
    return row.standingsOverrides as Record<string, unknown>;
  }
  const persistedFields: Record<string, string> = {
    doubleElimination: 'playoffDoubleElimination',
    winnerSetCount: 'playoffWinnerSetCount',
    loserSetCount: 'playoffLoserSetCount',
    winnerBracketPointsToVictory: 'playoffWinnerBracketPointsToVictory',
    loserBracketPointsToVictory: 'playoffLoserBracketPointsToVictory',
    prize: 'playoffPrize',
    fieldCount: 'playoffFieldCount',
    restTimeMinutes: 'playoffRestTimeMinutes',
    matchDurationMinutes: 'playoffMatchDurationMinutes',
    setDurationMinutes: 'playoffSetDurationMinutes',
  };
  const config = Object.fromEntries(
    Object.entries(persistedFields)
      .filter(([, sourceKey]) => row[sourceKey] !== undefined && row[sourceKey] !== null)
      .map(([key, sourceKey]) => [key, row[sourceKey]]),
  );
  return Object.keys(config).length > 0 ? config : null;
};

const divisionDetailFor = (row: Record<string, unknown>, index: number) => ({
  id: String(row.id ?? row.$id ?? ''),
  sourceDivisionId: typeof row.sourceDivisionId === 'string' ? row.sourceDivisionId : null,
  key: typeof row.key === 'string' && row.key.length > 0 ? row.key : `division-${index + 1}`,
  name: typeof row.name === 'string' ? row.name : `Division ${index + 1}`,
  kind: row.kind === 'PLAYOFF' ? 'PLAYOFF' as const : 'LEAGUE' as const,
  poolPlay: Boolean((row.phaseSettings as Record<string, unknown> | null)?.poolPlay),
  divisionTypeId: typeof row.divisionTypeId === 'string' ? row.divisionTypeId : '',
  skillDivisionTypeId: typeof row.skillDivisionTypeId === 'string' ? row.skillDivisionTypeId : '',
  ageDivisionTypeId: typeof row.ageDivisionTypeId === 'string' ? row.ageDivisionTypeId : '',
  divisionTypeName: '',
  ratingType: typeof row.ratingType === 'string' ? row.ratingType : '',
  gender: typeof row.gender === 'string' ? row.gender : undefined,
  price: typeof row.price === 'number' ? row.price : null,
  maxParticipants: typeof row.maxParticipants === 'number' ? row.maxParticipants : null,
  playoffTeamCount: typeof row.playoffTeamCount === 'number' ? row.playoffTeamCount : null,
  phaseSettings: row.phaseSettings && typeof row.phaseSettings === 'object' ? row.phaseSettings : {},
  playoffPlacementDivisionIds: Array.isArray(row.playoffPlacementDivisionIds) ? row.playoffPlacementDivisionIds : [],
  standingsOverrides: row.kind === 'PLAYOFF' ? null : numericStandingsOverridesFor(row),
  playoffConfig: playoffConfigFor(row),
  gamesPerOpponent: typeof row.gamesPerOpponent === 'number' ? row.gamesPerOpponent : null,
  restTimeMinutes: typeof row.restTimeMinutes === 'number' ? row.restTimeMinutes : null,
  usesSets: typeof row.usesSets === 'boolean' ? row.usesSets : null,
  matchDurationMinutes: typeof row.matchDurationMinutes === 'number' ? row.matchDurationMinutes : null,
  setDurationMinutes: typeof row.setDurationMinutes === 'number' ? row.setDurationMinutes : null,
  setsPerMatch: typeof row.setsPerMatch === 'number' ? row.setsPerMatch : null,
  pointsToVictory: Array.isArray(row.pointsToVictory) ? row.pointsToVictory : [],
  standingsConfirmedAt: row.standingsConfirmedAt ?? null,
  standingsConfirmedBy: typeof row.standingsConfirmedBy === 'string' ? row.standingsConfirmedBy : null,
  allowPaymentPlans: typeof row.allowPaymentPlans === 'boolean' ? row.allowPaymentPlans : null,
  installmentCount: typeof row.installmentCount === 'number' ? row.installmentCount : null,
  installmentDueDates: Array.isArray(row.installmentDueDates) ? row.installmentDueDates : [],
  installmentDueRelativeDays: Array.isArray(row.installmentDueRelativeDays) ? row.installmentDueRelativeDays : [],
  installmentAmounts: Array.isArray(row.installmentAmounts) ? row.installmentAmounts : [],
  ageCutoffDate: row.ageCutoffDate ?? null,
  ageCutoffLabel: typeof row.ageCutoffLabel === 'string' ? row.ageCutoffLabel : null,
  ageCutoffSource: typeof row.ageCutoffSource === 'string' ? row.ageCutoffSource : null,
  fieldIds: Array.isArray(row.fieldIds) ? row.fieldIds : [],
  teamIds: Array.isArray(row.teamIds) ? row.teamIds : [],
});
const loadCatalogs = async (client: EditorSnapshotClient, event: Record<string, unknown>, query?: EventEditorBootstrapQuery) => {
  const sportIds = Array.isArray(event.sportIds) ? event.sportIds : query?.sportId ? [query.sportId] : [];
  const organizationId = typeof event.organizationId === 'string' ? event.organizationId : query?.organizationId;
  const [sports, organizations, templates] = await Promise.all([
    sportIds.length ? callFindMany(client, 'sports', { where: { id: { in: sportIds } } }) : Promise.resolve([]),
    organizationId ? callFindMany(client, 'organizations', { where: { id: organizationId } }) : Promise.resolve([]),
    callFindMany(client, 'eventTemplates', { where: { organizationId: organizationId ?? undefined } }),
  ]);
  const fields = await callFindMany(client, 'fields', {
    where: organizationId ? { organizationId } : { id: { in: [] } },
  });
  const toRecords = (rows: unknown[]): Record<string, unknown>[] => rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map(canonicalReadRow);
  return {
    sports: toRecords(sports),
    organizations: toRecords(organizations),
    fields: toRecords(fields),
    templates: toRecords(templates),
  };
};

const loadCapability = async (client: EditorSnapshotClient, event: Record<string, unknown>, actor?: EditorActor | null) => {
  const organizationId = typeof event.organizationId === 'string' ? event.organizationId : null;
  let canUseOnlinePayments = false;
  if (organizationId) {
    const account = await callFindFirst(client, 'stripeAccounts', {
      where: { organizationId, accountId: { not: null } },
      select: { accountId: true },
    });
    canUseOnlinePayments = Boolean(account?.accountId);
  }
  const organization = event.organization && typeof event.organization === 'object'
    ? event.organization as Record<string, unknown>
    : null;
  if (!canUseOnlinePayments) canUseOnlinePayments = organization?.hasStripeAccount === true;
  return {
    canUseOnlinePayments,
    canManageStaff: Boolean(actor?.userId),
    canEdit: Boolean(actor?.userId),
    supportsTeamStaffing: ['LEAGUE', 'TOURNAMENT', 'EVENT'].includes(String(event.eventType ?? '').toUpperCase()),
  };
};

const asDate = (value: unknown): Date | null => {
  const date = value instanceof Date ? new Date(value) : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
};

const loadCreateSourceEvent = async (
  query: EventEditorBootstrapQuery,
  client: EditorSnapshotClient,
): Promise<Record<string, unknown>> => {
  let event = emptyEvent(query);

  if (query.templateId && getModelDelegate(client, 'eventTemplates')?.findUnique) {
    const template = await callFindUnique(client, 'eventTemplates', { where: { id: query.templateId } });
    if (template && !template.archivedAt) {
      const [resources, timeSlots, rentalHints, leagueScoringConfig] = await Promise.all([
        callFindMany(client, 'eventTemplateResources', { where: { templateId: query.templateId }, orderBy: { sortOrder: 'asc' } }),
        callFindMany(client, 'eventTemplateTimeSlots', { where: { templateId: query.templateId }, orderBy: { sortOrder: 'asc' } }),
        callFindMany(client, 'eventTemplateRentalResourceHints', { where: { templateId: query.templateId } }),
        callFindUnique(client, 'eventTemplateLeagueScoringConfigs', { where: { eventTemplateId: query.templateId } }),
      ]);
      const seeded = buildEventDraftFromTemplate({
        template,
        resources,
        timeSlots,
        rentalHints,
        leagueScoringConfig,
      } as any, {
        newEventId: '',
        newStartDate: asDate(query.start ?? event.start) ?? new Date(),
        hostId: '',
      });
      event = {
        ...(seeded as unknown as Record<string, unknown>),
        id: '',
        organizationId: seeded.organizationId ?? query.organizationId ?? null,
        requiredTemplateIds: [query.templateId],
      };
    }
  }

  if (!query.rentalBookingId) return event;

  const [booking, items] = await Promise.all([
    callFindUnique(client, 'rentalBookings', { where: { id: query.rentalBookingId } }),
    callFindMany(client, 'rentalBookingItems', {
      where: { bookingId: query.rentalBookingId },
      orderBy: { start: 'asc' },
    }),
  ]);
  const rentalItems = items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  if (!rentalItems.length) {
    return { ...event, rentalBookingId: query.rentalBookingId };
  }

  const fieldIds = Array.from(new Set(rentalItems
    .map((item) => item.fieldId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)));
  const storedFields = await callFindMany(client, 'fields', { where: { id: { in: fieldIds } } });
  const fields = (storedFields.length ? storedFields : fieldIds.map((id) => ({ id, $id: id, name: '' })))
    .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === 'object');
  const fieldById = new Map(fields.map((field) => [String(field.id ?? field.$id), field]));
  const timeSlots = rentalItems.map((item, index) => {
    const itemId = String(item.id ?? `rental-item-${index + 1}`);
    const fieldId = String(item.fieldId ?? '');
    const start = asDate(item.start) ?? new Date();
    const end = asDate(item.end) ?? start;
    const requiredTemplateIds = Array.isArray(item.requiredTemplateIds) ? item.requiredTemplateIds : [];
    const hostRequiredTemplateIds = Array.isArray(item.hostRequiredTemplateIds) ? item.hostRequiredTemplateIds : [];
    return {
      id: String(item.eventTimeSlotId ?? itemId),
      $id: String(item.eventTimeSlotId ?? itemId),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: typeof item.timeZone === 'string' ? item.timeZone : 'UTC',
      scheduledFieldId: fieldId,
      scheduledFieldIds: fieldId ? [fieldId] : [],
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: query.rentalBookingId,
      rentalBookingItemId: itemId,
      rentalLocked: true,
      price: typeof item.priceCents === 'number' ? item.priceCents : undefined,
      requiredTemplateIds,
      hostRequiredTemplateIds,
      field: fieldById.get(fieldId) ?? null,
    };
  });
  const starts = timeSlots.map((slot) => asDate(slot.startDate)).filter((date): date is Date => Boolean(date));
  const ends = timeSlots.map((slot) => asDate(slot.endDate)).filter((date): date is Date => Boolean(date));
  const requiredTemplateIds = Array.from(new Set(timeSlots.flatMap((slot) => slot.requiredTemplateIds)));
  return {
    ...event,
    organizationId: booking?.organizationId ?? event.organizationId ?? query.organizationId ?? null,
    rentalBookingId: query.rentalBookingId,
    rentalBookingItemId: String(rentalItems[0].id ?? ''),
    start: (starts.sort((left, right) => left.getTime() - right.getTime())[0] ?? new Date()).toISOString(),
    end: (ends.sort((left, right) => right.getTime() - left.getTime())[0] ?? new Date()).toISOString(),
    noFixedEndDateTime: false,
    fieldIds,
    fields,
    timeSlotIds: timeSlots.map((slot) => slot.id),
    timeSlots,
    requiredTemplateIds,
  };
};

const emptyEvent = (query: EventEditorBootstrapQuery = {}): Record<string, unknown> => ({
  id: '',
  name: '',
  description: '',
  eventType: query.eventType ?? 'EVENT',
  sportIds: query.sportId ? [query.sportId] : [],
  start: query.start ?? new Date().toISOString(),
  end: null,
  scheduleEndConstraint: null,
  generatedScheduleEnd: null,
  noFixedEndDateTime: true,
  location: '',
  address: '',
  coordinates: [0, 0],
  affiliateUrl: '',
  parentEvent: query.parentEventId ?? null,
  organizationId: query.organizationId ?? null,
  hostId: null,
  state: 'UNPUBLISHED',
  price: 0,
  registrationPaymentMode: 'FREE',
  taxHandling: 'INHERIT_ORG',
  organizerManualTaxRateBps: 0,
  manualPaymentLinks: [],
  manualPaymentInstructions: null,
  allowPaymentPlans: false,
  installmentCount: null,
  installmentDueDates: [],
  installmentDueRelativeDays: [],
  installmentAmounts: [],
  teamSignup: false,
  singleDivision: true,
  registrationByDivisionType: false,
  teamSizeLimit: 2,
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
  winnerBracketPointsToVictory: [],
  loserBracketPointsToVictory: [],
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
  officialSchedulingMode: 'SCHEDULE',
  teamOfficialsMaySwap: false,
  teamCheckInMode: 'OFF',
  teamCheckInOpenMinutesBefore: 60,
  allowTemporaryMatchPlayers: false,
  autoCreatePointMatchIncidents: false,
  officialIds: [],
  officialPositions: [],
  eventOfficials: [],
  assistantHostIds: [],
  pendingStaffInvites: [],
  tags: [],
});

export const buildEventEditorSnapshot = async (
  event: Record<string, unknown>,
  context: EventEditorSnapshotContext = {},
): Promise<EventEditorSnapshot> => {
  const client = context.client ?? prisma;
  const eventId = typeof event.id === 'string' && event.id.trim().length > 0 ? event.id : null;
  const mode = context.mode ?? (eventId ? 'EDIT' : 'CREATE');
  const [resources, loadedDivisions] = await Promise.all([
    loadEventResources(client, event),
    loadEventDivisions(client, eventId),
  ]);
  const inlineDivisions = [
    ...(Array.isArray(event.divisionDetails) ? event.divisionDetails : []),
    ...(Array.isArray(event.playoffDivisionDetails) ? event.playoffDivisionDetails : []),
  ].filter((division): division is Record<string, unknown> => Boolean(division) && typeof division === 'object');
  const divisions = loadedDivisions.length > 0
    ? loadedDivisions
    : inlineDivisions;
  const divisionDetails = divisions
    .map(divisionDetailFor)
    .filter((division) => division.id.length > 0);
  const rentalSlots = resources.timeSlots.filter((slot) => (
    slot && typeof slot === 'object' && (
      Boolean((slot as Record<string, unknown>).rentalLocked)
      || typeof (slot as Record<string, unknown>).rentalBookingId === 'string'
      || typeof (slot as Record<string, unknown>).rentalBookingItemId === 'string'
    )
  )) as Array<Record<string, unknown>>;
  const rentalBookingId = typeof event.rentalBookingId === 'string'
    ? event.rentalBookingId
    : typeof context.query?.rentalBookingId === 'string'
      ? context.query.rentalBookingId
      : rentalSlots.find((slot) => typeof slot.rentalBookingId === 'string')?.rentalBookingId ?? null;
  const rentalBookingItemId = typeof event.rentalBookingItemId === 'string'
    ? event.rentalBookingItemId
    : rentalSlots.find((slot) => typeof slot.rentalBookingItemId === 'string')?.rentalBookingItemId ?? null;
  const inlineDivisionIds = Array.isArray(event.divisions)
    ? event.divisions.filter((id): id is string => typeof id === 'string')
    : [];
  const inlineDivisionFieldIds = event.divisionFieldIds && typeof event.divisionFieldIds === 'object'
    ? event.divisionFieldIds
    : {};
  const eventWithResources = {
    ...event,
    ...resources,
    divisions: divisionDetails.length
      ? divisionDetails.filter((division) => division.kind === 'LEAGUE').map((division) => division.id)
      : inlineDivisionIds,
    divisionDetails: divisionDetails.filter((division) => division.kind === 'LEAGUE'),
    playoffDivisionDetails: divisionDetails.filter((division) => division.kind === 'PLAYOFF'),
    divisionFieldIds: divisionDetails.length
      ? Object.fromEntries(divisionDetails.map((division) => [division.id, division.fieldIds]))
      : inlineDivisionFieldIds,
    rentalBookingId,
    rentalBookingItemId,
  };
  const questions = eventId
    ? await listRegistrationQuestions({ scopeType: 'EVENT', scopeId: eventId, client })
    : [];
  const staff = eventId
    ? await loadEventStaffSnapshot(client, eventId)
    : null;
  const catalogs = await loadCatalogs(client, eventWithResources, context.query);
  const capabilities = await loadCapability(client, eventWithResources, context.actor);
  const draft = legacyEventToEditorDraft(eventWithResources as unknown as Event, questions);
  if (staff) {
    draft.staff = {
      ...draft.staff,
      assistantHostIds: staff.assistantHostIds,
      officialPositions: staff.officialPositions,
      eventOfficials: staff.eventOfficials,
      officialIds: staff.officialIds,
      pendingInvites: staff.staffInvites,
    };
  }
  const revision = mode === 'CREATE'
    ? 'new'
    : editorRevisionFor({ draft });
  const snapshot = {
    contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
    mode,
    eventId,
    editorRevision: revision,
    staffRevision: staff?.revision ?? null,
    draft,
    capabilities,
    catalogs,
    immutable: {
      fieldNames: Array.isArray(event.immutableFieldNames) ? event.immutableFieldNames : [],
      rental: Boolean(rentalBookingId || rentalSlots.length > 0),
      template: String(event.state ?? '').toUpperCase() === 'TEMPLATE' || Boolean(context.query?.templateId),
    },
  };
  return parseEventEditorSnapshot(snapshot);
};

export const loadEventEditorSnapshot = async (eventId: string, context: EventEditorSnapshotContext = {}): Promise<EventEditorSnapshot> => {
  const client = context.client ?? prisma;
  const event = await client.events.findUnique({ where: { id: eventId } });
  if (!event) throw Object.assign(new Error('Event not found.'), { code: 'EDITOR_NOT_FOUND' });
  return buildEventEditorSnapshot(event as unknown as Record<string, unknown>, { ...context, mode: 'EDIT' });
};
export const loadCreateEventEditorSnapshot = async (
  query: EventEditorBootstrapQuery = {},
  context: Omit<EventEditorSnapshotContext, 'mode' | 'query'> = {},
): Promise<EventEditorSnapshot> => {
  const client = context.client ?? prisma;
  const event = await loadCreateSourceEvent(query, client);
  return buildEventEditorSnapshot(event, {
    ...context,
    mode: 'CREATE',
    query,
  });
};

export const editorRevisionForSnapshot = editorRevisionFor;
export const computeEventEditorRevision = (snapshotOwnedState: unknown): string => editorRevisionFor(snapshotOwnedState);

export const loadExistingEventEditorSnapshot = async (
  eventId: string,
  actor: EditorActor,
  client?: EditorSnapshotClient,
): Promise<EventEditorSnapshot> => loadEventEditorSnapshot(eventId, { actor, client });
