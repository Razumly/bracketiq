'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, ScrollArea, Select, SimpleGrid, Stack, Text, TextInput } from '@/components/organization/organization-operation-ui';
import { useDebounce } from '@/app/hooks/useDebounce';
import {
  BILLING_COUNTRY_OPTIONS,
  isSupportedBillingCountryCode,
  isSupportedUsStateCode,
  normalizeBillingCountryCode,
  normalizeUsStateCode,
  US_STATE_OPTIONS,
} from '@/lib/billingAddressOptions';
import { locationService, type PlacePrediction, type PlacePredictionOptions } from '@/lib/locationService';
import type { BillingAddress } from '@/types';

const BILLING_ADDRESS_PREDICTION_OPTIONS: PlacePredictionOptions = {
  types: ['address'],
  componentRestrictions: { country: 'us' },
};

type BillingAddressFieldsProps = {
  value: BillingAddress;
  onChange: (value: BillingAddress) => void;
  onValidationMessage?: (message: string | null) => void;
  disabled?: boolean;
};

function addressFromPlace(
  details: Awaited<ReturnType<typeof locationService.getPlaceDetails>>,
  prediction: PlacePrediction,
  current: BillingAddress,
): BillingAddress {
  return {
    ...current,
    line1: details.line1 ?? prediction.description.split(',')[0]?.trim() ?? current.line1,
    line2: details.line2 ?? '',
    city: details.city ?? current.city,
    state: normalizeUsStateCode(details.state),
    postalCode: details.zipCode ?? current.postalCode,
    countryCode: normalizeBillingCountryCode(details.country ?? 'US'),
  };
}

function addressRegionError(address: BillingAddress): string | null {
  if (!isSupportedBillingCountryCode(address.countryCode)) {
    return 'Only United States billing addresses are supported right now.';
  }
  if (address.state && !isSupportedUsStateCode(address.state)) {
    return 'Select a supported billing state.';
  }
  return null;
}

export default function BillingAddressFields({
  value,
  onChange,
  onValidationMessage,
  disabled = false,
}: BillingAddressFieldsProps) {
  const [addressSearchFocused, setAddressSearchFocused] = useState(false);
  const [addressPredictions, setAddressPredictions] = useState<PlacePrediction[]>([]);
  const [addressPredictionsLoading, setAddressPredictionsLoading] = useState(false);
  const [addressSessionToken, setAddressSessionToken] = useState<any | null>(null);
  const debouncedAddressSearch = useDebounce(value.line1, 250);

  const endAddressSession = useCallback(() => {
    setAddressSessionToken(null);
    setAddressSearchFocused(false);
    setAddressPredictions([]);
    setAddressPredictionsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchPredictions = async () => {
      if (disabled || !addressSearchFocused || debouncedAddressSearch.trim().length < 3) {
        setAddressPredictions([]);
        setAddressPredictionsLoading(false);
        return;
      }

      try {
        setAddressPredictionsLoading(true);
        const predictions = await locationService.getPlacePredictions(
          debouncedAddressSearch,
          addressSessionToken ?? undefined,
          BILLING_ADDRESS_PREDICTION_OPTIONS,
        );
        if (!cancelled) {
          setAddressPredictions(predictions);
        }
      } catch (predictionError) {
        if (!cancelled) {
          console.error('Failed to load billing address suggestions', predictionError);
          setAddressPredictions([]);
        }
      } finally {
        if (!cancelled) {
          setAddressPredictionsLoading(false);
        }
      }
    };

    void fetchPredictions();

    return () => {
      cancelled = true;
    };
  }, [addressSearchFocused, addressSessionToken, debouncedAddressSearch, disabled]);

  const updateField = (field: keyof BillingAddress, nextValue: string) => {
    onValidationMessage?.(null);
    onChange({
      ...value,
      [field]: nextValue,
    });
  };

  const startAddressSession = () => {
    if (disabled) return;
    setAddressSearchFocused(true);
    if (!addressSessionToken) {
      setAddressSessionToken(locationService.createPlacesSessionToken());
    }
  };

  const selectAddressPrediction = async (prediction: PlacePrediction) => {
    if (disabled) return;
    onValidationMessage?.(null);
    try {
      const details = await locationService.getPlaceDetails(prediction.placeId, addressSessionToken ?? undefined);
      const nextAddress = addressFromPlace(details, prediction, value);
      onChange(nextAddress);
      onValidationMessage?.(addressRegionError(nextAddress));
    } catch (selectionError) {
      console.error('Failed to select billing address suggestion', selectionError);
      onValidationMessage?.('We could not fill that address. You can still enter it manually.');
    } finally {
      endAddressSession();
    }
  };

  return (
    <>
      <TextInput
        label="Address line 1"
        value={value.line1}
        onFocus={startAddressSession}
        onBlur={() => {
          window.setTimeout(() => {
            setAddressSearchFocused(false);
          }, 150);
        }}
        onChange={(event) => {
          updateField('line1', event.currentTarget.value);
          setAddressSearchFocused(true);
        }}
        autoComplete="off"
        disabled={disabled}
        required
      />
      {(addressPredictionsLoading || addressPredictions.length > 0) && addressSearchFocused ? (
        <ScrollArea.Autosize mah={180} className="-mt-2">
          <Stack gap={0} className="overflow-hidden border border-border org-radius-control">
            {addressPredictionsLoading ? (
              <Text size="xs" c="dimmed" className="px-3 py-2">
                Loading suggestions...
              </Text>
            ) : null}
            {addressPredictions.map((prediction) => (
              <Button
                key={prediction.placeId}
                type="button"
                variant="subtle"
                color="gray"
                justify="flex-start"
                radius={0}
                disabled={disabled}
                className="h-auto whitespace-normal text-left"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { void selectAddressPrediction(prediction); }}
              >
                {prediction.description}
              </Button>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      ) : null}
      <TextInput
        label="Address line 2"
        value={value.line2 ?? ''}
        onChange={(event) => updateField('line2', event.currentTarget.value)}
        disabled={disabled}
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="City"
          value={value.city}
          onChange={(event) => updateField('city', event.currentTarget.value)}
          disabled={disabled}
          required
        />
        <Select
          label="State"
          data={US_STATE_OPTIONS}
          value={normalizeUsStateCode(value.state) || null}
          onChange={(nextValue) => updateField('state', nextValue ?? '')}
          searchable
          disabled={disabled}
          required
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="ZIP code"
          value={value.postalCode}
          onChange={(event) => updateField('postalCode', event.currentTarget.value)}
          disabled={disabled}
          required
        />
        <Select
          label="Country"
          data={BILLING_COUNTRY_OPTIONS}
          value={normalizeBillingCountryCode(value.countryCode) || 'US'}
          onChange={(nextValue) => updateField('countryCode', nextValue ?? 'US')}
          allowDeselect={false}
          disabled={disabled}
          required
        />
      </SimpleGrid>
    </>
  );
}
