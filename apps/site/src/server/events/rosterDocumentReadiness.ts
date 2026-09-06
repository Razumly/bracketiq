import type { Prisma } from '@/generated/prisma/client';
import { isUnknownDateOfBirth } from '@/server/userPrivacy';
import { calculateAgeOnDate } from '@/lib/age';
import { buildRequiredSignatureTasks, buildSignatureCompletionKey, type ComplianceTemplate, type TeamComplianceRequiredDocument } from '@/lib/eventTeamCompliance';
import { documentSubjectIdFor, findCompletedDocumentSatisfactions, hasCompletedDocumentSignerRole, readByIdChunks } from '@/server/documentEvidence';

type ReadinessEvent = { id: string; organizationId: string | null; start: Date | null };
type RosterPlayer = { id: string; dateOfBirth: Date | null };

// Roster placement supplies the Subject. An Account or separate registration is not required.
export async function readRosterDocumentReadiness(
  client: Prisma.TransactionClient,
  event: ReadinessEvent,
  players: RosterPlayer[],
  templates: ComplianceTemplate[],
) {
  // Confirmed profile merges preserve the original evidence Subject IDs.
  const profileIds = new Set(players.map((player) => player.id));
  const mergedSources = new Map<string, Set<string>>();
  let frontier = players.map((player) => player.id);
  while (frontier.length) {
    const merges = await readByIdChunks(frontier, (ids) => client.userProfileMerges.findMany({
      where: { OR: [{ primaryProfileId: { in: ids } }, { sourceProfileId: { in: ids } }] },
      select: { sourceProfileId: true, primaryProfileId: true },
    }));
    const next: string[] = [];
    for (const merge of merges) {
      for (const [profileId, relatedId] of [[merge.primaryProfileId, merge.sourceProfileId], [merge.sourceProfileId, merge.primaryProfileId]]) {
        const sources = mergedSources.get(profileId) ?? new Set<string>();
        sources.add(relatedId);
        mergedSources.set(profileId, sources);
        if (!profileIds.has(relatedId)) { profileIds.add(relatedId); next.push(relatedId); }
      }
    }
    frontier = next;
  }
  const subjects = event.organizationId && templates.length
    ? await readByIdChunks([...profileIds], (ids) => client.documentSubjects.findMany({
      where: { OR: [
        { organizationId: event.organizationId!, userId: { in: ids } },
        { id: { in: ids.map((id) => documentSubjectIdFor(event.organizationId, id)!).filter(Boolean) } },
      ] },
      select: { id: true, userId: true, organizationId: true },
    })) : [];
  const profileBySubject = new Map(subjects.map((subject) => [subject.id, subject.organizationId === event.organizationId ? subject.userId : '']));
  // Existing signing writers use deterministic IDs after a Subject moves in a merge.
  // Stored Subject ownership wins when that ID already exists.
  for (const profileId of profileIds) {
    const subjectId = documentSubjectIdFor(event.organizationId, profileId);
    if (subjectId && !profileBySubject.has(subjectId)) profileBySubject.set(subjectId, profileId);
  }
  const subjectIds = [...profileBySubject.keys()];
  const completions = await findCompletedDocumentSatisfactions({
    documentSubjectIds: subjectIds,
    templateDocumentIds: templates.map((template) => template.id),
    scopes: [
      ...(event.organizationId ? [{ scopeType: 'ORGANIZATION' as const, scopeId: event.organizationId }] : []),
      { scopeType: 'EVENT_PARTICIPATION', scopeId: event.id },
    ],
  }, client);
  return new Map(players.map((player) => {
    const relatedProfiles = new Set([player.id]);
    // A protected history entry can still reference a merged source profile.
    for (const profileId of relatedProfiles) {
      for (const sourceId of mergedSources.get(profileId) ?? []) relatedProfiles.add(sourceId);
    }
    const age = player.dateOfBirth && !isUnknownDateOfBirth(player.dateOfBirth) && event.start ? calculateAgeOnDate(player.dateOfBirth, event.start) : Number.NaN;
    const isMinorAtEvent = Number.isFinite(age) && age < 18;
    const tasks = (Number.isFinite(age) ? [isMinorAtEvent] : [false, true]).flatMap((isChildRegistration) =>
      buildRequiredSignatureTasks({ templates, context: { userId: player.id, isChildRegistration } }));
    const requiredDocuments: TeamComplianceRequiredDocument[] = tasks.map((task) => {
      const scopeType = task.signOnce ? 'ORGANIZATION' : 'EVENT_PARTICIPATION';
      const scopeId = task.signOnce ? event.organizationId : event.id;
      const completion = Number.isFinite(age) ? completions.find((row) => relatedProfiles.has(profileBySubject.get(row.documentSubjectId) ?? '')
        && row.templateDocumentId === task.templateId && row.scopeType === scopeType && row.scopeId === scopeId
        && tasks.filter((required) => required.templateId === task.templateId).every((required) =>
          hasCompletedDocumentSignerRole(row.completedSignerRoles, required.signerContext))) : undefined;
      return {
        key: buildSignatureCompletionKey({ scopeKey: task.signOnce ? 'once' : `event:${event.id}`,
          templateId: task.templateId, signerContext: task.signerContext, hostUserId: task.hostUserId }),
        templateId: task.templateId, title: task.templateTitle, type: task.templateType,
        signerContext: task.signerContext, signerLabel: task.signerLabel, signOnce: task.signOnce,
        status: completion ? 'SIGNED' : 'UNSIGNED',
        signedDocumentRecordId: completion?.sourceEvidenceId, signedAt: completion?.signedAt ?? undefined,
      };
    });
    return [player.id, { isMinorAtEvent, requiredDocuments,
      documents: { signedCount: requiredDocuments.filter((document) => document.status === 'SIGNED').length,
        requiredCount: requiredDocuments.length } }] as const;
  }));
}
