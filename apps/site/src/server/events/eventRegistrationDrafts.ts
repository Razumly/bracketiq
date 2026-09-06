import { createHash } from 'node:crypto';
import type { EventRegistrationDrafts, Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import {
  registrationDraftPatchSchema,
  registrationDraftStepSchema,
  type EventRegistrationDraft,
  type EventRegistrationDraftPatch,
  type EventRegistrationDraftSave,
  type EventRegistrationDraftScope,
  type EventRegistrationDraftState,
} from '@/lib/contracts/eventRegistrationDraft';
import { resolveEventDivisionSelection } from '@/app/api/events/[eventId]/registrationDivisionUtils';
import { isActiveWeeklyParentEvent, isWeeklyOccurrenceJoinClosed, resolveWeeklyOccurrence } from './weeklyOccurrences';

type Client = Prisma.TransactionClient;
type Scope = EventRegistrationDraftScope & { accountId: string; eventId: string };

export class RegistrationDraftError extends Error {
  constructor(message: string, public status: number, public state?: EventRegistrationDraftState) {
    super(message);
  }
}

const draftId = (scope: Scope) => createHash('sha256').update(JSON.stringify([
  scope.accountId, scope.eventId, scope.slotId || '', scope.occurrenceDate || '',
])).digest('hex');

async function eligibleTeams(accountId: string, sportKeys: string[], client: Client) {
  const [managers, captains] = await Promise.all([
    client.teamStaffAssignments.findMany({
      where: { userId: accountId, role: 'MANAGER', status: 'ACTIVE' }, select: { teamId: true },
    }),
    client.teamRegistrations.findMany({
      where: { userId: accountId, status: 'ACTIVE', isCaptain: true }, select: { teamId: true },
    }),
  ]);
  const ids = [...new Set([...managers, ...captains].map((row) => row.teamId))];
  const teams = await client.canonicalTeams.findMany({
    where: { id: { in: ids }, archivedAt: null, visibility: 'PUBLIC' },
    select: { id: true, name: true, sport: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return teams.filter((team) => !sportKeys.length || sportKeys.includes(team.sport?.trim().toLowerCase() ?? ''));
}

function serializeDraft(row: EventRegistrationDrafts): EventRegistrationDraft {
  const answers = registrationDraftPatchSchema.shape.answers.parse(row.answers) ?? {};
  return {
    id: row.id, eventId: row.eventId, revision: row.revision,
    slotId: row.slotId || null, occurrenceDate: row.occurrenceDate || null,
    selectedTeamId: row.selectedTeamId, selectedDivisionId: row.selectedDivisionId,
    selectedDivisionTypeKey: row.selectedDivisionTypeKey, answers,
    step: registrationDraftStepSchema.parse(row.step),
    completedSteps: registrationDraftStepSchema.array().parse(row.completedSteps),
    registrationId: row.registrationId, holdExpiresAt: null,
    teamCreationId: row.teamCreationId, completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readRegistrationDraft(scope: Scope, client: Client = prisma): Promise<EventRegistrationDraftState> {
  const event = await client.events.findUnique({ where: { id: scope.eventId } });
  if (!event) throw new RegistrationDraftError('Event not found.', 404);
  const sportId = event.sportIds[0]?.trim() ?? '';
  const sport = sportId.toLowerCase();
  const sportRecord = sportId ? await client.sports.findUnique({ where: { id: sportId }, select: { name: true } }) : null;
  const sportKeys = [...new Set([sport, sportRecord?.name.trim().toLowerCase()].filter((value): value is string => Boolean(value)))];
  const [row, teams, remembered] = await Promise.all([
    client.eventRegistrationDrafts.findUnique({ where: { id: draftId(scope) } }),
    eligibleTeams(scope.accountId, sportKeys, client),
    client.eventRegistrationTeamPreferences.findUnique({
      where: { accountId_sport: { accountId: scope.accountId, sport } },
    }),
  ]);
  let unavailableReason: string | null = event.archivedAt ? 'This Event is archived.' : null;
  if (isActiveWeeklyParentEvent(event)) {
    const occurrence = await resolveWeeklyOccurrence({ event, occurrence: scope }, client);
    if (!occurrence.ok) unavailableReason = occurrence.error;
    else if (isWeeklyOccurrenceJoinClosed(occurrence.value)) unavailableReason = 'This weekly session has already started.';
  } else if (scope.slotId || scope.occurrenceDate) {
    unavailableReason = 'This Event no longer uses the selected weekly session.';
  } else if (event.start.getTime() <= Date.now()) {
    unavailableReason = 'This Event has already started.';
  }
  if (event.affiliateUrl?.trim()) unavailableReason = 'This Event uses external registration.';
  if (['UNPUBLISHED', 'DRAFT', 'TEMPLATE'].includes(event.state?.toUpperCase() ?? '')) unavailableReason = 'This Event is not open for registration.';
  const draft = row ? serializeDraft(row) : null;
  const invalidations: string[] = [];
  if (draft?.selectedTeamId && !teams.some((team) => team.id === draft.selectedTeamId)) {
    invalidations.push('The saved Team is no longer eligible. Choose another Team.');
    draft.selectedTeamId = null;
    draft.registrationId = null;
    draft.step = 'review';
    draft.completedSteps = [];
  }
  if (draft?.selectedDivisionId || draft?.selectedDivisionTypeKey) {
    const selection = await resolveEventDivisionSelection({ event, input: {
      divisionId: draft.selectedDivisionId, divisionTypeKey: draft.selectedDivisionTypeKey,
    } });
    if (!selection.ok) {
      invalidations.push('The saved Division is no longer available. Choose a Division.');
      draft.selectedDivisionId = null;
      draft.selectedDivisionTypeKey = null;
      draft.registrationId = null;
      draft.step = 'review';
      draft.completedSteps = draft.completedSteps.filter((step) => step === 'team' || step === 'players');
    } else {
      draft.selectedDivisionId = selection.selection.divisionId;
      draft.selectedDivisionTypeKey = selection.selection.divisionTypeKey;
    }
  }
  if (draft?.registrationId) {
    const registration = await client.eventRegistrations.findFirst({ where: {
      id: draft.registrationId, eventId: scope.eventId, createdBy: scope.accountId,
      slotId: scope.slotId || null, occurrenceDate: scope.occurrenceDate || null,
    } });
    let correctTeam = !draft.selectedTeamId;
    if (registration && draft.selectedTeamId) {
      const eventTeam = await client.teams.findUnique({ where: { id: registration.registrantId }, select: { parentTeamId: true } });
      correctTeam = registration.registrantType === 'TEAM'
        && (registration.registrantId === draft.selectedTeamId || eventTeam?.parentTeamId === draft.selectedTeamId);
    }
    const expiresAt = registration?.status === 'STARTED' && registration.createdAt
      ? new Date(registration.createdAt.getTime() + 10 * 60 * 1000) : null;
    if (!registration || !correctTeam || ['CANCELLED', 'DECLINED'].includes(registration.status)
      || (expiresAt && expiresAt.getTime() <= Date.now())) {
      invalidations.push('The registration reservation is no longer available. Your Team and answers are saved.');
      draft.registrationId = null;
      draft.step = 'review';
    } else {
      draft.holdExpiresAt = expiresAt?.toISOString() ?? null;
    }
  }
  const eligible = (id: string | null | undefined) => Boolean(id && teams.some((team) => team.id === id));
  const selectionSource = draft?.step === 'team' && draft.teamCreationId && !draft.selectedTeamId ? null : eligible(draft?.selectedTeamId) ? 'draft'
    : eligible(remembered?.teamId) ? 'remembered' : teams.length === 1 ? 'sole' : null;
  const selectedTeamId = selectionSource === 'draft' ? draft!.selectedTeamId
    : selectionSource === 'remembered' ? remembered!.teamId
      : selectionSource === 'sole' ? teams[0].id : null;
  return { version: 1, draft, eligibleTeams: teams, selectedTeamId, selectionSource,
    available: !unavailableReason, unavailableReason, invalidations };
}

export async function saveRegistrationDraft(
  scope: Scope,
  input: Pick<EventRegistrationDraftSave, 'baseRevision' | 'patch'>,
  client: Client,
): Promise<EventRegistrationDraftState> {
  const id = draftId(scope);
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`registration-draft:${id}`}, 0))`;
  const state = await readRegistrationDraft(scope, client);
  if (!state.available) throw new RegistrationDraftError(state.unavailableReason!, 409, state);
  if ((state.draft?.revision ?? 0) !== input.baseRevision) {
    throw new RegistrationDraftError('Registration progress changed on another device. Review the saved progress.', 409, state);
  }
  const patch: EventRegistrationDraftPatch = registrationDraftPatchSchema.parse(input.patch);
  if (patch.selectedDivisionTypeKey !== undefined && patch.selectedDivisionId === undefined) {
    patch.selectedDivisionId = null;
  }
  if (patch.selectedDivisionId !== undefined && input.patch.selectedDivisionTypeKey === undefined) {
    patch.selectedDivisionTypeKey = null;
  }
  if (patch.selectedTeamId && !state.eligibleTeams.some((team) => team.id === patch.selectedTeamId)) {
    throw new RegistrationDraftError('You cannot register this Team for this Event.', 403, state);
  }
  if (patch.registrationId) {
    const registration = await client.eventRegistrations.findFirst({ where: {
      id: patch.registrationId, eventId: scope.eventId, createdBy: scope.accountId,
      slotId: scope.slotId || null, occurrenceDate: scope.occurrenceDate || null,
    }, select: { id: true } });
    if (!registration) throw new RegistrationDraftError('Registration reference is not valid for this Account and Event.', 400, state);
  }
  const current = state.draft;
  const changedTeam = patch.selectedTeamId !== undefined && patch.selectedTeamId !== current?.selectedTeamId;
  const data = {
    selectedTeamId: current?.selectedTeamId ?? state.selectedTeamId,
    selectedDivisionId: current?.selectedDivisionId ?? null,
    selectedDivisionTypeKey: current?.selectedDivisionTypeKey ?? null,
    answers: current?.answers ?? {}, step: current?.step ?? 'review',
    completedSteps: current?.completedSteps ?? [], registrationId: current?.registrationId ?? null,
    teamCreationId: current?.teamCreationId ?? null,
    ...(changedTeam ? { registrationId: null, completedSteps: [], step: 'review', completedAt: null } : {}),
    ...patch,
    revision: input.baseRevision + 1,
  };
  await client.eventRegistrationDrafts.upsert({
    where: { id },
    create: { id, accountId: scope.accountId, eventId: scope.eventId,
      slotId: scope.slotId || '', occurrenceDate: scope.occurrenceDate || '', ...data },
    update: data,
  });
  return readRegistrationDraft(scope, client);
}

export async function deleteRegistrationDraft(scope: Scope) {
  await prisma.eventRegistrationDrafts.deleteMany({ where: { id: draftId(scope), accountId: scope.accountId } });
}
