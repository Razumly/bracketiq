import type { Facility, Field, Organization } from '@/types';
import { buildRentalSelectionCheckout } from './facilityRentalCheckout';
import type { RentalSelectionCheckoutSelection } from './facilityCalendarTypes';

const organization: Organization = { $id: 'org-1', name: 'River Club', location: 'Club office', coordinates: [-97, 30] };
const facility: Facility = {
  $id: 'facility-1', organizationId: organization.$id, name: 'River Center',
  location: 'Court entrance', address: '100 River Road', coordinates: [-98, 31],
};
const field: Field = {
  $id: 'court-1', name: 'Court 1', location: 'North door', lat: 32, long: -99,
  facilityId: facility.$id, facility,
};
const selection: RentalSelectionCheckoutSelection = {
  key: 'selection-1', scheduledFieldIds: [field.$id], dayOfWeek: 1, daysOfWeek: [1],
  startTimeMinutes: 600, endTimeMinutes: 660, startDate: '2030-06-11T10:00',
  endDate: '2030-06-11T11:00', repeating: false,
};
const input = {
  eventId: 'new-event', totalRentalCents: 1500.6, rentalSelections: [selection],
  requiredTemplateIds: ['waiver-1', 'waiver-2'], hostRequiredTemplateIds: ['host-waiver'],
  organization, hostSelection: 'renter-org', fields: [field], facilities: [facility],
};

function paramsFor(payload: ReturnType<typeof buildRentalSelectionCheckout>) {
  return new URL(payload.manageEventUrl, 'http://localhost').searchParams;
}

it('keeps checkout values and the schedule link consistent without changing the selections', () => {
  const snapshot = JSON.stringify(input);
  const result = buildRentalSelectionCheckout(input);
  expect(result).toMatchObject({
    eventId: 'new-event', organizationId: organization.$id, organizationName: organization.name,
    renterOrganizationId: 'renter-org', primaryFieldId: field.$id, primaryFieldName: 'River Center - Court 1',
    facilityId: facility.$id, facilityName: facility.name, facilityLocation: facility.location,
    facilityAddress: facility.address, location: field.location, coordinates: [-99, 32],
    rentalStart: '2030-06-11T10:00:00', rentalEnd: '2030-06-11T11:00:00',
    totalRentalCents: 1501, requiredTemplateIds: input.requiredTemplateIds, hostRequiredTemplateIds: input.hostRequiredTemplateIds,
  });
  const url = new URL(result.manageEventUrl, 'http://localhost');
  expect(url.pathname).toBe('/events/new-event/schedule');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    create: '1', rentalStart: result.rentalStart, rentalEnd: result.rentalEnd,
    rentalFieldId: field.$id, rentalFieldName: result.primaryFieldName, rentalLocation: field.location,
    rentalLng: '-99', rentalLat: '32', rentalFacilityId: facility.$id, rentalFacilityName: facility.name,
    rentalFacilityLocation: facility.location, rentalFacilityAddress: facility.address,
    rentalPriceCents: '1501', rentalRequiredTemplateIds: 'waiver-1,waiver-2', rentalHostRequiredTemplateIds: 'host-waiver',
    rentalSelections: JSON.stringify([selection]), rentalOrgId: organization.$id, hostOrgId: 'renter-org',
  });
  expect(JSON.stringify(input)).toBe(snapshot);
});

it('uses all selection bounds and first-seen resource order', () => {
  const later = { ...selection, key: 'later', scheduledFieldIds: ['court-2', 'court-1', 'court-2'], endDate: '2030-06-12T14:00' };
  const earlier = { ...selection, key: 'earlier', startDate: '2030-06-10T08:00', endDate: '2030-06-10T09:00' };
  const secondField = { ...field, $id: 'court-2', name: 'Court 2' };
  const result = buildRentalSelectionCheckout({ ...input, rentalSelections: [later, earlier], fields: [field, secondField] });
  expect(result).toMatchObject({
    fieldIds: ['court-2', 'court-1'], primaryFieldId: 'court-2', primaryFieldName: 'River Center - Court 2',
    rentalStart: '2030-06-10T08:00:00', rentalEnd: '2030-06-12T14:00:00', rentalSelections: [later, earlier],
  });
  expect(JSON.parse(paramsFor(result).get('rentalSelections')!)).toEqual([later, earlier]);
});

it('uses linked facility data when the field is not expanded and falls back from facility location to address', () => {
  const linked = { ...field, facility: undefined, location: '', lat: 0, long: 0 };
  const addressOnly = { ...facility, location: '' };
  const result = buildRentalSelectionCheckout({ ...input, fields: [linked], facilities: [addressOnly] });
  expect(result).toMatchObject({
    facilityId: facility.$id, facilityName: facility.name, facilityLocation: facility.address,
    location: facility.address, coordinates: facility.coordinates, primaryFieldName: 'Court 1',
  });
  expect(paramsFor(result).get('rentalFacilityLocation')).toBe(facility.address);
});

it('prefers an expanded facility over another list entry and uses Organization coordinates when needed', () => {
  const expanded = { ...facility, name: 'Expanded Center', coordinates: null };
  const result = buildRentalSelectionCheckout({
    ...input, fields: [{ ...field, facility: expanded, lat: 0, long: 0 }], facilities: [{ ...facility, name: 'Other Center' }],
  });
  expect(result.facilityName).toBe('Expanded Center');
  expect(result.primaryFieldName).toBe('Expanded Center - Court 1');
  expect(result.coordinates).toEqual(organization.coordinates);
});

it('retains an unresolved facility link in the callback without adding hydrated facility fields to the URL', () => {
  const result = buildRentalSelectionCheckout({
    ...input, fields: [{ ...field, facility: undefined }], facilities: [],
  });
  expect(result.facilityId).toBe(facility.$id);
  expect(result.facilityName).toBeNull();
  expect(paramsFor(result).has('rentalFacilityId')).toBe(false);
});

it.each(['self', ''])('omits optional price, documents, and personal host parameters for %s', (hostSelection) => {
  const result = buildRentalSelectionCheckout({
    ...input, totalRentalCents: 0, requiredTemplateIds: [], hostRequiredTemplateIds: [], hostSelection,
  });
  expect(result.renterOrganizationId).toBeNull();
  expect(result.totalRentalCents).toBe(0);
  const params = paramsFor(result);
  expect(params.has('rentalPriceCents')).toBe(false);
  expect(params.has('rentalRequiredTemplateIds')).toBe(false);
  expect(params.has('rentalHostRequiredTemplateIds')).toBe(false);
  expect(params.has('hostOrgId')).toBe(false);
});

it('omits unavailable field metadata and ignores malformed or reversed date bounds', () => {
  const invalid = { ...selection, startDate: 'invalid' };
  const reversed = { ...selection, startDate: '2030-06-11T12:00', endDate: '2030-06-11T10:00' };
  const result = buildRentalSelectionCheckout({
    ...input, rentalSelections: [invalid, reversed], organization: null, fields: [], facilities: [],
  });
  expect(result).toMatchObject({
    organizationId: null, organizationName: 'Organization', primaryFieldId: null, primaryFieldName: null,
    facilityId: null, facilityName: null, location: '', coordinates: undefined, rentalStart: '', rentalEnd: '',
  });
  const params = paramsFor(result);
  expect(params.has('rentalStart')).toBe(false);
  expect(params.has('rentalEnd')).toBe(false);
  expect(params.has('rentalFieldId')).toBe(false);
  expect(params.has('rentalOrgId')).toBe(false);
});
