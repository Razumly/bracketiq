import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationStoreTabContent from '../OrganizationStoreTabContent';
import type { Product } from '@/types';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';

const product: Product = {
  $id: 'product-1',
  organizationId: 'org-1',
  name: 'Summer membership',
  description: 'Access to weekly training.',
  priceCents: 2500,
  period: 'single',
  productType: 'MEMBERSHIP',
  isActive: true,
};

const baseProps = {
  organizationHasStripeAccount: true,
  canManageProducts: false,
  products: [product],
  productName: '',
  onProductNameChange: jest.fn(),
  productDescription: '',
  onProductDescriptionChange: jest.fn(),
  productPeriod: 'month' as const,
  onProductPeriodChange: jest.fn(),
  productType: 'MEMBERSHIP' as const,
  onProductTypeChange: jest.fn(),
  productPriceCents: 0,
  onProductPriceChange: jest.fn(),
  creatingProduct: false,
  canCreateProduct: false,
  onCreateProduct: jest.fn(),
  productDiscountCodes: {},
  onProductDiscountCodeChange: jest.fn(),
  startingProductCheckoutId: null,
  onProductPurchase: jest.fn(),
  onProductEdit: jest.fn(),
};

describe('OrganizationStoreTabContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts checkout for a product when a member selects Buy now', async () => {
    const user = userEvent.setup();

    render(<OrganizationStoreTabContent {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Buy now' }));

    expect(baseProps.onProductPurchase).toHaveBeenCalledWith(product);
  });

  it('opens the editor when an organization manager selects a product card', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <OrganizationStoreTabContent
        {...baseProps}
        canManageProducts
        onProductEdit={baseProps.onProductEdit}
      />,
    );

    const productCard = screen.getByRole('button', { name: 'Edit Summer membership' });
    await user.click(screen.getByText('Summer membership'));

    expect(baseProps.onProductEdit).toHaveBeenCalledWith(product);

    baseProps.onProductEdit.mockClear();
    productCard.focus();
    await user.keyboard('{Enter}');

    expect(baseProps.onProductEdit).toHaveBeenCalledWith(product);
  });
});
