'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@/components/organization/organization-operation-ui';
import { billingAddressService } from '@/lib/billingAddressService';
import {
  isSupportedBillingCountryCode,
  isSupportedUsStateCode,
  normalizeBillingCountryCode,
  normalizeUsStateCode,
} from '@/lib/billingAddressOptions';
import type { BillingAddress } from '@/types';
import BillingAddressFields from './BillingAddressFields';

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

type BillingAddressModalProps = {
  opened: boolean;
  onClose: () => void;
  onSaved: (billingAddress: BillingAddress) => Promise<void> | void;
  title?: string;
  description?: string;
};

export default function BillingAddressModal({
  opened,
  onClose,
  onSaved,
  title = 'Billing Address Required',
  description = 'Enter your billing address so tax and payment totals can be calculated.',
}: BillingAddressModalProps) {
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!opened) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setBillingAddress(EMPTY_BILLING_ADDRESS);
    setError(null);

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

  const validate = (): string | null => {
    if (!billingAddress.line1.trim()) return 'Address line 1 is required.';
    if (!billingAddress.city.trim()) return 'City is required.';
    if (!billingAddress.state.trim()) return 'State is required.';
    if (!isSupportedUsStateCode(billingAddress.state)) return 'Select a supported billing state.';
    if (!billingAddress.postalCode.trim()) return 'ZIP code is required.';
    if (!billingAddress.countryCode.trim()) return 'Country is required.';
    if (!isSupportedBillingCountryCode(billingAddress.countryCode)) {
      return 'Only United States billing addresses are supported right now.';
    }
    return null;
  };

  const handleSave = async () => {
    if (loading || saving || loadFailed) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
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
        <Text size="sm" c="dimmed">{description}</Text>
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        {loadFailed && <Alert color="red">
          <p>We could not load your billing address. Try again.</p>
          <Button variant="default" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>
        </Alert>}
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading billing address...</p>}
        <fieldset disabled={fieldsDisabled} aria-busy={busy} className="m-0 min-w-0 border-0 p-0">
          <Stack gap="md">
            <BillingAddressFields
              value={billingAddress}
              onChange={setBillingAddress}
              onValidationMessage={setError}
              disabled={fieldsDisabled}
            />
          </Stack>
        </fieldset>
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
