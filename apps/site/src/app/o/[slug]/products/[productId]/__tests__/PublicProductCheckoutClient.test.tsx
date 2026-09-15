import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiRequestError } from '@/lib/apiClient';
import { billingAddressService } from '@/lib/billingAddressService';
import { paymentService } from '@/lib/paymentService';
import { productService } from '@/lib/productService';
import type { PublicOrganizationSummary } from '@/server/publicOrganizationCatalog';
import type { BillingAddress, BillingAddressProfile, PaymentIntent, Product } from '@/types';
import PublicProductCheckoutClient from '../PublicProductCheckoutClient';

const pushMock = jest.fn();
const mockUseApp = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
jest.mock('@/app/providers', () => ({ useApp: () => mockUseApp() }));
jest.mock('@/lib/billingAddressService', () => ({ billingAddressService: { getBillingAddressProfile: jest.fn(), saveBillingAddress: jest.fn() } }));
jest.mock('@/lib/paymentService', () => ({ paymentService: { createProductPaymentIntent: jest.fn() } }));
jest.mock('@/lib/productService', () => ({ productService: { createSubscriptionCheckout: jest.fn() } }));
jest.mock('@/lib/locationService', () => ({ locationService: { createPlacesSessionToken: jest.fn(), getPlacePredictions: jest.fn().mockResolvedValue([]) } }));

const organization: PublicOrganizationSummary = {
  id: 'org_1', slug: 'summit', name: 'Summit Sports Club', description: null,
  location: 'Seattle', website: null, logoUrl: '/logo.png', sports: [],
  brandPrimaryColor: '#0f766e', brandAccentColor: '#f59e0b', publicHeadline: 'Play here',
  publicIntroText: 'Welcome', publicPageEnabled: true, publicWidgetsEnabled: true,
  publicCompletionRedirectUrl: null,
};
const product: Product = { $id: 'shirt', organizationId: 'org_1', name: 'Training shirt', priceCents: 2850, period: 'single' };
const address: BillingAddress = { line1: '120 Park Street', line2: '', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US' };
// This application result has no provider credentials. The real payment seam shows its configuration error without loading Stripe.
const checkout: PaymentIntent = {
  publishableKey: '',
  feeBreakdown: { eventPrice: 2500, processingFee: 125, stripeFee: 103, taxAmount: 206, totalCharge: 2706, hostReceives: 2272, feePercentage: 0.05, purchaseType: 'product' },
};
const renderCheckout = (selectedProduct = product) => render(<PublicProductCheckoutClient slug="summit" organization={organization} product={selectedProduct} />);

const originalStripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

describe('Public product checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    mockUseApp.mockReturnValue({ user: { $id: 'user_1' }, loading: false });
    jest.mocked(billingAddressService.getBillingAddressProfile).mockResolvedValue({ billingAddress: address, email: 'sam@example.com' });
    jest.mocked(billingAddressService.saveBillingAddress).mockResolvedValue({ billingAddress: address, email: 'sam@example.com' });
    jest.mocked(paymentService.createProductPaymentIntent).mockResolvedValue(checkout);
    jest.mocked(productService.createSubscriptionCheckout).mockResolvedValue(checkout);
  });

  afterAll(() => {
    if (originalStripeKey === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = originalStripeKey;
  });

  it('waits for saved billing and an explicit review action before creating checkout', async () => {
    const user = userEvent.setup();
    const { promise, resolve: finishLoad } = Promise.withResolvers<BillingAddressProfile>();
    jest.mocked(billingAddressService.getBillingAddressProfile).mockReturnValue(promise);
    renderCheckout();
    expect(screen.getByRole('button', { name: 'Review total' })).toBeDisabled();
    await act(async () => { finishLoad({ billingAddress: address, email: 'sam@example.com' }); });
    expect(paymentService.createProductPaymentIntent).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Review total' }));
    expect(await screen.findByRole('button', { name: 'Continue to Stripe' })).toBeEnabled();
    expect(paymentService.createProductPaymentIntent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the discount and address after a failure, then retains exact fees through payment setup recovery', async () => {
    const user = userEvent.setup();
    jest.mocked(paymentService.createProductPaymentIntent).mockRejectedValueOnce(new Error('Checkout is temporarily unavailable.'));
    renderCheckout();
    await waitFor(() => expect(screen.getByLabelText('Discount code')).toBeEnabled());
    await user.type(screen.getByLabelText('Discount code'), ' SAVE ');
    await user.click(screen.getByRole('button', { name: 'Review total' }));
    await screen.findByText('Checkout is temporarily unavailable.');
    expect(screen.getByLabelText('Discount code')).toHaveValue(' SAVE ');
    expect(screen.getByText('120 Park Street')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Continue to Stripe' });
    const summary = screen.getByRole('region', { name: 'Order summary' });
    expect(within(summary).getByText('$28.50')).toBeInTheDocument();
    expect(within(summary).getByText('−$3.50')).toBeInTheDocument();
    expect(within(summary).getByText('$2.06')).toBeInTheDocument();
    expect(within(summary).getByText('$27.06')).toBeInTheDocument();
    expect(paymentService.createProductPaymentIntent).toHaveBeenLastCalledWith({ $id: 'user_1' }, product, { $id: 'org_1', name: 'Summit Sports Club' }, address, 'SAVE');
    await user.click(screen.getByRole('button', { name: 'Continue to Stripe' }));
    const payment = await screen.findByRole('dialog');
    expect(within(payment).getByText('$27.06')).toBeInTheDocument();
    expect(within(payment).getByRole('alert')).toBeInTheDocument();
    await user.click(within(payment).getByRole('button', { name: 'Back to checkout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Continue to Stripe' }));
    expect(paymentService.createProductPaymentIntent).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Purchase complete' })).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('saves corrected billing values before retrying the subscription with the same product and discount', async () => {
    const user = userEvent.setup();
    const membership: Product = { ...product, $id: 'membership', name: 'Monthly membership', period: 'month' };
    jest.mocked(productService.createSubscriptionCheckout).mockRejectedValueOnce(new ApiRequestError('Billing address required', 400, { billingAddressRequired: true }));
    renderCheckout(membership);
    await waitFor(() => expect(screen.getByLabelText('Discount code')).toBeEnabled());
    await user.type(screen.getByLabelText('Discount code'), 'MEMBER');
    await user.click(screen.getByRole('button', { name: 'Review total' }));
    const billing = await screen.findByRole('dialog');
    const line1 = await within(billing).findByDisplayValue('120 Park Street');
    await user.clear(line1);
    await user.type(line1, '220 Park Street');
    await user.click(within(billing).getByRole('button', { name: 'Save billing address' }));
    await screen.findByRole('button', { name: 'Continue to Stripe' });
    expect(billingAddressService.saveBillingAddress).toHaveBeenCalledWith({ ...address, line1: '220 Park Street' });
    expect(productService.createSubscriptionCheckout).toHaveBeenLastCalledWith({ productId: 'membership', billingAddress: { ...address, line1: '220 Park Street' }, discountCode: 'MEMBER' });
    expect(screen.getByText('220 Park Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Discount code')).toHaveValue('MEMBER');
    expect(paymentService.createProductPaymentIntent).not.toHaveBeenCalled();
  });

  it('removes a stale total when a discount changes and recalculates before payment can reopen', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review total' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Review total' }));
    await screen.findByRole('button', { name: 'Continue to Stripe' });
    await user.type(screen.getByLabelText('Discount code'), 'NEW');
    expect(screen.queryByRole('button', { name: 'Continue to Stripe' })).not.toBeInTheDocument();
    expect(screen.queryByText('$27.06')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review total' }));
    await screen.findByRole('button', { name: 'Continue to Stripe' });
    expect(paymentService.createProductPaymentIntent).toHaveBeenCalledTimes(2);
  });
});
