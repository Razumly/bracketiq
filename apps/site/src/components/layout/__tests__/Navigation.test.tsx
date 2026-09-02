import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Navigation from '../Navigation';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    alt ? <span role="img" aria-label={alt} /> : <span aria-hidden="true" />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();
let mockPathname = '/discover';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

const mockOpenAssistant = jest.fn();
jest.mock('@/context/AgentContext', () => ({
  useAgentContext: () => ({
    openAssistant: mockOpenAssistant,
  }),
}));

const logoutMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  authService: {
    logout: (...args: unknown[]) => logoutMock(...args),
  },
}));

describe('Navigation', () => {
  const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalMatchMediaDescriptor) {
      Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });
  const mockRendered = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    jest.spyOn(element, 'getClientRects').mockImplementation(() => [rect] as unknown as DOMRectList);
  };
  const fetchMock = jest.fn();
  const authenticatedState = {
    user: {
      firstName: 'Profile',
      lastName: 'Name',
      userName: 'profile_name',
      homePageOrganizationId: 'org_42',
      onboardingIntent: 'ORGANIZATION',
    },
    authUser: { $id: 'user_1', email: 'user@example.com', name: 'Taylor' },
    setUser: jest.fn(),
    setAuthUser: jest.fn(),
    loading: false,
    isGuest: false,
    isAuthenticated: true,
  };
  const publicState = {
    user: null,
    authUser: null,
    setUser: jest.fn(),
    setAuthUser: jest.fn(),
    loading: false,
    isGuest: true,
    isAuthenticated: false,
  };
  const renderNavigation = () => render(<Navigation />);
  const installResponsiveMatchMedia = () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQuery = {
      matches: false,
      media: '(min-width: 64rem)',
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    } as unknown as MediaQueryList & { setMatches: (matches: boolean) => void };
    mediaQuery.setMatches = (matches) => {
      mediaQuery.matches = matches;
      listeners.forEach((listener) => listener(mediaQuery as MediaQueryListEvent));
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => mediaQuery),
    });
    return mediaQuery;
  };

  beforeEach(() => {
    mockPathname = '/discover';
    replaceMock.mockReset();
    refreshMock.mockReset();
    mockOpenAssistant.mockReset();
    logoutMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    useAppMock.mockReturnValue(authenticatedState);
  });

  it('renders nothing while authentication is loading', () => {
    useAppMock.mockReturnValue({
      ...authenticatedState,
      loading: true,
    });

    const { container } = renderNavigation();

    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the home target and desktop route order', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: /bracketiq/i })).toHaveAttribute('href', '/organizations/org_42');
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/organizations/org_42',
      '/info',
      '/guides',
      '/discover',
      '/organizations',
      '/my-schedule',
      '/mobile-app',
      '/profile',
    ]);
  });

  it('shows the hydrated profile name instead of the stale auth name', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: /profile name/i })).toHaveAttribute('href', '/profile');
    expect(screen.queryByText('Taylor')).not.toBeInTheDocument();
  });

  it.each(['/discover', '/discover/events/event_42'])('marks the %s route as the active descendant', (path) => {
    mockPathname = path;
    renderNavigation();

    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Info' })).not.toHaveAttribute('aria-current');
  });

  it('marks profile and mobile application descendants as active', () => {
    mockPathname = '/profile/settings';
    const profileView = renderNavigation();
    expect(profileView.getByRole('link', { name: /profile name/i })).toHaveAttribute('aria-current', 'page');

    profileView.unmount();
    mockPathname = '/mobile-app/install';
    renderNavigation();
    expect(screen.getByRole('link', { name: /get the mobile app/i })).toHaveAttribute('aria-current', 'page');
  });

  it('shows admin navigation only after allowed access resolves', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    renderNavigation();

    expect(await screen.findByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/access', {
      credentials: 'include',
      cache: 'no-store',
    });
  });

  it('does not request or show admin navigation for a public viewer', () => {
    useAppMock.mockReturnValue(publicState);

    renderNavigation();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('ignores a stale admin response after an authenticated viewer changes', async () => {
    const firstResponse = Promise.withResolvers<unknown>();
    const staleJsonSettled = Promise.withResolvers<void>();
    const staleJson = jest.fn(async () => {
      staleJsonSettled.resolve();
      return { allowed: true };
    });
    fetchMock.mockImplementationOnce(() => firstResponse.promise).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: false }),
    });

    const view = renderNavigation();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    useAppMock.mockReturnValue({
      ...authenticatedState,
      authUser: { ...authenticatedState.authUser, $id: 'user_2' },
    });
    view.rerender(<Navigation />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstResponse.resolve({
        ok: true,
        json: staleJson,
      });
      await staleJsonSettled.promise;
      await Promise.resolve();
    });
    expect(staleJson).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument());
  });

  it('shows the AI assistant trigger and opens feedback from the desktop header', async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.click(screen.getByRole('button', { name: 'Open AI assistant' }));
    expect(mockOpenAssistant).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
  });

  it('opens the authenticated left menu with the current account and route order', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', 'mobile-navigation-menu');

    await user.click(menuButton);

    const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });
    expect(menu).toHaveAttribute('id', 'mobile-navigation-menu');
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/profile',
      '/discover',
      '/organizations',
      '/my-schedule',
      '/info',
      '/guides',
      '/mobile-app',
    ]);
    expect(within(menu).getByRole('button', { name: 'Feedback' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Open AI assistant' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: /profile name/i })).not.toHaveAttribute('aria-current');
    await waitFor(() => expect(within(menu).getByRole('button', { name: 'Close menu' })).toHaveFocus());
  });

  it('closes the mobile menu through Escape and its close control and restores trigger focus', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(menuButton);
    await screen.findByRole('dialog', { name: 'Navigation menu' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument());
    await waitFor(() => expect(menuButton).toHaveFocus());
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
  it('hands mobile feedback off after the menu closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    mockRendered(menuButton);
    await user.click(menuButton);
    const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });

    act(() => {
      fireEvent.click(within(menu).getByRole('button', { name: 'Feedback' }));
      fireEvent.transitionEnd(menu);
    });

    const feedbackDialog = await screen.findByRole('dialog', { name: 'Send feedback' });
    expect(feedbackDialog).toBeInTheDocument();

    await user.click(within(feedbackDialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Send feedback' })).not.toBeInTheDocument());
    await waitFor(() => expect(menuButton).toHaveFocus());
  });
  it('opens mobile feedback on transition completion before the fallback timer', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderNavigation();

      const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
      await user.click(menuButton);
      const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });

      act(() => {
        fireEvent.click(within(menu).getByRole('button', { name: 'Feedback' }));
        fireEvent.transitionEnd(menu);
      });

      expect(screen.getByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
      expect(screen.getAllByRole('dialog', { name: 'Send feedback' })).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels the pending mobile feedback fallback when the menu reopens', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderNavigation();

      const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
      await user.click(menuButton);
      const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });
      await user.click(within(menu).getByRole('button', { name: 'Feedback' }));

      await user.click(menuButton);
      const reopenedMenu = await screen.findByRole('dialog', { name: 'Navigation menu' });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(reopenedMenu).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Send feedback' })).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('moves focus to the desktop home link when a breakpoint change closes the mobile menu', async () => {
    const user = userEvent.setup();
    const mediaQuery = installResponsiveMatchMedia();

    renderNavigation();
    const homeLink = screen.getByRole('link', { name: 'BracketIQ home' });
    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(menuButton);
    await screen.findByRole('dialog', { name: 'Navigation menu' });

    act(() => {
      mediaQuery.setMatches(true);
    });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument());
    await waitFor(() => expect(homeLink).toHaveFocus());
    expect(menuButton).not.toHaveFocus();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
  it('does not carry desktop focus handoff across a closed breakpoint cycle', async () => {
    const user = userEvent.setup();
    const mediaQuery = installResponsiveMatchMedia();
    renderNavigation();
    const homeLink = screen.getByRole('link', { name: 'BracketIQ home' });
    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });

    act(() => {
      mediaQuery.setMatches(true);
      mediaQuery.setMatches(false);
    });

    await user.click(menuButton);
    await screen.findByRole('dialog', { name: 'Navigation menu' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument());
    await waitFor(() => expect(menuButton).toHaveFocus());
    expect(homeLink).not.toHaveFocus();
  });

  it('clears desktop focus handoff when the menu reopens during its close transition', async () => {
    const user = userEvent.setup();
    const mediaQuery = installResponsiveMatchMedia();
    renderNavigation();
    const homeLink = screen.getByRole('link', { name: 'BracketIQ home' });
    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    mockRendered(menuButton);

    await user.click(menuButton);
    const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });
    const pendingCloseAnimation = Promise.withResolvers<void>();
    Object.defineProperty(menu, 'getAnimations', {
      configurable: true,
      value: jest.fn(() => [{
        finished: pendingCloseAnimation.promise,
        pending: false,
        playState: 'running',
      }] as Animation[]),
    });

    act(() => {
      mediaQuery.setMatches(true);
    });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toBeInTheDocument();

    act(() => {
      mediaQuery.setMatches(false);
    });
    await user.click(menuButton);
    const reopenedMenu = await screen.findByRole('dialog', { name: 'Navigation menu' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    Object.defineProperty(reopenedMenu, 'getAnimations', {
      configurable: true,
      value: jest.fn(() => []),
    });
    pendingCloseAnimation.resolve();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument());
    await waitFor(() => expect(menuButton).toHaveFocus());
    expect(homeLink).not.toHaveFocus();
  });

  it('closes the mobile menu after a link activation', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(menuButton);
    const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });

    await user.click(within(menu).getByRole('link', { name: 'My Organizations' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument());
    await waitFor(() => expect(menuButton).toHaveFocus());
  });

  it('shows the public menu branch with Login / Signup and no authenticated actions', async () => {
    const user = userEvent.setup();
    useAppMock.mockReturnValue(publicState);
    renderNavigation();

    expect(screen.getByRole('link', { name: 'Login / Signup' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Open AI assistant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send feedback' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const menu = await screen.findByRole('dialog', { name: 'Navigation menu' });
    expect(within(menu).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/login',
      '/discover',
      '/organizations',
      '/my-schedule',
      '/info',
      '/guides',
      '/mobile-app',
    ]);
    expect(within(menu).queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
  });

  it('shows guest navigation without requiring an authenticated user', () => {
    useAppMock.mockReturnValue(publicState);

    renderNavigation();

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bracketiq/i })).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('link', { name: /info/i })).toHaveAttribute('href', '/info');
    expect(screen.getByRole('link', { name: /guides/i })).toHaveAttribute('href', '/guides');
    expect(screen.getAllByRole('link', { name: /discover/i })[0]).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('link', { name: /my organizations/i })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('link', { name: /my schedule/i })).toHaveAttribute('href', '/my-schedule');
    expect(screen.getByRole('link', { name: /login \/ signup/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
  });

  it('shows guest navigation for a signed-out visitor without an explicit guest session', () => {
    useAppMock.mockReturnValue({
      ...publicState,
      isGuest: false,
    });

    renderNavigation();

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /login \/ signup/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /my organizations/i })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('link', { name: /my schedule/i })).toHaveAttribute('href', '/my-schedule');
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
  });
});
