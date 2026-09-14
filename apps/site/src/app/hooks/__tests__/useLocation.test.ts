import { act, renderHook, waitFor } from '@testing-library/react';
import { useLocation } from '../useLocation';
import { locationService, type LocationInfo } from '@/lib/locationService';

jest.mock('@/lib/locationService', () => ({
  locationService: {
    getCurrentLocation: jest.fn(),
    reverseGeocode: jest.fn(),
    geocodeLocation: jest.fn(),
    getApproximateLocation: jest.fn(),
  },
}));

const mockedLocationService = locationService as jest.Mocked<typeof locationService>;

describe('useLocation', () => {
  beforeEach(() => {
    mockedLocationService.getCurrentLocation.mockReset();
    mockedLocationService.reverseGeocode.mockReset();
    mockedLocationService.geocodeLocation.mockReset();
    mockedLocationService.getApproximateLocation.mockReset();
    localStorage.clear();
    (navigator as any).permissions = undefined;
    const { result, unmount } = renderHook(() => useLocation());
    act(() => result.current.clearLocation());
    unmount();
  });

  it('uses a saved location instead of requesting an approximate location', () => {
    localStorage.setItem('user-location', JSON.stringify({ lat: 45.5, lng: -122.6 }));
    localStorage.setItem('user-location-info', JSON.stringify({
      lat: 45.5,
      lng: -122.6,
      city: 'Portland',
    }));

    const { result } = renderHook(() => useLocation({ loadApproximate: true }));

    expect(result.current.location).toEqual({ lat: 45.5, lng: -122.6 });
    expect(result.current.locationInfo).toMatchObject({ city: 'Portland' });
    expect(mockedLocationService.getApproximateLocation).not.toHaveBeenCalled();
  });

  it('replaces approximate location with exact browser location and stores it', async () => {
    mockedLocationService.getApproximateLocation.mockResolvedValue({
      lat: 39.7,
      lng: -104.9,
      city: 'Denver',
      source: 'approximate',
    });
    mockedLocationService.getCurrentLocation.mockResolvedValue({ lat: 40, lng: -105 });
    mockedLocationService.reverseGeocode.mockResolvedValue({
      lat: 40,
      lng: -105,
      city: 'Boulder',
    });

    const { result } = renderHook(() => useLocation({ loadApproximate: true }));
    await waitFor(() => expect(result.current.locationInfo?.source).toBe('approximate'));
    expect(mockedLocationService.getCurrentLocation).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.location).toEqual({ lat: 40, lng: -105 });
    expect(result.current.locationInfo).toMatchObject({ city: 'Boulder', source: 'exact' });
    expect(localStorage.getItem('user-location')).toBe(JSON.stringify({ lat: 40, lng: -105 }));
    expect(JSON.parse(localStorage.getItem('user-location-info')!)).toMatchObject({ source: 'exact' });
  });

  it('starts geolocation without awaiting the Permissions API', async () => {
    const permissionsQuery = jest.fn().mockResolvedValue({ state: 'prompt' });
    (navigator as Navigator & { permissions?: { query: jest.Mock } }).permissions = {
      query: permissionsQuery,
    };
    mockedLocationService.getCurrentLocation.mockResolvedValue({ lat: 45.58, lng: -122.35 });
    mockedLocationService.reverseGeocode.mockResolvedValue({
      lat: 45.58,
      lng: -122.35,
      city: 'Washougal',
      state: 'WA',
    });

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(permissionsQuery).not.toHaveBeenCalled();
    expect(mockedLocationService.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(result.current.locationInfo).toMatchObject({ city: 'Washougal', state: 'WA' });
  });

  it('searches for a location via geocode', async () => {
    mockedLocationService.geocodeLocation.mockResolvedValue({
      lat: 51.5,
      lng: -0.12,
      city: 'London',
    });

    const { result } = renderHook(() => useLocation());

    let found = false;
    await act(async () => {
      found = await result.current.searchLocation('London');
    });

    expect(found).toBe(true);
    expect(mockedLocationService.geocodeLocation).toHaveBeenCalledWith('London');
    expect(result.current.location).toEqual({ lat: 51.5, lng: -0.12 });
    expect(result.current.locationInfo).toMatchObject({ city: 'London', source: 'manual' });
  });

  it('clears stored location', async () => {
    mockedLocationService.geocodeLocation.mockResolvedValue({ lat: 10, lng: 10 });

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.searchLocation('Somewhere');
      result.current.clearLocation();
    });

    expect(result.current.location).toBeNull();
    expect(localStorage.getItem('user-location')).toBeNull();
  });

  it('returns false and exposes the geocoder error when a location is not found', async () => {
    mockedLocationService.geocodeLocation.mockRejectedValue(new Error('Location not found'));

    const { result } = renderHook(() => useLocation());

    let found = true;
    await act(async () => {
      found = await result.current.searchLocation('not-a-real-place');
    });

    expect(found).toBe(false);
    expect(result.current.error).toBe('Location not found');
    expect(result.current.location).toBeNull();
  });

  it('does not request approximate location unless a consumer opts in', () => {
    renderHook(() => useLocation());
    expect(mockedLocationService.getApproximateLocation).not.toHaveBeenCalled();
  });

  it('keeps a shared manual location when an approximate request finishes later', async () => {
    let resolveApproximate!: (info: LocationInfo) => void;
    mockedLocationService.getApproximateLocation.mockImplementation(() => (
      new Promise(resolve => { resolveApproximate = resolve; })
    ));
    const approximate = renderHook(() => useLocation({ loadApproximate: true }));
    const manual = renderHook(() => useLocation());
    const selectedLocation = { lat: 51.5, lng: -0.12, city: 'London' };

    act(() => manual.result.current.setLocationFromInfo(selectedLocation));
    await act(async () => {
      resolveApproximate({ lat: 45.5, lng: -122.6, city: 'Portland', source: 'approximate' });
    });

    expect(approximate.result.current.locationInfo).toEqual({ ...selectedLocation, source: 'manual' });
    expect(JSON.parse(localStorage.getItem('user-location-info')!)).toEqual({
      ...selectedLocation,
      source: 'manual',
    });
  });

  it('does not restore an approximate location after its consumer unmounts', async () => {
    let resolveApproximate!: (info: LocationInfo) => void;
    mockedLocationService.getApproximateLocation.mockImplementation(() => (
      new Promise(resolve => { resolveApproximate = resolve; })
    ));
    const { unmount } = renderHook(() => useLocation({ loadApproximate: true }));
    const signal = mockedLocationService.getApproximateLocation.mock.calls[0][0];
    unmount();

    await act(async () => {
      resolveApproximate({ lat: 45.5, lng: -122.6, city: 'Portland', source: 'approximate' });
    });

    const { result } = renderHook(() => useLocation());
    expect(signal?.aborted).toBe(true);
    expect(result.current.location).toBeNull();
    expect(localStorage.getItem('user-location-info')).toBeNull();
  });
});
