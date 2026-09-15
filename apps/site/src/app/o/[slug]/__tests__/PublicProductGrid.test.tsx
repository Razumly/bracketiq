import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicOrganizationSummary } from '@/server/publicOrganizationCatalog';
import PublicProductGrid from '../PublicProductGrid';

const pushMock = jest.fn();
const loginMock = jest.fn();
const createAccountMock = jest.fn();
const mockUseApp = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
jest.mock('@/app/providers', () => ({ useApp: () => mockUseApp() }));
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      login: (...args: unknown[]) => loginMock(...args),
      createAccount: (...args: unknown[]) => createAccountMock(...args),
    },
  };
});

const organization: PublicOrganizationSummary = {
  id: 'org_1', slug: 'summit', name: 'Summit Sports Club', description: null,
  location: 'Seattle', website: null, logoUrl: '/logo.png', sports: [],
  brandPrimaryColor: '#0f766e', brandAccentColor: '#f59e0b', publicHeadline: 'Play here',
  publicIntroText: 'Welcome', publicPageEnabled: true, publicWidgetsEnabled: true,
  publicCompletionRedirectUrl: null,
};
const products = [
  { id: 'membership', name: 'Monthly membership', description: 'Weekly court access.', priceCents: 4900, period: 'month', detailsUrl: '/o/summit/products/membership' },
  { id: 'shirt', name: 'Training shirt', description: 'Club training shirt.', priceCents: 2850, period: 'single', detailsUrl: '/o/summit/products/shirt' },
];
const renderCatalog = () => render(<PublicProductGrid slug="summit" organization={organization} products={products} />);

describe('PublicProductGrid', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    window.sessionStorage.clear();
    mockUseApp.mockReturnValue({ user: { $id: 'user_1' }, loading: false, setUser: jest.fn(), setAuthUser: jest.fn() });
  });

  it('keeps selection and product details separate from checkout and carries the chosen product forward', async () => {
    const user = userEvent.setup();
    renderCatalog();
    const continueButton = screen.getByRole('button', { name: 'Continue to checkout' });
    expect(continueButton).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Training shirt/ }));
    const summary = screen.getByRole('region', { name: 'Order summary' });
    expect(within(summary).getByText('Training shirt')).toBeInTheDocument();
    expect(within(summary).getByText('$28.50')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View details for Monthly membership' }));
    const detail = screen.getByRole('dialog');
    expect(within(detail).getByText('Weekly court access.')).toBeInTheDocument();
    expect(within(summary).getByText('Training shirt')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    await user.click(within(detail).getByRole('button', { name: 'Select product' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(summary).getByText('$49.00 · month')).toBeInTheDocument();
    await user.click(continueButton);
    expect(pushMock).toHaveBeenCalledWith('/o/summit/products/membership');
  });

  it('retains the selected product through a failed sign-in and continues after authentication succeeds', async () => {
    const user = userEvent.setup();
    const setUser = jest.fn();
    mockUseApp.mockReturnValue({ user: null, loading: false, setUser, setAuthUser: jest.fn() });
    loginMock.mockRejectedValueOnce(new Error('Check your email and password.'));
    loginMock.mockResolvedValueOnce({ user: { $id: 'user_1' }, profile: { $id: 'user_1' } });
    renderCatalog();
    await user.click(screen.getByRole('radio', { name: /Training shirt/ }));
    await user.click(screen.getByRole('button', { name: 'Continue to checkout' }));
    await user.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
    await user.type(screen.getByLabelText('Email address', { exact: false }), 'sam@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    expect(await screen.findByText('Check your email and password.')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/o/summit/products/shirt'));
    expect(setUser).toHaveBeenCalledWith({ $id: 'user_1' });
  });

  it('allows selection while the session loads but blocks checkout until it is ready', async () => {
    const user = userEvent.setup();
    mockUseApp.mockReturnValue({ user: null, loading: true, setUser: jest.fn(), setAuthUser: jest.fn() });
    const { rerender } = renderCatalog();
    await user.click(screen.getByRole('radio', { name: /Training shirt/ }));
    expect(screen.getByRole('button', { name: 'Continue to checkout' })).toBeDisabled();
    mockUseApp.mockReturnValue({ user: { $id: 'user_1' }, loading: false, setUser: jest.fn(), setAuthUser: jest.fn() });
    rerender(<PublicProductGrid slug="summit" organization={organization} products={products} />);
    await user.click(screen.getByRole('button', { name: 'Continue to checkout' }));
    expect(pushMock).toHaveBeenCalledWith('/o/summit/products/shirt');
  });
});
