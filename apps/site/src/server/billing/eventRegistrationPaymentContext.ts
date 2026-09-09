import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

type PaymentContextClient = PrismaClient | Prisma.TransactionClient;


export type EventRegistrationPurchaseContext = {
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrantType: string | null;
  parentId: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  sourceIntegrityFailure?: string;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const readMetadataValue = (
  metadata: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null => {
  for (const key of keys) {
    const value = toStringOrNull(metadata?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const eventRegistrationSourceSelect = {
  eventId: true,
  registrantId: true,
  parentId: true,
  registrantType: true,
  eventTeamId: true,
  divisionId: true,
  divisionTypeId: true,
  divisionTypeKey: true,
  slotId: true,
  occurrenceDate: true,
} as const;
const billPurchaseOwnershipSelect = {
  ownerType: true,
  ownerId: true,
  eventId: true,
  organizationId: true,
  slotId: true,
  occurrenceDate: true,
  sourceType: true,
  sourceId: true,
} as const;

const billPurchaseSelect = {
  ...billPurchaseOwnershipSelect,
  parentBillId: true,
  lineItems: true,
} as const;

type BillPurchaseOwnershipRow = Prisma.BillsGetPayload<{
  select: typeof billPurchaseOwnershipSelect;
}>;

type BillPurchaseRow = Prisma.BillsGetPayload<{
  select: typeof billPurchaseSelect;
}>;

type SourceRegistrationRow = Prisma.EventRegistrationsGetPayload<{
  select: typeof eventRegistrationSourceSelect;
}>;
export type EventRegistrationBillSourceValidationReason =
  | 'missing_source_id'
  | 'source_registration_not_found'
  | 'source_event_mismatch'
  | 'source_occurrence_mismatch'
  | 'source_registration_type_mismatch'
  | 'source_owner_mismatch'
  | 'source_organization_mismatch';

export type EventRegistrationBillSourceValidation =
  | {
      valid: true;
      registration: SourceRegistrationRow;
    }
  | {
      valid: false;
      reason: EventRegistrationBillSourceValidationReason;
      registration?: SourceRegistrationRow;
    };

type EventRegistrationBillSourceValidationParams = {
  sourceId: string | null;
  ownerType: string | null;
  ownerId: string | null;
  eventId?: string | null;
  organizationId?: string | null;
  slotId?: string | null;
  occurrenceDate?: string | null;
  client?: PaymentContextClient;
};

const validateEventRegistrationBillSourceRow = async ({
  registration,
  ownerType,
  ownerId,
  eventId,
  organizationId,
  slotId,
  occurrenceDate,
  client,
}: Omit<EventRegistrationBillSourceValidationParams, 'sourceId'> & {
  registration: SourceRegistrationRow | null;
  client: PaymentContextClient;
}): Promise<EventRegistrationBillSourceValidation> => {
  if (!registration) {
    return { valid: false, reason: 'source_registration_not_found' };
  }

  const normalizedOwnerType = toStringOrNull(ownerType)?.toUpperCase();
  const normalizedOwnerId = toStringOrNull(ownerId);
  const normalizedEventId = toStringOrNull(eventId);
  const normalizedOrganizationId = toStringOrNull(organizationId);
  const normalizedSlotId = toStringOrNull(slotId);
  const normalizedOccurrenceDate = toStringOrNull(occurrenceDate);
  const registrationEventId = toStringOrNull(registration.eventId);
  const registrationSlotId = toStringOrNull(registration.slotId);
  const registrationOccurrenceDate = toStringOrNull(registration.occurrenceDate);
  const registrationType = toStringOrNull(registration.registrantType)?.toUpperCase();

  if (normalizedEventId && registrationEventId !== normalizedEventId) {
    return { valid: false, reason: 'source_event_mismatch', registration };
  }
  if (
    (normalizedSlotId && registrationSlotId !== normalizedSlotId)
    || (normalizedOccurrenceDate && registrationOccurrenceDate !== normalizedOccurrenceDate)
  ) {
    return { valid: false, reason: 'source_occurrence_mismatch', registration };
  }

  if (!normalizedOwnerType || !normalizedOwnerId) {
    return { valid: false, reason: 'source_owner_mismatch', registration };
  }

  if (normalizedOwnerType === 'USER') {
    if (!['SELF', 'CHILD'].includes(registrationType ?? '')) {
      return { valid: false, reason: 'source_registration_type_mismatch', registration };
    }
    if (toStringOrNull(registration.registrantId) !== normalizedOwnerId) {
      return { valid: false, reason: 'source_owner_mismatch', registration };
    }
  } else if (normalizedOwnerType === 'TEAM') {
    if (registrationType !== 'TEAM') {
      return { valid: false, reason: 'source_registration_type_mismatch', registration };
    }
    const registrationTeamIds = new Set([
      toStringOrNull(registration.registrantId),
      toStringOrNull(registration.parentId),
      toStringOrNull(registration.eventTeamId),
    ].filter((value): value is string => Boolean(value)));
    if (!registrationTeamIds.has(normalizedOwnerId)) {
      return { valid: false, reason: 'source_owner_mismatch', registration };
    }
  } else if (normalizedOwnerType === 'ORGANIZATION') {
    const sourceEventId = registrationEventId;
    const sourceEvent = sourceEventId && typeof client.events?.findUnique === 'function'
      ? await client.events.findUnique({
          where: { id: sourceEventId },
          select: { organizationId: true },
        })
      : null;
    if (!sourceEvent || toStringOrNull(sourceEvent.organizationId) !== normalizedOwnerId) {
      return { valid: false, reason: 'source_organization_mismatch', registration };
    }
    if (normalizedOrganizationId && normalizedOrganizationId !== normalizedOwnerId) {
      return { valid: false, reason: 'source_organization_mismatch', registration };
    }
  } else {
    return { valid: false, reason: 'source_owner_mismatch', registration };
  }

  return { valid: true, registration };
};

export const validateEventRegistrationBillSource = async ({
  sourceId,
  ownerType,
  ownerId,
  eventId = null,
  organizationId = null,
  slotId = null,
  occurrenceDate = null,
  client = prisma,
}: EventRegistrationBillSourceValidationParams): Promise<EventRegistrationBillSourceValidation> => {
  const normalizedSourceId = toStringOrNull(sourceId);
  if (!normalizedSourceId) {
    return { valid: false, reason: 'missing_source_id' };
  }

  const registration = await client.eventRegistrations.findUnique({
    where: { id: normalizedSourceId },
    select: eventRegistrationSourceSelect,
  });

  return validateEventRegistrationBillSourceRow({
    registration,
    ownerType,
    ownerId,
    eventId,
    organizationId,
    slotId,
    occurrenceDate,
    client,
  });
};

export const loadBillPurchaseMetadata = async (
  billId: string | null,
  client: PaymentContextClient = prisma,
): Promise<Record<string, unknown> | null> => {
  if (!billId) {
    return null;
  }

  const bill = await client.bills.findUnique({
    where: { id: billId },
    select: billPurchaseSelect,
  });
  if (!bill) {
    return null;
  }
  const sourceOwnerBill: BillPurchaseOwnershipRow | null = bill.parentBillId
    ? await client.bills.findUnique({
        where: { id: bill.parentBillId },
        select: billPurchaseOwnershipSelect,
      })
    : bill;

  const lineItems = Array.isArray(bill.lineItems) ? bill.lineItems : [];
  const purchaseLineItem = lineItems.find((item) => (
    isObjectRecord(item)
    && (
      typeof item.purchaseType === 'string'
      || typeof item.registrationId === 'string'
      || typeof item.eventRegistrationId === 'string'
    )
  ));
  const lineItem = isObjectRecord(purchaseLineItem) ? purchaseLineItem : null;
  const sourceType = toStringOrNull(bill.sourceType)?.toUpperCase() ?? null;
  const sourceId = toStringOrNull(bill.sourceId);
  const sourceRegistration = sourceType === 'EVENT_REGISTRATION' && sourceId
    ? await client.eventRegistrations.findUnique({
        where: { id: sourceId },
        select: eventRegistrationSourceSelect,
      })
    : null;
  const sourceOwnerSourceType = toStringOrNull(sourceOwnerBill?.sourceType)?.toUpperCase() ?? null;
  const sourceOwnerSourceId = toStringOrNull(sourceOwnerBill?.sourceId);
  const sourceOwnerMatches = !bill.parentBillId
    || Boolean(
      sourceOwnerBill
      && sourceOwnerSourceType === sourceType
      && sourceOwnerSourceId === sourceId,
    );
  const ownerBill = sourceOwnerBill ?? bill;
  const ownerType = toStringOrNull(ownerBill.ownerType)?.toUpperCase();
  const sourceValidation = sourceType === 'EVENT_REGISTRATION'
    ? !sourceId
      ? { valid: false as const, reason: 'missing_source_id' as const }
      : !sourceOwnerMatches
        ? { valid: false as const, reason: 'source_owner_mismatch' as const }
        : await validateEventRegistrationBillSourceRow({
            registration: sourceRegistration,
            ownerType: ownerBill.ownerType,
            ownerId: ownerBill.ownerId,
            eventId: ownerBill.eventId,
            organizationId: ownerBill.organizationId,
            slotId: ownerBill.slotId,
            occurrenceDate: ownerBill.occurrenceDate,
            client,
          })
    : null;
  const sourceRegistrationForMetadata = sourceValidation?.valid ? sourceValidation.registration : null;
  const sourceRegistrationTypeForMetadata = toStringOrNull(
    sourceRegistrationForMetadata?.registrantType,
  )?.toUpperCase();
  const sourceIsTeamForMetadata = sourceRegistrationTypeForMetadata === 'TEAM';

  const legacyMetadata = {
    purchaseType: readMetadataValue(lineItem, 'purchaseType') ?? null,
    eventId: readMetadataValue(lineItem, 'eventId', 'event_id')
      ?? toStringOrNull(bill.eventId),
    organizationId: readMetadataValue(lineItem, 'organizationId', 'organization_id')
      ?? toStringOrNull(bill.organizationId),
    registrationId: readMetadataValue(lineItem, 'registrationId', 'registration_id', 'eventRegistrationId')
      ?? sourceId,
    userId: readMetadataValue(lineItem, 'userId', 'user_id')
      ?? (ownerType === 'USER' ? toStringOrNull(bill.ownerId) : null),
    teamId: readMetadataValue(lineItem, 'teamId', 'team_id')
      ?? (ownerType === 'TEAM' ? toStringOrNull(bill.ownerId) : null),
    eventRegistrationRegistrantType: readMetadataValue(
      lineItem,
      'eventRegistrationRegistrantType',
      'event_registration_registrant_type',
    ) ?? (ownerType === 'TEAM' ? 'TEAM' : 'SELF'),
    eventRegistrationParentId: readMetadataValue(
      lineItem,
      'eventRegistrationParentId',
      'event_registration_parent_id',
    ),
    occurrenceSlotId: readMetadataValue(
      lineItem,
      'occurrenceSlotId',
      'occurrence_slot_id',
      'slotId',
      'slot_id',
    ) ?? toStringOrNull(bill.slotId),
    occurrenceDate: readMetadataValue(lineItem, 'occurrenceDate', 'occurrence_date')
      ?? toStringOrNull(bill.occurrenceDate),
    eventRegistrationDivisionId: readMetadataValue(
      lineItem,
      'eventRegistrationDivisionId',
      'event_registration_division_id',
    ),
    eventRegistrationDivisionTypeId: readMetadataValue(
      lineItem,
      'eventRegistrationDivisionTypeId',
      'event_registration_division_type_id',
    ),
    eventRegistrationDivisionTypeKey: readMetadataValue(
      lineItem,
      'eventRegistrationDivisionTypeKey',
      'event_registration_division_type_key',
    ),
  };

  const sourceMetadata = {
    purchaseType: 'event',
    eventId: toStringOrNull(sourceRegistrationForMetadata?.eventId)
      ?? toStringOrNull(bill.eventId),
    organizationId: toStringOrNull(bill.organizationId),
    registrationId: sourceId,
    userId: sourceRegistrationForMetadata && !sourceIsTeamForMetadata
      ? toStringOrNull(sourceRegistrationForMetadata.registrantId)
      : null,
    teamId: sourceRegistrationForMetadata && sourceIsTeamForMetadata
      ? toStringOrNull(sourceRegistrationForMetadata.eventTeamId)
        ?? toStringOrNull(sourceRegistrationForMetadata.registrantId)
      : null,
    eventRegistrationRegistrantType: sourceRegistrationTypeForMetadata
      ?? (ownerType === 'TEAM' ? 'TEAM' : 'SELF'),
    eventRegistrationParentId: toStringOrNull(sourceRegistrationForMetadata?.parentId),
    occurrenceSlotId: toStringOrNull(sourceRegistrationForMetadata?.slotId)
      ?? toStringOrNull(bill.slotId),
    occurrenceDate: toStringOrNull(sourceRegistrationForMetadata?.occurrenceDate)
      ?? toStringOrNull(bill.occurrenceDate),
    eventRegistrationDivisionId: toStringOrNull(sourceRegistrationForMetadata?.divisionId),
    eventRegistrationDivisionTypeId: toStringOrNull(sourceRegistrationForMetadata?.divisionTypeId),
    eventRegistrationDivisionTypeKey: toStringOrNull(sourceRegistrationForMetadata?.divisionTypeKey),
  };

  return {
    ...(lineItem ?? {}),
    sourceType,
    sourceId,
    ...(sourceValidation && !sourceValidation.valid
      ? { eventRegistrationSourceInvalidReason: sourceValidation.reason }
      : {}),
    ...(sourceType === 'EVENT_REGISTRATION' ? sourceMetadata : legacyMetadata),
  };
};

export const resolveEventRegistrationPurchaseContext = ({
  billMetadata,
  fallback,
}: {
  billMetadata: Record<string, unknown> | null;
  fallback: EventRegistrationPurchaseContext;
}): EventRegistrationPurchaseContext => {
  const sourceIntegrityFailure = readMetadataValue(
    billMetadata,
    'eventRegistrationSourceInvalidReason',
  );

  return {
    purchaseType: readMetadataValue(billMetadata, 'purchaseType', 'purchase_type') ?? fallback.purchaseType,
    eventId: readMetadataValue(billMetadata, 'eventId', 'event_id') ?? fallback.eventId,
    teamId: readMetadataValue(billMetadata, 'teamId', 'team_id') ?? fallback.teamId,
    userId: readMetadataValue(billMetadata, 'userId', 'user_id') ?? fallback.userId,
    registrantType: readMetadataValue(
      billMetadata,
      'eventRegistrationRegistrantType',
      'event_registration_registrant_type',
    ) ?? fallback.registrantType,
    parentId: readMetadataValue(
      billMetadata,
      'eventRegistrationParentId',
      'event_registration_parent_id',
    ) ?? fallback.parentId,
    registrationId: readMetadataValue(
      billMetadata,
      'registrationId',
      'registration_id',
      'eventRegistrationId',
    ) ?? fallback.registrationId,
    occurrenceSlotId: readMetadataValue(
      billMetadata,
      'occurrenceSlotId',
      'occurrence_slot_id',
      'slotId',
      'slot_id',
    ) ?? fallback.occurrenceSlotId,
    occurrenceDate: readMetadataValue(billMetadata, 'occurrenceDate', 'occurrence_date')
      ?? fallback.occurrenceDate,
    divisionId: readMetadataValue(
      billMetadata,
      'eventRegistrationDivisionId',
      'event_registration_division_id',
    ) ?? fallback.divisionId,
    divisionTypeId: readMetadataValue(
      billMetadata,
      'eventRegistrationDivisionTypeId',
      'event_registration_division_type_id',
    ) ?? fallback.divisionTypeId,
    divisionTypeKey: readMetadataValue(
      billMetadata,
      'eventRegistrationDivisionTypeKey',
      'event_registration_division_type_key',
    ) ?? fallback.divisionTypeKey,
    ...(sourceIntegrityFailure ? { sourceIntegrityFailure } : {}),
  };
};
