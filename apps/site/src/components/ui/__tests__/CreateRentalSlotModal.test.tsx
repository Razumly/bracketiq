import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Field, TimeSlot } from '@/types';
import CreateRentalSlotModal from '../CreateRentalSlotModal';
import { getIndexedEntityColorPair } from '@/lib/entityColors';

const createRentalSlotMock = jest.fn();
const updateRentalSlotMock = jest.fn();
const deleteRentalSlotMock = jest.fn();
const apiRequestMock = jest.fn();

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    createRentalSlot: (...args: any[]) => createRentalSlotMock(...args),
    updateRentalSlot: (...args: any[]) => updateRentalSlotMock(...args),
    deleteRentalSlot: (...args: any[]) => deleteRentalSlotMock(...args),
  },
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  isApiRequestError: (error: unknown) => {
    if (!error || typeof error !== 'object' || !('name' in error)) {
      return false;
    }
    return error.name === 'ApiRequestError';
  },
}));

jest.mock('@/components/ui/PriceWithFeesPreview', () => () => null);

describe('CreateRentalSlotModal multi-field creation', () => {
  const editField: Field = { $id: 'court', name: 'Court', location: '', lat: 0, long: 0 };
  const editableSlot: TimeSlot = { $id: 'slot', dayOfWeek: 0, daysOfWeek: [0], repeating: false,
    startDate: '2035-06-11T22:00:00Z', endDate: '2035-06-12T02:00:00Z', timeZone: 'UTC',
    startTimeMinutes: 1320, endTimeMinutes: 120 };

  it('keeps one overnight interval when editing a non-repeating rental time', async () => {
    const submit = jest.fn();
    const user = userEvent.setup();
    render(<CreateRentalSlotModal opened field={editField} slot={editableSlot} onClose={() => undefined} onSubmitOverride={submit} />);
    await user.click(screen.getByRole('combobox', { name: 'End time hour' }));
    await user.click(screen.getByRole('option', { name: '3', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save Rental Slot' }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({
      repeating: false, startDate: '2035-06-11T22:00:00', endDate: '2035-06-12T03:00:00', endTimeMinutes: 180,
    }) })));
  });

  it('rejects an expired non-repeating rental without submitting', async () => {
    const submit = jest.fn();
    const user = userEvent.setup();
    render(<CreateRentalSlotModal opened field={editField} slot={{ ...editableSlot, startDate: '2020-06-11T22:00:00Z', endDate: '2020-06-12T02:00:00Z' }} onClose={() => undefined} onSubmitOverride={submit} />);
    await user.click(screen.getByRole('button', { name: 'Save Rental Slot' }));
    expect(await screen.findByText(/end date and time must be in the future/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('saves several selected repeating weekdays', async () => {
    const submit = jest.fn();
    const user = userEvent.setup();
    render(<CreateRentalSlotModal opened field={editField} slot={{ ...editableSlot, repeating: true, endDate: null }} onClose={() => undefined} onSubmitOverride={submit} />);
    await user.click(screen.getByRole('combobox', { name: 'Repeat on' }));
    await user.click(screen.getByRole('option', { name: 'Wednesday' }));
    await user.click(screen.getByRole('button', { name: 'Save Rental Slot' }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ daysOfWeek: [0, 2], repeating: true }),
      updatePayload: expect.objectContaining({ daysOfWeek: [0, 2] }),
    })));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    apiRequestMock.mockResolvedValue({ templates: [] });
  });

  it('creates one rental slot per selected field in create mode', async () => {
    const selectedFields = [
      {
        $id: 'field_main',
        name: 'Main',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
      {
        $id: 'field_aux',
        name: 'Aux',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
    ] as any[];

    createRentalSlotMock.mockImplementation(async (field: any) => ({
      field: {
        ...field,
        rentalSlotIds: [`slot_${field.$id}`],
        rentalSlots: [{ $id: `slot_${field.$id}`, dayOfWeek: 1, repeating: false }],
      },
      slot: { $id: `slot_${field.$id}`, dayOfWeek: 1, repeating: false },
    }));

    const onSaved = jest.fn();
    const onClose = jest.fn();
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={onClose}
          field={selectedFields[0]}
          selectedFields={selectedFields}
          slot={null}
          initialRange={null}
          onSaved={onSaved}
          organizationId={null}
          organizationHasStripeAccount={false}
        />
      </MantineProvider>,
    );

    expect(await screen.findByText('Resources')).toBeInTheDocument();

    const submitButton = await screen.findByRole('button', { name: 'Create Rental Slots (2)' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(createRentalSlotMock).toHaveBeenCalledTimes(2);
    });

    expect(createRentalSlotMock.mock.calls[0]?.[0]?.$id).toBe('field_main');
    expect(createRentalSlotMock.mock.calls[1]?.[0]?.$id).toBe('field_aux');
    expect(onSaved).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $id: 'field_main' }),
        expect.objectContaining({ $id: 'field_aux' }),
      ]),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('submits an open-ended overnight repeating rental slot', async () => {
    const field = {
      $id: 'field_overnight',
      name: 'Overnight Court',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: ['slot_overnight'],
      rentalSlots: [],
    } as any;
    const slot = {
      $id: 'slot_overnight',
      dayOfWeek: 0,
      daysOfWeek: [0],
      startDate: '2030-06-10T00:00:00',
      endDate: null,
      startTimeMinutes: 23 * 60,
      endTimeMinutes: 60,
      timeZone: 'UTC',
      repeating: true,
    } as any;
    const onSubmitOverride = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={() => undefined}
          field={field}
          slot={slot}
          onSubmitOverride={onSubmitOverride}
          organizationId={null}
          organizationHasStripeAccount={false}
        />
      </MantineProvider>,
    );
    expect(
      await screen.findByText('Overnight slot ends on the next local weekday: Tuesday.'),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Save Rental Slot' }));

    await waitFor(() => {
      expect(onSubmitOverride).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          startTimeMinutes: 23 * 60,
          endTimeMinutes: 60,
          endDate: null,
          repeating: true,
        }),
      }));
    });
  });

  it('uses the persisted slot time zone when editing a calendar date', async () => {
    const field: Field = {
      $id: 'field_tokyo',
      name: 'Tokyo Court',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: ['slot_tokyo'],
      rentalSlots: [],
    };
    const slot: TimeSlot = {
      $id: 'slot_tokyo',
      dayOfWeek: 0,
      daysOfWeek: [0],
      startDate: '2030-06-09T15:00:00.000Z',
      endDate: null,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 10 * 60,
      timeZone: 'Asia/Tokyo',
      repeating: true,
    };
    const onSubmitOverride = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={() => undefined}
          field={field}
          slot={slot}
          onSubmitOverride={onSubmitOverride}
          organizationId={null}
          organizationHasStripeAccount={false}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Save Rental Slot' }));

    await waitFor(() => {
      expect(onSubmitOverride).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          dayOfWeek: 0,
          startDate: '2030-06-10T09:00:00',
          timeZone: 'Asia/Tokyo',
        }),
        updatePayload: expect.objectContaining({
          dayOfWeek: 0,
          startDate: '2030-06-10T09:00:00',
          timeZone: 'Asia/Tokyo',
        }),
      }));
    });
  });

  it('renders selected fields with colors from the provided field reference list', async () => {
    const selectedFields = [
      {
        $id: 'field_main',
        name: 'Main',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
      {
        $id: 'field_aux',
        name: 'Aux',
        location: '',
        lat: 0,
        long: 0,
        rentalSlotIds: [],
        rentalSlots: [],
      },
    ] as any[];

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={() => undefined}
          field={selectedFields[0]}
          selectedFields={selectedFields}
          slot={null}
          initialRange={null}
          organizationId={null}
          organizationHasStripeAccount={false}
          fieldColorReferenceList={['field_main', 'field_aux']}
        />
      </MantineProvider>,
    );

    expect(await screen.findByText('Main')).toBeInTheDocument();
    expect(screen.getByTestId('rental-slot-field-chip-field_main')).toHaveStyle(`background-color: ${getIndexedEntityColorPair(0).bg}`);
    expect(screen.getByTestId('rental-slot-field-chip-field_aux')).toHaveStyle(`background-color: ${getIndexedEntityColorPair(1).bg}`);
  });
  it('shows the API validation error when saving a rental slot fails', async () => {
    const field = {
      $id: 'field_error',
      name: 'Error Court',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: [],
      rentalSlots: [],
    } as any;
    const serverError = new Error(
      'Repeating Time Slot on 2030-03-10 contains a nonexistent local time.',
    );
    serverError.name = 'ApiRequestError';
    createRentalSlotMock.mockRejectedValue(serverError);
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <CreateRentalSlotModal
          opened
          onClose={() => undefined}
          field={field}
          slot={null}
          organizationId={null}
          organizationHasStripeAccount={false}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Create Rental Slot' }));

    expect(await screen.findByText(serverError.message)).toBeInTheDocument();
  });
});
