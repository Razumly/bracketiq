'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Paper,
  TextInput,
} from '@/components/organization/organization-operation-ui';
import { useApp } from '@/app/providers';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import { PaymentOrderSummary, PaymentResultView } from '@/components/ui/PaymentResultView';
import { getPaymentModalCopy } from '@/components/ui/paymentModalCopy';
import { isApiRequestError } from '@/lib/apiClient';
import { billingAddressService } from '@/lib/billingAddressService';
import { paymentService } from '@/lib/paymentService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { productService } from '@/lib/productService';
import type { PublicOrganizationSummary } from '@/server/publicOrganizationCatalog';
import type { BillingAddress, PaymentIntent, Product } from '@/types';
import { formatPrice } from '@/types';

const isSinglePurchasePeriod = (period: Product['period'] | string | null | undefined): boolean =>
  String(period ?? '').trim().toLowerCase() === 'single';

const formatProductPriceLabel = (product: Product): string => (
  isSinglePurchasePeriod(product.period)
    ? formatPrice(product.priceCents)
    : `${formatPrice(product.priceCents)} / ${product.period}`
);

type PublicProductCheckoutClientProps = {
  slug: string;
  organization: PublicOrganizationSummary;
  product: Product;
};

export default function PublicProductCheckoutClient({
  slug,
  organization,
  product,
}: PublicProductCheckoutClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const checkoutStarting = useRef(false);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [billingAddress, setBillingAddress] = useState<BillingAddress | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingLoadAttempt, setBillingLoadAttempt] = useState(0);
  const [checkoutOutcome, setCheckoutOutcome] = useState<'success' | 'pending' | null>(null);
  const [paymentInterrupted, setPaymentInterrupted] = useState(false);
  const payerId = user?.$id;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setBillingLoading(Boolean(payerId));
    setBillingError(null);
    setBillingAddress(null);
    setPaymentData(null);
    setCheckoutOutcome(null);
    setShowPaymentModal(false);
    setShowBillingAddressModal(false);
    if (!payerId) return;
    billingAddressService.getBillingAddressProfile()
      .then((profile) => {
        if (!cancelled) setBillingAddress(profile.billingAddress);
      })
      .catch(() => {
        if (!cancelled) setBillingError('Your saved billing address could not be loaded. Try again before continuing.');
      })
      .finally(() => {
        if (!cancelled) setBillingLoading(false);
      });
    return () => { cancelled = true; };
  }, [authLoading, billingLoadAttempt, payerId]);

  const startProductCheckout = async (address = billingAddress ?? undefined) => {
    if (!user || checkoutStarting.current || checkoutOutcome) return;
    checkoutStarting.current = true;
    setStartingCheckout(true);
    setCheckoutError(null);
    try {
      const intent = isSinglePurchasePeriod(product.period)
        ? await paymentService.createProductPaymentIntent(
            user,
            product,
            { $id: organization.id, name: organization.name },
            address,
            discountCode.trim() || null,
          )
        : await productService.createSubscriptionCheckout({
            productId: product.$id,
            billingAddress: address,
            discountCode: discountCode.trim() || null,
          });
      setPaymentData(intent);
      setShowBillingAddressModal(false);
      setPaymentInterrupted(false);
    } catch (error) {
      if (
        isApiRequestError(error)
        && error.data
        && typeof error.data === 'object'
        && 'billingAddressRequired' in error.data
        && Boolean(error.data.billingAddressRequired)
      ) {
        setShowBillingAddressModal(true);
        return;
      }
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start checkout. Try again.');
    } finally {
      checkoutStarting.current = false;
      setStartingCheckout(false);
    }
  };

  const finishCheckout = () => navigateToPublicCompletion({
    router,
    slug,
    kind: 'product',
    redirectUrl: organization.publicCompletionRedirectUrl,
  });
  const paymentDisabled = authLoading || !user || billingLoading || Boolean(billingError) || startingCheckout;
  const orderContext = (
    <div className="org-radius-surface border border-border bg-muted p-4">
      <p className="font-semibold">{product.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">{organization.name} · {formatProductPriceLabel(product)}</p>
    </div>
  );

  return (
    <Container size="xl" py="xl">
      <main className="space-y-6 text-foreground">
        <Button variant="subtle" onClick={() => router.push(`/o/${encodeURIComponent(slug)}#products`)} leftSection={<ArrowLeft aria-hidden="true" className="size-4" />}>
          Back to products
        </Button>
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{checkoutOutcome === 'success' ? 'Purchase complete' : checkoutOutcome === 'pending' ? 'Payment pending' : 'Complete your purchase'}</h1>
          <p className="text-muted-foreground">{product.name} · {organization.name}</p>
        </header>

        {checkoutOutcome && paymentData ? (
          <Paper withBorder p="lg">
            <PaymentResultView
              view={checkoutOutcome}
              reloading={false}
              copy={getPaymentModalCopy('product')}
              orderName={product.name}
              orderDetail={organization.name}
              originalPrice={product.priceCents}
              feeBreakdown={paymentData.feeBreakdown}
              onClose={checkoutOutcome === 'success' ? finishCheckout : () => router.push(`/o/${encodeURIComponent(slug)}#products`)}
              closeLabel={checkoutOutcome === 'success' ? 'Continue' : 'Back to products'}
            />
          </Paper>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
            <div className="space-y-6">
              <Paper withBorder p="lg" className="space-y-4">
                <h2 className="text-xl font-semibold">Product details</h2>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{product.name}</h3>
                  {product.description && <p className="whitespace-pre-line text-muted-foreground">{product.description}</p>}
                  <Badge>{isSinglePurchasePeriod(product.period) ? 'One-time purchase' : `Recurring every ${product.period}`}</Badge>
                </div>
              </Paper>

              {!authLoading && user && <Paper withBorder p="lg" className="space-y-4">
                <h2 className="text-xl font-semibold">Billing address</h2>
                {billingLoading ? <p role="status" className="text-sm text-muted-foreground">Loading your saved billing address...</p> : billingError ? (
                  <Alert color="red">
                    <p>{billingError}</p>
                    <Button variant="default" className="mt-3" onClick={() => setBillingLoadAttempt((attempt) => attempt + 1)}>Retry billing address</Button>
                  </Alert>
                ) : (
                  <>
                    {billingAddress ? (
                      <address className="text-sm not-italic leading-6">
                        <p>{billingAddress.line1}</p>
                        {billingAddress.line2 && <p>{billingAddress.line2}</p>}
                        <p>{billingAddress.city}, {billingAddress.state} {billingAddress.postalCode}</p>
                        <p>{billingAddress.countryCode}</p>
                      </address>
                    ) : <p className="text-sm text-muted-foreground">Add your billing address if it is needed to calculate tax.</p>}
                    <Button variant="default" disabled={startingCheckout || showPaymentModal} onClick={() => setShowBillingAddressModal(true)}>
                      {billingAddress ? 'Edit billing address' : 'Add billing address'}
                    </Button>
                    <p className="text-sm text-muted-foreground">Your saved address is kept if you close payment or try again.</p>
                  </>
                )}
              </Paper>}

              <Paper withBorder p="lg" className="space-y-4">
                <h2 className="text-xl font-semibold">Payment method</h2>
                <div className="org-radius-surface space-y-3 border border-border bg-muted p-5">
                  <p className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="size-5" /> Pay securely with Stripe</p>
                  <p className="text-sm text-muted-foreground">Review your total, then continue to Stripe to enter payment details.</p>
                  {paymentData && <p role="status" className="flex items-center gap-2 text-sm font-medium"><Check aria-hidden="true" className="size-4" /> Your total is ready. Continue to Stripe for payment.</p>}
                  {startingCheckout && <p role="status" className="text-sm text-muted-foreground">Calculating tax and preparing your total...</p>}
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-4 shrink-0" /> Your payment details stay with Stripe, not BracketIQ.</p>
              </Paper>
            </div>

            <Paper withBorder p="lg" className="space-y-5 lg:sticky lg:top-6" role="region" aria-label="Order summary">
              <h2 className="text-xl font-semibold">Order summary</h2>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{product.name}</h3>
                <p className="text-sm text-muted-foreground">{organization.name}</p>
              </div>
              {paymentData ? <PaymentOrderSummary feeBreakdown={paymentData.feeBreakdown} originalPrice={product.priceCents} /> : (
                <dl className="space-y-3 border-y border-border py-4 text-sm">
                  <div className="flex justify-between gap-4"><dt>Product price</dt><dd className="font-semibold tabular-nums">{formatProductPriceLabel(product)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Processing fees</dt><dd>Included</dd></div>
                  <div className="flex justify-between gap-4"><dt>Tax</dt><dd>Calculated before payment</dd></div>
                </dl>
              )}
              <TextInput
                label="Discount code"
                placeholder="Enter code"
                value={discountCode}
                onChange={(event) => {
                  setDiscountCode(event.currentTarget.value);
                  setPaymentData(null);
                  setCheckoutError(null);
                }}
                description={paymentData && discountCode.trim() ? 'This total includes the accepted discount code.' : 'Your code is applied when you review the total.'}
                disabled={paymentDisabled || showPaymentModal}
              />
              {authLoading && <p role="status" className="text-sm text-muted-foreground">Checking your session.</p>}
              {!authLoading && !user && <Alert color="yellow" title="Sign in required">
                <p>Sign in before purchasing this product.</p>
                <Button className="mt-3" onClick={() => router.push('/login')}>Sign in to purchase</Button>
              </Alert>}
              {checkoutError && <Alert color="red" title="Checkout unavailable"><p>{checkoutError}</p><p className="mt-2">Your product, billing address, and discount code are kept. You have not completed payment.</p></Alert>}
              {paymentInterrupted && <Alert color="blue" title="Payment not completed">Your order is ready to resume. Continue with the same checkout when you are ready.</Alert>}
              <Button
                fullWidth
                loading={startingCheckout}
                disabled={paymentDisabled}
                aria-describedby="checkout-prerequisite"
                onClick={() => { if (paymentData) setShowPaymentModal(true); else void startProductCheckout(); }}
                rightSection={<ArrowRight aria-hidden="true" className="size-4" />}
              >
                {paymentData ? 'Continue to Stripe' : checkoutError ? 'Try again' : 'Review total'}
              </Button>
              <p id="checkout-prerequisite" className="text-sm text-muted-foreground">
                {authLoading ? 'Wait while we check your session.' : !user ? 'Sign in to continue.' : billingLoading ? 'Wait for your saved billing address to load.' : billingError ? 'Reload your billing address to continue.' : startingCheckout ? 'Wait while your checkout is prepared.' : paymentData ? 'Payment is completed in the secure Stripe form.' : 'Review the exact total before opening payment.'}
              </p>
            </Paper>
          </div>
        )}
      </main>

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => setShowBillingAddressModal(false)}
        onSaved={async (address) => {
          setBillingAddress(address);
          setShowBillingAddressModal(false);
          setPaymentData(null);
          await startProductCheckout(address);
        }}
        summary={orderContext}
        title="Billing address"
        description="Save your billing address to calculate tax and review the exact total before payment."
      />
      <PaymentModal
        isOpen={showPaymentModal && Boolean(paymentData) && Boolean(user)}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentInterrupted(true);
        }}
        event={{ name: product.name, location: organization.name, eventType: 'EVENT', price: product.priceCents }}
        paymentData={paymentData}
        originalPrice={product.priceCents}
        summary={orderContext}
        onPaymentSuccess={() => { setCheckoutOutcome('success'); setShowPaymentModal(false); }}
        onPaymentPending={() => { setCheckoutOutcome('pending'); setShowPaymentModal(false); }}
      />
    </Container>
  );
}
