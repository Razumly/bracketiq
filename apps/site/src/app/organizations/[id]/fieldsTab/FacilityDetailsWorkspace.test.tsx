import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { facilityService } from '@/lib/facilityService';
import { fieldService } from '@/lib/fieldService';
import { sportsService } from '@/lib/sportsService';
import type { Facility, Field, Organization } from '@/types';
import FacilityDetailsWorkspace from './FacilityDetailsWorkspace';

jest.mock('@/lib/facilityService', () => ({
  facilityService: { updateFacility: jest.fn(), createFacility: jest.fn() },
}));
jest.mock('@/lib/fieldService', () => ({
  fieldService: { updateField: jest.fn(), createField: jest.fn() },
}));
jest.mock('@/lib/sportsService', () => ({ sportsService: { getAll: jest.fn() } }));
jest.mock('@/lib/organizationNotifications', () => ({ notifications: { show: jest.fn() } }));
// These workflows use saved locations. Address selection requires separate provider verification.
jest.mock('@/components/location/LocationSelector', () => ({
  __esModule: true,
  default: () => null,
}));

const facilities = jest.mocked(facilityService);
const fields = jest.mocked(fieldService);
const sports = jest.mocked(sportsService);
const organization: Organization = { $id: 'org-1', name: 'River City' };
const facility: Facility = {
  $id: 'facility-1', organizationId: organization.$id, name: 'River City Center',
  location: '100 River Road', coordinates: [-122.67, 45.52],
};
const resource: Field = {
  $id: 'resource-1', name: 'Court 1', facilityId: facility.$id,
  location: '', lat: 0, long: 0, sportIds: [],
};
type Props = ComponentProps<typeof FacilityDetailsWorkspace>;

function workspace(overrides: Partial<Props> = {}) {
  return (
    <MantineProvider>
      <FacilityDetailsWorkspace
        organization={organization} facilities={[facility]} fields={[resource]}
        canManage onSaved={jest.fn().mockResolvedValue(undefined)}
        onSwitchToSchedule={jest.fn()} {...overrides}
      />
    </MantineProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
  sports.getAll.mockResolvedValue([]);
  facilities.updateFacility.mockImplementation(async (id, data) => ({ ...facility, ...data, $id: id }));
  fields.updateField.mockImplementation(async (data) => ({ ...resource, ...data }));
});
afterEach(() => jest.restoreAllMocks());

it('keeps edited fields, focus, and undo history when equivalent saved data arrives', async () => {
  const user = userEvent.setup();
  const view = render(workspace());
  const name = screen.getByRole('textbox', { name: 'Name' });
  await user.clear(name);
  await user.type(name, 'Draft center');
  view.rerender(workspace({ facilities: [{ ...facility }], fields: [{ ...resource }] }));
  expect(screen.getByRole('textbox', { name: 'Name' })).toBe(name);
  expect(name).toHaveFocus();
  expect(name).toHaveValue('Draft center');
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(name).toHaveValue(facility.name);
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(facilities.updateFacility).not.toHaveBeenCalled();
});

it('resets drafts and undo history when saved facility data changes', async () => {
  const user = userEvent.setup();
  const view = render(workspace());
  await user.type(screen.getByRole('textbox', { name: 'Name' }), ' draft');
  view.rerender(workspace({ facilities: [{ ...facility, name: 'Updated center' }] }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Updated center'));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

it('retains a failed save for explicit retry and blocks edits while saving', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const request = deferred<Facility>();
  facilities.updateFacility.mockReturnValueOnce(request.promise);
  const onSaved = jest.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(workspace({ onSaved }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New center' } });
  await user.click(screen.getByRole('button', { name: /Save changes/ }));
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '+ Resource' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await act(async () => request.reject(new Error('Save failed')));
  expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('New center');
  expect(onSaved).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /Save changes/ }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(facilities.updateFacility).toHaveBeenCalledTimes(2);
  expect(facilities.updateFacility).toHaveBeenLastCalledWith(facility.$id, expect.objectContaining({ name: 'New center' }));
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('validates all resource drafts before any facility write', async () => {
  const user = userEvent.setup();
  render(workspace());
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New center' } });
  await user.click(screen.getByRole('button', { name: '+ Resource' }));
  await user.click(screen.getByRole('button', { name: /Save changes/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('Resource name is required.');
  expect(facilities.updateFacility).not.toHaveBeenCalled();
  expect(fields.createField).not.toHaveBeenCalled();
});

it('maps a created resource to its saved identity and uses updates on its next save', async () => {
  fields.createField.mockResolvedValue({ ...resource, $id: 'resource-new', name: 'Court 2' });
  const onSaved = jest.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(workspace({ onSaved }));
  await user.click(screen.getByRole('button', { name: '+ Resource' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Court 2');
  await user.click(screen.getByRole('button', { name: /Save changes/ }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(fields.createField).toHaveBeenCalledWith({
    name: 'Court 2', location: null, lat: undefined, long: undefined,
    facilityId: facility.$id, sportIds: [], organization,
  });
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Court 2');
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Court 3' } });
  await user.click(screen.getByRole('button', { name: /Save changes/ }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  expect(fields.createField).toHaveBeenCalledTimes(1);
  expect(fields.updateField).toHaveBeenCalledWith(expect.objectContaining({ $id: 'resource-new', name: 'Court 3' }));
});

it('keeps schedule navigation available for read-only users without permitting edits', async () => {
  const onSwitchToSchedule = jest.fn();
  const user = userEvent.setup();
  render(workspace({ canManage: false, onSwitchToSchedule }));
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '+ Facility' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await user.click(screen.getByRole('button', { name: 'Back to schedule' }));
  expect(facilities.createFacility).not.toHaveBeenCalled();
  expect(onSwitchToSchedule).toHaveBeenCalledTimes(1);
});
