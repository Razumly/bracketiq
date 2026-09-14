"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useLocation } from "@/app/hooks/useLocation";
import { locationService } from "@/lib/locationService";
import { useDebounce } from "@/app/hooks/useDebounce";
import {
  Button,
  Group,
  Loader,
  Popover,
  Text,
  TextInput,
} from "@/components/organization/organization-operation-ui";

export type LocationSearchProps = {
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  displayLabel?: string;
};

export default function LocationSearch({
  inline = false,
  open: openProp,
  onOpenChange,
  displayLabel,
}: LocationSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const locationTriggerContainerRef = useRef<HTMLSpanElement>(null);
  const wasLocationOptionsOpenRef = useRef(false);
  const [predictions, setPredictions] = useState<
    Array<{ description: string; placeId: string }>
  >([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<any | null>(null);
  const mountedRef = useRef(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);
  const isControlled = openProp !== undefined;
  const isOpen = openProp ?? uncontrolledOpen;

  const {
    locationInfo,
    loading,
    error,
    requestLocation,
    searchLocation,
    clearLocation,
    setLocationFromInfo,
  } = useLocation();
  const isApproximate = locationInfo?.source === "approximate";
  const locationLabel = locationInfo?.city
    ? `${locationInfo.city}${locationInfo.state ? `, ${locationInfo.state}` : ""}`
    : locationInfo?.formattedAddress ||
      (locationInfo ? "Current Location" : "Set Location");

  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!inline && wasLocationOptionsOpenRef.current && !isOpen) {
      locationTriggerContainerRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
    }
    wasLocationOptionsOpenRef.current = isOpen;
  }, [inline, isOpen]);

  useEffect(() => {
    if (!inline || !isOpen || searchQuery) return;
    const input = inlineInputRef.current;
    input?.focus({ preventScroll: true });
    if (displayLabel?.trim()) input?.select();
  }, [displayLabel, inline, isOpen, searchQuery]);
  const startSession = () => {
    if (!sessionToken)
      setSessionToken(locationService.createPlacesSessionToken());
  };
  const endSession = () => {
    setSessionToken(null);
    setPredictions([]);
    setSearchQuery("");
  };

  const openLocationOptions = () => {
    if (isOpen) return;
    setSelectionError(null);
    startSession();
    setOpen(true);
  };

  const handleUseCurrentLocation = async () => {
    setSelectionError(null);
    await requestLocation();
  };

  const handleSearchLocation = async (
    event: React.FormEvent | React.KeyboardEvent,
  ) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setSelectionError(null);
    const found = await searchLocation(searchQuery.trim());
    if (!found || !mountedRef.current) return;

    setOpen(false);
    endSession();
  };

  const toggleLocationOptions = () => {
    if (isOpen) {
      setOpen(false);
      return;
    }
    openLocationOptions();
  };

  const handleClearLocation = () => {
    setSelectionError(null);
    clearLocation();
    setOpen(false);
    endSession();
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debouncedQuery || !isOpen) {
        setPredictions([]);
        return;
      }
      try {
        setPredictionsLoading(true);
        const preds = await locationService.getPlacePredictions(
          debouncedQuery,
          sessionToken || undefined,
        );
        if (!cancelled) setPredictions(preds);
      } catch (e) {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setPredictionsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, sessionToken, isOpen]);

  const selectPrediction = async (placeId: string) => {
    setSelectionError(null);
    try {
      const info = await locationService.getPlaceDetails(
        placeId,
        sessionToken || undefined,
      );
      if (!mountedRef.current) return;
      setLocationFromInfo(info);
      setOpen(false);
    } catch (err) {
      if (mountedRef.current) {
        setSelectionError(
          err instanceof Error ? err.message : "Failed to find location",
        );
      }
    } finally {
      if (mountedRef.current) endSession();
    }
  };

  const inlineDisplayValue = searchQuery || displayLabel?.trim() || "";

  return (
    <Popover opened={isOpen} onChange={setOpen}>
      <span
        ref={locationTriggerContainerRef}
        className={inline ? "block w-full" : "inline-flex max-w-full min-w-0"}
      >
        <Popover.Target>
          {inline ? (
            <TextInput
              ref={inlineInputRef}
              value={inlineDisplayValue}
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                if (!isOpen) openLocationOptions();
              }}
              onFocus={(event) => {
                openLocationOptions();
                if (!searchQuery && displayLabel?.trim())
                  event.currentTarget.select();
              }}
              onClick={openLocationOptions}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  return;
                }
                if (event.key === "Enter") void handleSearchLocation(event);
              }}
              autoFocus={isOpen}
              placeholder="Search destinations"
              aria-label="Where"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              leftSection={<MapPin aria-hidden="true" size={16} />}
              radius="none"
              className="location-search-inline-input"
            />
          ) : (
            <Button
              variant="outline"
              onClick={toggleLocationOptions}
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              leftSection={<MapPin aria-hidden="true" size={16} />}
            >
              {locationLabel}
              {isApproximate ? " (approximate)" : ""}
            </Button>
          )}
        </Popover.Target>
      </span>
      <Popover.Dropdown
        className={`location-search-dropdown w-[min(24rem,calc(100vw-4rem))]${inline ? "location-search-dropdown--inline" : ""}`}
      >
        {inline ? (
          <>
            <Group mb="sm">
              <Button
                fullWidth
                onClick={handleUseCurrentLocation}
                disabled={loading}
                leftSection={<MapPin aria-hidden="true" size={16} />}
                className="discover-location-nearby-button"
              >
                {loading ? (
                  <>
                    <Loader size="sm" aria-hidden="true" />
                    Getting location…
                  </>
                ) : (
                  "Nearby"
                )}
              </Button>
            </Group>
            {(predictionsLoading || predictions.length > 0) && (
              <div className="max-h-48 overflow-auto">
                {predictionsLoading && (
                  <Text size="xs" c="dimmed" className="px-2">
                    Loading suggestions…
                  </Text>
                )}
                {predictions.map((prediction) => (
                  <Button
                    key={prediction.placeId}
                    variant="subtle"
                    fullWidth
                    justify="flex-start"
                    onClick={() => selectPrediction(prediction.placeId)}
                  >
                    {prediction.description}
                  </Button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {isApproximate && (
              <Text size="sm" c="dimmed" mb="sm">
                This location is an estimate from your network. Use exact
                location for nearby results.
              </Text>
            )}
            <Group mb="sm">
              <Button
                fullWidth
                onClick={handleUseCurrentLocation}
                disabled={loading}
                leftSection={<MapPin aria-hidden="true" size={16} />}
              >
                {loading ? (
                  <>
                    <Loader size="sm" aria-hidden="true" />
                    Getting location…
                  </>
                ) : isApproximate ? (
                  "Use Exact Location"
                ) : (
                  "Use Current Location"
                )}
              </Button>
            </Group>
            <form onSubmit={handleSearchLocation}>
              <Group align="stretch" gap="xs">
                <TextInput
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.currentTarget.value)
                  }
                  placeholder="Enter city, state, or ZIP"
                  aria-label="City, state, or ZIP"
                  className="min-w-0 flex-1"
                />
                <Button type="submit" disabled={loading || !searchQuery.trim()}>
                  Search
                </Button>
              </Group>
            </form>
            {(predictionsLoading || predictions.length > 0) && (
              <div className="mt-3 max-h-48 overflow-auto">
                {predictionsLoading && (
                  <Text size="xs" c="dimmed" className="px-2">
                    Loading suggestions…
                  </Text>
                )}
                {predictions.map((prediction) => (
                  <Button
                    key={prediction.placeId}
                    variant="subtle"
                    fullWidth
                    justify="flex-start"
                    onClick={() => selectPrediction(prediction.placeId)}
                  >
                    {prediction.description}
                  </Button>
                ))}
              </div>
            )}
            {locationInfo && (
              <Group justify="space-between" mt="sm">
                <Text size="sm" c="dimmed">
                  {isApproximate ? "Approximate" : "Current"}: {locationLabel}
                </Text>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  onClick={handleClearLocation}
                >
                  Clear
                </Button>
              </Group>
            )}
          </>
        )}
        {(selectionError || error) && (
          <Text size="xs" c="red" mt="sm" role="alert">
            {selectionError || error}
          </Text>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
