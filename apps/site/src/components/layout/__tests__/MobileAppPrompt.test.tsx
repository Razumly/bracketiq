import { act, fireEvent, render, screen, within } from '@testing-library/react';
import MobileAppPrompt, {
  isOnboardingPromptPath,
  supportsNativeIosSmartAppBanner,
} from '../MobileAppPrompt';

const IOS_SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const IOS_CHROME_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/135.0.7049.53 Mobile/15E148 Safari/604.1';
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36';
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15';
const IOS_STORE_URL = 'https://apps.apple.com/us/app/bracketiq/id6746649739';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.razumly.mvp';
const IOS_DEEP_LINK = 'mvp://discover';
const ANDROID_DEEP_LINK = 'razumly://mvp';
const DISMISSED_UNTIL_KEY = 'mvp_mobile_app_prompt_dismissed_until';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_NOW = new Date('2026-09-01T12:00:00.000Z').getTime();

let mockPathname = '/discover';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const originalWindow = window;
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(originalWindow, 'matchMedia');
const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(originalWindow.navigator, 'userAgent');
const originalMaxTouchPointsDescriptor = Object.getOwnPropertyDescriptor(
  originalWindow.navigator,
  'maxTouchPoints',
);
const originalStandaloneDescriptor = Object.getOwnPropertyDescriptor(originalWindow.navigator, 'standalone');
const promptEnvKeys = [
  'NEXT_PUBLIC_SHOW_APP_PROMPT',
  'NEXT_PUBLIC_MVP_IOS_APP_STORE_URL',
  'NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL',
  'NEXT_PUBLIC_MVP_IOS_DEEP_LINK',
  'NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK',
] as const;
const originalPromptEnv = promptEnvKeys.reduce<Record<string, string | undefined>>((snapshot, key) => {
  snapshot[key] = process.env[key];
  return snapshot;
}, {});

type BrowserOptions = {
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayModeStandalone?: boolean;
};

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}

function restorePromptEnv() {
  for (const key of promptEnvKeys) {
    const value = originalPromptEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function installBrowser({
  userAgent = ANDROID_USER_AGENT,
  maxTouchPoints = 5,
  standalone = false,
  displayModeStandalone = false,
}: BrowserOptions = {}) {
  Object.defineProperty(originalWindow.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(originalWindow.navigator, 'maxTouchPoints', {
    configurable: true,
    value: maxTouchPoints,
  });
  Object.defineProperty(originalWindow.navigator, 'standalone', {
    configurable: true,
    value: standalone,
  });
  Object.defineProperty(originalWindow, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn((query: string) => ({
      matches: query === '(display-mode: standalone)' && displayModeStandalone,
    }) as MediaQueryList),
  });
}

function restoreBrowser() {
  restoreProperty(originalWindow.navigator, 'userAgent', originalUserAgentDescriptor);
  restoreProperty(originalWindow.navigator, 'maxTouchPoints', originalMaxTouchPointsDescriptor);
  restoreProperty(originalWindow.navigator, 'standalone', originalStandaloneDescriptor);
  restoreProperty(originalWindow, 'matchMedia', originalMatchMediaDescriptor);
}

type LocationUrlRecord = {
  scheme: string;
  username: string;
  password: string;
  host: string | null;
  port: number | null;
  path: string[];
  query: string | null;
  fragment: string | null;
};

type LocationImplementation = {
  _locationObjectSetterNavigate: (url: LocationUrlRecord) => void;
};

const serializeURL = (require('whatwg-url') as {
  serializeURL: (url: LocationUrlRecord) => string;
}).serializeURL;

function installLocationRecorder() {
  const implementationSymbol = Object.getOwnPropertySymbols(originalWindow.location)[0];
  if (!implementationSymbol) {
    throw new Error('The jsdom location implementation is not available.');
  }

  const implementation = (
    originalWindow.location as unknown as { [key: symbol]: unknown }
  )[implementationSymbol] as LocationImplementation | undefined;
  if (!implementation) {
    throw new Error('The jsdom location implementation is not available.');
  }

  const assignments: string[] = [];
  jest.spyOn(implementation, '_locationObjectSetterNavigate').mockImplementation((url) => {
    assignments.push(serializeURL(url));
  });

  return {
    get href() {
      return assignments[assignments.length - 1] ?? originalWindow.location.href;
    },
  };
}

function renderPrompt(options?: BrowserOptions) {
  installBrowser(options);
  return render(<MobileAppPrompt />);
}

function revealPrompt() {
  act(() => {
    jest.advanceTimersByTime(0);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE_NOW);
  mockPathname = '/discover';
  process.env.NEXT_PUBLIC_SHOW_APP_PROMPT = '1';
  process.env.NEXT_PUBLIC_MVP_IOS_APP_STORE_URL = IOS_STORE_URL;
  process.env.NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL = ANDROID_STORE_URL;
  process.env.NEXT_PUBLIC_MVP_IOS_DEEP_LINK = IOS_DEEP_LINK;
  process.env.NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK = ANDROID_DEEP_LINK;
  originalWindow.localStorage.clear();
  installBrowser();
});

afterEach(() => {
  originalWindow.localStorage.clear();
  restorePromptEnv();
  restoreBrowser();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('MobileAppPrompt browser gating', () => {
  it('suppresses the custom prompt for iPhone Safari so the native banner is the only iOS prompt', () => {
    expect(supportsNativeIosSmartAppBanner(IOS_SAFARI_USER_AGENT, 5)).toBe(true);

    renderPrompt({ userAgent: IOS_SAFARI_USER_AGENT });
    revealPrompt();

    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
  });

  it('keeps the custom prompt available for non-Safari iOS browsers', () => {
    expect(supportsNativeIosSmartAppBanner(IOS_CHROME_USER_AGENT, 5)).toBe(false);

    renderPrompt({ userAgent: IOS_CHROME_USER_AGENT });
    revealPrompt();

    expect(screen.getByRole('region', { name: 'Mobile app prompt' })).toBeInTheDocument();
  });

  it('does not stack the mobile app prompt over either onboarding flow', () => {
    expect(isOnboardingPromptPath('/')).toBe(true);
    expect(isOnboardingPromptPath('/onboarding')).toBe(true);
    expect(isOnboardingPromptPath('/discover')).toBe(false);

    for (const path of ['/', '/onboarding']) {
      mockPathname = path;
      renderPrompt();
      revealPrompt();
      expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
    }
  });

  it('suppresses the prompt when the feature flag is disabled', () => {
    process.env.NEXT_PUBLIC_SHOW_APP_PROMPT = '0';

    renderPrompt();
    revealPrompt();

    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
  });

  it('suppresses the prompt for non-mobile browsers', () => {
    renderPrompt({ userAgent: DESKTOP_USER_AGENT, maxTouchPoints: 0 });
    revealPrompt();

    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
  });

  it.each([
    ['Android', ANDROID_USER_AGENT],
    ['non-Safari iOS', IOS_CHROME_USER_AGENT],
  ])('reveals for %s after the zero-delay timer', (_platform, userAgent) => {
    renderPrompt({ userAgent });

    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
    revealPrompt();

    const prompt = screen.getByRole('region', { name: 'Mobile app prompt' });
    expect(prompt).toBeInTheDocument();
    expect(within(prompt).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Not now',
      'Get App',
      'Open App',
    ]);
  });

  it.each([
    ['display-mode standalone', { displayModeStandalone: true }],
    ['installed iOS application mode', { standalone: true }],
  ])('suppresses the prompt in %s', (_mode, options) => {
    renderPrompt(options);
    revealPrompt();

    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
  });

  it('suppresses the prompt until the seven-day dismissal expires', () => {
    originalWindow.localStorage.setItem(DISMISSED_UNTIL_KEY, String(BASE_NOW + 1));

    renderPrompt();
    revealPrompt();

    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
  });

  it('reveals the prompt after a dismissal expires', () => {
    originalWindow.localStorage.setItem(DISMISSED_UNTIL_KEY, String(BASE_NOW - 1));

    renderPrompt();
    revealPrompt();

    expect(screen.getByRole('region', { name: 'Mobile app prompt' })).toBeInTheDocument();
  });

  it('writes exactly seven days and closes when the user selects Not now', () => {
    renderPrompt();
    revealPrompt();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(originalWindow.localStorage.getItem(DISMISSED_UNTIL_KEY)).toBe(
      String(BASE_NOW + DISMISS_DURATION_MS),
    );
    expect(screen.queryByRole('region', { name: 'Mobile app prompt' })).not.toBeInTheDocument();
  });

  it.each([
    ['iOS', IOS_CHROME_USER_AGENT, IOS_STORE_URL],
    ['Android', ANDROID_USER_AGENT, ANDROID_STORE_URL],
  ])('uses the %s store URL for the Get App action', (_platform, userAgent, expectedUrl) => {
    renderPrompt({ userAgent });
    revealPrompt();
    const location = installLocationRecorder();

    fireEvent.click(screen.getByRole('button', { name: 'Get App' }));

    expect(location.href).toBe(expectedUrl);
  });

  it.each([
    ['iOS', IOS_CHROME_USER_AGENT, IOS_DEEP_LINK, IOS_STORE_URL],
    ['Android', ANDROID_USER_AGENT, ANDROID_DEEP_LINK, ANDROID_STORE_URL],
  ])('assigns the %s deep link and falls back to its store after 1.2 seconds', (
    _platform,
    userAgent,
    expectedDeepLink,
    expectedStoreUrl,
  ) => {
    renderPrompt({ userAgent });
    revealPrompt();
    const location = installLocationRecorder();

    fireEvent.click(screen.getByRole('button', { name: 'Open App' }));

    expect(location.href).toBe(expectedDeepLink);
    act(() => {
      jest.advanceTimersByTime(1_199);
    });
    expect(location.href).toBe(expectedDeepLink);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(location.href).toBe(expectedStoreUrl);
  });
});
