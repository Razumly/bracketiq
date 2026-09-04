'use client';

import type { Product, ProductType } from '@/types';
import {
  Button,
  Group,
  Modal,
  Stack,
} from '@/components/organization/organization-operation-ui';
import OrganizationProductFields from './OrganizationProductFields';

export type OrganizationProductEditorModalProps = {
  opened: boolean;
  selectedProduct: Product | null;
  organizationHasStripeAccount: boolean;
  editProductName: string;
  onEditProductNameChange: (value: string) => void;
  editProductDescription: string;
  onEditProductDescriptionChange: (value: string) => void;
  editProductPeriod: Product['period'];
  onEditProductPeriodChange: (value: string | null) => void;
  editProductType: ProductType;
  onEditProductTypeChange: (value: string | null) => void;
  editProductPriceCents: number;
  onEditProductPriceChange: (value: number) => void;
  canUpdateProduct: boolean;
  updatingProduct: boolean;
  deletingProduct: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export default function OrganizationProductEditorModal({
  opened,
  selectedProduct,
  organizationHasStripeAccount,
  editProductName,
  onEditProductNameChange,
  editProductDescription,
  onEditProductDescriptionChange,
  editProductPeriod,
  onEditProductPeriodChange,
  editProductType,
  onEditProductTypeChange,
  editProductPriceCents,
  onEditProductPriceChange,
  canUpdateProduct,
  updatingProduct,
  deletingProduct,
  onClose,
  onSave,
  onDelete,
}: OrganizationProductEditorModalProps) {
  return (
    <Modal opened={opened && Boolean(selectedProduct)} onClose={onClose} title="Edit product" centered>
      {selectedProduct && (
        <Stack gap="sm">
          <OrganizationProductFields
            productName={editProductName}
            onProductNameChange={onEditProductNameChange}
            productDescription={editProductDescription}
            onProductDescriptionChange={onEditProductDescriptionChange}
            productPeriod={editProductPeriod}
            onProductPeriodChange={onEditProductPeriodChange}
            productType={editProductType}
            onProductTypeChange={onEditProductTypeChange}
            productPriceCents={editProductPriceCents}
            onProductPriceChange={onEditProductPriceChange}
            organizationHasStripeAccount={organizationHasStripeAccount}
            descriptionMultiline
          />
          <Group justify="space-between" mt="md">
            <Button variant="light" color="red" onClick={onDelete} loading={deletingProduct}>
              Delete product
            </Button>
            <Group gap="xs">
              <Button variant="default" onClick={onClose}>Cancel</Button>
              <Button onClick={onSave} loading={updatingProduct} disabled={!canUpdateProduct}>
                Save changes
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
