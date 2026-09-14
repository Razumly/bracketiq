import { useState, useEffect, useCallback, useRef } from 'react';
import { LocationCoordinates, LocationInfo, locationService } from '@/lib/locationService';

// Shared store to keep location in sync across hook consumers
type Listener = (loc: LocationCoordinates | null, info: LocationInfo | null) => void;
const listeners = new Set<Listener>();
let sharedLocation: LocationCoordinates | null = null;
let sharedLocationInfo: LocationInfo | null = null;
let sharedLocationRevision = 0;

const readStoredJson = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
};

const getInitialLocation = (): LocationCoordinates | null => {
  if (sharedLocation) {
    return sharedLocation;
  }

  const storedLocation = readStoredJson<LocationCoordinates>('user-location');
  if (storedLocation) {
    sharedLocation = storedLocation;
  }
  return storedLocation;
};

const getInitialLocationInfo = (): LocationInfo | null => {
  if (sharedLocationInfo) {
    return sharedLocationInfo;
  }

  const storedLocationInfo = readStoredJson<LocationInfo>('user-location-info');
  if (storedLocationInfo) {
    sharedLocationInfo = storedLocationInfo;
  }
  return storedLocationInfo;
};

const notifyAll = () => {
  listeners.forEach(fn => fn(sharedLocation, sharedLocationInfo));
};

const saveLocation = (info: LocationInfo | null) => {
  sharedLocation = info ? { lat: info.lat, lng: info.lng } : null;
  sharedLocationInfo = info;
  notifyAll();
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('user-location-changed', {
    detail: { loc: sharedLocation, info },
  }));
  try {
    if (info) {
      window.localStorage.setItem('user-location', JSON.stringify(sharedLocation));
      window.localStorage.setItem('user-location-info', JSON.stringify(info));
    } else {
      window.localStorage.removeItem('user-location');
      window.localStorage.removeItem('user-location-info');
    }
  } catch {
    // Keep the shared location when browser storage is unavailable.
  }
};

interface UseLocationOptions {
  loadApproximate?: boolean;
}

interface UseLocationReturn {
  location: LocationCoordinates | null;
  locationInfo: LocationInfo | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<void>;
  searchLocation: (query: string) => Promise<boolean>;
  clearLocation: () => void;
  setLocationFromInfo: (info: LocationInfo) => void;
}

export function useLocation({ loadApproximate = false }: UseLocationOptions = {}): UseLocationReturn {
  const [location, setLocation] = useState<LocationCoordinates | null>(() => getInitialLocation());
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(() => getInitialLocationInfo());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  // Load saved location from localStorage
  useEffect(() => {
    // Initialize from shared store if available, otherwise from localStorage
    setLocation(getInitialLocation());
    setLocationInfo(getInitialLocationInfo());

    // Subscribe to shared updates
    const listener: Listener = (loc, info) => {
      setLocation(loc);
      setLocationInfo(info);
    };
    listeners.add(listener);

    // Subscribe to window-level location change events for cross-bundle safety
    const onWindowLocationChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ loc: LocationCoordinates | null; info: LocationInfo | null }>).detail;
      if (detail) {
        if (detail.loc !== sharedLocation || detail.info !== sharedLocationInfo) {
          sharedLocationRevision += 1;
          sharedLocation = detail.loc;
          sharedLocationInfo = detail.info;
          notifyAll();
        }
        setLocation(detail.loc);
        setLocationInfo(detail.info);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('user-location-changed', onWindowLocationChanged as EventListener);
    }
    return () => {
      requestControllerRef.current?.abort();
      listeners.delete(listener);
      if (typeof window !== 'undefined') {
        window.removeEventListener('user-location-changed', onWindowLocationChanged as EventListener);
      }
    };
  }, []);

  useEffect(() => {
    if (requestControllerRef.current?.signal.aborted) setLoading(false);
    if (!loadApproximate || getInitialLocation() || getInitialLocationInfo()) return;

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const revision = sharedLocationRevision;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const info = await locationService.getApproximateLocation(controller.signal);
        if (
          controller.signal.aborted
          || revision !== sharedLocationRevision
          || getInitialLocation()
          || getInitialLocationInfo()
        ) return;
        saveLocation({ ...info, source: 'approximate' });
      } catch (err) {
        if (!controller.signal.aborted && revision === sharedLocationRevision) {
          setError(err instanceof Error ? err.message : 'Failed to get approximate location');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [loadApproximate]);

  const beginRequest = useCallback(() => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const revision = ++sharedLocationRevision;
    setLoading(true);
    setError(null);
    return { controller, revision };
  }, []);

  const requestLocation = useCallback(async () => {
    const { controller, revision } = beginRequest();
    const isCurrent = () => !controller.signal.aborted && revision === sharedLocationRevision;

    try {
      const coords = await locationService.getCurrentLocation();
      if (!isCurrent()) return;
      let info: LocationInfo = { ...coords };
      try {
        info = await locationService.reverseGeocode(coords.lat, coords.lng);
      } catch {
        // Exact coordinates remain useful when the address cannot load.
      }
      if (isCurrent()) saveLocation({ ...info, ...coords, source: 'exact' });
    } catch (error) {
      if (!isCurrent()) return;
      try {
        const approximateInfo = await locationService.getApproximateLocation(controller.signal);
        if (isCurrent()) saveLocation({ ...approximateInfo, source: 'approximate' });
      } catch {
        if (isCurrent()) {
          setError(error instanceof Error ? error.message : 'Failed to get location');
        }
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [beginRequest]);

  const searchLocation = useCallback(async (query: string): Promise<boolean> => {
    const { controller, revision } = beginRequest();
    const isCurrent = () => !controller.signal.aborted && revision === sharedLocationRevision;

    try {
      const info = await locationService.geocodeLocation(query);
      if (!isCurrent()) return false;
      saveLocation({ ...info, source: 'manual' });
      return true;
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Failed to find location');
      return false;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [beginRequest]);

  const clearLocation = useCallback(() => {
    requestControllerRef.current?.abort();
    sharedLocationRevision += 1;
    setLoading(false);
    setError(null);
    saveLocation(null);
  }, []);

  const setLocationFromInfo = useCallback((info: LocationInfo) => {
    requestControllerRef.current?.abort();
    sharedLocationRevision += 1;
    setLoading(false);
    setError(null);
    saveLocation({ ...info, source: 'manual' });
  }, []);

  return {
    location,
    locationInfo,
    loading,
    error,
    requestLocation,
    searchLocation,
    clearLocation,
    setLocationFromInfo
  };
}
