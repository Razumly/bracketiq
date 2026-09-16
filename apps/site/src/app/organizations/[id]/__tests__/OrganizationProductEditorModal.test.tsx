import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationProductEditorModal from '../OrganizationProductEditorModal';
import type { Product } from '@/types';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';

const product: Product = {
  $id: 'product-1',
  organizationId: 'org-1',
  name: 'Summer membership',
  priceCents: 2500,
  period: 'month',
  productType: 'MEMBERSHIP',
  isActive: true,
};

describe('OrganizationProductEditorModal', () => {
  it('saves the current product edits through the modal boundary', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();

    renderWithMantine(
      <OrganizationProductEditorModal
        opened
        selectedProduct={product}
        organizationHasStripeAccount
        editProductName="Summer membership"
        onEditProductNameChange={jest.fn()}
        editProductDescription=""
        onEditProductDescriptionChange={jest.fn()}
        editProductPeriod="month"
        onEditProductPeriodChange={jest.fn()}
        editProductType="MEMBERSHIP"
        onEditProductTypeChange={jest.fn()}
        editProductPriceCents={2500}
        onEditProductPriceChange={jest.fn()}
        canUpdateProduct
        updatingProduct={false}
        deletingProduct={false}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
