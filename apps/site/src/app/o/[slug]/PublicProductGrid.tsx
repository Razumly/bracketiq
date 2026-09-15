'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Badge,
  Paper,
} from '@/components/organization/organization-operation-ui';
import { useApp } from '@/app/providers';
import { ApiError, authService } from '@/lib/auth';
import type {
  PublicOrganizationProductCard,
  PublicOrganizationSummary,
} from '@/server/publicOrganizationCatalog';
import type { UserData } from '@/types';
import { formatPrice } from '@/types';
import styles from './PublicOrganizationPage.module.css';

type PublicProductGridProps = {
  slug: string;
  organization: PublicOrganizationSummary;
  products: PublicOrganizationProductCard[];
};

type AuthModalMode = 'login' | 'signup';

type AuthModalForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  userName: string;
  dateOfBirth: string;
};

const PENDING_PRODUCT_CHECKOUT_KEY = 'public-product-checkout';

const EMPTY_AUTH_MODAL_FORM: AuthModalForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  userName: '',
  dateOfBirth: '',
};

const isSinglePurchasePeriod = (period: string | null | undefined): boolean =>
  String(period ?? '').trim().toLowerCase() === 'single';

const getProductPriceLabel = (product: PublicOrganizationProductCard): string => (
  isSinglePurchasePeriod(product.period)
    ? formatPrice(product.priceCents)
    : `${formatPrice(product.priceCents)} · ${String(product.period).toLowerCase()}`
);

const readPendingCheckoutProductId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = window.sessionStorage.getItem(PENDING_PRODUCT_CHECKOUT_KEY);
  return value && value.trim().length > 0 ? value : null;
};

const writePendingCheckoutProductId = (productId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(PENDING_PRODUCT_CHECKOUT_KEY, productId);
};

const clearPendingCheckoutProductId = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(PENDING_PRODUCT_CHECKOUT_KEY);
};

export default function PublicProductGrid({
  slug,
  organization,
  products,
}: PublicProductGridProps) {
  const router = useRouter();
  const { user, loading: authLoading, setAuthUser, setUser } = useApp();
  const [activeProduct, setActiveProduct] = useState<PublicOrganizationProductCard | null>(null);
  const [detailProduct, setDetailProduct] = useState<PublicOrganizationProductCard | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('signup');
  const [authModalForm, setAuthModalForm] = useState<AuthModalForm>(EMPTY_AUTH_MODAL_FORM);
  const [authModalLoading, setAuthModalLoading] = useState(false);
  const [authModalError, setAuthModalError] = useState('');
  const [authVerificationEmail, setAuthVerificationEmail] = useState('');
  const [authVerificationMessage, setAuthVerificationMessage] = useState('');
  const [authVerificationMessageType, setAuthVerificationMessageType] = useState<'info' | 'success'>('info');
  const [authResendingVerification, setAuthResendingVerification] = useState(false);

  const today = useMemo(() => new Date(), []);
  const maxAuthDob = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const resetAuthModalFeedback = useCallback(() => {
    setAuthModalError('');
    setAuthVerificationEmail('');
    setAuthVerificationMessage('');
    setAuthVerificationMessageType('info');
  }, []);

  const openAuthModal = useCallback((product: PublicOrganizationProductCard) => {
    setActiveProduct(product);
    setAuthModalMode('signup');
    setAuthModalForm(EMPTY_AUTH_MODAL_FORM);
    setShowAuthModal(true);
    resetAuthModalFeedback();
  }, [resetAuthModalFeedback]);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    setAuthModalLoading(false);
    setAuthModalForm(EMPTY_AUTH_MODAL_FORM);
    resetAuthModalFeedback();
  }, [resetAuthModalFeedback]);

  const continueToCheckout = useCallback((
    product: PublicOrganizationProductCard,
    purchaser?: UserData | null,
  ) => {
    if (!(purchaser ?? user)) {
      openAuthModal(product);
      return;
    }
    clearPendingCheckoutProductId();
    router.push(`/o/${encodeURIComponent(slug)}/products/${encodeURIComponent(product.id)}`);
  }, [openAuthModal, router, slug, user]);

  const handleAuthModalInputChange = useCallback((field: keyof AuthModalForm, value: string) => {
    setAuthModalForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleAuthModalResendVerification = useCallback(async () => {
    if (!authVerificationEmail) {
      return;
    }
    setAuthResendingVerification(true);
    setAuthModalError('');
    try {
      await authService.resendVerification(authVerificationEmail);
      setAuthVerificationMessage(`Verification email sent to ${authVerificationEmail}.`);
      setAuthVerificationMessageType('info');
    } catch (error) {
      setAuthModalError(error instanceof Error ? error.message : 'Failed to resend verification email.');
    } finally {
      setAuthResendingVerification(false);
    }
  }, [authVerificationEmail]);

  const handleAuthModalGoogle = useCallback(async () => {
    if (!activeProduct) {
      return;
    }
    writePendingCheckoutProductId(activeProduct.id);
    await authService.oauthLoginWithGoogle();
  }, [activeProduct]);

  const handleAuthModalSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProduct) {
      return;
    }

    setAuthModalLoading(true);
    resetAuthModalFeedback();
    try {
      const authResult = authModalMode === 'login'
        ? await authService.login(authModalForm.email, authModalForm.password)
        : await authService.createAccount(
            authModalForm.email,
            authModalForm.password,
            authModalForm.firstName,
            authModalForm.lastName,
            authModalForm.userName,
            authModalForm.dateOfBirth,
          );

      if (!authResult.user || !authResult.profile) {
        throw new Error('Failed to retrieve user profile data.');
      }

      setAuthUser(authResult.user);
      setUser(authResult.profile);
      setShowAuthModal(false);
      continueToCheckout(activeProduct, authResult.profile);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        const pendingEmail = error.email || authModalForm.email.trim().toLowerCase();
        setAuthVerificationEmail(pendingEmail);
        setAuthVerificationMessage(error.message || 'Please verify your email before signing in.');
        setAuthVerificationMessageType('info');
        setAuthModalError('');
        return;
      }
      setAuthModalError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthModalLoading(false);
    }
  }, [activeProduct, authModalForm, authModalMode, continueToCheckout, resetAuthModalFeedback, setAuthUser, setUser]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    const pendingProductId = readPendingCheckoutProductId();
    if (!pendingProductId) {
      return;
    }
    const pendingProduct = products.find((product) => product.id === pendingProductId);
    if (!pendingProduct) {
      clearPendingCheckoutProductId();
      return;
    }
    continueToCheckout(pendingProduct, user);
  }, [authLoading, continueToCheckout, products, user]);

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-4 text-xl font-semibold text-foreground">Choose a product</legend>
          {products.map((product) => {
            const selected = activeProduct?.id === product.id;
            return (
              <div
                key={product.id}
                className={`org-radius-surface border p-4 sm:p-5 ${selected ? 'border-ring bg-secondary' : 'border-border bg-card'}`}
              >
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="public-product"
                    value={product.id}
                    checked={selected}
                    onChange={() => setActiveProduct(product)}
                    className="mt-1 size-5 shrink-0 accent-[var(--ring)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-start justify-between gap-2 font-semibold text-foreground">
                      <span className="text-lg">{product.name}</span>
                      <span className="text-lg tabular-nums">{getProductPriceLabel(product)}</span>
                    </span>
                    {product.description && <span className="mt-1 block text-sm text-muted-foreground">{product.description}</span>}
                  </span>
                </label>
                <div className="ml-8 mt-2 flex flex-wrap items-center gap-3">
                  <Badge>{isSinglePurchasePeriod(product.period) ? 'One-time purchase' : 'Recurring'}</Badge>
                  <Button
                    variant="subtle"
                    onClick={() => setDetailProduct(product)}
                    aria-label={`View details for ${product.name}`}
                    rightSection={<ArrowRight aria-hidden="true" className="size-4" />}
                  >
                    View details
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-sm text-muted-foreground">Choose one product. Review its details before checkout.</p>
        </fieldset>

        <Paper withBorder p="lg" className="space-y-5 lg:sticky lg:top-6" role="region" aria-label="Order summary">
          <h3 className="text-xl font-semibold">Order summary</h3>
          {activeProduct ? (
            <>
              <div className="space-y-2">
                <p className="text-lg font-semibold">{activeProduct.name}</p>
                {activeProduct.description && <p className="text-sm text-muted-foreground">{activeProduct.description}</p>}
                <Badge><Check aria-hidden="true" className="mr-1 size-3" /> Selected</Badge>
              </div>
              <dl className="space-y-3 border-y border-border py-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Quantity</dt><dd>1</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Product price</dt><dd className="font-semibold tabular-nums">{getProductPriceLabel(activeProduct)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Tax</dt><dd>Calculated at checkout</dd></div>
              </dl>
            </>
          ) : <p className="text-sm text-muted-foreground">No product selected.</p>}
          <Button
            fullWidth
            disabled={authLoading || !activeProduct}
            aria-describedby="product-checkout-prerequisite"
            onClick={() => { if (activeProduct) continueToCheckout(activeProduct); }}
            rightSection={<ArrowRight aria-hidden="true" className="size-4" />}
          >
            Continue to checkout
          </Button>
          <p id="product-checkout-prerequisite" className="text-sm text-muted-foreground">
            {authLoading ? 'Checking your session.' : !activeProduct ? 'Select a product to continue.' : !user ? 'Sign in or create an account to purchase this product.' : 'Review billing, discounts, and your exact total before payment.'}
          </p>
          <p className="flex items-start gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
            Processing fees are included in the online price. Stripe collects payment details.
          </p>
        </Paper>
      </div>

      <Modal opened={Boolean(detailProduct)} onClose={() => setDetailProduct(null)} title={detailProduct?.name} size="lg">
        {detailProduct && <Stack gap="lg">
          <Text c="dimmed">{organization.name}</Text>
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Product overview</h3>
            {detailProduct.description && <p className="whitespace-pre-line text-muted-foreground">{detailProduct.description}</p>}
            <dl className="space-y-3 border-y border-border py-4 text-sm">
              <div className="flex justify-between gap-4"><dt>Product price</dt><dd className="font-semibold tabular-nums">{getProductPriceLabel(detailProduct)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Payment frequency</dt><dd>{isSinglePurchasePeriod(detailProduct.period) ? 'One time' : `Every ${detailProduct.period}`}</dd></div>
              <div className="flex justify-between gap-4"><dt>Tax</dt><dd>Calculated at checkout</dd></div>
            </dl>
            <p className="text-sm text-muted-foreground">Processing fees are included in the online price. Selecting this product does not take payment.</p>
          </section>
          <Button onClick={() => { setActiveProduct(detailProduct); setDetailProduct(null); }}>
            Select product
          </Button>
        </Stack>}
      </Modal>

      <Modal
        opened={showAuthModal}
        onClose={closeAuthModal}
        centered
        title={authModalMode === 'login' ? 'Sign in to purchase' : 'Create account to purchase'}
      >
        <form onSubmit={handleAuthModalSubmit}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {authModalMode === 'login'
                ? 'Sign in to continue with checkout.'
                : 'Create an account to continue with checkout.'}
            </Text>
            {authModalMode === 'signup' ? (
              <>
                <TextInput
                  label="First name"
                  value={authModalForm.firstName}
                  onChange={(changeEvent) => handleAuthModalInputChange('firstName', changeEvent.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Last name"
                  value={authModalForm.lastName}
                  onChange={(changeEvent) => handleAuthModalInputChange('lastName', changeEvent.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Username"
                  value={authModalForm.userName}
                  onChange={(changeEvent) => handleAuthModalInputChange('userName', changeEvent.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Date of birth"
                  type="date"
                  value={authModalForm.dateOfBirth}
                  onChange={(changeEvent) => handleAuthModalInputChange('dateOfBirth', changeEvent.currentTarget.value)}
                  max={maxAuthDob}
                  required
                />
              </>
            ) : null}
            <TextInput
              label="Email address"
              type="email"
              value={authModalForm.email}
              onChange={(changeEvent) => handleAuthModalInputChange('email', changeEvent.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Password"
              value={authModalForm.password}
              onChange={(changeEvent) => handleAuthModalInputChange('password', changeEvent.currentTarget.value)}
              required
              minLength={8}
            />
            {authVerificationMessage ? (
              <Alert color={authVerificationMessageType === 'success' ? 'green' : 'yellow'} variant="light">
                <Text size="sm">{authVerificationMessage}</Text>
                {authVerificationEmail ? (
                  <Button
                    type="button"
                    variant="subtle"
                    size="compact-sm"
                    mt="xs"
                    loading={authResendingVerification}
                    onClick={() => { void handleAuthModalResendVerification(); }}
                  >
                    Resend verification email
                  </Button>
                ) : null}
              </Alert>
            ) : null}
            {authModalError ? (
              <Alert color="red" variant="light">
                {authModalError}
              </Alert>
            ) : null}
            <Button type="submit" fullWidth loading={authModalLoading}>
              {authModalMode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            <Button
              type="button"
              variant="subtle"
              onClick={() => {
                setAuthModalMode((current) => (current === 'login' ? 'signup' : 'login'));
                resetAuthModalFeedback();
              }}
            >
              {authModalMode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Button>
            <Group gap="xs" align="center" wrap="nowrap">
              <div className={styles.authDivider} />
              <Text size="xs" c="dimmed">or</Text>
              <div className={styles.authDivider} />
            </Group>
            <Button
              type="button"
              fullWidth
              variant="default"
              onClick={() => { void handleAuthModalGoogle(); }}
              disabled={authModalLoading}
            >
              Continue with Google
            </Button>
          </Stack>
        </form>
      </Modal>

    </>
  );
}
