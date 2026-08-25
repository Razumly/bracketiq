import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { calculateAgeOnDate } from '@/lib/age';
import {
  buildRequiredSignatureTasks,
  buildSignatureCompletionKey,
  normalizeRegistrationAnswersSnapshot,
  pickPrimaryBill,
  type ComplianceTemplate,
  type EventTeamComplianceResponse,
  type TeamCompliancePaymentSummary,
  type TeamComplianceRequiredDocument,
  type TeamComplianceUserSummary,
} from '@/lib/eventTeamCompliance';
import {
  documentSubjectIdFor,
  findCompletedDocumentSatisfactions,
} from '@/server/documentEvidence';
import { loadBillDiscountSummaries, withBillDiscountAmounts } from '@/server/billing/billDiscountSummaries';

export const dynamic = 'force-dynamic';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeId(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toDisplayName = (user: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
}): string => {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName) {
    return fullName;
  }
  if (typeof user.userName === 'string' && user.userName.trim().length > 0) {
    return user.userName.trim();
  }
  return user.id;
};

const toPaymentSummary = (bill: {
  id: string;
  totalAmountCents: number | null;
  paidAmountCents: number | null;
  originalAmountCents?: number | null;
  discountAmountCents?: number | null;
  discountedAmountCents?: number | null;
  discounts?: TeamCompliancePaymentSummary['discounts'];
  status: string | null;
  manualPaymentProofStatus?: string | null;
  manualPaymentProofCount?: number | null;
} | null, inheritedFromTeamBill = false, paymentPending = false): TeamCompliancePaymentSummary => {
  if (!bill) {
    return {
      hasBill: false,
      billId: null,
      totalAmountCents: 0,
      paidAmountCents: 0,
      originalAmountCents: 0,
      discountAmountCents: 0,
      discountedAmountCents: 0,
      discounts: [],
      status: null,
      isPaidInFull: false,
      paymentPending,
      inheritedFromTeamBill,
    };
  }
  const totalAmountCents = Number.isFinite(bill.totalAmountCents)
    ? Number(bill.totalAmountCents)
    : Number(bill.totalAmountCents ?? 0);
  const paidAmountCents = Number.isFinite(bill.paidAmountCents)
    ? Number(bill.paidAmountCents)
    : Number(bill.paidAmountCents ?? 0);
  const originalAmountCents = Number.isFinite(Number(bill.originalAmountCents))
    ? Number(bill.originalAmountCents)
    : totalAmountCents;
  const discountAmountCents = Number.isFinite(Number(bill.discountAmountCents))
    ? Number(bill.discountAmountCents)
    : Math.max(0, originalAmountCents - totalAmountCents);
  const discountedAmountCents = Number.isFinite(Number(bill.discountedAmountCents))
    ? Number(bill.discountedAmountCents)
    : Math.max(0, originalAmountCents - discountAmountCents);
  const normalizedStatus = bill.status ? String(bill.status).toUpperCase() : null;
  const amountDueCents = discountedAmountCents > 0 ? discountedAmountCents : totalAmountCents;
  const isPaidInFull = amountDueCents > 0
    && paidAmountCents >= amountDueCents
    && (!normalizedStatus || normalizedStatus === 'PAID');
  return {
    hasBill: true,
    billId: bill.id,
    totalAmountCents,
    paidAmountCents,
    originalAmountCents,
    discountAmountCents,
    discountedAmountCents,
    discounts: Array.isArray(bill.discounts) ? bill.discounts : [],
    status: normalizedStatus,
    isPaidInFull,
    manualPaymentProofStatus: bill.manualPaymentProofStatus ?? null,
    manualPaymentProofCount: Number.isFinite(Number(bill.manualPaymentProofCount))
      ? Number(bill.manualPaymentProofCount)
      : 0,
    paymentPending,
    inheritedFromTeamBill,
  };
};

const ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES = ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] as const;
const INELIGIBLE_EVENT_PERSON_REGISTRATION_STATUSES = new Set(['CANCELLED', 'PAYMENT_FAILED']);

const isEligibleEventPersonRegistration = (status: unknown): boolean => {
  const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
  return !normalizedStatus || !INELIGIBLE_EVENT_PERSON_REGISTRATION_STATUSES.has(normalizedStatus);
};

const buildOccurrenceWhere = (req: NextRequest) => {
  const slotId = normalizeId(req.nextUrl.searchParams.get('slotId'));
  const occurrenceDate = normalizeId(req.nextUrl.searchParams.get('occurrenceDate'));
  if (slotId && occurrenceDate) {
    return { slotId, occurrenceDate };
  }
  return { slotId: null, occurrenceDate: null };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSession(req);
  const { eventId } = await params;

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      start: true,
      teamSignup: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      requiredTemplateIds: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const canManage = await canManageEvent(
    {
      userId: session.userId,
      isAdmin: session.isAdmin,
    },
    event,
  );
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!event.teamSignup) {
    const payload: EventTeamComplianceResponse = { teams: [] };
    return NextResponse.json(payload, { status: 200 });
  }

  const occurrenceWhere = buildOccurrenceWhere(req);
  const teamRegistrationRows = await prisma.eventRegistrations.findMany({
    where: {
      eventId: event.id,
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: { in: [...ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES] },
      ...occurrenceWhere,
    },
    select: {
      id: true,
      registrantId: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
  const teamIds = Array.from(
    new Set(
      teamRegistrationRows
        .map((row) => normalizeId(row.registrantId))
        .filter((teamId): teamId is string => Boolean(teamId)),
    ),
  );
  if (!teamIds.length) {
    const payload: EventTeamComplianceResponse = { teams: [] };
    return NextResponse.json(payload, { status: 200 });
  }

  const registrationByTeamId = new Map<string, { id: string; status: string | null; updatedAt: Date | null; createdAt: Date | null }>();
  teamRegistrationRows.forEach((registration) => {
    const teamId = normalizeId(registration.registrantId);
    if (!teamId) {
      return;
    }
    const existing = registrationByTeamId.get(teamId);
    const existingTs = Math.max(toTimestamp(existing?.updatedAt), toTimestamp(existing?.createdAt));
    const nextTs = Math.max(toTimestamp(registration.updatedAt), toTimestamp(registration.createdAt));
    if (!existing || nextTs >= existingTs) {
      registrationByTeamId.set(teamId, {
        id: registration.id,
        status: registration.status ? String(registration.status) : null,
        updatedAt: registration.updatedAt ?? null,
        createdAt: registration.createdAt ?? null,
      });
    }
  });

  const [teams, templates] = await Promise.all([
    prisma.teams.findMany({
      where: { id: { in: teamIds } },
      select: {
        id: true,
        name: true,
        playerIds: true,
        parentTeamId: true,
      },
    }),
    (() => {
      const requiredTemplateIds = normalizeIdList(event.requiredTemplateIds);
      if (!requiredTemplateIds.length) {
        return Promise.resolve<ComplianceTemplate[]>([]);
      }
      return prisma.templateDocuments.findMany({
        where: { id: { in: requiredTemplateIds } },
        select: {
          id: true,
          title: true,
          type: true,
          signOnce: true,
          requiredSignerType: true,
        },
      });
    })(),
  ]);
  const answerResponses: Array<{ subjectId: string; answersSnapshot: unknown }> = registrationByTeamId.size && typeof (prisma as any).registrationQuestionResponses?.findMany === 'function'
    ? await (prisma as any).registrationQuestionResponses.findMany({
      where: {
        subjectType: 'EVENT_REGISTRATION' as any,
        subjectId: { in: Array.from(registrationByTeamId.values()).map((registration) => registration.id) },
      },
      select: {
        subjectId: true,
        answersSnapshot: true,
      },
    })
    : [];
  const answersByRegistrationId = new Map(
    answerResponses.map((response) => [
      response.subjectId,
      normalizeRegistrationAnswersSnapshot(response.answersSnapshot),
    ]),
  );
  const teamOwnerIds = Array.from(
    new Set(
      teamIds.concat(
        normalizeIdList(teams.map((team) => team.parentTeamId)),
      ),
    ),
  );
  const teamBills = teamOwnerIds.length
    ? await prisma.bills.findMany({
      where: {
        eventId,
        ownerType: 'TEAM',
        ownerId: { in: teamOwnerIds },
      },
      select: {
        id: true,
        ownerId: true,
        totalAmountCents: true,
        paidAmountCents: true,
        sourceType: true,
        sourceId: true,
        status: true,
        parentBillId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    : [];

  const playerIds = Array.from(
    new Set(
      teams.flatMap((team) => normalizeIdList(team.playerIds)),
    ),
  );

  const [users, registrations, userBills] = await Promise.all([
    playerIds.length
      ? prisma.userData.findMany({
        where: { id: { in: playerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
          dateOfBirth: true,
        },
      })
      : Promise.resolve([]),
    playerIds.length
      ? prisma.eventRegistrations.findMany({
        where: {
          eventId,
          eventTeamId: { in: teamIds },
          registrantId: { in: playerIds },
          registrantType: { in: ['SELF', 'CHILD'] },
        },
        select: {
          eventTeamId: true,
          registrantId: true,
          registrantType: true,
          parentId: true,
          status: true,
          updatedAt: true,
          createdAt: true,
        },
      })
      : Promise.resolve([]),
    (() => {
      const parentBillIds = teamBills
        .filter((bill) => !normalizeId(bill.parentBillId))
        .map((bill) => bill.id);
      if (!playerIds.length || !parentBillIds.length) {
        return Promise.resolve<Array<{
          id: string;
          ownerId: string;
          totalAmountCents: number;
          paidAmountCents: number;
          sourceType: string | null;
          sourceId: string | null;
          status: string;
          parentBillId: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>>([]);
      }
      return prisma.bills.findMany({
        where: {
          eventId,
          ownerType: 'USER',
          ownerId: { in: playerIds },
          parentBillId: { in: parentBillIds },
        },
        select: {
          id: true,
          ownerId: true,
          totalAmountCents: true,
          paidAmountCents: true,
          sourceType: true,
          sourceId: true,
          status: true,
          parentBillId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    })(),
  ]);
  const latestRegistrationByEventTeamAndUserId = new Map<string, {
    registrantType: string | null;
    parentId: string | null;
    status: string | null;
    updatedAt: Date | null;
    createdAt: Date | null;
  }>();
  registrations.forEach((registration) => {
    const eventTeamId = normalizeId(registration.eventTeamId);
    const userId = normalizeId(registration.registrantId);
    if (!eventTeamId || !userId) {
      return;
    }
    const key = `${eventTeamId}::${userId}`;
    const existing = latestRegistrationByEventTeamAndUserId.get(key);
    const existingTs = Math.max(toTimestamp(existing?.updatedAt), toTimestamp(existing?.createdAt));
    const nextTs = Math.max(toTimestamp(registration.updatedAt), toTimestamp(registration.createdAt));
    if (!existing || nextTs >= existingTs) {
      latestRegistrationByEventTeamAndUserId.set(key, {
        registrantType: registration.registrantType ? String(registration.registrantType) : null,
        parentId: normalizeId(registration.parentId),
        status: registration.status ? String(registration.status) : null,
        updatedAt: registration.updatedAt ?? null,
        createdAt: registration.createdAt ?? null,
      });
    }
  });

  const allBillIdsForProofs = [...teamBills, ...userBills].map((bill) => bill.id);
  const proofRows = allBillIdsForProofs.length && typeof (prisma as any).billPaymentProofs?.findMany === 'function'
    ? await (prisma as any).billPaymentProofs.findMany({
      where: { billId: { in: allBillIdsForProofs } },
      select: { billId: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    : [];
  const proofSummaryByBillId = new Map<string, { count: number; status: string | null }>();
  (proofRows as Array<{ billId: string; status: string | null }>).forEach((proof) => {
    const existing = proofSummaryByBillId.get(proof.billId);
    if (existing) {
      existing.count += 1;
      return;
    }
    proofSummaryByBillId.set(proof.billId, { count: 1, status: proof.status ?? null });
  });
  [...teamBills, ...userBills].forEach((bill) => {
    const proofSummary = proofSummaryByBillId.get(bill.id);
    (bill as any).manualPaymentProofStatus = proofSummary?.status ?? null;
    (bill as any).manualPaymentProofCount = proofSummary?.count ?? 0;
  });
  const discountAmountsByBillId = await loadBillDiscountSummaries(prisma, [...teamBills, ...userBills]);
  [...teamBills, ...userBills].forEach((bill) => {
    Object.assign(bill as any, withBillDiscountAmounts(bill, discountAmountsByBillId));
  });

  const teamMembershipScopeIdsByUserId = new Map<string, Set<string>>();
  teams.forEach((team) => {
    const scopeId = normalizeId(team.parentTeamId) ?? normalizeId(team.id);
    if (!scopeId) {
      return;
    }
    normalizeIdList(team.playerIds).forEach((playerId) => {
      const scopeIds = teamMembershipScopeIdsByUserId.get(playerId) ?? new Set<string>();
      scopeIds.add(scopeId);
      teamMembershipScopeIdsByUserId.set(playerId, scopeIds);
    });
  });
  const teamMembershipScopeIds = Array.from(new Set(
    Array.from(teamMembershipScopeIdsByUserId.values()).flatMap((scopeIds) => Array.from(scopeIds)),
  ));
  const documentSubjectIdByUserId = new Map(
    playerIds
      .map((playerId) => [
        playerId,
        documentSubjectIdFor(event.organizationId, playerId),
      ] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
  const satisfactionRows = await findCompletedDocumentSatisfactions({
    documentSubjectIds: Array.from(documentSubjectIdByUserId.values()),
    templateDocumentIds: templates.map((template) => template.id),
    scopes: [
      ...(event.organizationId
        ? [{ scopeType: 'ORGANIZATION' as const, scopeId: event.organizationId }]
        : []),
      ...teamMembershipScopeIds.map((scopeId) => ({
        scopeType: 'TEAM_MEMBERSHIP' as const,
        scopeId,
      })),
      { scopeType: 'EVENT_PARTICIPATION' as const, scopeId: eventId },
    ],
  });
  const completeDocumentSatisfactionByKey = new Map<string, { id: string; signedAt?: string }>();
  satisfactionRows.forEach((row) => {
    const signedAt = row.signedAt ?? undefined;
    completeDocumentSatisfactionByKey.set(
      `${row.documentSubjectId}::${row.templateDocumentId}::${row.scopeType}::${row.scopeId}`,
      { id: row.sourceEvidenceId, signedAt },
    );
  });
  const getSatisfiedDocument = (task: {
    templateId: string;
    signOnce: boolean;
    signerUserId?: string | null;
    hostUserId?: string | null;
  }) => {
    const subjectUserId = normalizeId(task.hostUserId) ?? normalizeId(task.signerUserId);
    const subjectId = subjectUserId ? documentSubjectIdByUserId.get(subjectUserId) : undefined;
    if (!subjectId) {
      return undefined;
    }
    const teamScopeIds = subjectUserId
      ? teamMembershipScopeIdsByUserId.get(subjectUserId)
      : undefined;
    const scopeCandidates = task.signOnce
      ? (event.organizationId
        ? [{ scopeType: 'ORGANIZATION' as const, scopeId: event.organizationId }]
        : [])
      : [
        ...(teamScopeIds
          ? Array.from(teamScopeIds).map((scopeId) => ({
            scopeType: 'TEAM_MEMBERSHIP' as const,
            scopeId,
          }))
          : []),
        { scopeType: 'EVENT_PARTICIPATION' as const, scopeId: eventId },
      ];
    for (const scope of scopeCandidates) {
      const completion = completeDocumentSatisfactionByKey.get(
        `${subjectId}::${task.templateId}::${scope.scopeType}::${scope.scopeId}`,
      );
      if (completion) {
        return completion;
      }
    }
    return undefined;
  };

  const usersById = new Map(users.map((user) => [user.id, user]));

  const teamBillsByOwnerId = new Map<string, Array<(typeof teamBills)[number]>>();
  teamBills.forEach((bill) => {
    const billOwnerId = normalizeId(bill.ownerId);
    if (!billOwnerId) {
      return;
    }
    const existing = teamBillsByOwnerId.get(billOwnerId);
    if (existing) {
      existing.push(bill);
    } else {
      teamBillsByOwnerId.set(billOwnerId, [bill]);
    }
  });

  const userBillsByOwnerId = new Map<string, Array<(typeof userBills)[number]>>();
  userBills.forEach((bill) => {
    const existing = userBillsByOwnerId.get(bill.ownerId);
    if (existing) {
      existing.push(bill);
    } else {
      userBillsByOwnerId.set(bill.ownerId, [bill]);
    }
  });

  const teamById = new Map(teams.map((team) => [team.id, team]));

  const responseTeams: EventTeamComplianceResponse['teams'] = teamIds
    .map((teamId) => {
      const team = teamById.get(teamId);
      if (!team) {
        return null;
      }

      const parentTeamId = normalizeId(team.parentTeamId);
      const parentTeamBills = parentTeamId ? (teamBillsByOwnerId.get(parentTeamId) ?? []) : [];
      const slotTeamBills = teamBillsByOwnerId.get(teamId) ?? [];
      const selectedTeamBills = parentTeamBills.length > 0 ? parentTeamBills : slotTeamBills;
      const teamBill = pickPrimaryBill(selectedTeamBills);
      const teamRegistration = registrationByTeamId.get(teamId);
      const teamPaymentPending = String(teamRegistration?.status ?? '').toUpperCase() === 'PENDING';
      const teamPayment = toPaymentSummary(
        teamBill,
        Boolean(teamBill && parentTeamId && parentTeamBills.length > 0),
        teamPaymentPending,
      );
      const orderedPlayerIds = normalizeIdList(team.playerIds);

      const usersForTeam: TeamComplianceUserSummary[] = orderedPlayerIds
        .filter((playerId) => {
          const registration = latestRegistrationByEventTeamAndUserId.get(`${team.id}::${playerId}`);
          return !registration || isEligibleEventPersonRegistration(registration.status);
        })
        .map((playerId) => {
          const user = usersById.get(playerId);
          if (!user) {
            return null;
          }
          const registration = latestRegistrationByEventTeamAndUserId.get(`${team.id}::${playerId}`);
          const ageAtEvent = calculateAgeOnDate(user.dateOfBirth, event.start);
          const isMinorAtEvent = Number.isFinite(ageAtEvent) && ageAtEvent < 18;
          const isChildRegistration = registration?.registrantType === 'CHILD' || isMinorAtEvent;
          const parentUserId = normalizeId(registration?.parentId);

          const signatureTasks = buildRequiredSignatureTasks({
            templates,
            context: {
              userId: playerId,
              isChildRegistration,
              parentUserId,
            },
          });

          const requiredDocuments: TeamComplianceRequiredDocument[] = signatureTasks.map((task) => {
            const completionKey = buildSignatureCompletionKey({
              scopeKey: task.signOnce ? 'once' : `event:${eventId}`,
              templateId: task.templateId,
              signerContext: task.signerContext,
              hostUserId: task.hostUserId,
            });
            const completion = getSatisfiedDocument(task);
            return {
              key: completionKey,
              templateId: task.templateId,
              title: task.templateTitle,
              type: task.templateType,
              signerContext: task.signerContext,
              signerLabel: task.signerLabel,
              signOnce: task.signOnce,
              status: completion ? 'SIGNED' : 'UNSIGNED',
              signedDocumentRecordId: completion?.id,
              signedAt: completion?.signedAt,
            };
          });

          const signedCount = requiredDocuments.filter((document) => document.status === 'SIGNED').length;
          const requiredCount = requiredDocuments.length;

          const userBillCandidates = userBillsByOwnerId.get(playerId) ?? [];
          const userBillForTeam = teamBill
            ? pickPrimaryBill(userBillCandidates.filter((bill) => bill.parentBillId === teamBill.id))
            : null;
          const userPayment = userBillForTeam
            ? toPaymentSummary(userBillForTeam)
            : toPaymentSummary(teamBill, Boolean(teamBill), teamPayment.paymentPending === true);

          const userSummary: TeamComplianceUserSummary = {
            userId: user.id,
            fullName: toDisplayName(user),
            userName: normalizeId(user.userName) ?? undefined,
            isMinorAtEvent,
            registrationType: isChildRegistration ? 'CHILD' : 'ADULT',
            payment: userPayment,
            documents: {
              signedCount,
              requiredCount,
            },
            requiredDocuments: requiredDocuments.sort((left, right) => (
              left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
              || left.signerLabel.localeCompare(right.signerLabel, undefined, { sensitivity: 'base' })
            )),
          };
          return userSummary;
        })
        .filter((summary): summary is TeamComplianceUserSummary => summary !== null)
        .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' }));

      const teamDocumentSignedCount = usersForTeam.reduce((total, userSummary) => total + userSummary.documents.signedCount, 0);
      const teamDocumentRequiredCount = usersForTeam.reduce((total, userSummary) => total + userSummary.documents.requiredCount, 0);

      return {
        teamId: team.id,
        teamName: team.name || 'Unnamed Team',
        payment: teamPayment,
        documents: {
          signedCount: teamDocumentSignedCount,
          requiredCount: teamDocumentRequiredCount,
        },
        registrationAnswers: teamRegistration?.id ? answersByRegistrationId.get(teamRegistration.id) ?? [] : [],
        users: usersForTeam,
      };
    })
    .filter((team): team is NonNullable<typeof team> => Boolean(team));

  const payload: EventTeamComplianceResponse = {
    teams: responseTeams,
  };
  return NextResponse.json(payload, { status: 200 });
}
