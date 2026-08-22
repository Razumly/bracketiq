import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import {
  acquireEventLockAndLoadStructure,
  buildEventRegistrationId,
  syncDivisionTeamMembershipFromRegistrations,
  transitionEventRegistrationStatus,
} from '@/server/events/eventRegistrations';
import { claimOrCreateEventTeamSnapshot } from '@/server/teams/teamMembership';
import {
  resolveEventRegistrationPaymentFailure,
  resolveEventRegistrationPaymentTargetStatus,
} from '@/server/billing/eventRegistrationPaymentResolution';
import {
  loadBillPurchaseMetadata,
  resolveEventRegistrationPurchaseContext,
  type EventRegistrationPurchaseContext,
} from '@/server/billing/eventRegistrationPaymentContext';
import type { EventRegistrationPaymentResolutionReason } from '@/contracts/eventParticipants';

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

export type ReconciledBillStatus = 'OPEN' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type BillPaymentOutcome = 'PAID' | 'FAILED';

type BillPaymentOutcomeRegistrationResult = {
  applied: boolean;
  reason?: string;
  registrationId?: string;
  activated?: boolean;
};
export const ensureEventRegistrationFromPurchase = async ({
  purchaseType,
  eventId,
  teamId,
  userId,
  registrantType,
  parentId,
  registrationId,
  occurrenceSlotId,
  occurrenceDate,
  now,
  divisionId,
  divisionTypeId,
  divisionTypeKey,
  targetStatus = 'ACTIVE',
  tx,
}: {
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrantType?: string | null;
  parentId?: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
  now: Date;
  targetStatus?: 'ACTIVE' | 'PENDING';
  tx?: Prisma.TransactionClient;
}): Promise<{ applied: boolean; reason?: string; registrationId?: string; activated?: boolean }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'event') {
    return { applied: false, reason: 'not_event_purchase' };
  }
  if (!eventId) {
    return { applied: false, reason: 'missing_event_id' };
  }
  if (!teamId && !userId) {
    return { applied: false, reason: 'missing_participant' };
  }

  try {
    const apply = async (transaction: Prisma.TransactionClient) => {
      const event = await acquireEventLockAndLoadStructure(transaction, eventId);
      if (!event) {
        return { applied: false, reason: 'event_not_found' };
      }

      if (teamId) {
        if (!event.teamSignup) {
          return { applied: false, reason: 'team_signup_disabled' };
        }
        const normalizedEventType = String(event.eventType ?? '').toUpperCase();
        const expectedRegistrationId = buildEventRegistrationId({
          eventId,
          registrantType: 'TEAM',
          registrantId: teamId,
          slotId: occurrenceSlotId,
          occurrenceDate,
        });
        const normalizedRegistrationId = toStringOrNull(registrationId);
        if (normalizedRegistrationId && normalizedRegistrationId !== expectedRegistrationId) {
          return { applied: false, reason: 'registration_id_mismatch' };
        }
        const effectiveRegistrationId = normalizedRegistrationId ?? expectedRegistrationId;
        const schedulableTeamEventRequiresReservation =
          normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT';
        if (schedulableTeamEventRequiresReservation && !normalizedRegistrationId) {
          return { applied: false, reason: 'schedulable_team_event_requires_participant_route' };
        }
        const existingRegistration = await transaction.eventRegistrations.findUnique({
          where: { id: effectiveRegistrationId },
          select: {
            id: true,
            eventId: true,
            registrantId: true,
            parentId: true,
            eventTeamId: true,
            registrantType: true,
            rosterRole: true,
            status: true,
            slotId: true,
            occurrenceDate: true,
            divisionId: true,
            divisionTypeId: true,
            divisionTypeKey: true,
            createdBy: true,
          },
        });
        if (!existingRegistration && (normalizedRegistrationId || schedulableTeamEventRequiresReservation)) {
          return { applied: false, reason: 'reservation_missing' };
        }

        if (schedulableTeamEventRequiresReservation && existingRegistration) {
          const reservedEventTeamId = toStringOrNull(existingRegistration.eventTeamId);
          const reservedRegistrantId = toStringOrNull(existingRegistration.registrantId);
          const canonicalTeamId = toStringOrNull(existingRegistration.parentId);
          const metadataParentId = toStringOrNull(parentId);
          const metadataDivisionId = toStringOrNull(divisionId);
          const metadataDivisionTypeId = toStringOrNull(divisionTypeId);
          const metadataDivisionTypeKey = toStringOrNull(divisionTypeKey);
          const reservationMatchesMetadata = (
            existingRegistration.id === effectiveRegistrationId
            && (!existingRegistration.eventId || existingRegistration.eventId === eventId)
            && (!existingRegistration.registrantType
              || String(existingRegistration.registrantType).toUpperCase() === 'TEAM')
            && (!existingRegistration.rosterRole
              || String(existingRegistration.rosterRole).toUpperCase() === 'PARTICIPANT')
            && reservedRegistrantId === teamId
            && reservedEventTeamId === teamId
            && Boolean(canonicalTeamId)
            && (!metadataParentId || metadataParentId === canonicalTeamId)
            && toStringOrNull(existingRegistration.slotId) === occurrenceSlotId
            && toStringOrNull(existingRegistration.occurrenceDate) === occurrenceDate
            && (!metadataDivisionId || metadataDivisionId === toStringOrNull(existingRegistration.divisionId))
            && (!metadataDivisionTypeId
              || metadataDivisionTypeId === toStringOrNull(existingRegistration.divisionTypeId))
            && (!metadataDivisionTypeKey
              || metadataDivisionTypeKey === toStringOrNull(existingRegistration.divisionTypeKey))
          );
          if (!reservationMatchesMetadata || !reservedEventTeamId || !canonicalTeamId) {
            return { applied: false, reason: 'reservation_metadata_mismatch' };
          }

          if (targetStatus === 'ACTIVE' && existingRegistration.status !== 'ACTIVE') {
            await claimOrCreateEventTeamSnapshot({
              tx: transaction,
              eventId,
              eventTeamId: reservedEventTeamId,
              canonicalTeamId,
              createdBy: toStringOrNull(existingRegistration.createdBy) ?? userId ?? 'system:webhook',
              divisionId: toStringOrNull(existingRegistration.divisionId),
              divisionTypeId: toStringOrNull(existingRegistration.divisionTypeId),
              divisionTypeKey: toStringOrNull(existingRegistration.divisionTypeKey),
              occurrence: occurrenceSlotId && occurrenceDate
                ? { slotId: occurrenceSlotId, occurrenceDate }
                : null,
              upsertRegistration: false,
            });
          }
        }
        let activated = false;
        if (!existingRegistration) {
          await transitionEventRegistrationStatus({
            registrationId: effectiveRegistrationId,
            eventId,
            event,
            status: targetStatus,
            create: {
              eventId,
              registrantType: 'TEAM',
              registrantId: teamId,
              rosterRole: 'PARTICIPANT',
              createdBy: userId ?? 'system:webhook',
              eventTeamId: teamId,
              divisionId: divisionId ?? null,
              divisionTypeId: divisionTypeId ?? null,
              divisionTypeKey: divisionTypeKey ?? null,
              occurrence: occurrenceSlotId && occurrenceDate
                ? { slotId: occurrenceSlotId, occurrenceDate }
                : null,
            },
          }, transaction);
          activated = targetStatus === 'ACTIVE';
        } else if (
          existingRegistration.status !== targetStatus
          && !(targetStatus === 'PENDING' && existingRegistration.status === 'ACTIVE')
        ) {
          await transitionEventRegistrationStatus({
            registrationId: effectiveRegistrationId,
            eventId,
            event,
            status: targetStatus,
            fallbackCurrent: {
              id: effectiveRegistrationId,
              eventId,
              registrantId: teamId,
              parentId: null,
              registrantType: 'TEAM',
              rosterRole: 'PARTICIPANT',
              status: existingRegistration.status,
              acceptedAt: null,
              eventTeamId: teamId,
              sourceTeamRegistrationId: null,
              ageAtEvent: null,
              divisionId: toStringOrNull(existingRegistration.divisionId),
              divisionTypeId: toStringOrNull(existingRegistration.divisionTypeId),
              divisionTypeKey: toStringOrNull(existingRegistration.divisionTypeKey),
              jerseyNumber: null,
              position: null,
              isCaptain: false,
              consentDocumentId: null,
              consentStatus: null,
              createdBy: userId ?? 'system:webhook',
              slotId: occurrenceSlotId,
              occurrenceDate,
              createdAt: null,
              updatedAt: null,
            } as any,
          }, transaction);
          activated = targetStatus === 'ACTIVE';
        }
        await transaction.eventRegistrations.updateMany({
          where: {
            eventId,
            registrantId: teamId,
            registrantType: 'TEAM',
            rosterRole: 'WAITLIST',
            status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
            slotId: occurrenceSlotId,
            occurrenceDate,
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        });
        if (schedulableTeamEventRequiresReservation && activated) {
          await syncDivisionTeamMembershipFromRegistrations(event, transaction);
        }

        return { applied: true, registrationId: effectiveRegistrationId, activated };
      }

      if (event.teamSignup) {
        return { applied: false, reason: 'team_signup_event_requires_team' };
      }

      const normalizedRegistrantType = String(registrantType ?? '').trim().toUpperCase() === 'CHILD'
        ? 'CHILD'
        : 'SELF';
      const participantUserId = userId as string;
      const expectedRegistrationId = buildEventRegistrationId({
        eventId,
        registrantType: normalizedRegistrantType,
        registrantId: participantUserId,
        slotId: occurrenceSlotId,
        occurrenceDate,
      });
      const normalizedRegistrationId = toStringOrNull(registrationId);
      if (normalizedRegistrationId && normalizedRegistrationId !== expectedRegistrationId) {
        return { applied: false, reason: 'registration_id_mismatch' };
      }
      const effectiveRegistrationId = normalizedRegistrationId ?? expectedRegistrationId;
      const existingRegistration = await transaction.eventRegistrations.findUnique({
        where: { id: effectiveRegistrationId },
        select: { status: true },
      });
      if (!existingRegistration && normalizedRegistrationId) {
        return { applied: false, reason: 'reservation_missing' };
      }
      let activated = false;
      if (!existingRegistration) {
        await transitionEventRegistrationStatus({
          registrationId: effectiveRegistrationId,
          eventId,
          event,
          status: targetStatus,
          create: {
            eventId,
            registrantType: normalizedRegistrantType,
            registrantId: participantUserId,
            parentId: normalizedRegistrantType === 'CHILD' ? parentId : null,
            rosterRole: 'PARTICIPANT',
            createdBy: userId ?? 'system:webhook',
            divisionId: divisionId ?? null,
            divisionTypeId: divisionTypeId ?? null,
            divisionTypeKey: divisionTypeKey ?? null,
            occurrence: occurrenceSlotId && occurrenceDate
              ? { slotId: occurrenceSlotId, occurrenceDate }
              : null,
          },
        }, transaction);
        activated = targetStatus === 'ACTIVE';
      } else if (
        existingRegistration.status !== targetStatus
        && !(targetStatus === 'PENDING' && existingRegistration.status === 'ACTIVE')
      ) {
        await transitionEventRegistrationStatus({
          registrationId: effectiveRegistrationId,
          eventId,
          status: targetStatus,
          fallbackCurrent: {
            id: effectiveRegistrationId,
            eventId,
            registrantId: participantUserId,
            parentId: normalizedRegistrantType === 'CHILD' ? parentId ?? null : null,
            registrantType: normalizedRegistrantType,
            rosterRole: 'PARTICIPANT',
            status: existingRegistration.status,
            acceptedAt: null,
            eventTeamId: null,
            sourceTeamRegistrationId: null,
            ageAtEvent: null,
            divisionId: divisionId ?? null,
            divisionTypeId: divisionTypeId ?? null,
            divisionTypeKey: divisionTypeKey ?? null,
            jerseyNumber: null,
            position: null,
            isCaptain: false,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: userId ?? 'system:webhook',
            slotId: occurrenceSlotId,
            occurrenceDate,
            createdAt: null,
            updatedAt: null,
          } as any,
          event,
        }, transaction);
        activated = targetStatus === 'ACTIVE';
      }
      await transaction.eventRegistrations.updateMany({
        where: {
          eventId,
          registrantId: participantUserId,
          registrantType: normalizedRegistrantType,
          rosterRole: { in: ['WAITLIST', 'FREE_AGENT'] },
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          slotId: occurrenceSlotId,
          occurrenceDate,
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });

      return { applied: true, registrationId: effectiveRegistrationId, activated };
    };
    return tx ? await apply(tx) : await prisma.$transaction(apply);
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? error.status
      : null;
    if (typeof status === 'number' && status === 404) {
      return { applied: false, reason: 'event_not_found' };
    }
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? error.code
      : null;
    if (errorCode === 'EVENT_REGISTRATION_CAPACITY_EXCEEDED') {
      return { applied: false, reason: 'capacity_exceeded' };
    }
    if (errorCode === 'INVALID_EVENT_REGISTRATION_UNIT') {
      return { applied: false, reason: 'invalid_registration_unit' };
    }
    if (tx) {
      throw error;
    }
    console.error('Failed to apply webhook event registration', {
      purchaseType,
      eventId,
      teamId,
      userId,
      error,
    });
    return { applied: false, reason: 'retryable_error' };
  }
};
const setEventRegistrationPaymentStatusFromPurchase = async ({
  purchaseType,
  eventId,
  teamId,
  userId,
  registrantType: purchaseRegistrantType,
  registrationId,
  occurrenceSlotId,
  occurrenceDate,
  now,
  targetStatus = 'PAYMENT_FAILED',
  paymentResolutionReason = null,
  isSchedulableTeamEventAllowed = false,
  tx,
}: {
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrantType?: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  now: Date;
  targetStatus?: 'PAYMENT_FAILED' | 'CANCELLED';
  paymentResolutionReason?: EventRegistrationPaymentResolutionReason | null;
  isSchedulableTeamEventAllowed?: boolean;
  tx?: Prisma.TransactionClient;
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'event') {
    return { applied: false, reason: 'not_event_purchase' };
  }
  if (!eventId) {
    return { applied: false, reason: 'missing_event_id' };
  }
  if (!teamId && !userId) {
    return { applied: false, reason: 'missing_participant' };
  }

  try {
    const apply = async (transaction: Prisma.TransactionClient) => {
      const lockedEvents = await transaction.$queryRaw<Array<{
        id: string;
        eventType: string | null;
        teamSignup: boolean | null;
      }>>`
        SELECT
          "id",
          "eventType",
          "teamSignup"
        FROM "Events"
        WHERE "id" = ${eventId}
        FOR UPDATE
      `;
      const event = lockedEvents[0] ?? null;
      if (!event) {
        return { applied: false, reason: 'event_not_found' };
      }

      const registrantType = teamId
        ? 'TEAM'
        : String(purchaseRegistrantType ?? '').trim().toUpperCase() === 'CHILD'
          ? 'CHILD'
          : 'SELF';
      const registrantId = teamId ?? userId as string;
      if (registrantType === 'TEAM') {
        if (!event.teamSignup) {
          return { applied: false, reason: 'team_signup_disabled' };
        }
        const normalizedEventType = String(event.eventType ?? '').toUpperCase();
        if (
          !isSchedulableTeamEventAllowed
          && (normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT')
        ) {
          return { applied: false, reason: 'schedulable_team_event_requires_participant_route' };
        }
      } else if (event.teamSignup) {
        return { applied: false, reason: 'team_signup_event_requires_team' };
      }

      const expectedRegistrationId = buildEventRegistrationId({
        eventId,
        registrantType,
        registrantId,
        slotId: occurrenceSlotId,
        occurrenceDate,
      });
      const normalizedRegistrationId = toStringOrNull(registrationId);
      if (normalizedRegistrationId && normalizedRegistrationId !== expectedRegistrationId) {
        return { applied: false, reason: 'registration_id_mismatch' };
      }

      const result = await transaction.eventRegistrations.updateMany({
        where: {
          id: normalizedRegistrationId ?? expectedRegistrationId,
          status: {
            in: targetStatus === 'CANCELLED'
              ? ['STARTED', 'PENDING', 'PAYMENT_FAILED']
              : ['STARTED', 'PENDING'],
          },
        },
        data: {
          status: targetStatus,
          paymentResolutionReason,
          updatedAt: now,
        },
      });
      return result.count > 0
        ? { applied: true }
        : { applied: false, reason: 'reservation_not_pending' };
    };
    return tx ? await apply(tx) : await prisma.$transaction(apply);
  } catch (error) {
    if (tx) {
      throw error;
    }
    console.error('Failed to update webhook event registration payment status', {
      purchaseType,
      eventId,
      teamId,
      userId,
      error,
    });
    return { applied: false, reason: 'error' };
  }
};
export const persistEventRegistrationPaymentResolution = async ({
  registrationApplied,
  failureReason,
  purchaseType,
  eventId,
  teamId,
  userId,
  registrantType,
  registrationId,
  occurrenceSlotId,
  occurrenceDate,
  now,
  isSchedulableTeamEventAllowed = false,
  tx,
}: {
  registrationApplied: boolean;
  failureReason: string | undefined;
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrantType?: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  now: Date;
  isSchedulableTeamEventAllowed?: boolean;
  tx?: Prisma.TransactionClient;
}): Promise<{ applied: boolean; reason?: string } | null> => {
  if (registrationApplied) {
    return null;
  }
  const paymentResolution = resolveEventRegistrationPaymentFailure(failureReason);
  if (!paymentResolution) {
    return null;
  }
  return setEventRegistrationPaymentStatusFromPurchase({
    purchaseType,
    eventId,
    teamId,
    userId,
    registrantType,
    registrationId,
    occurrenceSlotId,
    occurrenceDate,
    now,
    ...paymentResolution,
    isSchedulableTeamEventAllowed,
    tx,
  });
};
export const applyBillPaymentOutcome = async ({
  billId,
  outcome,
  fallback,
  now,
  billStatus = 'OPEN',
  parentBillId = null,
  tx,
}: {
  billId: string | null;
  outcome: BillPaymentOutcome;
  fallback: EventRegistrationPurchaseContext;
  now: Date;
  billStatus?: ReconciledBillStatus;
  parentBillId?: string | null;
  tx?: Prisma.TransactionClient;
}) => {
  const context = resolveEventRegistrationPurchaseContext({
    billMetadata: await loadBillPurchaseMetadata(billId, tx),
    fallback,
  });
  const hasInvalidEventRegistrationSource = Boolean(context.sourceIntegrityFailure);
  const registrationResult: BillPaymentOutcomeRegistrationResult = hasInvalidEventRegistrationSource
    ? { applied: false, reason: 'invalid_event_registration_source' }
    : outcome === 'PAID'
      ? await ensureEventRegistrationFromPurchase({
          purchaseType: context.purchaseType,
          eventId: context.eventId,
          teamId: context.teamId,
          userId: context.userId,
          registrantType: context.registrantType,
          parentId: context.parentId,
          registrationId: context.registrationId,
          occurrenceSlotId: context.occurrenceSlotId,
          occurrenceDate: context.occurrenceDate,
          divisionId: context.divisionId,
          divisionTypeId: context.divisionTypeId,
          divisionTypeKey: context.divisionTypeKey,
          now,
          targetStatus: resolveEventRegistrationPaymentTargetStatus({
            parentBillId,
            billStatus,
          }),
          tx,
        })
      : await setEventRegistrationPaymentStatusFromPurchase({
          purchaseType: context.purchaseType,
          eventId: context.eventId,
          teamId: context.teamId,
          userId: context.userId,
          registrantType: context.registrantType,
          registrationId: context.registrationId,
          occurrenceSlotId: context.occurrenceSlotId,
          occurrenceDate: context.occurrenceDate,
          now,
          tx,
        });
  const paymentResolutionResult = outcome === 'PAID' && !hasInvalidEventRegistrationSource
    ? await persistEventRegistrationPaymentResolution({
        registrationApplied: registrationResult.applied,
        failureReason: registrationResult.reason,
        purchaseType: context.purchaseType,
        eventId: context.eventId,
        teamId: context.teamId,
        userId: context.userId,
        registrantType: context.registrantType,
        registrationId: context.registrationId,
        occurrenceSlotId: context.occurrenceSlotId,
        occurrenceDate: context.occurrenceDate,
        now,
        isSchedulableTeamEventAllowed: true,
        tx,
      })
    : null;

  return { context, registrationResult, paymentResolutionResult };
};
