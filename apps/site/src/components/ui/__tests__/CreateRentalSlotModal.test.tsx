import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
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
