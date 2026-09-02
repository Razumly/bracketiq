import { createContext, useContext, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { AIAssistantDrawer } from '../AIAssistantDrawer';
import type {
  AgentActivePageContext,
  AgentChatLoadResponse,
  AgentChatSendResponse,
  AgentConfirmResponse,
  AgentClientAction,
  AgentClientActionResult,
} from '@/lib/agent/types';

const mockFetch = jest.fn();
const mockUseApp = jest.fn();
const mockUsePathname = jest.fn();
const mockDispatchClientActions = jest.fn();
const mockRefreshActivePage = jest.fn();
const mockCloseAssistant = jest.fn();

type TestAgentContextValue = {
  activePageContext: AgentActivePageContext | null;
  closeAssistant: () => void;
  dispatchClientActions: (actions: AgentClientAction[]) => Promise<AgentClientActionResult>;
  isAssistantOpen: boolean;
  refreshActivePage: () => Promise<void>;
};

const mockAgentContextProvider = createContext<TestAgentContextValue | null>(null);

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));
jest.mock('@/app/providers', () => ({
  useApp: () => mockUseApp(),
}));
jest.mock('@/context/AgentContext', () => ({
  useAgentContext: () => {
    const context = useContext(mockAgentContextProvider);
    if (!context) throw new Error('Missing test Agent context.');
    return context;
  },
}));

const loadResponse = (overrides: Partial<AgentChatLoadResponse> = {}): AgentChatLoadResponse => ({
  conversationId: 'conversation_1',
  messages: [
    {
      id: 'assistant_1',
      role: 'assistant',
      content: 'Loaded assistant response.',
    },
  ],
  pendingConfirmations: [],
  isGuest: false,
  canUseActions: true,
  ...overrides,
});

const sendResponse = (overrides: Partial<AgentChatSendResponse> = {}): AgentChatSendResponse => ({
  conversationId: 'conversation_1',
  reply: 'The assistant completed the request.',
  pendingConfirmations: [],
  changes: [],
  clientActions: [],
  ...overrides,
});

const confirmResponse = (overrides: Partial<AgentConfirmResponse> = {}): AgentConfirmResponse => ({
  reply: 'The confirmation is complete.',
  status: 'executed',
  changes: [],
  ...overrides,
});

const response = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Request failed',
    text: async () => JSON.stringify(body),
  }) as Response;
const textResponse = (body: string, status: number): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Request failed',
    text: async () => body,
  }) as Response;
const mockRendered = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => [rect],
  });
};

function DrawerHarness({
  enabled = true,
  activePageContext = null,
  responsive = false,
}: {
  enabled?: boolean;
  activePageContext?: AgentActivePageContext | null;
  responsive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const agentContext: TestAgentContextValue = {
    activePageContext,
    closeAssistant: () => {
      mockCloseAssistant();
      setOpen(false);
    },
    dispatchClientActions: mockDispatchClientActions,
    isAssistantOpen: open,
    refreshActivePage: mockRefreshActivePage,
  };

  return (
    <mockAgentContextProvider.Provider value={agentContext}>
      {responsive ? (
        <>
          <button
            type="button"
            aria-label="Open AI assistant"
            style={{ display: mobile ? 'none' : 'inline-flex' }}
            onClick={() => {
              setOpen(true);
              setMobile(true);
            }}
          >
            Desktop AI launcher
          </button>
          <button
            type="button"
            aria-label="Open navigation menu"
            style={{ display: mobile ? 'inline-flex' : 'none' }}
          >
            Mobile navigation launcher
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Open assistant
        </button>
      )}
      <AIAssistantDrawer enabled={enabled} />
    </mockAgentContextProvider.Provider>
  );
}

function renderDrawer(options: {
  enabled?: boolean;
  activePageContext?: AgentActivePageContext | null;
  guest?: boolean;
  responsive?: boolean;
} = {}) {
  mockUsePathname.mockReturnValue('/events/event_42/schedule');
  mockUseApp.mockReturnValue({
    loading: false,
    isAuthenticated: !options.guest,
    isGuest: Boolean(options.guest),
  });
  mockDispatchClientActions.mockResolvedValue({ applied: 0, errors: [] });
  mockRefreshActivePage.mockResolvedValue(undefined);
  return render(
    <DrawerHarness
      enabled={options.enabled}
      activePageContext={options.activePageContext}
      responsive={options.responsive}
    />,
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseApp.mockReset();
  mockUsePathname.mockReset();
  mockDispatchClientActions.mockReset();
  mockRefreshActivePage.mockReset();
  mockCloseAssistant.mockReset();
  globalThis.fetch = mockFetch as typeof fetch;
});

describe('AIAssistantDrawer', () => {
  it('does not load while closed and loads only once across reopen', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(response(loadResponse()));
    renderDrawer();

    expect(mockFetch).not.toHaveBeenCalled();

    const trigger = screen.getByRole('button', { name: 'Open assistant' });
    trigger.focus();
    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: /ai assistant/i })).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch.mock.calls[0][0]).toBe('/api/agent/chat');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'GET' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /ai assistant/i })).not.toBeInTheDocument());
    await user.click(trigger);
    expect(await screen.findByText('Loaded assistant response.')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on an enabled in-sheet control while the first GET is pending', async () => {
    const user = userEvent.setup();
    let resolveLoad: ((value: Response) => void) | undefined;
    mockFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveLoad = resolve;
    }));
    renderDrawer();

    const trigger = screen.getByRole('button', { name: 'Open assistant' });
    trigger.focus();
    await user.click(trigger);
    const input = await screen.findByRole('textbox', { name: /ask the ai assistant/i });
    expect(await screen.findByText('Loading chat...')).toBeInTheDocument();
    expect(input).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());

    resolveLoad?.(response(loadResponse()));
    expect(await screen.findByText('Loaded assistant response.')).toBeInTheDocument();
  });

  it('shows a plain-text load error once without retrying in a loop', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(textResponse('AI assistant is not configured.', 503));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('AI assistant is not configured.');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('posts a new chat request and renders the returned conversation', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(response(loadResponse()))
      .mockResolvedValueOnce(response(loadResponse({
        conversationId: 'conversation_2',
        messages: [{ id: 'assistant_new', role: 'assistant', content: 'New conversation.' }],
      })));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Loaded assistant response.');
    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(await screen.findByText('New conversation.')).toBeInTheDocument();
    expect(mockFetch.mock.calls[1][0]).toBe('/api/agent/chat/new');
    expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('sends the message and exact page context, dispatches client actions, and refreshes changed pages', async () => {
    const user = userEvent.setup();
    const activePageContext: AgentActivePageContext = {
      kind: 'event_schedule',
      eventId: 'event_42',
      eventName: 'Autumn Classic',
      activeTab: 'matches',
      hasUnsavedChanges: true,
    };
    const clientAction: AgentClientAction = {
      type: 'schedule.match.update',
      eventId: 'event_42',
      matchId: 'match_7',
      updates: { fieldId: 'field_2' },
      summary: 'Move match 7 to Field 2.',
    };
    mockFetch
      .mockResolvedValueOnce(response(loadResponse()))
      .mockResolvedValueOnce(response(sendResponse({
        reply: 'I drafted that change.',
        changes: [{ type: 'schedule', eventId: 'event_42', operation: 'update' }],
        clientActions: [clientAction],
      })));
    mockDispatchClientActions.mockResolvedValue({ applied: 1, errors: [] });
    renderDrawer({ activePageContext });

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Loaded assistant response.');
    const input = screen.getByRole('textbox', { name: /ask the ai assistant/i });
    await user.type(input, 'Move match 7 to Field 2');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('I drafted that change.')).toBeInTheDocument();
    const sendCall = mockFetch.mock.calls[1];
    expect(sendCall[0]).toBe('/api/agent/chat');
    expect(sendCall[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(sendCall[1].body)).toEqual({
      message: 'Move match 7 to Field 2',
      pageContext: {
        pathname: '/events/event_42/schedule',
        auth: { isAuthenticated: true, isGuest: false },
        page: activePageContext,
      },
    });
    expect(mockDispatchClientActions).toHaveBeenCalledWith([clientAction]);
    expect(mockRefreshActivePage).toHaveBeenCalledTimes(1);
  });

  it('reports recoverable client-action errors after the assistant reply', async () => {
    const user = userEvent.setup();
    const clientAction: AgentClientAction = {
      type: 'schedule.match.update',
      eventId: 'event_42',
      matchId: 'match_7',
      updates: { fieldId: 'field_2' },
      summary: 'Move match 7 to Field 2.',
    };
    mockFetch
      .mockResolvedValueOnce(response(loadResponse()))
      .mockResolvedValueOnce(response(sendResponse({ clientActions: [clientAction] })));
    renderDrawer();
    mockDispatchClientActions.mockResolvedValue({ applied: 0, errors: ['The match is locked.'] });

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Loaded assistant response.');
    const input = screen.getByRole('textbox', { name: /ask the ai assistant/i });
    await user.type(input, 'Apply the draft');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('I could not apply the draft changes: The match is locked.')).toBeInTheDocument();
    expect(mockDispatchClientActions).toHaveBeenCalledWith([clientAction]);
  });

  it('posts confirmation payloads, keeps save-required confirmations, and removes completed confirmations', async () => {
    const user = userEvent.setup();
    const pending = {
      id: 'confirmation_1',
      toolName: 'update_schedule',
      summary: 'Update the event schedule.',
      expiresAt: '2026-09-01T20:00:00.000Z',
    };
    mockFetch
      .mockResolvedValueOnce(response(loadResponse({ pendingConfirmations: [pending] })))
      .mockResolvedValueOnce(response(confirmResponse({
        reply: 'The draft is ready to save.',
        status: 'save_required',
      })))
      .mockResolvedValueOnce(response(confirmResponse({
        reply: 'The draft was saved.',
        status: 'executed',
        changes: [{ type: 'schedule', eventId: 'event_42', operation: 'update' }],
      })));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Update the event schedule.');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('The draft is ready to save.')).toBeInTheDocument();
    expect(screen.getByText('Update the event schedule.')).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      confirmationId: 'confirmation_1',
      confirmed: true,
      pageContext: {
        pathname: '/events/event_42/schedule',
        auth: { isAuthenticated: true, isGuest: false },
        page: null,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('The draft was saved.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Update the event schedule.')).not.toBeInTheDocument());
    expect(mockRefreshActivePage).toHaveBeenCalledTimes(1);
  });

  it('sends a cancellation confirmation body and removes the cancelled item', async () => {
    const user = userEvent.setup();
    const pending = {
      id: 'confirmation_cancel',
      toolName: 'update_schedule',
      summary: 'Discard this schedule draft.',
      expiresAt: '2026-09-01T20:00:00.000Z',
    };
    mockFetch
      .mockResolvedValueOnce(response(loadResponse({ pendingConfirmations: [pending] })))
      .mockResolvedValueOnce(response(confirmResponse({
        reply: 'The draft was cancelled.',
        status: 'cancelled',
      })));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Discard this schedule draft.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('The draft was cancelled.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Discard this schedule draft.')).not.toBeInTheDocument());
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      confirmationId: 'confirmation_cancel',
      confirmed: false,
      pageContext: {
        pathname: '/events/event_42/schedule',
        auth: { isAuthenticated: true, isGuest: false },
        page: null,
      },
    });
  });

  it('disables confirmation actions while the request is pending and keeps the drawer usable', async () => {
    const user = userEvent.setup();
    const pending = {
      id: 'confirmation_2',
      toolName: 'update_schedule',
      summary: 'Apply a pending schedule draft.',
      expiresAt: '2026-09-01T20:00:00.000Z',
    };
    let resolveConfirm: ((value: Response) => void) | undefined;
    mockFetch
      .mockResolvedValueOnce(response(loadResponse({ pendingConfirmations: [pending] })))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveConfirm = resolve;
      }));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Apply a pending schedule draft.');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    resolveConfirm?.(response(confirmResponse({ status: 'executed' })));
    await waitFor(() => expect(screen.queryByText('Apply a pending schedule draft.')).not.toBeInTheDocument());

    mockFetch.mockResolvedValueOnce(response(loadResponse()));
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(await screen.findByText('Loaded assistant response.')).toBeInTheDocument();
  });

  it('shows recoverable request errors and keeps the drawer usable', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(response(loadResponse()))
      .mockResolvedValueOnce(response({ error: 'The assistant is temporarily unavailable.' }, 503))
      .mockResolvedValueOnce(response(loadResponse({ messages: [{ id: 'assistant_retry', role: 'assistant', content: 'Recovered.' }] })));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Loaded assistant response.');
    const input = screen.getByRole('textbox', { name: /ask the ai assistant/i });
    await user.type(input, 'Try this request');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The assistant is temporarily unavailable.');
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(await screen.findByText('Recovered.')).toBeInTheDocument();
  });

  it('preserves Shift+Enter newlines, sends on Enter, and shows the guest footer', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(response(loadResponse()))
      .mockResolvedValueOnce(response(sendResponse({ reply: 'Sent with a newline.' })));
    renderDrawer({ guest: true });

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByText('Loaded assistant response.');
    const input = screen.getByRole('textbox', { name: /ask the ai assistant/i });
    await user.type(input, 'First line');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(input, 'Second line');
    expect(input).toHaveValue('First line\nSecond line');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Sent with a newline.')).toBeInTheDocument();
    expect(screen.getByText('Guest help mode')).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).message).toBe('First line\nSecond line');
  });

  it('shows the disabled state without loading and disables its controls', async () => {
    const user = userEvent.setup();
    renderDrawer({ enabled: false });

    await user.click(screen.getByRole('button', { name: 'Open assistant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /ask the ai assistant/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());
  });

  it('uses an enabled initial-focus target, closes through context, and restores opener focus', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(response(loadResponse()));
    renderDrawer();
    const trigger = screen.getByRole('button', { name: 'Open assistant' });
    mockRendered(trigger);
    trigger.focus();
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /ai assistant/i });
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText('Loaded assistant response.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockCloseAssistant).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    const input = screen.getByRole('textbox', { name: /ask the ai assistant/i });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'Keep this draft while the drawer is closed.');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockCloseAssistant).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /ask the ai assistant/i })).toHaveValue(
        'Keep this draft while the drawer is closed.',
      ),
    );
  });
  it('restores focus to the visible navigation launcher when a connected opener becomes hidden', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(response(loadResponse()));
    renderDrawer({ responsive: true });

    const assistantLauncher = screen.getByRole('button', { name: 'Open AI assistant' });
    const navigationLauncher = document.querySelector<HTMLElement>(
      '[aria-label="Open navigation menu"]',
    );
    if (!navigationLauncher) throw new Error('Missing navigation launcher fixture.');
    mockRendered(assistantLauncher);
    mockRendered(navigationLauncher);
    assistantLauncher.focus();
    await user.click(assistantLauncher);
    await screen.findByRole('dialog', { name: /ai assistant/i });
    await screen.findByText('Loaded assistant response.');

    expect(assistantLauncher.isConnected).toBe(true);
    expect(assistantLauncher).not.toBeVisible();
    expect(navigationLauncher).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(navigationLauncher).toHaveFocus());
  });

});
