import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LocationSearch from '../LocationSearch';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import type { LocationInfo } from '@/lib/locationService';

const mockRequestLocation = jest.fn();
const mockSearchLocation = jest.fn();
const mockClearLocation = jest.fn();
const mockSetLocationFromInfo = jest.fn();
const mockGetPlacePredictions = jest.fn();
const mockGetPlaceDetails = jest.fn();
let mockLocationInfo: LocationInfo | null = null;

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    location: null,
    locationInfo: mockLocationInfo,
    loading: false,
    error: null,
    requestLocation: mockRequestLocation,
    searchLocation: mockSearchLocation,
    clearLocation: mockClearLocation,
    setLocationFromInfo: mockSetLocationFromInfo,
  }),
}));

jest.mock('@/lib/locationService', () => ({
  locationService: {
    createPlacesSessionToken: jest.fn(() => null),
    getPlacePredictions: (...args: unknown[]) => mockGetPlacePredictions(...args),
    getPlaceDetails: (...args: unknown[]) => mockGetPlaceDetails(...args),
  },
}));

jest.mock('@/app/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

describe('LocationSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocationInfo = null;
    mockRequestLocation.mockResolvedValue(undefined);
    mockSearchLocation.mockResolvedValue(true);
    mockGetPlacePredictions.mockResolvedValue([]);
    mockGetPlaceDetails.mockResolvedValue(null);
  });

  it('requests browser location only from the current location control', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);
    expect(mockRequestLocation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Set Location' }));
    expect(await screen.findByPlaceholderText('Enter city, state, or ZIP')).toBeInTheDocument();
    expect(mockRequestLocation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Use Current Location' }));
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('lets the user replace an approximate location with exact browser location', async () => {
    mockLocationInfo = {
      lat: 45.5,
      lng: -122.6,
      city: 'Portland',
      state: 'OR',
      source: 'approximate',
    };
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    await user.click(screen.getByRole('button', { name: 'Portland, OR (approximate)' }));
    expect(mockRequestLocation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Use Exact Location' }));
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('returns focus to Set Location after Escape closes the picker', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    const locationButton = screen.getByRole('button', { name: 'Set Location' });
    await user.click(locationButton);
    const locationInput = await screen.findByPlaceholderText('Enter city, state, or ZIP');
    await user.click(locationInput);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(locationButton).toHaveFocus());
  });

  it('submits a typed ZIP through the shared location search and closes on success', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    const locationButton = screen.getByRole('button', { name: 'Set Location' });
    await user.click(locationButton);
    await user.type(await screen.findByPlaceholderText('Enter city, state, or ZIP'), '98671{Enter}');

    await waitFor(() => {
      expect(mockSearchLocation).toHaveBeenCalledWith('98671');
    });
    expect(locationButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the picker open when a typed location cannot be resolved', async () => {
    mockSearchLocation.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch />);

    const locationButton = screen.getByRole('button', { name: 'Set Location' });
    await user.click(locationButton);
    await user.type(await screen.findByPlaceholderText('Enter city, state, or ZIP'), 'not-a-real-place{Enter}');

    await waitFor(() => {
      expect(mockSearchLocation).toHaveBeenCalledWith('not-a-real-place');
    });
    expect(locationButton).toHaveAttribute('aria-expanded', 'true');
  });
  it('keeps inline location entry in the search surface with only Nearby as the location action', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch inline />);

    const locationInput = screen.getByRole('textbox', { name: 'Where' });
    expect(locationInput).toHaveAttribute('placeholder', 'Search destinations');
    await user.click(locationInput);

    expect(screen.getByRole('button', { name: 'Nearby' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Current|Approximate/)).not.toBeInTheDocument();
  });

  it('shows the discover location label in the shared inline control', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LocationSearch inline displayLabel="Near by" />);

    const locationInput = screen.getByRole('textbox', { name: 'Where' });
    expect(locationInput).toHaveValue('Near by');

    await user.click(locationInput);

    expect(locationInput).toHaveValue('Near by');
    expect(screen.getByRole('button', { name: 'Nearby' })).toBeInTheDocument();
  });
});
