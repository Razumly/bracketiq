import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createContext, useContext, useState } from 'react';

import { ChatDrawer } from '../ChatDrawer';

const useChatMock = jest.fn();
const useChatUIMock = jest.fn();
const usePathnameMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));


jest.mock('@/context/ChatContext', () => ({
  useChat: () => useChatMock(),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => useChatUIMock(),
}));
jest.mock('@/app/providers', () => ({
  useApp: () => ({ user: { $id: 'user_1' } }),
}));
const mockLottieControls = {
  stop: jest.fn(),
  goToAndStop: jest.fn(),
  goToAndPlay: jest.fn(),
};

jest.mock('lottie-react', () => ({
  __esModule: true,
  default: ({ lottieRef }: { lottieRef?: { current: unknown } }) => {
    if (lottieRef) {
      lottieRef.current = mockLottieControls;
    }
    return null;
  },
}));

const focusUIContext = createContext<Record<string, unknown> | null>(null);
const focusChatContext = createContext<Record<string, unknown> | null>(null);

function useFocusUIContext() {
  const context = useContext(focusUIContext);
  if (!context) {
    throw new Error('Missing focus UI context');
  }
  return context;
}

function useFocusChatContext() {
  const context = useContext(focusChatContext);
  if (!context) {
    throw new Error('Missing focus chat context');
  }
  return context;
}

function FocusHarness() {
  const [isChatListOpen, setChatListOpen] = useState(false);
  const [openChatWindows, setOpenChatWindows] = useState<string[]>([]);
  const chatUI = {
    isChatListOpen,
    openChatWindows,
    openChatList: () => setChatListOpen(true),
    closeChatList: () => setChatListOpen(false),
    openChatWindow: (chatId: string) => {
      setOpenChatWindows((previous) => (
        previous.includes(chatId) ? previous : [...previous, chatId]
      ));
    },
    closeChatWindow: (chatId: string) => {
      setOpenChatWindows((previous) => previous.filter((id) => id !== chatId));
    },
    closeAllChatWindows: () => setOpenChatWindows([]),
    isInviteModalOpen: false,
    setInviteModalOpen: () => {},
    isFloatingButtonVisible: !isChatListOpen && openChatWindows.length === 0,
  };
  const chat = {
    chatGroups: [{
      $id: 'chat_1',
      name: 'River City Operations',
      displayName: null,
      userIds: ['user_1', 'user_2'],
      hostId: 'user_1',
      unreadCount: 0,
    }],
    messages: { chat_1: [] },
    messagePagination: {
      chat_1: {
        initialized: true,
        loadingMore: false,
        nextIndex: 0,
        totalCount: 0,
        remainingCount: 0,
        hasMore: false,
        limit: 20,
      },
    },
    loading: false,
    loadMessages: async () => {},
    loadMoreMessages: async () => {},
    loadChatGroups: async () => {},
    markChatViewed: () => {},
    sendMessage: async () => true,
    createChatGroup: async () => {},
    ensureChatAccess: async () => true,
    chatTermsState: null,
    chatTermsLoading: false,
    chatTermsModalOpen: false,
    acceptChatTerms: async () => true,
    closeChatTermsModal: () => {},
    hideChatGroups: () => {},
  };

  return (
    <focusUIContext.Provider value={chatUI}>
      <focusChatContext.Provider value={chat}>
        <ChatDrawer />
      </focusChatContext.Provider>
    </focusUIContext.Provider>
  );
}

describe('ChatDrawer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    usePathnameMock.mockReturnValue('/discover');
    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: jest.fn(),
      chatTermsState: {
        version: '2026-06-10',
        url: '/terms',
        summary: ['There is no tolerance for objectionable content or abusive users.'],
        accepted: false,
        acceptedAt: null,
      },
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: jest.fn(),
      isFloatingButtonVisible: false,
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('refreshes inactive chat groups every 30 seconds', async () => {
    const loadMessagesMock = jest.fn().mockResolvedValue(undefined);
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const markChatViewedMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: loadMessagesMock,
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: markChatViewedMock,
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });

    render(<ChatDrawer />);

    await act(async () => {});
    expect(loadChatGroupsMock).toHaveBeenCalledWith({ silent: true });
    expect(loadChatGroupsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(loadChatGroupsMock).toHaveBeenCalledTimes(2);
    expect(loadChatGroupsMock).toHaveBeenNthCalledWith(2, { silent: true });
  });

  it('shows unread badge on floating chat button', async () => {
    useChatMock.mockReturnValue({
      chatGroups: [{ $id: 'chat_1', unreadCount: 3 }],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: jest.fn(),
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: jest.fn(),
      isFloatingButtonVisible: true,
    });

    render(<ChatDrawer />);

    await act(async () => {});
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  it('portals the mobile launcher into the authenticated header slot', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    try {
      const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
      const openChatListMock = jest.fn();
      useChatMock.mockReturnValue({
        chatGroups: [],
        loadMessages: jest.fn().mockResolvedValue(undefined),
        loadChatGroups: loadChatGroupsMock,
        markChatViewed: jest.fn(),
        chatTermsState: null,
        chatTermsLoading: false,
        chatTermsModalOpen: false,
        acceptChatTerms: jest.fn().mockResolvedValue(undefined),
        closeChatTermsModal: jest.fn(),
      });
      useChatUIMock.mockReturnValue({
        isChatListOpen: false,
        openChatWindows: [],
        openChatList: openChatListMock,
        isFloatingButtonVisible: true,
      });

      const { container } = render(
        <>
          <div id="mobile-navigation-chat-action" data-mobile-chat-action-slot />
          <ChatDrawer />
        </>,
      );
      const mobileChatSlot = container.querySelector('#mobile-navigation-chat-action');
      expect(mobileChatSlot).not.toBeNull();

      const launcher = await screen.findByRole('button', { name: 'Open chat' });
      expect(mobileChatSlot).toContainElement(launcher);

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.click(launcher);
      await waitFor(() => expect(loadChatGroupsMock).toHaveBeenCalledWith());
      expect(openChatListMock).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
  it('keeps the mobile chat list mounted behind a conversation and restores row focus', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    try {
      useChatMock.mockImplementation(useFocusChatContext);
      useChatUIMock.mockImplementation(useFocusUIContext);
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(<FocusHarness />);
      await act(async () => {});

      await user.click(await screen.findByRole('button', { name: 'Open chat' }));
      const chatList = await screen.findByRole('dialog', { name: 'Messages' });
      const row = await screen.findByRole('button', {
        name: 'Open River City Operations, 0 unread messages',
      });
      await user.click(row);

      const chatWindow = await screen.findByRole('dialog', { name: 'River City Operations' });
      expect(chatList).toBeInTheDocument();
      expect(chatList.compareDocumentPosition(chatWindow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const closeWindow = await screen.findByRole('button', { name: 'Close chat' });
      await waitFor(() => expect(closeWindow).toHaveFocus());
      await user.keyboard('{Escape}');
      await waitFor(() => expect(chatWindow).not.toBeInTheDocument());
      expect(chatList).toBeInTheDocument();
      expect(row).toHaveFocus();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });



  it('marks chats as viewed when windows are open', async () => {
    const markChatViewedMock = jest.fn();
    const loadMessagesMock = jest.fn().mockResolvedValue(undefined);

    useChatMock.mockReturnValue({
      chatGroups: [{ $id: 'chat_1', name: 'Weekend League', userIds: ['user_1'], hostId: 'user_1' }],
      messages: { chat_1: [] },
      messagePagination: {
        chat_1: {
          initialized: true,
          loadingMore: false,
          nextIndex: 0,
          totalCount: 0,
          remainingCount: 0,
          hasMore: false,
          limit: 20,
        },
      },
      sendMessage: jest.fn().mockResolvedValue(true),
      loadMoreMessages: jest.fn().mockResolvedValue(undefined),
      loadMessages: loadMessagesMock,
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: markChatViewedMock,
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: jest.fn().mockResolvedValue(true),
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: ['chat_1'],
      openChatList: jest.fn(),
      isFloatingButtonVisible: false,
      closeChatWindow: jest.fn(),
    });

    render(<ChatDrawer />);
    await act(async () => {});

    expect(markChatViewedMock).toHaveBeenCalledWith('chat_1');
    expect(loadMessagesMock).toHaveBeenCalledWith('chat_1');
  });

  it('opens the chat list without requiring chat terms consent', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const ensureChatAccessMock = jest.fn().mockResolvedValue(false);
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const openChatListMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: jest.fn(),
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      ensureChatAccess: ensureChatAccessMock,
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: openChatListMock,
      isFloatingButtonVisible: true,
    });

    render(<ChatDrawer />);
    await act(async () => {});

    await user.click(screen.getByLabelText('Open chat'));

    await waitFor(() => {
      expect(loadChatGroupsMock).toHaveBeenCalledWith();
    });
    expect(ensureChatAccessMock).not.toHaveBeenCalled();
    expect(openChatListMock).toHaveBeenCalled();
  });

  it('records terms agreement separately from opening the chat list', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const ensureChatAccessMock = jest.fn().mockResolvedValue(false);
    const acceptChatTermsMock = jest.fn().mockResolvedValue(true);
    const loadChatGroupsMock = jest.fn().mockResolvedValue(undefined);
    const openChatListMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: jest.fn(),
      chatTermsState: {
        version: '2026-06-10',
        url: '/terms',
        summary: ['There is no tolerance for objectionable content or abusive users.'],
        accepted: false,
        acceptedAt: null,
      },
      chatTermsLoading: false,
      chatTermsModalOpen: true,
      ensureChatAccess: ensureChatAccessMock,
      acceptChatTerms: acceptChatTermsMock,
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue({
      isChatListOpen: false,
      openChatWindows: [],
      openChatList: openChatListMock,
      isFloatingButtonVisible: true,
    });

    render(<ChatDrawer />);
    await act(async () => {});

    await user.click(screen.getByLabelText('Open chat'));
    await user.click(screen.getByText('Agree'));

    await waitFor(() => {
      expect(acceptChatTermsMock).toHaveBeenCalled();
    });
    expect(ensureChatAccessMock).not.toHaveBeenCalled();
    expect(loadChatGroupsMock).toHaveBeenCalledWith();
    expect(openChatListMock).toHaveBeenCalled();
  });

  it('returns focus through an unmounted chat window and then back to the launcher', async () => {
    useChatMock.mockImplementation(useFocusChatContext);
    useChatUIMock.mockImplementation(useFocusUIContext);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<FocusHarness />);
    await act(async () => {});

    const launcher = await screen.findByRole('button', { name: 'Open chat' });
    launcher.focus();
    await user.click(launcher);

    const row = await screen.findByRole('button', {
      name: 'Open River City Operations, 0 unread messages',
    });
    await user.click(row);

    const chatWindow = await screen.findByRole('dialog', { name: 'River City Operations' });
    const closeWindow = screen.getByRole('button', { name: 'Close chat' });
    await waitFor(() => expect(closeWindow).toHaveFocus());

    await user.keyboard('{Escape}');
    await act(async () => {});
    expect(chatWindow).not.toBeInTheDocument();
    const windowFocusStates = [document.activeElement === row];
    await act(async () => {
      jest.advanceTimersByTime(16);
    });
    windowFocusStates.push(document.activeElement === row);
    await act(async () => {
      jest.advanceTimersByTime(284);
    });
    windowFocusStates.push(document.activeElement === row);

    await user.click(screen.getByRole('button', { name: 'Close chat list' }));
    const launcherAfterListClose = await screen.findByRole('button', { name: 'Open chat' });
    await act(async () => {});
    const listFocusStates = [document.activeElement === launcherAfterListClose];
    await act(async () => {
      jest.advanceTimersByTime(16);
    });
    listFocusStates.push(document.activeElement === launcherAfterListClose);
    await act(async () => {
      jest.advanceTimersByTime(284);
    });
    listFocusStates.push(document.activeElement === launcherAfterListClose);

    expect({
      windowFocusStates,
      listFocusStates,
    }).toEqual({
      windowFocusStates: [true, true, true],
      listFocusStates: [true, true, true],
    });

  });
  it('preserves the pre-request chat trigger when list loading resolves', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    let resolveLoad!: () => void;
    const pendingLoad = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const loadChatGroupsMock = jest.fn((options?: { silent?: boolean }) => (
      options?.silent ? Promise.resolve() : pendingLoad
    ));
    const openChatListMock = jest.fn();
    const uiState = {
      isChatListOpen: false,
      openChatWindows: [] as string[],
      openChatList: openChatListMock,
      isFloatingButtonVisible: true,
      closeChatList: jest.fn(),
      closeChatWindow: jest.fn(),
      setInviteModalOpen: jest.fn(),
    };

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: loadChatGroupsMock,
      markChatViewed: jest.fn(),
      chatTermsState: null,
      chatTermsLoading: false,
      chatTermsModalOpen: false,
      acceptChatTerms: jest.fn().mockResolvedValue(undefined),
      closeChatTermsModal: jest.fn(),
    });
    useChatUIMock.mockReturnValue(uiState);

    const rendered = render(
      <>
        <button type="button">Outside</button>
        <ChatDrawer />
      </>,
    );
    await act(async () => {});

    const trigger = screen.getByRole('button', { name: 'Open chat' });
    trigger.focus();
    await user.click(trigger);
    screen.getByRole('button', { name: 'Outside' }).focus();

    resolveLoad();
    await waitFor(() => expect(openChatListMock).toHaveBeenCalledTimes(1));

    useChatUIMock.mockReturnValue({ ...uiState, isChatListOpen: true });
    rendered.rerender(
      <>
        <button type="button">Outside</button>
        <ChatDrawer />
      </>,
    );

    useChatUIMock.mockReturnValue(uiState);
    rendered.rerender(
      <>
        <button type="button">Outside</button>
        <ChatDrawer />
      </>,
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps the Lottie chat animation stopped when reduced motion is preferred', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });

    try {
      useChatMock.mockReturnValue({
        chatGroups: [],
        loadMessages: jest.fn().mockResolvedValue(undefined),
        loadChatGroups: jest.fn().mockResolvedValue(undefined),
        markChatViewed: jest.fn(),
        chatTermsState: null,
        chatTermsLoading: false,
        chatTermsModalOpen: false,
        acceptChatTerms: jest.fn().mockResolvedValue(undefined),
        closeChatTermsModal: jest.fn(),
      });
      useChatUIMock.mockReturnValue({
        isChatListOpen: false,
        openChatWindows: [],
        openChatList: jest.fn(),
        isFloatingButtonVisible: true,
      });

      render(<ChatDrawer />);
      await act(async () => {});

      mockLottieControls.goToAndPlay.mockClear();
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Open chat' }));

      expect(mockLottieControls.goToAndPlay).not.toHaveBeenCalled();
      expect(mockLottieControls.stop).toHaveBeenCalled();
      expect(mockLottieControls.goToAndStop).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it('shows the chat terms modal and records agreement', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const acceptChatTermsMock = jest.fn().mockResolvedValue(undefined);
    const closeChatTermsModalMock = jest.fn();

    useChatMock.mockReturnValue({
      chatGroups: [],
      loadMessages: jest.fn().mockResolvedValue(undefined),
      loadChatGroups: jest.fn().mockResolvedValue(undefined),
      markChatViewed: jest.fn(),
      chatTermsState: {
        version: '2026-06-10',
        url: '/terms',
        summary: ['There is no tolerance for objectionable content or abusive users.'],
        accepted: false,
        acceptedAt: null,
      },
      chatTermsLoading: false,
      chatTermsModalOpen: true,
      ensureChatAccess: jest.fn().mockResolvedValue(false),
      acceptChatTerms: acceptChatTermsMock,
      closeChatTermsModal: closeChatTermsModalMock,
    });

    render(<ChatDrawer />);
    await act(async () => {});

    expect(screen.getByText('Agree to the Terms and EULA')).toBeInTheDocument();
    expect(screen.getByText('There is no tolerance for objectionable content or abusive users.')).toBeInTheDocument();

    await user.click(screen.getByText('Agree'));
    await waitFor(() => {
      expect(acceptChatTermsMock).toHaveBeenCalled();
    });

    await user.click(screen.getByText('Not now'));
    expect(closeChatTermsModalMock).toHaveBeenCalled();
  });
});
