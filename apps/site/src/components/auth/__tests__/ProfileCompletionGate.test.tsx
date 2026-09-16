import { render } from '@testing-library/react';

const replaceMock = jest.fn();
const useAppMock = jest.fn();
const getHomePathForUserMock = jest.fn();
let mockPathname: string | null = '/discover';
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

jest.mock('@/lib/homePage', () => ({
  getHomePathForUser: (...args: unknown[]) => getHomePathForUserMock(...args),
}));

import ProfileCompletionGate from '../ProfileCompletionGate';

const completedUser = { $id: 'user_1', userName: 'complete-user' };
const authenticatedState = {
  user: completedUser,
  loading: false,
  isGuest: false,
  isAuthenticated: true,
  requiresProfileCompletion: false,
};

function renderGate() {
  return render(<ProfileCompletionGate />);
}

describe('ProfileCompletionGate', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useAppMock.mockReset();
    getHomePathForUserMock.mockReset();
    mockPathname = '/discover';
    mockSearchParams = new URLSearchParams();
    useAppMock.mockReturnValue(authenticatedState);
    getHomePathForUserMock.mockReturnValue('/discover');
  });

  it.each([
    ['loading', { loading: true }],
    ['guest', { isGuest: true }],
    ['signed out', { isAuthenticated: false }],
  ])('renders no UI and does not redirect for a %s viewer', (_state, state) => {
    useAppMock.mockReturnValue({ ...authenticatedState, ...state });

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders no UI and does not redirect without a pathname', () => {
    mockPathname = null;
    useAppMock.mockReturnValue({
      ...authenticatedState,
      requiresProfileCompletion: true,
    });

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects an incomplete authenticated viewer to profile completion with the current query', () => {
    mockPathname = '/find-events';
    mockSearchParams = new URLSearchParams('source=home&sport=volleyball');
    useAppMock.mockReturnValue({
      ...authenticatedState,
      requiresProfileCompletion: true,
    });

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith(
      '/complete-profile?next=%2Ffind-events%3Fsource%3Dhome%26sport%3Dvolleyball',
    );
  });

  it('does not redirect an incomplete authenticated viewer already on profile completion', () => {
    mockPathname = '/complete-profile';
    mockSearchParams = new URLSearchParams('next=%2Ffind-events');
    useAppMock.mockReturnValue({
      ...authenticatedState,
      requiresProfileCompletion: true,
    });

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('uses a safe next path when a completed viewer leaves profile completion', () => {
    mockPathname = '/complete-profile';
    mockSearchParams = new URLSearchParams('next=%2Ffind-events%3Fsource%3Dprofile');

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/find-events?source=profile');
  });

  it('uses the home path when profile completion has no safe next path', () => {
    mockPathname = '/complete-profile';
    getHomePathForUserMock.mockReturnValue('/organizations/org_42');

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/organizations/org_42');
  });

  it('uses discover when an authenticated viewer has no hydrated user for the home fallback', () => {
    mockPathname = '/complete-profile';
    useAppMock.mockReturnValue({
      ...authenticatedState,
      user: null,
    });

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/discover');
  });

  it.each([
    ['empty', ''],
    ['non-relative', 'events/today'],
    ['double slash', '//external.example/events'],
    ['control character', '/events/\u0000today'],
    ['login', '/login?next=%2Ffind-events'],
    ['complete profile', '/complete-profile?next=%2Ffind-events'],
  ])('rejects an unsafe %s next path and uses the home fallback', (_name, next) => {
    mockPathname = '/complete-profile';
    mockSearchParams = new URLSearchParams({ next });
    getHomePathForUserMock.mockReturnValue('/organizations/org_42');

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/organizations/org_42');
  });
});
