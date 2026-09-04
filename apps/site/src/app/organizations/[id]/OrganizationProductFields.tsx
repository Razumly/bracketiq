'use client';

import type { Product, ProductType } from '@/types';
import HostPriceInput from '@/components/ui/HostPriceInput';
import {
  Select,
  TextInput,
  Textarea,
} from '@/components/organization/organization-operation-ui';
import { defaultProductTypeForPeriod, getProductTypeOptionsForPeriod } from '@/lib/productTypes';
import { PRODUCT_PERIOD_OPTIONS } from './organizationStoreUtils';

export type OrganizationProductFieldsProps = {
  productName: string;
  onProductNameChange: (value: string) => void;
  productDescription: string;
  onProductDescriptionChange: (value: string) => void;
  productPeriod: Product['period'];
  onProductPeriodChange: (value: string | null) => void;
  productType: ProductType;
  onProductTypeChange: (value: string | null) => void;
  productPriceCents: number;
  onProductPriceChange: (value: number) => void;
  organizationHasStripeAccount: boolean;
  descriptionMultiline?: boolean;
};

export default function OrganizationProductFields({
  productName,
  onProductNameChange,
  productDescription,
  onProductDescriptionChange,
  productPeriod,
  onProductPeriodChange,
  productType,
  onProductTypeChange,
  productPriceCents,
  onProductPriceChange,
  organizationHasStripeAccount,
  descriptionMultiline = false,
}: OrganizationProductFieldsProps) {
  return (
    <>
      <TextInput
        label="Name"
        placeholder="Product"
        value={productName}
        onChange={(event) => onProductNameChange(event.currentTarget.value)}
        required
      />
      <HostPriceInput
        hostLabel="Host take-home"
        totalLabel="Product price"
        value={organizationHasStripeAccount ? productPriceCents : 0}
        onChange={onProductPriceChange}
        disabled={!organizationHasStripeAccount}
        required
      />
      <Select
        label="Billing period"
        data={PRODUCT_PERIOD_OPTIONS}
        value={productPeriod}
        onChange={onProductPeriodChange}
      />
      <Select
        label="Product type"
        data={getProductTypeOptionsForPeriod(productPeriod)}
        value={productType}
        onChange={(value) => onProductTypeChange(value ?? defaultProductTypeForPeriod(productPeriod))}
      />
      {descriptionMultiline ? (
        <Textarea
          label="Description"
          placeholder="Optional description"
          value={productDescription}
          onChange={(event) => onProductDescriptionChange(event.currentTarget.value)}
          minRows={2}
        />
      ) : (
        <TextInput
          label="Description"
          placeholder="Optional description"
          value={productDescription}
          onChange={(event) => onProductDescriptionChange(event.currentTarget.value)}
        />
      )}
    </>
  );
}
