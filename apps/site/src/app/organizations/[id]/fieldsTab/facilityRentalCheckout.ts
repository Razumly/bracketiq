import type { Facility, Field, Organization } from '@/types';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFacilityScopedFieldDisplayName, getFieldResolvedLocation } from '@/lib/fieldUtils';
import { getFieldCoordinatesWithFallback, getFieldFacilityFromList, getFieldFacilityId } from './facilityCalendarResources';
import { normalizeFieldIds } from './facilityFormUtils';
import type { RentalSelectionCheckoutPayload, RentalSelectionCheckoutSelection } from './facilityCalendarTypes';

type CheckoutInput = Pick<RentalSelectionCheckoutPayload,
  'eventId' | 'totalRentalCents' | 'rentalSelections' | 'requiredTemplateIds' | 'hostRequiredTemplateIds'
> & {
  organization: Organization | null;
  hostSelection: string;
  fields: Field[];
  facilities: Facility[];
};

function rentalBounds(selections: RentalSelectionCheckoutSelection[]) {
  let earliest: Date | null = null;
  let latest: Date | null = null;
  selections.forEach((selection) => {
    const start = parseLocalDateTime(selection.startDate);
    const end = parseLocalDateTime(selection.endDate);
    if (!start || !end || end <= start) return;
    if (!earliest || start < earliest) earliest = start;
    if (!latest || end > latest) latest = end;
  });
  return {
    rentalStart: earliest ? formatLocalDateTime(earliest) : '',
    rentalEnd: latest ? formatLocalDateTime(latest) : '',
  };
}

function facilityLocation(facility: Facility | null) {
  return facility?.location || facility?.address || null;
}

function facilityPayload(field: Field | null, facility: Facility | null) {
  return {
    facilityId: facility?.$id ?? getFieldFacilityId(field) ?? null,
    facilityName: facility?.name ?? null,
    facilityLocation: facilityLocation(facility),
    facilityAddress: facility?.address ?? null,
  };
}

function fieldPayload(field: Field | null, facility: Facility | null, organization: Organization | null) {
  return {
    primaryFieldId: field?.$id ?? null,
    primaryFieldName: field ? getFacilityScopedFieldDisplayName(field) : null,
    location: getFieldResolvedLocation(field, facilityLocation(facility) ?? organization?.location ?? ''),
    coordinates: getFieldCoordinatesWithFallback(field, facility, organization),
  };
}

function appendTruthyParameters(params: URLSearchParams, pairs: Array<[string, string | null | undefined]>) {
  for (const [key, value] of pairs) {
    if (value) params.set(key, value);
  }
}

function appendFacilityParameters(params: URLSearchParams, facility: Facility | null) {
  appendTruthyParameters(params, [
    ['rentalFacilityId', facility?.$id],
    ['rentalFacilityName', facility?.name],
    ['rentalFacilityLocation', facilityLocation(facility)],
    ['rentalFacilityAddress', facility?.address],
  ]);
}

function appendFieldParameters(
  params: URLSearchParams, field: Field | null, facility: Facility | null, payload: RentalSelectionCheckoutPayload,
) {
  if (!field) return;
  params.set('rentalFieldId', field.$id);
  params.set('rentalFieldName', getFacilityScopedFieldDisplayName(field));
  if (payload.location) params.set('rentalLocation', payload.location);
  if (payload.coordinates) {
    params.set('rentalLng', String(payload.coordinates[0]));
    params.set('rentalLat', String(payload.coordinates[1]));
  }
  appendFacilityParameters(params, facility);
}

function checkoutUrl(
  input: CheckoutInput, payload: RentalSelectionCheckoutPayload, field: Field | null, facility: Facility | null,
) {
  const params = new URLSearchParams();
  params.set('create', '1');
  appendTruthyParameters(params, [['rentalStart', payload.rentalStart], ['rentalEnd', payload.rentalEnd]]);
  appendFieldParameters(params, field, facility, payload);
  if (input.totalRentalCents > 0) params.set('rentalPriceCents', String(Math.round(input.totalRentalCents)));
  if (input.requiredTemplateIds.length > 0) params.set('rentalRequiredTemplateIds', input.requiredTemplateIds.join(','));
  if (input.hostRequiredTemplateIds.length > 0) params.set('rentalHostRequiredTemplateIds', input.hostRequiredTemplateIds.join(','));
  if (input.rentalSelections.length > 0) params.set('rentalSelections', JSON.stringify(input.rentalSelections));
  appendTruthyParameters(params, [['rentalOrgId', payload.organizationId], ['hostOrgId', payload.renterOrganizationId]]);
  return `/events/${input.eventId}/schedule?${params.toString()}`;
}

export function buildRentalSelectionCheckout(input: CheckoutInput): RentalSelectionCheckoutPayload {
  const fieldIds = Array.from(new Set(input.rentalSelections.flatMap((selection) => normalizeFieldIds(selection.scheduledFieldIds))));
  const field = input.fields.find((candidate) => candidate.$id === fieldIds[0]) ?? null;
  const facility = getFieldFacilityFromList(field, input.facilities);
  const payload: RentalSelectionCheckoutPayload = {
    eventId: input.eventId, manageEventUrl: '',
    organizationId: input.organization?.$id ?? null,
    organizationName: input.organization?.name ?? 'Organization',
    renterOrganizationId: input.hostSelection && input.hostSelection !== 'self' ? input.hostSelection : null,
    ...facilityPayload(field, facility),
    ...fieldPayload(field, facility, input.organization),
    ...rentalBounds(input.rentalSelections),
    fieldIds,
    totalRentalCents: Math.round(input.totalRentalCents),
    rentalSelections: input.rentalSelections,
    requiredTemplateIds: input.requiredTemplateIds,
    hostRequiredTemplateIds: input.hostRequiredTemplateIds,
  };
  return { ...payload, manageEventUrl: checkoutUrl(input, payload, field, facility) };
}
