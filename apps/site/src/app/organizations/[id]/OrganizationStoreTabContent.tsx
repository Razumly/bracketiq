'use client';

import type { Product, ProductType } from '@/types';
import {
  Button,
  Group,
  Paper,
  SimpleGrid,
  Text,
  TextInput,
  Title,
} from '@/components/organization/organization-operation-ui';
import OrganizationProductFields from './OrganizationProductFields';
import {
  formatProductPeriodLabel,
  formatProductPriceLabel,
  isSinglePurchasePeriod,
  PRODUCT_PERIOD_OPTIONS,
  resolveProductCheckoutLabel,
} from './organizationStoreUtils';

export type OrganizationStoreTabContentProps = {
  organizationHasStripeAccount: boolean;
  canManageProducts: boolean;
  products: Product[];
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
  creatingProduct: boolean;
  canCreateProduct: boolean;
  onCreateProduct: () => void | Promise<void>;
  productDiscountCodes: Record<string, string>;
  onProductDiscountCodeChange: (productId: string, value: string) => void;
  startingProductCheckoutId: string | null;
  onProductPurchase: (product: Product) => void | Promise<void>;
  onProductEdit: (product: Product) => void;
};

export default function OrganizationStoreTabContent({
  organizationHasStripeAccount,
  canManageProducts,
  products,
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
  creatingProduct,
  canCreateProduct,
  onCreateProduct,
  productDiscountCodes,
  onProductDiscountCodeChange,
  startingProductCheckoutId,
  onProductPurchase,
  onProductEdit,
}: OrganizationStoreTabContentProps) {
  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Group justify="space-between" align="center" mb="md">
        <Title order={5}>Store</Title>
        {!organizationHasStripeAccount && (
          <Text size="sm" c="red">
            Connect Stripe to accept payments for products.
          </Text>
        )}
      </Group>

      {canManageProducts && (
        <Paper withBorder radius="md" p="md" mb="lg" className="org-tab-item">
          <Title order={6} mb="xs">Add product</Title>
          <Text size="sm" c="dimmed" mb="md">
            Create a recurring or one-time product that users can purchase.
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <OrganizationProductFields
              productName={productName}
              onProductNameChange={onProductNameChange}
              productDescription={productDescription}
              onProductDescriptionChange={onProductDescriptionChange}
              productPeriod={productPeriod}
              onProductPeriodChange={onProductPeriodChange}
              productType={productType}
              onProductTypeChange={onProductTypeChange}
              productPriceCents={productPriceCents}
              onProductPriceChange={onProductPriceChange}
              organizationHasStripeAccount={organizationHasStripeAccount}
            />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button
              onClick={onCreateProduct}
              loading={creatingProduct}
              disabled={!organizationHasStripeAccount || !canCreateProduct}
            >
              Add Product
            </Button>
          </Group>
        </Paper>
      )}

      <Title order={6} mb="sm">Products</Title>
      {products.length === 0 ? (
        <Text size="sm" c="dimmed">No products yet.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
          {products.map((product) => (
            <Paper
              key={product.$id}
              withBorder
              radius="md"
              p="md"
              className="org-tab-item"
              role={canManageProducts ? 'button' : undefined}
              tabIndex={canManageProducts ? 0 : undefined}
              aria-label={canManageProducts ? `Edit ${product.name}` : undefined}
              onClick={() => {
                if (canManageProducts) onProductEdit(product);
              }}
              onKeyDown={(event) => {
                if (
                  canManageProducts
                  && event.target === event.currentTarget
                  && (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  onProductEdit(product);
                }
              }}
              style={{ cursor: canManageProducts ? 'pointer' : 'default' }}
            >
              <Group justify="space-between" align="flex-start" mb="xs">
                <div>
                  <Text fw={600}>{product.name}</Text>
                  {product.description && <Text size="sm" c="dimmed">{product.description}</Text>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text size="sm" c="dimmed">{formatProductPeriodLabel(product.period)}</Text>
                  {canManageProducts && (
                    <Text size="xs" c="dimmed">Click card to edit</Text>
                  )}
                </div>
              </Group>
              <Text fw={700} mb="xs">{formatProductPriceLabel(product)}</Text>
              {isSinglePurchasePeriod(product.period) ? (
                <TextInput
                  label="Discount code"
                  placeholder="Enter code"
                  size="xs"
                  mb="xs"
                  value={productDiscountCodes[product.$id] ?? ''}
                  onChange={(event) => onProductDiscountCodeChange(product.$id, event.currentTarget.value)}
                  disabled={startingProductCheckoutId === product.$id}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : null}
              {product.isActive === false && (
                <Text size="xs" c="red" mb="xs">Inactive</Text>
              )}
              <Button
                fullWidth
                variant={canManageProducts ? 'outline' : 'filled'}
                loading={startingProductCheckoutId === product.$id}
                disabled={
                  product.isActive === false
                  || (!organizationHasStripeAccount && !canManageProducts)
                  || startingProductCheckoutId !== null
                }
                onClick={(event) => {
                  if (canManageProducts) event.stopPropagation();
                  void onProductPurchase(product);
                }}
              >
                {resolveProductCheckoutLabel(product, canManageProducts)}
              </Button>
            </Paper>
          ))}
        </SimpleGrid>
      )}
    </Paper>
  );
}
