'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useLocation } from '@/app/hooks/useLocation';
import { locationService } from '@/lib/locationService';
import { useDebounce } from '@/app/hooks/useDebounce';
import {
  Button,
  Group,
  Loader,
  Popover,
  Text,
  TextInput,
} from '@/components/organization/organization-operation-ui';

export default function LocationSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const locationTriggerContainerRef = useRef<HTMLSpanElement>(null);
  const wasLocationOptionsOpenRef = useRef(false);
  const [predictions, setPredictions] = useState<Array<{ description: string; placeId: string }>>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<any | null>(null);
  const locationPromptAttemptedRef = useRef(false);
  const debouncedQuery = useDebounce(searchQuery, 250);

  const {
    location,
    locationInfo,
    loading,
    error,
    requestLocation,
    searchLocation,
    clearLocation,
    setLocationFromInfo,
  } = useLocation();

  useEffect(() => {
    if (wasLocationOptionsOpenRef.current && !showLocationOptions) {
      locationTriggerContainerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    wasLocationOptionsOpenRef.current = showLocationOptions;
  }, [showLocationOptions]);

  const handleUseCurrentLocation = async () => {
    locationPromptAttemptedRef.current = true;
    await requestLocation();
  };

  const startSession = () => {
    if (!sessionToken) setSessionToken(locationService.createPlacesSessionToken());
  };
  const endSession = () => {
    setSessionToken(null);
    setPredictions([]);
    setSearchQuery('');
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const found = await searchLocation(searchQuery.trim());
    if (!found) return;

    setShowLocationOptions(false);
    endSession();
  };

  const toggleLocationOptions = () => {
    const willOpen = !showLocationOptions;
    setShowLocationOptions(willOpen);
    if (!willOpen) return;

    startSession();
    if (!location && !locationPromptAttemptedRef.current) {
      locationPromptAttemptedRef.current = true;
      void requestLocation();
    }
  };

  const handleClearLocation = () => {
    clearLocation();
    setShowLocationOptions(false);
    endSession();
  };

  // Fetch predictions when query changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debouncedQuery || !showLocationOptions) {
        setPredictions([]);
        return;
      }
      try {
        setPredictionsLoading(true);
        const preds = await locationService.getPlacePredictions(debouncedQuery, sessionToken || undefined);
        if (!cancelled) setPredictions(preds);
      } catch (e) {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setPredictionsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, sessionToken, showLocationOptions]);

  const selectPrediction = async (placeId: string) => {
    try {
      const info = await locationService.getPlaceDetails(placeId, sessionToken || undefined);
      setLocationFromInfo(info);
      setShowLocationOptions(false);
    } catch (e) {
      // noop
    } finally {
      endSession();
    }
  };

  return (
    <Popover opened={showLocationOptions} onChange={setShowLocationOptions}>
      <span ref={locationTriggerContainerRef} className="inline-flex min-w-0 max-w-full">
        <Popover.Target>
          <Button
            variant="outline"
            onClick={toggleLocationOptions}
            aria-expanded={showLocationOptions}
            aria-haspopup="dialog"
            leftSection={<MapPin aria-hidden="true" size={16} />}
          >
            {locationInfo?.city ? `${locationInfo.city}${locationInfo.state ? `, ${locationInfo.state}` : ''}` : 'Set Location'}
          </Button>
        </Popover.Target>
      </span>
      <Popover.Dropdown className="location-search-dropdown w-[min(24rem,calc(100vw-2rem))]">
        <Group mb="sm">
          <Button fullWidth onClick={handleUseCurrentLocation} disabled={loading} leftSection={<MapPin aria-hidden="true" size={16} />}>
            {loading ? <><Loader size="sm" aria-hidden="true" />Getting location…</> : 'Use Current Location'}
          </Button>
        </Group>
        <form onSubmit={handleSearchLocation}>
          <Group align="stretch" gap="xs">
            <TextInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Enter city, state, or ZIP"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={loading || !searchQuery.trim()}>Search</Button>
          </Group>
        </form>
        {(predictionsLoading || predictions.length > 0) && (
          <div className="mt-3 max-h-48 overflow-auto">
            {predictionsLoading && <Text size="xs" c="dimmed" className="px-2">Loading suggestions…</Text>}
            {predictions.map((prediction) => (
              <Button key={prediction.placeId} variant="subtle" fullWidth justify="flex-start" onClick={() => selectPrediction(prediction.placeId)}>
                {prediction.description}
              </Button>
            ))}
          </div>
        )}
        {locationInfo && (
          <Group justify="space-between" mt="sm">
            <Text size="sm" c="dimmed">Current: {locationInfo.city}{locationInfo.state ? `, ${locationInfo.state}` : ''}</Text>
            <Button variant="subtle" color="red" size="xs" onClick={handleClearLocation}>Clear</Button>
          </Group>
        )}
        {error && (
          <Text size="xs" c="red" mt="sm">{error}</Text>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
