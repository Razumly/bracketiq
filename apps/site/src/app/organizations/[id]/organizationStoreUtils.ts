import type { Product, ProductType } from '@/types';
import { formatPrice } from '@/types';
import {
  defaultProductTypeForPeriod,
  deriveProductTypeFromTaxCategory,
} from '@/lib/productTypes';

export const PRODUCT_PERIOD_OPTIONS: Array<{
  label: string;
  value: Product['period'];
}> = [
  { label: 'Single purchase', value: 'single' },
  { label: 'Month', value: 'month' },
  { label: 'Week', value: 'week' },
  { label: 'Year', value: 'year' },
];

export const isSinglePurchasePeriod = (
  period: Product['period'] | string | null | undefined,
): boolean => String(period ?? '').trim().toLowerCase() === 'single';

export const resolveProductEditorPeriod = (
  period: Product['period'] | string | null | undefined,
): Product['period'] => {
  const normalized = String(period ?? '').trim().toLowerCase();
  if (
    normalized === 'single'
    || normalized === 'week'
    || normalized === 'month'
    || normalized === 'year'
  ) {
    return normalized as Product['period'];
  }
  return 'month';
};

export const resolveProductEditorType = (
  productType: ProductType | null | undefined,
  taxCategory: Product['taxCategory'] | null | undefined,
  period: Product['period'],
): ProductType => productType ?? deriveProductTypeFromTaxCategory(taxCategory, period);

export const maybeCarryDefaultProductType = (
  currentProductType: ProductType,
  previousPeriod: Product['period'],
  nextPeriod: Product['period'],
): ProductType => (
  currentProductType === defaultProductTypeForPeriod(previousPeriod)
    ? defaultProductTypeForPeriod(nextPeriod)
    : currentProductType
);

export const formatProductPeriodLabel = (
  period: Product['period'] | string | null | undefined,
): string => {
  const normalized = resolveProductEditorPeriod(period);
  if (normalized === 'single') return 'Single purchase';
  if (normalized === 'week') return 'Weekly';
  if (normalized === 'year') return 'Yearly';
  return 'Monthly';
};

export const formatProductRecurringSuffix = (
  period: Product['period'] | string | null | undefined,
): string => {
  const normalized = resolveProductEditorPeriod(period);
  if (normalized === 'week') return 'week';
  if (normalized === 'year') return 'year';
  return 'month';
};

export const formatProductPriceLabel = (product: Product): string => (
  isSinglePurchasePeriod(product.period)
    ? formatPrice(product.priceCents)
    : `${formatPrice(product.priceCents)} / ${formatProductRecurringSuffix(product.period)}`
);

export const resolveProductCheckoutLabel = (
  product: Product,
  isOwner: boolean,
): string => {
  if (isSinglePurchasePeriod(product.period)) {
    return isOwner ? 'Preview purchase' : 'Buy now';
  }
  return isOwner ? 'Preview subscription' : 'Subscribe';
};
