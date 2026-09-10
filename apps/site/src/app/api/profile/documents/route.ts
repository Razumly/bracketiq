import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { listGuardianChildIds } from '@/server/guardianAuthority';
import { requireSession } from '@/lib/permissions';
import {
  canViewerProxyChildSignature,
  isChildSignatureRestrictedToChildAccount,
} from '@/lib/profileDocumentAccess';
import {
  getRequiredSignerTypeLabel,
  getSignerContextLabel,
  normalizeRequiredSignerType,
  type SignerContext,
} from '@/lib/templateSignerTypes';
import {
  findCompletedDocumentSatisfactions,
  hasCompletedDocumentSignerRole,
} from '@/server/documentEvidence';
import { getCanonicalTeamIdsByUserIds } from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

type ProfileDocumentProvenance = 'BOLDSIGN' | 'BRACKETIQ' | 'IMPORTED';

type ProfileDocumentCard = {
  id: string;
  status: 'UNSIGNED' | 'SIGNED' | 'VOID';
  eventId?: string;
  eventName?: string;
  teamId?: string;
  teamName?: string;
  organizationId?: string;
  organizationName: string;
  templateId: string;
  title: string;
  type: 'PDF' | 'TEXT';
  provenance?: ProfileDocumentProvenance;
  documentRequirementTitle?: string;
  versionSequence?: number;
  scopeType?: string;
  scopeId?: string;
  historicalSigningDate?: string;
  requiredSignerType: string;
  requiredSignerLabel: string;
  signerContext: SignerContext;
  signerContextLabel: string;
  childUserId?: string;
  childName?: string;
  childEmail?: string;
  consentStatus?: string;
  requiresChildEmail?: boolean;
  statusNote?: string;
  signedAt?: string;
  signedDocumentRecordId?: string;
  viewUrl?: string;
  content?: string;
};

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const formatChildDisplayName = (firstName?: string | null, lastName?: string | null): string | undefined => {
  const parts = [normalizeText(firstName), normalizeText(lastName)].filter((value): value is string => Boolean(value));
  if (!parts.length) {
    return undefined;
  }
  return parts.join(' ');
};

const normalizeTemplateType = (value: unknown): 'PDF' | 'TEXT' => {
  return typeof value === 'string' && value.toUpperCase() === 'TEXT' ? 'TEXT' : 'PDF';
};

const isSignedStatus = (value: unknown): boolean => {
  const status = normalizeText(value)?.toLowerCase();
  return status === 'signed' || status === 'completed';
};

const isRevokedStatus = (value: unknown): boolean => {
  const status = normalizeText(value)?.toLowerCase();
  return status === 'revoked';
};

const ACTIVE_EVENT_REGISTRATION_STATUSES = ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED'] as const;

const toTimestamp = (value?: string | Date | null): number => {
  if (!value) return 0;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : 0;
};

const getDisplayOrganizationName = (params: {
  eventOrganizationId?: string | null;
  templateOrganizationId?: string | null;
  organizationsById: Map<string, string>;
}): { organizationId?: string; organizationName: string } => {
  const eventOrganizationId = normalizeText(params.eventOrganizationId ?? undefined);
  if (eventOrganizationId) {
    return {
      organizationId: eventOrganizationId,
      organizationName: params.organizationsById.get(eventOrganizationId) ?? 'Organization',
    };
  }

  const templateOrganizationId = normalizeText(params.templateOrganizationId ?? undefined);
  if (templateOrganizationId) {
    return {
      organizationId: templateOrganizationId,
      organizationName: params.organizationsById.get(templateOrganizationId) ?? 'Organization',
    };
  }

  return { organizationName: 'Independent Event' };
};

const normalizeSignerContextValue = (value: unknown): SignerContext | undefined => {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === 'participant') return 'participant';
  if (normalized === 'parent_guardian' || normalized === 'parentguardian') return 'parent_guardian';
  if (normalized === 'child') return 'child';
  return undefined;
};

const buildTemplateScopeKey = (params: {
  templateId: string;
  signerContext: SignerContext;
  childUserId?: string;
}): string => {
  return `${params.templateId}::${params.signerContext}::${params.childUserId ?? 'self'}`;
};

const buildEventScopeKey = (params: {
  eventId: string;
  templateId: string;
  signerContext: SignerContext;
  childUserId?: string;
}): string => {
  return `${params.eventId}::${buildTemplateScopeKey({
    templateId: params.templateId,
    signerContext: params.signerContext,
    childUserId: params.childUserId,
  })}`;
};

const buildTeamScopeKey = (params: {
  teamId: string;
  templateId: string;
  signerContext: SignerContext;
  childUserId?: string;
}) => {
  return `${params.teamId}::${buildTemplateScopeKey({
    templateId: params.templateId,
    signerContext: params.signerContext,
    childUserId: params.childUserId,
  })}`;
};

const isSignerContextVisibleForViewer = (params: {
  viewerUserId: string;
  signerContext: SignerContext;
  childUserId?: string;
  signerUserId?: string;
}): boolean => {
  const childUserId = normalizeText(params.childUserId);
  const signerUserId = normalizeText(params.signerUserId);

  if (params.signerContext === 'participant') {
    return signerUserId ? signerUserId === params.viewerUserId : true;
  }

  if (!childUserId) {
    return false;
  }

  if (params.signerContext === 'child') {
    return childUserId === params.viewerUserId;
  }

  if (params.signerContext === 'parent_guardian') {
    if (childUserId === params.viewerUserId) {
      return false;
    }
    return signerUserId ? signerUserId === params.viewerUserId : true;
  }

  return false;
};

export async function GET(_req: NextRequest) {
  const session = await requireSession(_req);
  const userId = session.userId;

  const linkedChildIds = await listGuardianChildIds(prisma, userId);
  const [registrations, parentLinksForSelf, selfSensitive] = await Promise.all([
    prisma.eventRegistrations.findMany({
      where: {
        OR: [
          { registrantId: userId },
          { parentId: userId, registrantId: { in: linkedChildIds } },
        ],
      },
      select: {
        id: true,
        eventId: true,
        parentId: true,
        registrantId: true,
        registrantType: true,
        rosterRole: true,
        status: true,
        consentStatus: true,
      },
    }),
    prisma.parentChildLinks.findMany({
      where: {
        childId: userId,
        status: 'ACTIVE',
      },
      select: {
        parentId: true,
      },
      take: 1,
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: {
        email: true,
      },
    }),
  ]);

  const teamIdsByUserId = await getCanonicalTeamIdsByUserIds(
    [userId, ...linkedChildIds],
    prisma,
  );
  const teamIds = teamIdsByUserId.get(userId) ?? [];
  const linkedChildProfiles = linkedChildIds.length
    ? await prisma.userData.findMany({
      where: { id: { in: linkedChildIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    })
    : [];
  const linkedChildTeamIds = Array.from(new Set(
    linkedChildProfiles.flatMap((child) =>
      teamIdsByUserId.get(child.id) ?? [],
    ),
  ));
  const canonicalTeamIdsForSlotLookup = Array.from(new Set([...teamIds, ...linkedChildTeamIds]));
  const slotTeams = canonicalTeamIdsForSlotLookup.length
    ? await prisma.teams.findMany({
        where: { parentTeamId: { in: canonicalTeamIdsForSlotLookup } },
        select: { id: true, parentTeamId: true },
      })
    : [];
  const slotTeamIdsByParent = new Map<string, string[]>();
  slotTeams.forEach((team) => {
    const parentTeamId = normalizeText(team.parentTeamId);
    const id = normalizeText(team.id);
    if (!parentTeamId || !id) {
      return;
    }
    const existing = slotTeamIdsByParent.get(parentTeamId) ?? [];
    existing.push(id);
    slotTeamIdsByParent.set(parentTeamId, existing);
  });
  const slotTeamIds = Array.from(new Set(
    teamIds.flatMap((teamId) => slotTeamIdsByParent.get(teamId) ?? []),
  ));
  const linkedChildSlotTeamIds = Array.from(new Set(
    linkedChildTeamIds.flatMap((teamId) => slotTeamIdsByParent.get(teamId) ?? []),
  ));
  const relevantTeamIds = Array.from(new Set([...teamIds, ...slotTeamIds]));
  const relevantLinkedChildTeamIds = Array.from(new Set([...linkedChildTeamIds, ...linkedChildSlotTeamIds]));
  const childTeamIdsByIdWithSlots = new Map<string, string[]>();
  linkedChildProfiles.forEach((child) => {
    const childId = normalizeText(child.id);
    if (!childId) {
      return;
    }
    const childCanonicalTeamIds = teamIdsByUserId.get(childId) ?? [];
    const childSlots = Array.from(new Set(
      childCanonicalTeamIds.flatMap((teamId) => slotTeamIdsByParent.get(teamId) ?? []),
    ));
    childTeamIdsByIdWithSlots.set(childId, Array.from(new Set([...childCanonicalTeamIds, ...childSlots])));
  });
  const selfEmail = normalizeText(selfSensitive?.email);
  const userIsLinkedChild = parentLinksForSelf.length > 0;
  const relevantProfileUserIds = Array.from(new Set(
    [userId, ...linkedChildIds]
      .map((value) => normalizeText(value))
      .filter((value): value is string => Boolean(value)),
  ));
  const teamRegistrations = await prisma.teamRegistrations.findMany({
    where: {
      status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
      OR: [
        { userId: { in: relevantProfileUserIds } },
        { parentId: userId, userId: { in: linkedChildIds } },
      ],
    },
    select: {
      id: true,
      teamId: true,
      userId: true,
      parentId: true,
      registrantType: true,
      status: true,
      consentStatus: true,
    },
  });
  const registrationChildIds = registrations
    .filter((registration) =>
      normalizeText(registration.parentId) === userId
      && normalizeText(registration.registrantType)?.toUpperCase() === 'CHILD',
    )
    .map((registration) => normalizeText(registration.registrantId))
    .filter((value): value is string => Boolean(value));
  const signatureUserIds = Array.from(new Set(
    [userId, ...linkedChildIds, ...registrationChildIds]
      .map((value) => normalizeText(value))
      .filter((value): value is string => Boolean(value)),
  ));
  const documentSubjectRows = signatureUserIds.length
    ? await prisma.documentSubjects.findMany({
      where: { userId: { in: signatureUserIds } },
      select: { id: true, userId: true, organizationId: true },
    })
    : [];
  const documentSubjectIdByOrganizationAndUserId = new Map(
    documentSubjectRows.map((subject) => [
      `${subject.organizationId}::${subject.userId}`,
      subject.id,
    ]),
  );
  const documentSubjectIds = documentSubjectRows.map((subject) => subject.id);
  const documentSubjectUserIdById = new Map(
    documentSubjectRows.map((subject) => [subject.id, subject.userId]),
  );
  const documentSubjectOrganizationIdById = new Map(
    documentSubjectRows.map((subject) => [subject.id, subject.organizationId]),
  );

  const isImportedSubjectVisibleToViewer = (document: {
    provenance: unknown;
    documentSubjectId: string | null;
    organizationId: string | null | undefined;
  }): boolean => {
    if (document.provenance !== 'IMPORTED' || !document.documentSubjectId) {
      return false;
    }
    const subjectUserId = documentSubjectUserIdById.get(document.documentSubjectId);
    const subjectOrganizationId = normalizeText(
      documentSubjectOrganizationIdById.get(document.documentSubjectId),
    );
    const documentOrganizationId = normalizeText(document.organizationId);
    if (
      !documentOrganizationId
      || !subjectOrganizationId
      || documentOrganizationId !== subjectOrganizationId
    ) {
      return false;
    }
    return subjectUserId === userId || (
      typeof subjectUserId === 'string'
      && linkedChildIds.includes(subjectUserId)
    );
  };
  const signedDocumentScopeFilters = [
    ...(signatureUserIds.length ? [{ userId: { in: signatureUserIds } }] : []),
    ...(documentSubjectIds.length ? [{ documentSubjectId: { in: documentSubjectIds } }] : []),
  ];
  const signedDocuments = signedDocumentScopeFilters.length > 0
    ? await prisma.signedDocuments.findMany({
      where: { OR: signedDocumentScopeFilters },
      orderBy: { createdAt: 'desc' },
      take: 1_000,
      select: {
        id: true,
        signedDocumentId: true,
        templateId: true,
        eventId: true,
        teamId: true,
        organizationId: true,
        userId: true,
        hostId: true,
        signerRole: true,
        documentSubjectId: true,
        importedFileId: true,
        provenance: true,
        status: true,
        signedAt: true,
        createdAt: true,
        historicalSigningDate: true,
        scopeType: true,
        importedAt: true,
        scopeId: true,
      },
    })
    : [];

  const signedEventIds = Array.from(new Set(
    signedDocuments
      .map((document) => normalizeText(document.eventId))
      .filter((value): value is string => Boolean(value)),
  ));

  const relevantEventTeamIds = Array.from(new Set([...relevantTeamIds, ...relevantLinkedChildTeamIds]));
  const discoverableRegistrationRows = await prisma.eventRegistrations.findMany({
    where: {
      status: { in: [...ACTIVE_EVENT_REGISTRATION_STATUSES] },
      OR: [
        { registrantId: { in: relevantProfileUserIds } },
        { parentId: userId },
        ...(relevantEventTeamIds.length
          ? [{ registrantType: 'TEAM' as const, registrantId: { in: relevantEventTeamIds } }]
          : []),
      ],
    },
    select: {
      id: true,
      eventId: true,
      parentId: true,
      registrantId: true,
      registrantType: true,
      rosterRole: true,
      status: true,
      consentStatus: true,
    },
  });
  const profileEventRegistrations = Array.from(
    new Map(
      [...registrations, ...discoverableRegistrationRows]
        .map((registration) => [registration.id, registration]),
    ).values(),
  );
  const registrationEventIds = Array.from(new Set(
    profileEventRegistrations
      .map((registration) => normalizeText(registration.eventId))
      .filter((value): value is string => Boolean(value)),
  ));

  const discoverableEventIds = Array.from(new Set([...registrationEventIds, ...signedEventIds]));
  const discoverableEvents = discoverableEventIds.length
    ? await prisma.events.findMany({
      where: { id: { in: discoverableEventIds } },
      select: {
        id: true,
        name: true,
        start: true,
        organizationId: true,
        requiredTemplateIds: true,
      },
    })
    : [];

  const relevantProfileTeamIds = Array.from(new Set([
    ...teamIds,
    ...linkedChildTeamIds,
    ...teamRegistrations
      .map((registration) => normalizeText(registration.teamId))
      .filter((value): value is string => Boolean(value)),
  ]));
  const discoverableTeams = relevantProfileTeamIds.length
    ? await prisma.canonicalTeams.findMany({
      where: { id: { in: relevantProfileTeamIds } },
      select: {
        id: true,
        name: true,
        organizationId: true,
        requiredTemplateIds: true,
        updatedAt: true,
      },
    })
    : [];

  const eventById = new Map(discoverableEvents.map((event) => [event.id, event]));
  const teamById = new Map(discoverableTeams.map((team) => [team.id, team]));
  const participantIdsByEventId = new Map<string, {
    teamIds: string[];
    userIds: string[];
    freeAgentIds: string[];
  }>();
  const getParticipantIdsForEvent = (eventId: string) => {
    let ids = participantIdsByEventId.get(eventId);
    if (!ids) {
      ids = { teamIds: [], userIds: [], freeAgentIds: [] };
      participantIdsByEventId.set(eventId, ids);
    }
    return ids;
  };
  profileEventRegistrations.forEach((registration) => {
    const eventId = normalizeText(registration.eventId);
    const registrantId = normalizeText(registration.registrantId);
    if (!eventId || !registrantId) {
      return;
    }
    const status = normalizeText(registration.status)?.toUpperCase();
    if (!status || !ACTIVE_EVENT_REGISTRATION_STATUSES.includes(status as typeof ACTIVE_EVENT_REGISTRATION_STATUSES[number])) {
      return;
    }
    const ids = getParticipantIdsForEvent(eventId);
    const rosterRole = normalizeText(registration.rosterRole)?.toUpperCase() ?? 'PARTICIPANT';
    const registrantType = normalizeText(registration.registrantType)?.toUpperCase();
    if (rosterRole === 'FREE_AGENT') {
      if (!ids.freeAgentIds.includes(registrantId)) {
        ids.freeAgentIds.push(registrantId);
      }
    } else if (rosterRole === 'PARTICIPANT' && registrantType === 'TEAM') {
      if (!ids.teamIds.includes(registrantId)) {
        ids.teamIds.push(registrantId);
      }
    } else if (rosterRole === 'PARTICIPANT' && (registrantType === 'SELF' || registrantType === 'CHILD')) {
      if (!ids.userIds.includes(registrantId)) {
        ids.userIds.push(registrantId);
      }
    }
  });

  const requiredTemplateIds = Array.from(new Set(
    [
      ...discoverableEvents.flatMap((event) =>
        Array.isArray(event.requiredTemplateIds)
          ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
          : [],
      ),
      ...discoverableTeams.flatMap((team) =>
        Array.isArray(team.requiredTemplateIds)
          ? team.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
          : [],
      ),
    ],
  ));

  const signedTemplateIds = Array.from(new Set(
    signedDocuments
      .map((document) => normalizeText(document.templateId))
      .filter((value): value is string => Boolean(value)),
  ));

  const templateIdsToLoad = Array.from(new Set([...requiredTemplateIds, ...signedTemplateIds]));

  const templates = templateIdsToLoad.length
    ? await prisma.templateDocuments.findMany({
      where: { id: { in: templateIdsToLoad } },
      select: {
        id: true,
        organizationId: true,
        title: true,
        type: true,
        versionSequence: true,
        documentRequirement: {
          select: {
            title: true,
          },
        },
        signOnce: true,
        requiredSignerType: true,
        content: true,
      },
    })
    : [];

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const incompleteImportedMetadata = signedDocuments.find((document) => {
    if (document.provenance !== 'IMPORTED') {
      return false;
    }
    const template = templateById.get(document.templateId);
    return !normalizeText(document.importedFileId)
      || !template
      || !normalizeText(template.title)
      || !Number.isInteger(template.versionSequence)
      || !template.documentRequirement
      || !normalizeText(template.documentRequirement.title);
  });
  if (incompleteImportedMetadata) {
    return NextResponse.json(
      { error: 'Imported document metadata is incomplete.' },
      { status: 500 },
    );
  }

  const childRegistrationRows = registrations.filter(
    (registration) =>
      normalizeText(registration.parentId) === userId
      && normalizeText(registration.registrantType)?.toUpperCase() === 'CHILD'
      && Boolean(normalizeText(registration.eventId)),
  );
  const childIds = Array.from(new Set(
    [
      ...linkedChildIds,
      ...childRegistrationRows
        .map((registration) => normalizeText(registration.registrantId))
        .filter((value): value is string => Boolean(value)),
      ...(userIsLinkedChild ? [userId] : []),
    ],
  ));
  const childEmails = childIds.length
    ? await prisma.sensitiveUserData.findMany({
      where: { userId: { in: childIds } },
      select: {
        userId: true,
        email: true,
      },
    })
    : [];
  const childEmailById = new Map(
    childEmails.map((row) => [row.userId, normalizeText(row.email) ?? '']),
  );
  const childProfilesForNames = childIds.length
    ? await prisma.userData.findMany({
      where: { id: { in: childIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    })
    : [];
  const childNameById = new Map(
    childProfilesForNames
      .map((row) => [row.id, formatChildDisplayName(row.firstName, row.lastName)])
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  );
  const childTeamIdsById = new Map(
    linkedChildProfiles.map((child) => [
      child.id,
      teamIdsByUserId.get(child.id) ?? [],
    ]),
  );
  const childRegistrationByEventAndChild = new Map<string, { consentStatus?: string; registrationStatus?: string }>();
  const childAssociationsByEvent = new Map<string, Array<{
    childUserId: string;
    childName?: string;
    childEmail?: string;
    consentStatus?: string;
    registrationStatus?: string;
    requiresChildEmail: boolean;
    statusNote?: string;
  }>>();
  const childAssociationKeys = new Set<string>();

  const addChildAssociation = (params: {
    eventId: string;
    childUserId: string;
    childName?: string;
    childEmail?: string;
    consentStatus?: string;
    registrationStatus?: string;
  }) => {
    const associationKey = `${params.eventId}:${params.childUserId}`;
    if (childAssociationKeys.has(associationKey)) {
      return;
    }
    childAssociationKeys.add(associationKey);

    const normalizedConsentStatus = normalizeText(params.consentStatus) ?? undefined;
    const normalizedRegistrationStatus = normalizeText(params.registrationStatus) ?? undefined;
    const requiresChildEmail = !params.childEmail;
    const statusNote = requiresChildEmail
      ? 'Child email is required before child signer links can be sent.'
      : undefined;

    const next = childAssociationsByEvent.get(params.eventId) ?? [];
    next.push({
      childUserId: params.childUserId,
      childName: normalizeText(params.childName) ?? undefined,
      childEmail: params.childEmail,
      consentStatus: normalizedConsentStatus,
      registrationStatus: normalizedRegistrationStatus,
      requiresChildEmail,
      statusNote,
    });
    childAssociationsByEvent.set(params.eventId, next);
  };

  childRegistrationRows.forEach((registration) => {
    const eventId = normalizeText(registration.eventId);
    const childUserId = normalizeText(registration.registrantId);
    if (!eventId || !childUserId) return;
    childRegistrationByEventAndChild.set(`${eventId}:${childUserId}`, {
      consentStatus: normalizeText(registration.consentStatus),
      registrationStatus: normalizeText(registration.status),
    });
    addChildAssociation({
      eventId,
      childUserId,
      childName: childNameById.get(childUserId),
      childEmail: childEmailById.get(childUserId) || undefined,
      consentStatus: normalizeText(registration.consentStatus),
      registrationStatus: normalizeText(registration.status),
    });
  });

  discoverableEvents.forEach((event) => {
    const eventParticipantIds = participantIdsByEventId.get(event.id);
    const eventTeamIds = eventParticipantIds?.teamIds ?? [];
    const eventFreeAgentIds = eventParticipantIds?.freeAgentIds ?? [];
    const eventUserIds = eventParticipantIds?.userIds ?? [];

    linkedChildIds.forEach((childUserId) => {
      const childTeamIds = childTeamIdsByIdWithSlots.get(childUserId)
        ?? childTeamIdsById.get(childUserId)
        ?? [];
      const isOnTeam = childTeamIds.some((teamId) => eventTeamIds.includes(teamId));
      const isFreeAgent = eventFreeAgentIds.includes(childUserId);
      if (!isOnTeam && !isFreeAgent) {
        return;
      }
      const registrationMeta = childRegistrationByEventAndChild.get(`${event.id}:${childUserId}`);
      addChildAssociation({
        eventId: event.id,
        childUserId,
        childName: childNameById.get(childUserId),
        childEmail: childEmailById.get(childUserId) || undefined,
        consentStatus: registrationMeta?.consentStatus,
        registrationStatus: registrationMeta?.registrationStatus,
      });
    });

    if (userIsLinkedChild) {
      const isOnTeam = relevantTeamIds.some((teamId) => eventTeamIds.includes(teamId));
      const isParticipant = eventUserIds.includes(userId);
      const isFreeAgent = eventFreeAgentIds.includes(userId);
      if (isOnTeam || isParticipant || isFreeAgent) {
        const registrationMeta = childRegistrationByEventAndChild.get(`${event.id}:${userId}`);
        addChildAssociation({
          eventId: event.id,
          childUserId: userId,
          childName: childNameById.get(userId),
          childEmail: selfEmail ?? undefined,
          consentStatus: registrationMeta?.consentStatus,
          registrationStatus: registrationMeta?.registrationStatus,
        });
      }
    }
  });

  const childRegistrationByTeamAndChild = new Map<string, { consentStatus?: string; registrationStatus?: string }>();
  const childAssociationsByTeam = new Map<string, Array<{
    childUserId: string;
    childName?: string;
    childEmail?: string;
    consentStatus?: string;
    registrationStatus?: string;
    requiresChildEmail: boolean;
    statusNote?: string;
  }>>();
  const childTeamAssociationKeys = new Set<string>();
  const addChildTeamAssociation = (params: {
    teamId: string;
    childUserId: string;
    childName?: string;
    childEmail?: string;
    consentStatus?: string;
    registrationStatus?: string;
  }) => {
    const associationKey = `${params.teamId}:${params.childUserId}`;
    if (childTeamAssociationKeys.has(associationKey)) {
      return;
    }
    childTeamAssociationKeys.add(associationKey);

    const normalizedConsentStatus = normalizeText(params.consentStatus) ?? undefined;
    const normalizedRegistrationStatus = normalizeText(params.registrationStatus) ?? undefined;
    const requiresChildEmail = !params.childEmail;
    const statusNote = requiresChildEmail
      ? 'Child email is required before child signer links can be sent.'
      : undefined;

    const next = childAssociationsByTeam.get(params.teamId) ?? [];
    next.push({
      childUserId: params.childUserId,
      childName: normalizeText(params.childName) ?? undefined,
      childEmail: params.childEmail,
      consentStatus: normalizedConsentStatus,
      registrationStatus: normalizedRegistrationStatus,
      requiresChildEmail,
      statusNote,
    });
    childAssociationsByTeam.set(params.teamId, next);
  };

  teamRegistrations.forEach((registration) => {
    const teamId = normalizeText(registration.teamId);
    const childUserId = normalizeText(registration.userId);
    const registrantType = normalizeText(registration.registrantType)?.toUpperCase();
    if (!teamId || !childUserId || registrantType !== 'CHILD') {
      return;
    }
    childRegistrationByTeamAndChild.set(`${teamId}:${childUserId}`, {
      consentStatus: normalizeText(registration.consentStatus),
      registrationStatus: normalizeText(registration.status),
    });
    addChildTeamAssociation({
      teamId,
      childUserId,
      childName: childNameById.get(childUserId),
      childEmail: childEmailById.get(childUserId) || undefined,
      consentStatus: normalizeText(registration.consentStatus),
      registrationStatus: normalizeText(registration.status),
    });
  });

  linkedChildIds.forEach((childUserId) => {
    const childTeamIds = childTeamIdsByIdWithSlots.get(childUserId)
      ?? childTeamIdsById.get(childUserId)
      ?? [];
    childTeamIds.forEach((teamId) => {
      const registrationMeta = childRegistrationByTeamAndChild.get(`${teamId}:${childUserId}`);
      addChildTeamAssociation({
        teamId,
        childUserId,
        childName: childNameById.get(childUserId),
        childEmail: childEmailById.get(childUserId) || undefined,
        consentStatus: registrationMeta?.consentStatus,
        registrationStatus: registrationMeta?.registrationStatus,
      });
    });
  });

  if (userIsLinkedChild) {
    relevantTeamIds.forEach((teamId) => {
      const registrationMeta = childRegistrationByTeamAndChild.get(`${teamId}:${userId}`);
      addChildTeamAssociation({
        teamId,
        childUserId: userId,
        childName: childNameById.get(userId),
        childEmail: selfEmail ?? undefined,
        consentStatus: registrationMeta?.consentStatus,
        registrationStatus: registrationMeta?.registrationStatus,
      });
    });
  }

  const organizationIds = Array.from(new Set([
    ...discoverableEvents
      .map((event) => normalizeText(event.organizationId))
      .filter((value): value is string => Boolean(value)),
    ...discoverableTeams
      .map((team) => normalizeText(team.organizationId))
      .filter((value): value is string => Boolean(value)),
    ...templates
      .map((template) => normalizeText(template.organizationId))
      .filter((value): value is string => Boolean(value)),
  ]));

  const organizations = organizationIds.length
    ? await prisma.organizations.findMany({
      where: { id: { in: organizationIds } },
      select: {
        id: true,
        name: true,
      },
    })
    : [];
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, normalizeText(organization.name) ?? 'Organization']),
  );
  const satisfactionScopes = [
    ...organizationIds.map((scopeId) => ({ scopeType: 'ORGANIZATION' as const, scopeId })),
    ...discoverableEventIds.map((scopeId) => ({ scopeType: 'EVENT_PARTICIPATION' as const, scopeId })),
    ...relevantProfileTeamIds.map((scopeId) => ({ scopeType: 'TEAM_MEMBERSHIP' as const, scopeId })),
  ];
  const satisfactionRows = documentSubjectIds.length
    && templateIdsToLoad.length
    && satisfactionScopes.length
    ? await findCompletedDocumentSatisfactions({
      documentSubjectIds,
      templateDocumentIds: templateIdsToLoad,
      scopes: satisfactionScopes,
    })
    : [];
  const signerStateRows = documentSubjectIds.length
    && templateIdsToLoad.length
    && satisfactionScopes.length
    ? await prisma.documentRequirementSatisfactions.findMany({
      where: {
        documentSubjectId: { in: documentSubjectIds },
        templateDocumentId: { in: templateIdsToLoad },
        invalidatedAt: null,
        OR: satisfactionScopes.map((scope) => ({
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        })),
      },
      select: {
        documentSubjectId: true,
        templateDocumentId: true,
        scopeType: true,
        scopeId: true,
        completedSignerRoles: true,
      },
    })
    : [];
  const completedSignerRolesBySatisfactionKey = new Map<string, string[]>(
    signerStateRows.map((row) => {
      const completedSignerRoles = Array.isArray(row.completedSignerRoles)
        ? row.completedSignerRoles.filter((role): role is string => typeof role === 'string')
        : [];
      return [
        `${row.documentSubjectId}::${row.templateDocumentId}::${row.scopeType}::${row.scopeId}`,
        completedSignerRoles,
      ];
    }),
  );
  type DocumentSatisfactionCardContext = {
    template: { id: string; signOnce: boolean; organizationId: string | null };
    signerContext: SignerContext;
    childUserId?: string;
    scopeType: 'EVENT_PARTICIPATION' | 'TEAM_MEMBERSHIP';
    scopeId: string;
    organizationId?: string | null;
  };
  const getDocumentSatisfactionKey = (
    params: DocumentSatisfactionCardContext,
  ): string | undefined => {
    const organizationId = normalizeText(params.organizationId ?? params.template.organizationId);
    const subjectUserId = params.signerContext === 'participant'
      ? userId
      : params.childUserId;
    const documentSubjectId = organizationId && subjectUserId
      ? documentSubjectIdByOrganizationAndUserId.get(`${organizationId}::${subjectUserId}`)
      : undefined;
    const scopeType = params.template.signOnce ? 'ORGANIZATION' : params.scopeType;
    const scopeId = params.template.signOnce ? organizationId : params.scopeId;
    if (!documentSubjectId || !scopeId) {
      return undefined;
    }
    return `${documentSubjectId}::${params.template.id}::${scopeType}::${scopeId}`;
  };
  const hasCompletedDocumentSigner = (
    params: DocumentSatisfactionCardContext,
  ): boolean => {
    const satisfactionKey = getDocumentSatisfactionKey(params);
    if (!satisfactionKey) {
      return false;
    }
    const completedSignerRoles = completedSignerRolesBySatisfactionKey.get(satisfactionKey);
    return completedSignerRoles
      ? hasCompletedDocumentSignerRole(completedSignerRoles, params.signerContext)
      : false;
  };
  const completeSatisfactionKeys = new Set<string>(
    satisfactionRows.map((row) =>
      `${row.documentSubjectId}::${row.templateDocumentId}::${row.scopeType}::${row.scopeId}`),
  );
  const hasCompleteDocumentSatisfaction = (
    params: DocumentSatisfactionCardContext,
  ): boolean => {
    const satisfactionKey = getDocumentSatisfactionKey(params);
    return satisfactionKey ? completeSatisfactionKeys.has(satisfactionKey) : false;
  };
  const discoverableEventsSorted = [...discoverableEvents].sort(
    (left, right) => toTimestamp(right.start) - toTimestamp(left.start),
  );
  const discoverableTeamsSorted = [...discoverableTeams].sort((left, right) => {
    const leftTime = toTimestamp(left.updatedAt ?? null);
    const rightTime = toTimestamp(right.updatedAt ?? null);
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return (normalizeText(left.name) ?? '').localeCompare(normalizeText(right.name) ?? '', undefined, { sensitivity: 'base' });
  });
  const selfProfileTeamIds = new Set(
    [
      ...relevantTeamIds,
      ...teamRegistrations
        .filter((registration) =>
          normalizeText(registration.userId) === userId
          && normalizeText(registration.registrantType)?.toUpperCase() !== 'CHILD',
        )
        .map((registration) => normalizeText(registration.teamId))
        .filter((value): value is string => Boolean(value)),
    ],
  );

  type SignedDocumentScopeStatus = {
    status: unknown;
    signedAt: string | null;
    createdAt: Date | null;
  };
  const signedByTemplateScope = new Map<string, SignedDocumentScopeStatus>();
  const signedByEventScope = new Map<string, SignedDocumentScopeStatus>();
  const signedByTeamScope = new Map<string, SignedDocumentScopeStatus>();
  const setLatestScopeStatus = (
    map: Map<string, SignedDocumentScopeStatus>,
    key: string,
    document: SignedDocumentScopeStatus,
  ) => {
    const existing = map.get(key);
    const documentTimestamp = toTimestamp(document.signedAt ?? document.createdAt);
    const existingTimestamp = existing
      ? toTimestamp(existing.signedAt ?? existing.createdAt)
      : 0;
    if (!existing || documentTimestamp >= existingTimestamp) {
      map.set(key, document);
    }
  };
  signedDocuments.forEach((document) => {
    const template = templateById.get(document.templateId);
    const requiredSignerType = normalizeRequiredSignerType(template?.requiredSignerType);
    const signerContext = normalizeSignerContextValue(document.signerRole) ?? (
      requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD'
        ? 'parent_guardian'
        : requiredSignerType === 'CHILD'
          ? 'child'
          : 'participant'
    );
    const childUserId = signerContext === 'participant'
      ? undefined
      : normalizeText(document.hostId);
    const status = {
      status: document.status,
      signedAt: document.signedAt,
      createdAt: document.createdAt,
    };
    setLatestScopeStatus(
      signedByTemplateScope,
      buildTemplateScopeKey({
        templateId: document.templateId,
        signerContext,
        childUserId,
      }),
      status,
    );
    const eventId = normalizeText(document.eventId);
    if (eventId) {
      setLatestScopeStatus(
        signedByEventScope,
        buildEventScopeKey({
          eventId,
          templateId: document.templateId,
          signerContext,
          childUserId,
        }),
        status,
      );
    }
    const teamId = normalizeText(document.teamId);
    if (teamId) {
      setLatestScopeStatus(
        signedByTeamScope,
        buildTeamScopeKey({
          teamId,
          templateId: document.templateId,
          signerContext,
          childUserId,
        }),
        status,
      );
    }
  });


  const unsignedCards: ProfileDocumentCard[] = [];
  const unsignedCardKeys = new Set<string>();
  const signOnceUnsignedScopeKeys = new Set<string>();
  const childUnsignedCountsByChildId = new Map<string, number>();

  discoverableEventsSorted.forEach((event) => {
    const templateIds = Array.isArray(event.requiredTemplateIds)
      ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
    if (!templateIds.length) {
      return;
    }

    templateIds.forEach((templateId) => {
      const template = templateById.get(templateId);
      if (!template) {
        return;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const signerContexts: Array<{
        signerContext: SignerContext;
        childUserId?: string;
        childName?: string;
        childEmail?: string;
        consentStatus?: string;
        requiresChildEmail?: boolean;
        statusNote?: string;
      }> = [];
      const childRows = childAssociationsByEvent.get(event.id) ?? [];

      if (requiredSignerType === 'PARTICIPANT') {
        signerContexts.push({ signerContext: 'participant' });
      }
      if (requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'parent_guardian',
            childUserId: childRow.childUserId,
            childName: childRow.childName,
            childEmail: childRow.childEmail,
            consentStatus: childRow.consentStatus,
            requiresChildEmail: childRow.requiresChildEmail,
            statusNote: childRow.statusNote,
          });
        });
      }
      if (requiredSignerType === 'CHILD' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'child',
            childUserId: childRow.childUserId,
            childName: childRow.childName,
            childEmail: childRow.childEmail,
            consentStatus: childRow.consentStatus,
            requiresChildEmail: childRow.requiresChildEmail,
            statusNote: childRow.statusNote,
          });
        });
      }

      signerContexts.forEach((context) => {
        const scopedChildUserId = context.signerContext === 'participant' ? undefined : context.childUserId;
        const templateScopeKey = buildTemplateScopeKey({
          templateId: template.id,
          signerContext: context.signerContext,
          childUserId: scopedChildUserId,
        });
        if (template.signOnce) {
          if (signOnceUnsignedScopeKeys.has(templateScopeKey)) {
            return;
          }
          signOnceUnsignedScopeKeys.add(templateScopeKey);
        }
        if (
          hasCompleteDocumentSatisfaction({
            template: {
              ...template,
              signOnce: template.signOnce ?? false,
            },
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
            scopeType: 'EVENT_PARTICIPATION',
            scopeId: event.id,
            organizationId: event.organizationId,
          })
          || hasCompletedDocumentSigner({
            template: {
              ...template,
              signOnce: template.signOnce ?? false,
            },
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
            scopeType: 'EVENT_PARTICIPATION',
            scopeId: event.id,
            organizationId: event.organizationId,
          })
        ) {
          return;
        }

        const cardId = template.signOnce
          ? `once:${templateScopeKey}`
          : `${event.id}:${template.id}:${context.signerContext}:${context.childUserId ?? 'self'}`;
        if (unsignedCardKeys.has(cardId)) {
          return;
        }
        unsignedCardKeys.add(cardId);
        if (context.signerContext === 'child' && scopedChildUserId) {
          const currentChildUnsignedCount = childUnsignedCountsByChildId.get(scopedChildUserId) ?? 0;
          childUnsignedCountsByChildId.set(scopedChildUserId, currentChildUnsignedCount + 1);
        }

        const viewerCanProxyChildSignature = canViewerProxyChildSignature({
          signerContext: context.signerContext,
          viewerUserId: userId,
          childUserId: scopedChildUserId,
          childEmail: context.childEmail,
        });
        if (
          !viewerCanProxyChildSignature
          && !isSignerContextVisibleForViewer({
            viewerUserId: userId,
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
          })
        ) {
          return;
        }

        const organizationDisplay = getDisplayOrganizationName({
          eventOrganizationId: event.organizationId,
          templateOrganizationId: template.organizationId,
          organizationsById,
        });
        const childMustSignFromOwnAccount = isChildSignatureRestrictedToChildAccount({
          signerContext: context.signerContext,
          viewerUserId: userId,
          childUserId: context.childUserId,
          childEmail: context.childEmail,
        });
        const requiresChildEmailForViewer = Boolean(
          context.signerContext === 'child'
          && context.requiresChildEmail
          && !viewerCanProxyChildSignature,
        );
        const statusNotes = [
          requiresChildEmailForViewer ? context.statusNote : undefined,
          childMustSignFromOwnAccount ? 'Waiting on child signature from the child account.' : undefined,
          viewerCanProxyChildSignature ? 'Child email is missing. Parent/guardian can sign on behalf of this child.' : undefined,
        ].filter((value): value is string => Boolean(value && value.trim()));
        const statusNote = statusNotes.length ? statusNotes.join(' ') : undefined;

        unsignedCards.push({
          id: cardId,
          status: 'UNSIGNED',
          eventId: event.id,
          eventName: normalizeText(event.name) ?? 'Event',
          organizationId: organizationDisplay.organizationId,
          organizationName: organizationDisplay.organizationName,
          templateId: template.id,
          title: normalizeText(template.title) ?? 'Required Document',
          type: normalizeTemplateType(template.type),
          documentRequirementTitle: normalizeText(template.documentRequirement?.title) ?? normalizeText(template.title),
          versionSequence: template.versionSequence,
          requiredSignerType,
          requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
          signerContext: context.signerContext,
          signerContextLabel: getSignerContextLabel(context.signerContext),
          childUserId: context.childUserId,
          childName: context.childName,
          childEmail: context.childEmail,
          consentStatus: context.consentStatus,
          requiresChildEmail: requiresChildEmailForViewer,
          statusNote,
          content: normalizeTemplateType(template.type) === 'TEXT' ? normalizeText(template.content) : undefined,
        });
      });
    });
  });

  discoverableTeamsSorted.forEach((team) => {
    const templateIds = Array.isArray(team.requiredTemplateIds)
      ? team.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
    if (!templateIds.length) {
      return;
    }

    templateIds.forEach((templateId) => {
      const template = templateById.get(templateId);
      if (!template) {
        return;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const signerContexts: Array<{
        signerContext: SignerContext;
        childUserId?: string;
        childName?: string;
        childEmail?: string;
        consentStatus?: string;
        requiresChildEmail?: boolean;
        statusNote?: string;
      }> = [];
      const childRows = childAssociationsByTeam.get(team.id) ?? [];

      if (requiredSignerType === 'PARTICIPANT' && selfProfileTeamIds.has(team.id)) {
        signerContexts.push({ signerContext: 'participant' });
      }
      if (requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'parent_guardian',
            childUserId: childRow.childUserId,
            childName: childRow.childName,
            childEmail: childRow.childEmail,
            consentStatus: childRow.consentStatus,
            requiresChildEmail: childRow.requiresChildEmail,
            statusNote: childRow.statusNote,
          });
        });
      }
      if (requiredSignerType === 'CHILD' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'child',
            childUserId: childRow.childUserId,
            childName: childRow.childName,
            childEmail: childRow.childEmail,
            consentStatus: childRow.consentStatus,
            requiresChildEmail: childRow.requiresChildEmail,
            statusNote: childRow.statusNote,
          });
        });
      }

      signerContexts.forEach((context) => {
        const scopedChildUserId = context.signerContext === 'participant' ? undefined : context.childUserId;
        const templateScopeKey = buildTemplateScopeKey({
          templateId: template.id,
          signerContext: context.signerContext,
          childUserId: scopedChildUserId,
        });
        if (template.signOnce) {
          if (signOnceUnsignedScopeKeys.has(templateScopeKey)) {
            return;
          }
          signOnceUnsignedScopeKeys.add(templateScopeKey);
        }
        if (
          hasCompleteDocumentSatisfaction({
            template: {
              ...template,
              signOnce: template.signOnce ?? false,
            },
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
            scopeType: 'TEAM_MEMBERSHIP',
            scopeId: team.id,
            organizationId: team.organizationId,
          })
          || hasCompletedDocumentSigner({
            template: {
              ...template,
              signOnce: template.signOnce ?? false,
            },
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
            scopeType: 'TEAM_MEMBERSHIP',
            scopeId: team.id,
            organizationId: team.organizationId,
          })
        ) {
          return;
        }

        const cardId = template.signOnce
          ? `once:${templateScopeKey}`
          : `team:${team.id}:${template.id}:${context.signerContext}:${context.childUserId ?? 'self'}`;
        if (unsignedCardKeys.has(cardId)) {
          return;
        }
        unsignedCardKeys.add(cardId);
        if (context.signerContext === 'child' && scopedChildUserId) {
          const currentChildUnsignedCount = childUnsignedCountsByChildId.get(scopedChildUserId) ?? 0;
          childUnsignedCountsByChildId.set(scopedChildUserId, currentChildUnsignedCount + 1);
        }

        const viewerCanProxyChildSignature = canViewerProxyChildSignature({
          signerContext: context.signerContext,
          viewerUserId: userId,
          childUserId: scopedChildUserId,
          childEmail: context.childEmail,
        });
        if (
          !viewerCanProxyChildSignature
          && !isSignerContextVisibleForViewer({
            viewerUserId: userId,
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
          })
        ) {
          return;
        }

        const organizationDisplay = getDisplayOrganizationName({
          eventOrganizationId: team.organizationId,
          templateOrganizationId: template.organizationId,
          organizationsById,
        });
        const childMustSignFromOwnAccount = isChildSignatureRestrictedToChildAccount({
          signerContext: context.signerContext,
          viewerUserId: userId,
          childUserId: context.childUserId,
          childEmail: context.childEmail,
        });
        const requiresChildEmailForViewer = Boolean(
          context.signerContext === 'child'
          && context.requiresChildEmail
          && !viewerCanProxyChildSignature,
        );
        const statusNotes = [
          requiresChildEmailForViewer ? context.statusNote : undefined,
          childMustSignFromOwnAccount ? 'Waiting on child signature from the child account.' : undefined,
          viewerCanProxyChildSignature ? 'Child email is missing. Parent/guardian can sign on behalf of this child.' : undefined,
        ].filter((value): value is string => Boolean(value && value.trim()));
        const statusNote = statusNotes.length ? statusNotes.join(' ') : undefined;

        unsignedCards.push({
          id: cardId,
          status: 'UNSIGNED',
          teamId: team.id,
          teamName: normalizeText(team.name) ?? 'Team',
          organizationId: organizationDisplay.organizationId,
          organizationName: organizationDisplay.organizationName,
          templateId: template.id,
          documentRequirementTitle: normalizeText(template.documentRequirement?.title) ?? normalizeText(template.title),
          versionSequence: template.versionSequence,
          title: normalizeText(template.title) ?? 'Required Document',
          type: normalizeTemplateType(template.type),
          requiredSignerType,
          requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
          signerContext: context.signerContext,
          signerContextLabel: getSignerContextLabel(context.signerContext),
          childUserId: context.childUserId,
          childName: context.childName,
          childEmail: context.childEmail,
          consentStatus: context.consentStatus,
          requiresChildEmail: requiresChildEmailForViewer,
          statusNote,
          content: normalizeTemplateType(template.type) === 'TEXT' ? normalizeText(template.content) : undefined,
        });
      });
    });
  });

  unsignedCards.sort((left, right) => {
    const leftEventStart = toTimestamp(eventById.get(left.eventId ?? '')?.start ?? null);
    const rightEventStart = toTimestamp(eventById.get(right.eventId ?? '')?.start ?? null);
    if (leftEventStart !== rightEventStart) {
      return rightEventStart - leftEventStart;
    }
    const leftTeamUpdatedAt = toTimestamp(teamById.get(left.teamId ?? '')?.updatedAt ?? null);
    const rightTeamUpdatedAt = toTimestamp(teamById.get(right.teamId ?? '')?.updatedAt ?? null);
    if (leftTeamUpdatedAt !== rightTeamUpdatedAt) {
      return rightTeamUpdatedAt - leftTeamUpdatedAt;
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  });

  const signedCards: ProfileDocumentCard[] = [];
  const voidedCardEntries: Array<{
    card: ProfileDocumentCard;
    importedAt?: Date | null;
    signedAt?: string | Date | null;
  }> = [];
  signedDocuments
    .filter((document) => isSignedStatus(document.status) || (
      document.provenance === 'IMPORTED'
      && normalizeText(document.status)?.toUpperCase() === 'VOID'
    ))
    .forEach((document) => {
      const event = normalizeText(document.eventId) ? eventById.get(normalizeText(document.eventId) as string) : undefined;
      const team = normalizeText(document.teamId) ? teamById.get(normalizeText(document.teamId) as string) : undefined;
      const template = templateById.get(document.templateId);
      const requiredSignerType = normalizeRequiredSignerType(template?.requiredSignerType);
      const signerContext = normalizeSignerContextValue(document.signerRole) ?? (
        requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD'
          ? 'parent_guardian'
          : requiredSignerType === 'CHILD'
            ? 'child'
            : 'participant'
      );
      const documentSubjectUserId = document.documentSubjectId
        ? documentSubjectUserIdById.get(document.documentSubjectId)
        : undefined;
      const childUserId = signerContext === 'participant'
        ? undefined
        : document.provenance === 'IMPORTED'
          ? documentSubjectUserId
          : normalizeText(document.hostId);
      const latestTemplateScopeStatus = signedByTemplateScope.get(buildTemplateScopeKey({
        templateId: document.templateId,
        signerContext,
        childUserId,
      }))?.status;
      const scopedEventId = normalizeText(document.eventId);
      const scopedTeamId = normalizeText(document.teamId);
      const latestEventScopeStatus = scopedEventId
        ? signedByEventScope.get(buildEventScopeKey({
          eventId: scopedEventId,
          templateId: document.templateId,
          signerContext,
          childUserId,
        }))?.status
        : undefined;
      const latestTeamScopeStatus = scopedTeamId
        ? signedByTeamScope.get(buildTeamScopeKey({
          teamId: scopedTeamId,
          templateId: document.templateId,
          signerContext,
          childUserId,
        }))?.status
        : undefined;
      const latestScopeStatus = (template?.signOnce ?? false)
        ? latestTemplateScopeStatus
        : (latestEventScopeStatus ?? latestTeamScopeStatus ?? latestTemplateScopeStatus);
      if (isRevokedStatus(latestScopeStatus)) {
        return;
      }
      const signerUserId = normalizeText(document.userId);
      const isVisibleToViewer = document.provenance === 'IMPORTED'
        ? isImportedSubjectVisibleToViewer(document)
        : isSignerContextVisibleForViewer({
          viewerUserId: userId,
          signerContext,
          childUserId,
          signerUserId,
        });
      if (!isVisibleToViewer) {
        return;
      }
      const organizationDisplay = getDisplayOrganizationName({
        eventOrganizationId: event?.organizationId ?? team?.organizationId,
        templateOrganizationId: template?.organizationId,
        organizationsById,
      });
      const type = document.provenance === 'IMPORTED'
        ? 'PDF'
        : normalizeTemplateType(template?.type);
      const childName = childUserId ? childNameById.get(childUserId) : undefined;

      const card: ProfileDocumentCard = {
        id: document.id,
        status: document.provenance === 'IMPORTED'
          && normalizeText(document.status)?.toUpperCase() === 'VOID'
          ? 'VOID'
          : 'SIGNED',
        eventId: event?.id ?? normalizeText(document.eventId),
        eventName: normalizeText(event?.name) ?? undefined,
        teamId: team?.id ?? normalizeText(document.teamId),
        teamName: normalizeText(team?.name) ?? undefined,
        organizationId: organizationDisplay.organizationId,
        documentRequirementTitle: normalizeText(template?.documentRequirement?.title) ?? normalizeText(template?.title),
        versionSequence: template?.versionSequence,
        organizationName: organizationDisplay.organizationName,
        templateId: normalizeText(document.templateId) ?? '',
        title: normalizeText(template?.title) ?? 'Signed Document',
        type,
        provenance: document.provenance,
        scopeType: normalizeText(document.scopeType),
        scopeId: normalizeText(document.scopeId),
        historicalSigningDate: document.historicalSigningDate?.toISOString(),
        requiredSignerType,
        requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
        signerContext,
        signerContextLabel: getSignerContextLabel(signerContext),
        childUserId,
        signedAt: document.provenance === 'IMPORTED'
          ? document.historicalSigningDate?.toISOString()
          : normalizeText(document.signedAt) ?? (document.createdAt ? document.createdAt.toISOString() : undefined),
        signedDocumentRecordId: document.id,
        viewUrl: type === 'PDF' ? `/api/documents/signed/${document.id}/file` : undefined,
        content: type === 'TEXT' ? normalizeText(template?.content) : undefined,
      };
      if (card.status === 'VOID') {
        voidedCardEntries.push({
          card,
          importedAt: document.importedAt,
          signedAt: card.signedAt,
        });
      } else {
        signedCards.push(card);
      }
    });

  signedCards.sort((left, right) => toTimestamp(right.signedAt) - toTimestamp(left.signedAt));
  voidedCardEntries.sort((left, right) => (
    toTimestamp(right.importedAt ?? right.signedAt)
    - toTimestamp(left.importedAt ?? left.signedAt)
  ));
  const voidedCards = voidedCardEntries.map(({ card }) => card);

  return NextResponse.json({
    viewerUserId: userId,
    unsigned: unsignedCards,
    voided: voidedCards,
    signed: signedCards,
    childUnsignedCounts: Array.from(childUnsignedCountsByChildId.entries()).map(([childUserId, unsignedCount]) => ({
      childUserId,
      unsignedCount,
    })),
  }, { status: 200 });
}
