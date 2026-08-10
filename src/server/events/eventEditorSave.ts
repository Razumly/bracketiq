import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';
import { acquireEventLock } from '@/server/repositories/locks';
import { upsertEventFromPayload } from '@/server/repositories/events';
import { hasOrgPermission, canManageEvent } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import {
  EVENT_STAFF_CONTRACT_VERSION,
  reconcileEventStaffDesiredState,
  type EventStaffPutInput,
} from './eventStaffReconciliation';
import {
  buildEventEditorSnapshot,
  loadCreateEventEditorSnapshot,
  loadEventEditorSnapshot,
  type EditorActor,
  type EditorSnapshotClient,
} from './eventEditorSnapshot';
import { editorDraftToLegacyEvent } from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import {
  claimEventEditorCreateOperation,
  completeEventEditorCreateOperation,
  eventEditorCreateRequestHash,
  waitForEventEditorCreateOperation,
  type EventCreateOperationClaim,
} from './eventCreateOperationReplay';
import { resolveMatchTimingPolicy } from '@/server/scheduler/matchTimingPolicy';
import {
  type CreateEventEditorCommand,
  type EventEditorBootstrapQuery,
  type EventEditorDraft,
  type EventEditorSaveResult,
  type EventEditorSnapshot,
  type SaveEventEditorCommand,
} from '@/contracts/eventEditor';
export class EditorPermissionError extends Error {
  constructor(message = 'You do not have permission to edit this event.') {
    super(message);
    this.name = 'EditorPermissionError';
  }
}

export class EditorRevisionConflictError extends Error {
  readonly currentEditorRevision: string;
  readonly currentStaffRevision: string | null;

  constructor(editorRevision: string, staffRevision: string | null) {
    super('Event editor data changed. Reload and try again.');
    this.name = 'EditorRevisionConflictError';
    this.currentEditorRevision = editorRevision;
    this.currentStaffRevision = staffRevision;
  }
}

export class EditorImmutableFieldError extends Error {
  readonly fieldName: string;

  constructor(fieldName: string) {
    super(`Immutable field ${fieldName} cannot be updated.`);
    this.name = 'EditorImmutableFieldError';
    this.fieldName = fieldName;
  }
}

export class EditorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorInputError';
  }
}

export class EditorCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorCapabilityError';
  }
}

export type EditorSaveOptions = {
  client?: EditorSnapshotClient;
  sendStaffInvites?: (candidates: unknown[], eventId: string) => Promise<'NOT_REQUESTED' | 'QUEUED' | 'FAILED'>;
  onEventCreated?: (eventId: string, draft: EventEditorDraft) => Promise<void>;
};

type QuestionRow = {
  id: string;
};

const staffInputFor = (draft: EventEditorDraft, revision: string): EventStaffPutInput => ({
  contractVersion: EVENT_STAFF_CONTRACT_VERSION,
  expectedRevision: revision,
  assistantHostIds: draft.staff.assistantHostIds,
  officialPositions: draft.staff.officialPositions.map((position) => ({
    id: position.id,
    name: position.name,
    count: position.count,
    order: position.order,
  })),
  eventOfficials: draft.staff.eventOfficials
    .filter((entry) => typeof entry.userId === 'string' && entry.userId.trim())
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : undefined,
      userId: String(entry.userId),
      positionIds: Array.isArray(entry.positionIds) ? entry.positionIds.filter((id): id is string => typeof id === 'string') : [],
      fieldIds: Array.isArray(entry.fieldIds) ? entry.fieldIds.filter((id): id is string => typeof id === 'string') : [],
      isActive: entry.isActive !== false,
    })),
  pendingInvites: draft.staff.pendingInvites
    .filter((entry) => typeof entry.email === 'string' && typeof entry.firstName === 'string' && typeof entry.lastName === 'string')
    .map((entry) => ({
      email: String(entry.email),
      firstName: String(entry.firstName),
      lastName: String(entry.lastName),
      roles: Array.isArray(entry.roles)
        ? entry.roles.filter((role): role is 'OFFICIAL' | 'ASSISTANT_HOST' => role === 'OFFICIAL' || role === 'ASSISTANT_HOST')
        : ['OFFICIAL'],
      resolvedUserId: typeof entry.resolvedUserId === 'string' ? entry.resolvedUserId : undefined,
    })),
});

const reconcileQuestions = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  draft: EventEditorDraft,
  actorUserId: string,
): Promise<Record<string, string>> => {
  const existingRows = await tx.registrationQuestions.findMany({
    where: { scopeType: 'EVENT', scopeId: eventId },
    select: { id: true },
  });
  const existingIds = new Set(existingRows.map((row: QuestionRow) => row.id));
  const activeIds = new Set<string>();
  const questionIdMap: Record<string, string> = {};
  const now = new Date();
  for (const [index, question] of draft.registration.questions.entries()) {
    const canonicalId = 'id' in question ? question.id : null;
    const clientId = 'clientId' in question ? question.clientId : null;
    if (canonicalId && !existingIds.has(canonicalId)) {
      throw new EditorInputError(`Registration question ${canonicalId} does not belong to this event.`);
    }
    const id = canonicalId ?? createId();
    const data = {
      prompt: question.prompt,
      answerType: question.answerType,
      required: question.required,
      sortOrder: question.sortOrder ?? index,
      isActive: true,
      updatedBy: actorUserId,
      updatedAt: now,
    };
    if (canonicalId) {
      await tx.registrationQuestions.update({ where: { id }, data });
    } else {
      await tx.registrationQuestions.create({
        data: {
          id,
          scopeType: 'EVENT',
          scopeId: eventId,
          ...data,
          createdBy: actorUserId,
          createdAt: now,
        },
      });
    }
    activeIds.add(id);
    if (clientId) questionIdMap[clientId] = id;
  }

  const inactiveIds = existingRows
    .map((row: QuestionRow) => row.id)
    .filter((id: string) => !activeIds.has(id));
  if (inactiveIds.length) {
    await tx.registrationQuestions.updateMany({
      where: { id: { in: inactiveIds } },
      data: { isActive: false, updatedBy: actorUserId, updatedAt: now },
    });
  }
  return questionIdMap;
};

const assertPaymentCapability = async (draft: EventEditorDraft, snapshot: { capabilities: { canUseOnlinePayments: boolean } }) => {
  if (draft.registration.payment.mode === 'ONLINE' && draft.registration.payment.priceCents > 0 && !snapshot.capabilities.canUseOnlinePayments) {
    throw new EditorCapabilityError('Online paid registration requires a connected payment account.');
  }
};

const assertImmutableFields = (
  draft: EventEditorDraft,
  eventId: string,
  snapshot: EventEditorSnapshot,
) => {
  const protectedFields = new Set(snapshot.immutable.fieldNames);
  if (snapshot.immutable.rental) {
    [
      'start',
      'end',
      'timeZone',
      'location',
      'address',
      'coordinates',
      'fields',
      'fieldIds',
      'timeSlots',
      'timeSlotIds',
      'requiredTemplateIds',
      'rentalBookingId',
      'rentalBookingItemId',
    ].forEach((fieldName) => protectedFields.add(fieldName));
  }
  if (snapshot.immutable.template) {
    protectedFields.add('requiredTemplateIds');
  }
  if (!protectedFields.size) return;
  const current = editorDraftToLegacyEvent(snapshot.draft, eventId);
  const next = editorDraftToLegacyEvent(draft, eventId);
  for (const fieldName of protectedFields) {
    if (JSON.stringify(current[fieldName]) !== JSON.stringify(next[fieldName])) {
      throw new EditorImmutableFieldError(fieldName);
    }
  }
};

const saveWithinTransaction = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  draft: EventEditorDraft,
  eventId: string,
  existingSnapshot: EventEditorSnapshot | null,
): Promise<{ questionIdMap: Record<string, string>; emailCandidates: unknown[] }> => {
  if (existingSnapshot) {
    assertImmutableFields(draft, eventId, existingSnapshot);
  }
  if (existingSnapshot) {
    await assertPaymentCapability(draft, existingSnapshot);
  }
  const eventPayload = editorDraftToLegacyEvent(draft, eventId);
  const matchRulesOverride = draft.competition.matchRulesOverride ?? {};
  const timing = resolveMatchTimingPolicy({
    usesSets: draft.competition.usesSets,
    segmentCount: typeof matchRulesOverride.segmentCount === 'number' ? matchRulesOverride.segmentCount : null,
    segmentLengthMinutes: typeof matchRulesOverride.segmentLengthMinutes === 'number' ? matchRulesOverride.segmentLengthMinutes : null,
    segmentBreakMinutes: typeof matchRulesOverride.segmentBreakMinutes === 'number' ? matchRulesOverride.segmentBreakMinutes : null,
    setsPerMatch: draft.competition.setsPerMatch,
    setDurationMinutes: draft.competition.setDurationMinutes,
    matchDurationMinutes: draft.competition.matchDurationMinutes,
    restTimeMinutes: draft.competition.restTimeMinutes,
  });
  if (
    typeof draft.competition.matchDurationMinutes === 'number'
    && draft.competition.matchDurationMinutes !== timing.durationMinutes
  ) {
    throw new EditorInputError('matchDurationMinutes is a server-calculated projection of the timing inputs.');
  }
  if (
    existingSnapshot?.mode === 'CREATE'
    && ['LEAGUE', 'TOURNAMENT'].includes(draft.basics.eventType.trim().toUpperCase())
  ) {
    eventPayload.state = 'UNPUBLISHED';
  }
  eventPayload.matchDurationMinutes = timing.durationMinutes;
  delete eventPayload.fields;
  delete eventPayload.timeSlots;
  delete eventPayload.assistantHostIds;
  delete eventPayload.eventOfficials;
  delete eventPayload.officialIds;
  delete eventPayload.officialPositions;
  delete eventPayload.pendingStaffInvites;
  delete eventPayload.staffInvites;
  delete eventPayload.divisionDetails;
  delete eventPayload.immutableFieldIds;
  delete eventPayload.rentalBookingId;
  delete eventPayload.rentalBookingItemId;
  eventPayload.hostId = draft.basics.hostId ?? actor.userId;
  eventPayload.registrationPaymentMode = draft.registration.payment.mode === 'MANUAL' ? 'MANUAL' : 'ONLINE';
  eventPayload.price = draft.registration.payment.priceCents;
  await upsertEventFromPayload({
    ...eventPayload,
    id: eventId,
    fieldIds: draft.resources.fieldIds,
    timeSlotIds: draft.resources.timeSlotIds,
    fields: draft.resources.fields,
    timeSlots: draft.resources.timeSlots,
    divisionDetails: draft.competition.divisionDetails,
    playoffDivisionDetails: draft.competition.playoffDivisionDetails,
    divisionFieldIds: draft.competition.divisionFieldIds,
    tags: draft.basics.tags,
  }, tx, { preserveOperationalState: true });

  const questionIdMap = await reconcileQuestions(tx, eventId, draft, actor.userId);
  const staffRevision = existingSnapshot?.staffRevision
    ?? (await loadEventEditorSnapshot(eventId, { actor, client: tx })).staffRevision;
  const staffResult = await reconcileEventStaffDesiredState(
    tx,
    eventId,
    staffInputFor(draft, staffRevision ?? ''),
    actor.userId,
  );
  return { questionIdMap, emailCandidates: staffResult.emailCandidates };
};

export const saveEventEditor = async (
  actor: EditorActor,
  command: SaveEventEditorCommand,
  eventId: string,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> => {
  const client = options.client ?? prisma;
  let emailCandidates: unknown[] = [];
  let questionIdMap: Record<string, string> = {};
  await client.$transaction(async (tx: Prisma.TransactionClient) => {
    await acquireEventLock(tx, eventId);
    const currentEvent = await tx.events.findUnique({ where: { id: eventId } });
    if (!currentEvent) {
      throw new Error('Event not found.');
    }
    if (!await canManageEvent({ ...actor, isAdmin: Boolean(actor.isAdmin) }, currentEvent, tx)) {
      throw new EditorPermissionError();
    }
    const currentSnapshot = await buildEventEditorSnapshot(
      currentEvent as unknown as Record<string, unknown>,
      { client: tx, actor, mode: 'EDIT' },
    );
    if (currentSnapshot.editorRevision !== command.editorRevision || currentSnapshot.staffRevision !== command.staffRevision) {
      throw new EditorRevisionConflictError(currentSnapshot.editorRevision, currentSnapshot.staffRevision);
    }
    ({ questionIdMap, emailCandidates } = await saveWithinTransaction(tx, actor, command.draft, eventId, currentSnapshot));
  });
  let staffEmailDelivery: EventEditorSaveResult['staffEmailDelivery'] = 'NOT_REQUESTED';
  if (emailCandidates.length && options.sendStaffInvites) {
    staffEmailDelivery = await options.sendStaffInvites(emailCandidates, eventId);
  }
  const snapshot = await loadEventEditorSnapshot(eventId, { actor, client });
  return { status: 'SAVED', snapshot, questionIdMap, staffEmailDelivery };
};

const draftOrganizationId = (draft: EventEditorDraft): string | null => draft.basics.organizationId?.trim() || null;
export const createEventEditor = async (
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> => {
  const client = options.client ?? prisma;
  const requestHash = eventEditorCreateRequestHash(command);
  let claim: EventCreateOperationClaim | null = null;
  let firstClaimResult: EventEditorSaveResult | null = null;
  let questionIdMap: Record<string, string> = {};
  let emailCandidates: unknown[] = [];

  await client.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed = await claimEventEditorCreateOperation({
      client: tx,
      createOperationId: command.createOperationId,
      actorUserId: actor.userId,
      requestHash,
    });
    claim = claimed;
    if (!claimed.firstClaim) return;

    const organizationId = draftOrganizationId(command.draft);
    const requestedHostId = command.draft.basics.hostId;
    if (!actor.isAdmin && requestedHostId && requestedHostId !== actor.userId) {
      throw new EditorPermissionError('The selected event host cannot create this event.');
    }
    if (!actor.isAdmin && organizationId) {
      const organization = await tx.organizations.findUnique({
        where: { id: organizationId },
        select: { id: true, ownerId: true, enabledFeatures: true },
      });
      if (!organization) {
        throw new EditorCapabilityError('Organization not found.');
      }
      if (!await hasOrgPermission({ ...actor, isAdmin: Boolean(actor.isAdmin) }, organization, ORG_PERMISSIONS.EVENTS_MANAGE, tx)) {
        throw new EditorPermissionError();
      }
      const requiredFeature = command.draft.basics.eventType.toUpperCase() === 'TRYOUT' ? 'CLUB_TEAMS' : 'EVENT_MANAGEMENT';
      if (!organization.enabledFeatures.includes(requiredFeature)) {
        throw new EditorCapabilityError('Enable event management tools before creating events.');
      }
    }
    const createQuery: EventEditorBootstrapQuery = {
      organizationId: organizationId ?? undefined,
      eventType: command.draft.basics.eventType,
      sportId: command.draft.basics.sportIds[0],
      parentEventId: command.draft.basics.parentEvent ?? undefined,
      templateId: command.draft.resources.requiredTemplateIds[0],
      rentalBookingId: command.draft.resources.rentalBookingId ?? undefined,
      start: command.draft.basics.start,
    };
    const createSnapshot = await loadCreateEventEditorSnapshot(createQuery, { actor, client: tx });
    await assertPaymentCapability(command.draft, createSnapshot);

    ({ questionIdMap, emailCandidates } = await saveWithinTransaction(
      tx,
      actor,
      command.draft,
      claimed.eventId,
      createSnapshot,
    ));
    const snapshot = await loadEventEditorSnapshot(claimed.eventId, { actor, client: tx });
    firstClaimResult = {
      status: 'SAVED',
      snapshot,
      questionIdMap,
      staffEmailDelivery: 'NOT_REQUESTED',
    };
    // Keep the receipt non-replayable until all post-commit hooks finish.
    // The canonical domain result is already durable for recovery.
    await completeEventEditorCreateOperation({
      client: tx,
      createOperationId: command.createOperationId,
      result: firstClaimResult,
      emailDelivery: 'PROCESSING',
    });
  });

  const operationClaim: EventCreateOperationClaim | null = claim as EventCreateOperationClaim | null;
  if (!operationClaim) throw new Error('The event create operation was not claimed.');
  if (operationClaim.firstClaim === false) {
    const replay = operationClaim.result
      ? operationClaim
      : await waitForEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        actorUserId: actor.userId,
        requestHash,
        returnCommittedResultOnTimeout: true,
      });
    if (!replay.result) throw new Error('The event create operation has no stored result.');
    return replay.result;
  }
  const canonicalResult: EventEditorSaveResult | null = firstClaimResult as EventEditorSaveResult | null;
  if (!canonicalResult) throw new Error('The event create operation has no canonical result.');

  let staffEmailDelivery: EventEditorSaveResult['staffEmailDelivery'] = 'NOT_REQUESTED';
  if (emailCandidates.length && options.sendStaffInvites) {
    try {
      staffEmailDelivery = await options.sendStaffInvites(emailCandidates, operationClaim.eventId);
    } catch (error) {
      staffEmailDelivery = 'FAILED';
      console.error('[event-editor] staff invite delivery failed after create', error);
    }
  }
  if (options.onEventCreated) {
    try {
      await options.onEventCreated(operationClaim.eventId, command.draft);
    } catch (error) {
      console.error('[event-editor] create notification failed after commit', error);
    }
  }
  const finalResult = { ...canonicalResult, staffEmailDelivery };
  try {
    await completeEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      result: finalResult,
      emailDelivery: staffEmailDelivery,
    });
  } catch (error) {
    // The committed canonical result remains replayable if delivery metadata
    // cannot be updated after the domain transaction.
    console.error('[event-editor] create delivery metadata update failed', error);
  }
  return finalResult;
};
export const createEventFromEditor = async (
  command: CreateEventEditorCommand,
  actor: EditorActor,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> => createEventEditor(actor, command, options);

export const saveEventFromEditor = async (
  eventId: string,
  command: SaveEventEditorCommand,
  actor: EditorActor,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> => saveEventEditor(actor, command, eventId, options);
