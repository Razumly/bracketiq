import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';

import AppError from '../error';
import AppLoading from '../loading';
import { PageShell } from '@/components/layout/PageShell';

import RootLayout from '../layout';
import { headers } from 'next/headers';

type TestChildrenProps = {
  children?: React.ReactNode;
};

type TestRequestHeaders = {
  get(name: string): string | null;
};

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('next/font/google', () => ({
  Archivo: () => ({
    className: 'test-font',
    variable: 'test-heading-font',
    style: { fontFamily: 'test-font-family' },
  }),
  IBM_Plex_Mono: () => ({
    className: 'test-font',
    variable: 'test-mono-font',
    style: { fontFamily: 'test-font-family' },
  }),
  Roboto_Flex: () => ({
    className: 'test-font',
    variable: 'test-body-font',
    style: { fontFamily: 'test-font-family' },
  }),
}));

jest.mock('next/script', () => {
  const ReactRuntime = require('react');

  return {
    __esModule: true,
    default: ({ id }: { id?: string; src?: string }) =>
      ReactRuntime.createElement('span', {
        'data-testid': id ? `script-${id}` : 'script-analytics',
      }),
  };
});

jest.mock('../providers', () => {
  const ReactRuntime = require('react');

  return {
    Providers: ({ children }: TestChildrenProps) =>
      ReactRuntime.createElement('div', { 'data-testid': 'providers' }, children),
  };
});

jest.mock('@/context/AgentContext', () => {
  const ReactRuntime = require('react');

  return {
    AgentProvider: ({ children }: TestChildrenProps) =>
      ReactRuntime.createElement('div', { 'data-testid': 'agent-provider' }, children),
  };
});

jest.mock('@/context/ChatContext', () => {
  const ReactRuntime = require('react');

  return {
    ChatProvider: ({ children }: TestChildrenProps) =>
      ReactRuntime.createElement('div', { 'data-testid': 'chat-provider' }, children),
  };
});

jest.mock('@/context/ChatUIContext', () => {
  const ReactRuntime = require('react');

  return {
    ChatUIProvider: ({ children }: TestChildrenProps) =>
      ReactRuntime.createElement('div', { 'data-testid': 'chat-ui-provider' }, children),
  };
});

jest.mock('@/components/chat/ChatComponents', () => {
  const ReactRuntime = require('react');

  return {
    ChatComponents: () => ReactRuntime.createElement('div', { 'data-testid': 'chat-components' }),
  };
});

jest.mock('@/components/agent/AIAssistantDrawer', () => {
  const ReactRuntime = require('react');

  return {
    AIAssistantDrawer: ({ enabled }: { enabled?: boolean }) =>
      ReactRuntime.createElement('div', {
        'data-enabled': String(enabled),
        'data-testid': 'ai-assistant',
      }),
  };
});

jest.mock('@/components/auth/ProfileCompletionGate', () => {
  const ReactRuntime = require('react');

  return {
    __esModule: true,
    default: () => ReactRuntime.createElement('div', { 'data-testid': 'profile-gate' }),
  };
});

jest.mock('@/components/analytics/PostHogIdentity', () => {
  const ReactRuntime = require('react');

  return {
    __esModule: true,
    default: () => ReactRuntime.createElement('div', { 'data-testid': 'posthog-identity' }),
  };
});

jest.mock('@/components/layout/MobileAppPrompt', () => {
  const ReactRuntime = require('react');

  return {
    __esModule: true,
    default: () => ReactRuntime.createElement('div', { 'data-testid': 'mobile-app-prompt' }),
  };
});

jest.mock('@/components/layout/SiteFooter', () => {
  const ReactRuntime = require('react');

  return {
    __esModule: true,
    default: () => ReactRuntime.createElement('footer', { 'data-testid': 'site-footer' }),
  };
});

jest.mock('@/components/ui/sonner', () => {
  const ReactRuntime = require('react');

  return {
    Toaster: () => ReactRuntime.createElement('div', { 'data-testid': 'toaster' }),
  };
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    alt ? <span role="img" aria-label={alt} /> : <span aria-hidden="true" />,
}));

describe('shared shell boundaries', () => {
  const mockedHeaders = headers as unknown as jest.MockedFunction<
    () => Promise<TestRequestHeaders>
  >;
  const initialDisableChat = process.env.NEXT_PUBLIC_DISABLE_CHAT;
  const initialAgentEnabled = process.env.OPENAI_AGENT_ENABLED;

  afterEach(() => {
    if (initialDisableChat === undefined) {
      delete process.env.NEXT_PUBLIC_DISABLE_CHAT;
    } else {
      process.env.NEXT_PUBLIC_DISABLE_CHAT = initialDisableChat;
    }

    if (initialAgentEnabled === undefined) {
      delete process.env.OPENAI_AGENT_ENABLED;
    } else {
      process.env.OPENAI_AGENT_ENABLED = initialAgentEnabled;
    }

    mockedHeaders.mockReset();
    document.body.innerHTML = '';
  });

  const renderRootLayout = async ({
    surface = null,
    disableChat = false,
    disableAgent = false,
  }: {
    surface?: string | null;
    disableChat?: boolean;
    disableAgent?: boolean;
  } = {}) => {
    mockedHeaders.mockResolvedValue({
      get: () => surface,
    });

    if (disableChat) {
      process.env.NEXT_PUBLIC_DISABLE_CHAT = '1';
    } else {
      delete process.env.NEXT_PUBLIC_DISABLE_CHAT;
    }

    if (disableAgent) {
      process.env.OPENAI_AGENT_ENABLED = 'off';
    } else {
      delete process.env.OPENAI_AGENT_ENABLED;
    }

    const markup = renderToStaticMarkup(
      await RootLayout({
        children: React.createElement('div', { 'data-testid': 'route-child' }, 'Route content'),
      }),
    );
    const parsedDocument = new DOMParser().parseFromString(markup, 'text/html');
    document.body.innerHTML = parsedDocument.body.innerHTML;
  };

  it('keeps normal providers and global surfaces in the PageShell order', async () => {
    await renderRootLayout();

    const profileGate = screen.getByTestId('profile-gate');
    const posthogIdentity = screen.getByTestId('posthog-identity');
    const providers = screen.getByTestId('providers');
    const agentProvider = screen.getByTestId('agent-provider');
    const chatProvider = screen.getByTestId('chat-provider');
    const chatUiProvider = screen.getByTestId('chat-ui-provider');
    const routeChild = screen.getByTestId('route-child');
    const chatComponents = screen.getByTestId('chat-components');
    const aiAssistant = screen.getByTestId('ai-assistant');
    const footer = screen.getByTestId('site-footer');
    const mobileAppPrompt = screen.getByTestId('mobile-app-prompt');
    const toaster = screen.getByTestId('toaster');
    const shell = footer.parentElement;

    if (!shell) {
      throw new Error('The PageShell footer parent is missing.');
    }

    expect(providers).toContainElement(shell);
    expect(shell).toContainElement(agentProvider);
    expect(agentProvider).toContainElement(aiAssistant);
    expect(agentProvider.parentElement?.parentElement).toBe(shell);
    expect(agentProvider).toContainElement(chatProvider);
    expect(chatProvider).toContainElement(chatUiProvider);
    expect(routeChild.compareDocumentPosition(chatComponents) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(chatComponents.compareDocumentPosition(aiAssistant) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(aiAssistant.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(profileGate.compareDocumentPosition(posthogIdentity) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(posthogIdentity.compareDocumentPosition(shell) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(footer.compareDocumentPosition(mobileAppPrompt) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(mobileAppPrompt.compareDocumentPosition(toaster) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(aiAssistant).toHaveAttribute('data-enabled', 'true');
    expect(screen.getByTestId('script-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('script-google-analytics')).toBeInTheDocument();
  });

  it('keeps both disabled feature branches inside the normal shell', async () => {
    await renderRootLayout({ disableChat: true, disableAgent: true });

    const agentProvider = screen.getByTestId('agent-provider');
    const routeChild = screen.getByTestId('route-child');
    const aiAssistant = screen.getByTestId('ai-assistant');
    const footer = screen.getByTestId('site-footer');
    const mobileAppPrompt = screen.getByTestId('mobile-app-prompt');
    const toaster = screen.getByTestId('toaster');

    expect(agentProvider).toContainElement(routeChild);
    expect(agentProvider).toContainElement(aiAssistant);
    expect(screen.queryByTestId('chat-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-ui-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-components')).not.toBeInTheDocument();
    expect(routeChild.compareDocumentPosition(aiAssistant) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(aiAssistant).toHaveAttribute('data-enabled', 'false');
    expect(aiAssistant.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(footer.compareDocumentPosition(mobileAppPrompt) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(mobileAppPrompt.compareDocumentPosition(toaster) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('bypasses normal providers and global UI for the overlay surface', async () => {
    await renderRootLayout({ surface: 'overlay' });

    const routeChild = screen.getByTestId('route-child');
    expect(routeChild.parentElement).toBe(document.body);
    for (const marker of [
      'providers',
      'profile-gate',
      'posthog-identity',
      'agent-provider',
      'chat-provider',
      'chat-ui-provider',
      'chat-components',
      'ai-assistant',
      'site-footer',
      'mobile-app-prompt',
      'toaster',
      'script-analytics',
      'script-google-analytics',
    ]) {
      expect(screen.queryByTestId(marker)).not.toBeInTheDocument();
    }
  });

  it('renders the growing content region before the footer', () => {
    render(
      <PageShell footer={<footer>Support links</footer>}>
        <div data-testid="route-content">Organization content</div>
      </PageShell>,
    );

    const routeContent = screen.getByTestId('route-content');
    const footer = screen.getByRole('contentinfo');
    const shell = footer.parentElement;

    if (!shell) {
      throw new Error('The PageShell footer parent is missing.');
    }

    expect(routeContent.parentElement).toBe(shell.firstElementChild);
    expect(routeContent.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('uses the shared in-flow loading contract at the root segment', () => {
    render(<AppLoading />);

    expect(screen.getByRole('status', { name: 'Loading page...' })).toBeInTheDocument();
    expect(screen.getByText('Loading page...')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'BracketIQ logo' })).not.toBeInTheDocument();
  });

  it('wires the root error retry to reset without exposing error details', async () => {
    const user = userEvent.setup();
    const reset = jest.fn();
    const error = Object.assign(new Error('Private server message'), {
      digest: 'private-digest',
    });

    render(<AppError error={error} reset={reset} />);

    const heading = screen.getByRole('heading', { name: 'Something went wrong' });
    const alert = screen.getByRole('alert');
    const retryButton = screen.getByRole('button', { name: 'Try again' });

    expect(screen.getByRole('region', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('We could not load this page. Try again.');
    expect(alert).not.toContainElement(retryButton);
    expect(heading).toHaveFocus();
    expect(screen.queryByText('Private server message')).not.toBeInTheDocument();
    expect(screen.queryByText('private-digest')).not.toBeInTheDocument();

    await user.tab();
    expect(retryButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
