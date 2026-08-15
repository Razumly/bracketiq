import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LandingPage from '../LandingPage';

jest.mock('motion/react', () => ({
  ...jest.requireActual('motion/react'),
  useReducedMotion: () => false,
}));

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

const startGuestSessionMock = jest.fn();

const originalIntersectionObserver = window.IntersectionObserver;
const originalMatchMedia = window.matchMedia;

type IntersectionObserverHarness = {
  callback: IntersectionObserverCallback;
  disconnect: jest.Mock;
  observe: jest.Mock;
  options: IntersectionObserverInit | undefined;
  unobserve: jest.Mock;
};

const intersectionObservers: IntersectionObserverHarness[] = [];

function installIntersectionObserver() {
  class IntersectionObserverMock {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
    readonly callback: IntersectionObserverCallback;
    readonly options: IntersectionObserverInit | undefined;
    readonly disconnect = jest.fn();
    readonly observe = jest.fn();
    readonly unobserve = jest.fn();

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.callback = callback;
      this.options = options;
      intersectionObservers.push(this);
    }

    takeRecords() {
      return [];
    }
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock,
    writable: true,
  });
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = jest.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
  );
  const removeEventListener = jest.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  );
  const media = '(prefers-reduced-motion: reduce)';
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn(() => mediaQuery),
    writable: true,
  });

  return {
    addEventListener,
    removeEventListener,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function getStaticOperations(container: HTMLElement) {
  const operations = container.querySelector<HTMLElement>(
    '.landing-static-operations',
  );
  if (!operations) throw new Error('Static operations content was not rendered');

  return {
    operations,
    cards: Array.from(
      operations.querySelectorAll<HTMLElement>(
        '[data-mobile-feature-card="true"]',
      ),
    ),
  };
}

describe('LandingPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    startGuestSessionMock.mockReset();
    intersectionObservers.splice(0);
    installMatchMedia(false);
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isGuest: false,
      isAuthenticated: false,
      startGuestSession: (...args: unknown[]) => startGuestSessionMock(...args),
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
      writable: true,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
      writable: true,
    });
  });

  it('renders landing content and auth actions for signed-out users', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        name: /run every event from one home/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign up/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i })[0]).toHaveAttribute('href', '/request-demo');
    expect(screen.getByRole('link', { name: /^platform$/i })).toHaveAttribute('href', '#platform');
    expect(screen.getByRole('link', { name: /^operations$/i })).toHaveAttribute('href', '#operations');
    expect(screen.getByRole('link', { name: /^integrations$/i })).toHaveAttribute('href', '#integrations');
    expect(screen.getByRole('link', { name: /read payment guide/i })).toHaveAttribute(
      'href',
      '/guides/paid-pickup-event-payments',
    );
    expect(screen.queryByRole('link', { name: /browse all guides/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /free to use\. pay only on processing/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /your site stays live/i })).toBeInTheDocument();
    expect(screen.getByText(/publish schedules, brackets, registration, payments, and documents/i)).toBeInTheDocument();
    expect(screen.getAllByText(/live event data/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /support@bracket-iq.com/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /continue as guest/i }).length).toBeGreaterThan(0);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps the marketing page visible while auth state resolves', () => {
    useAppMock.mockReturnValue({
      user: null,
      loading: true,
      isGuest: false,
      isAuthenticated: false,
    });

    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        name: /run every event from one home/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Loading\.\.\.$/i)).not.toBeInTheDocument();
  });

  it('renders a single app CTA for signed-in users on the landing page', () => {
    useAppMock.mockReturnValue({
      user: { homePageOrganizationId: 'org_42', onboardingIntent: 'ORGANIZATION' },
      loading: false,
      isGuest: false,
      isAuthenticated: true,
    });

    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: /go to app/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /request demo/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /^sign up$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders landing content for active guest sessions', () => {
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isGuest: true,
      isAuthenticated: false,
    });

    render(<LandingPage />);

    expect(
      screen.getByRole('heading', {
        name: /run every event from one home/i,
      }),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('starts a guest session and routes to onboarding when continue as guest is clicked', async () => {
    startGuestSessionMock.mockResolvedValue(undefined);

    render(<LandingPage />);

    fireEvent.click(screen.getAllByRole('button', { name: /continue as guest/i })[0]);

    await waitFor(() => {
      expect(startGuestSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).toHaveBeenCalledWith('/onboarding');
  });

  it('keeps the brand link on the info route when configured', () => {
    render(<LandingPage brandHref="/info" />);

    expect(screen.getByRole('link', { name: /bracketiq/i })).toHaveAttribute('href', '/info');
  });

  it('can route section nav links through the info route', () => {
    render(<LandingPage brandHref="/info" anchorHrefPrefix="/info" />);

    expect(screen.getByRole('link', { name: /^platform$/i })).toHaveAttribute('href', '/info#platform');
    expect(screen.getByRole('link', { name: /^fees$/i })).toHaveAttribute('href', '/info#fees');
  });

  it('can render the hero screenshots in a horizontal layout', () => {
    render(<LandingPage heroMediaLayout="horizontal" />);

    expect(screen.getByAltText('Web discover dashboard').closest('.landing-hero-stack')).toHaveClass(
      'landing-hero-stack-horizontal',
    );
  });

  it('renders the connected platform layers', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', { name: /run events from the web\. keep teams updated from mobile\./i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Organizer console').closest('article')).toHaveClass('landing-platform-card');
    expect(screen.getByText('Mobile participant app').closest('article')).toHaveClass('landing-platform-card');
    expect(screen.queryByText(/staff manage events/i)).not.toBeInTheDocument();
  });

  it('renders a supported use cases section', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /built for every run of play/i })).toBeInTheDocument();
    expect(screen.getByAltText('Sports operations dashboard for mixed programs')).toBeInTheDocument();
    expect(screen.getByText('Facility Programs').closest('article')).toHaveClass('landing-use-case');
    expect(screen.queryByText(/^System$/i)).not.toBeInTheDocument();
  });

  it('renders the compact workflow steps', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: /from setup to game day/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /set up the operating model/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /open registration and schedules/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /manage game day from the same system/i })).toBeInTheDocument();
  });

  it('renders feature screenshots in the pinned operations section', async () => {
    render(<LandingPage />);

    expect(screen.getAllByRole('heading', { name: /schedule courts fast/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: /feature progress toward the final/i }).length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByText('Courts + fields')
        .some((element) => element.closest('ul')?.classList.contains('landing-operation-point-list')),
    ).toBe(true);
    expect(
      screen
        .getAllByText(/schedule courts fast/i)
        .some((element) => element.closest('article')?.getAttribute('style')?.includes('--landing-feature-theme')),
    ).toBe(true);
    const staticFeatureCard = screen
      .getAllByText(/schedule courts fast/i)
      .map((element) => element.closest('article'))
      .find((article) => article?.hasAttribute('data-mobile-feature-card'));
    expect(staticFeatureCard).toHaveAttribute('data-mobile-feature-card', 'true');
    expect(
      screen
        .getAllByAltText('Web field and scheduling view')
        .some((image) => image.closest('.landing-operation-preview-crop')),
    ).toBe(true);
    await waitFor(() => expect(staticFeatureCard).toHaveClass('is-visible'));
    expect(screen.getAllByAltText('Web field and scheduling view')[0].closest('.landing-surface-soft')).toBeNull();
    expect(screen.getAllByAltText('Mobile schedule view')[0].closest('.landing-surface-soft')).toBeNull();
    expect(screen.getAllByAltText('Web field and scheduling view').length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('Web team management and roster view').length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('Web payment flow and checkout summary').length).toBeGreaterThan(0);
  });

  it('reveals observed feature cards in progressive order and removes DOM markers on teardown', () => {
    installIntersectionObserver();

    const { container, unmount } = render(<LandingPage />);
    const { operations, cards } = getStaticOperations(container);
    const observer = intersectionObservers[0];

    expect(operations).toHaveClass('is-reveal-ready');
    expect(cards.length).toBeGreaterThan(3);
    expect(cards.every((card) => !card.classList.contains('is-visible'))).toBe(
      true,
    );
    expect(intersectionObservers).toHaveLength(1);
    expect(observer.options).toEqual({
      rootMargin: '0px 0px -14% 0px',
      threshold: 0.2,
    });
    expect(observer.observe.mock.calls.map(([card]) => card)).toEqual(cards);

    observer.callback(
      [
        {
          isIntersecting: true,
          target: cards[2],
        } as IntersectionObserverEntry,
      ],
      observer as unknown as IntersectionObserver,
    );

    expect(
      cards.slice(0, 3).every((card) => card.classList.contains('is-visible')),
    ).toBe(true);
    expect(
      cards.slice(3).every((card) => !card.classList.contains('is-visible')),
    ).toBe(true);
    expect(observer.unobserve.mock.calls.map(([card]) => card)).toEqual(
      cards.slice(0, 3),
    );

    unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(operations).not.toHaveClass('is-reveal-ready');
    expect(cards.every((card) => !card.classList.contains('is-visible'))).toBe(
      true,
    );

    const remountedView = render(<LandingPage />);
    const remounted = getStaticOperations(remountedView.container);
    const remountedObserver = intersectionObservers[1];

    expect(intersectionObservers).toHaveLength(2);
    expect(remounted.operations).toHaveClass('is-reveal-ready');
    expect(
      remounted.cards.every((card) => !card.classList.contains('is-visible')),
    ).toBe(true);
    expect(remountedObserver.observe.mock.calls.map(([card]) => card)).toEqual(
      remounted.cards,
    );

    remountedView.unmount();
    expect(remountedObserver.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reveals every feature card immediately when reduced motion is preferred', () => {
    installMatchMedia(true);
    installIntersectionObserver();

    const { container, unmount } = render(<LandingPage />);
    const { operations, cards } = getStaticOperations(container);

    expect(operations).toHaveClass('is-reveal-ready');
    expect(cards.every((card) => card.classList.contains('is-visible'))).toBe(
      true,
    );
    expect(intersectionObservers).toHaveLength(0);

    unmount();

    expect(operations).not.toHaveClass('is-reveal-ready');
    expect(cards.every((card) => !card.classList.contains('is-visible'))).toBe(
      true,
    );
  });

  it('reveals every feature card immediately without IntersectionObserver', () => {
    const { container } = render(<LandingPage />);
    const { operations, cards } = getStaticOperations(container);

    expect(operations).toHaveClass('is-reveal-ready');
    expect(cards.every((card) => card.classList.contains('is-visible'))).toBe(
      true,
    );
    expect(intersectionObservers).toHaveLength(0);
  });

  it('stops observation when reduced-motion context changes and cleans the subscription', () => {
    const reducedMotion = installMatchMedia(false);
    installIntersectionObserver();

    const { container, unmount } = render(<LandingPage />);
    const { operations, cards } = getStaticOperations(container);
    const observer = intersectionObservers[0];
    const changeListener = reducedMotion.addEventListener.mock.calls[0]?.[1];

    expect(changeListener).toEqual(expect.any(Function));
    expect(cards.every((card) => !card.classList.contains('is-visible'))).toBe(
      true,
    );

    act(() => {
      reducedMotion.setMatches(true);
    });

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(cards.every((card) => card.classList.contains('is-visible'))).toBe(
      true,
    );

    unmount();

    expect(reducedMotion.removeEventListener).toHaveBeenCalledWith(
      'change',
      changeListener,
    );
    expect(operations).not.toHaveClass('is-reveal-ready');
    expect(cards.every((card) => !card.classList.contains('is-visible'))).toBe(
      true,
    );
  });

  it('presents signable document creation for rentals, events, and teams', () => {
    render(<LandingPage />);

    expect(screen.getAllByText(/documents signed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/waivers/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/clearance/i).length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('Web signable document creation screen').length).toBeGreaterThan(0);
  });

  it('opens and closes the mobile navigation menu', () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));

    expect(screen.getAllByRole('link', { name: /^platform$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /close navigation menu/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close navigation menu/i }));

    expect(screen.queryByRole('button', { name: /close navigation menu/i })).not.toBeInTheDocument();
  });
});
