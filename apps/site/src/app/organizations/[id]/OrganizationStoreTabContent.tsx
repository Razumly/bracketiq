'use client';

import { useState, type HTMLAttributes } from 'react';
import { Package, ShoppingBag, RefreshCw, Plus } from 'lucide-react';
import { OrganizationStatStrip, OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import { OrganizationDataRegion } from '@/components/organization/OrganizationDataLoading';
import type { Product, ProductType } from '@/types';
import {
  Button,
  Modal,
  Select,
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

function productCardInteractions(
  product: Product,
  canManage: boolean,
  onEdit: (product: Product) => void,
): HTMLAttributes<HTMLDivElement> {
  if (!canManage) return { style: { cursor: 'default' } };
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': `Edit ${product.name}`,
    style: { cursor: 'pointer' },
    onClick: () => onEdit(product),
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onEdit(product);
    },
  };
}

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
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const visibleProducts = products.filter((product) => (
    `${product.name} ${product.description || ''}`.toLowerCase().includes(query.trim().toLowerCase())
    && (!status || (status === 'active') === (product.isActive !== false))
  ));
  return (
    <section className="org-section org-store">
      <OrganizationTabHeading title="Store" description="Manage products, memberships, and one-time purchases.">
        {canManageProducts && <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>Add product</Button>}
      </OrganizationTabHeading>
        {!organizationHasStripeAccount && (
          <Text size="sm" c="red">
            Connect Stripe to accept payments for products.
          </Text>
        )}
      <OrganizationStatStrip items={[
        { label: 'products', value: products.length, icon: <Package /> },
        { label: 'active products', value: products.filter((product) => product.isActive !== false).length, icon: <ShoppingBag /> },
        { label: 'recurring products', value: products.filter((product) => !isSinglePurchasePeriod(product.period)).length, icon: <RefreshCw /> },
      ]} />

      {canManageProducts && (
        <Modal opened={creating} onClose={() => setCreating(false)} title="Add product" size="lg">
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
        </Modal>
      )}

      <div className="org-filter-toolbar">
        <TextInput aria-label="Search products" placeholder="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <Select aria-label="Filter product status" placeholder="Status" value={status} onChange={setStatus} clearable data={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        <Button variant="subtle" onClick={() => { setQuery(''); setStatus(null); }}>Clear all</Button>
      </div>
      <OrganizationDataRegion label="products" layout="cards">
      {products.length === 0 ? (
        <Text size="sm" c="dimmed">No products yet.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
          {visibleProducts.map((product) => (
            <Paper
              key={product.$id}
              withBorder
              radius="md"
              p="md"
              className="org-store-product"
              {...productCardInteractions(product, canManageProducts, onProductEdit)}
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
      {products.length > 0 && visibleProducts.length === 0 && <p className="org-empty-copy">No products match these filters.</p>}
      </OrganizationDataRegion>
    </section>
  );
}
