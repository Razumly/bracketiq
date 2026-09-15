'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@/components/organization/organization-operation-ui';
import { billingAddressService } from '@/lib/billingAddressService';
import {
  isSupportedBillingCountryCode,
  isSupportedUsStateCode,
  normalizeBillingCountryCode,
  normalizeUsStateCode,
} from '@/lib/billingAddressOptions';
import type { BillingAddress } from '@/types';
import BillingAddressFields, { type BillingAddressFieldErrors } from './BillingAddressFields';

const EMPTY_BILLING_ADDRESS: BillingAddress = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  countryCode: 'US',
};

const normalizeBillingAddress = (value: BillingAddress = EMPTY_BILLING_ADDRESS): BillingAddress => ({
  line1: value.line1 ?? '',
  line2: value.line2 ?? '',
  city: value.city ?? '',
  state: normalizeUsStateCode(value.state),
  postalCode: value.postalCode ?? '',
  countryCode: normalizeBillingCountryCode(value.countryCode),
});

const getBillingAddressErrors = (address: BillingAddress): BillingAddressFieldErrors => {
  const errors: BillingAddressFieldErrors = {};
  if (!address.line1.trim()) errors.line1 = 'Address line 1 is required.';
  if (!address.city.trim()) errors.city = 'City is required.';
  if (!address.state.trim()) errors.state = 'State is required.';
  else if (!isSupportedUsStateCode(address.state)) errors.state = 'Select a supported billing state.';
  if (!address.postalCode.trim()) errors.postalCode = 'ZIP code is required.';
  if (!address.countryCode.trim()) errors.countryCode = 'Country is required.';
  else if (!isSupportedBillingCountryCode(address.countryCode)) errors.countryCode = 'Only United States billing addresses are supported right now.';
  return errors;
};

type BillingAddressModalProps = {
  opened: boolean;
  onClose: () => void;
  onSaved: (billingAddress: BillingAddress) => Promise<void> | void;
  title?: string;
  description?: string;
  summary?: ReactNode;
};

export default function BillingAddressModal({
  opened,
  onClose,
  onSaved,
  title = 'Billing Address Required',
  description = 'Enter your billing address so tax and payment totals can be calculated.',
  summary,
}: BillingAddressModalProps) {
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<BillingAddressFieldErrors>({});
  const fieldsRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setBillingAddress(EMPTY_BILLING_ADDRESS);
    setError(null);
    setFieldErrors({});

    billingAddressService.getBillingAddressProfile()
      .then((profile) => {
        if (!cancelled) {
          setBillingAddress(normalizeBillingAddress(profile.billingAddress ?? undefined));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          console.error('Failed to load billing address profile', loadError);
          setBillingAddress(EMPTY_BILLING_ADDRESS);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opened, loadAttempt]);

  const handleSave = async () => {
    if (loading || saving || loadFailed) return;
    const validationErrors = getBillingAddressErrors(billingAddress);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError('Check the billing address fields below.');
      window.requestAnimationFrame(() => {
        fieldsRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setSaving(true);
    setError(null);
    const normalized = {
      ...billingAddress,
      line1: billingAddress.line1.trim(),
      line2: billingAddress.line2?.trim() || '',
      city: billingAddress.city.trim(),
      state: normalizeUsStateCode(billingAddress.state),
      postalCode: billingAddress.postalCode.trim(),
      countryCode: normalizeBillingCountryCode(billingAddress.countryCode),
    };

    try {
      await billingAddressService.saveBillingAddress(normalized);
      await onSaved(normalized);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save billing address.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;
  const fieldsDisabled = busy || loadFailed;
  return (
    <Modal opened={opened} onClose={() => { if (!saving) onClose(); }} title={title} centered>
      <Stack gap="md">
        {summary}
        <Text size="sm" c="dimmed">{description}</Text>
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        {loadFailed && <Alert color="red">
          <p>We could not load your billing address. Try again.</p>
          <Button variant="default" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>
        </Alert>}
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading billing address...</p>}
        <fieldset ref={fieldsRef} disabled={fieldsDisabled} aria-busy={busy} className="m-0 min-w-0 border-0 p-0">
          <Stack gap="md">
            <BillingAddressFields
              value={billingAddress}
              onChange={(nextAddress) => {
                setBillingAddress(nextAddress);
                if (Object.keys(fieldErrors).length > 0) setFieldErrors(getBillingAddressErrors(nextAddress));
              }}
              onValidationMessage={setError}
              disabled={fieldsDisabled}
              errors={fieldErrors}
            />
          </Stack>
        </fieldset>
        {loadFailed && <p className="text-sm text-muted-foreground">Reload your billing address before saving changes.</p>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={fieldsDisabled}>
            Save billing address
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
