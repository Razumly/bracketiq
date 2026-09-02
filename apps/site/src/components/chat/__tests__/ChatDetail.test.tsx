import type { ReactNode } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ChatDetail } from '../ChatDetail';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const useChatMock = jest.fn();
const useChatUIMock = jest.fn();
const useAppMock = jest.fn();

jest.mock('@/context/ChatContext', () => ({
  useChat: () => useChatMock(),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => useChatUIMock(),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

describe('ChatDetail', () => {
  const sendMessageMock = jest.fn();
  const loadMoreMessagesMock = jest.fn();
  const closeChatWindowMock = jest.fn();

  const buildBaseChatContext = () => ({
    messages: {
      chat_1: [
        {
          $id: 'm_1',
          userId: 'user_2',
          body: 'hello',
          chatId: 'chat_1',
          sentTime: '2026-03-06T00:00:00.000Z',
          readByIds: ['user_2'],
        },
      ],
    },
    messagePagination: {
      chat_1: {
        initialized: true,
        loadingMore: false,
        nextIndex: 1,
        totalCount: 5,
        remainingCount: 4,
        hasMore: true,
        limit: 20,
      },
    },
    sendMessage: sendMessageMock,
    loadMoreMessages: loadMoreMessagesMock,
    chatGroups: [{ $id: 'chat_1', name: 'Weekend League', userIds: ['user_1', 'user_2'], hostId: 'user_1' }],
  });

  beforeEach(() => {
    sendMessageMock.mockReset();
    loadMoreMessagesMock.mockReset();
    closeChatWindowMock.mockReset();

    useAppMock.mockReturnValue({
      user: { $id: 'user_1' },
    });
    useChatUIMock.mockReturnValue({
      closeChatWindow: closeChatWindowMock,
    });
    useChatMock.mockReturnValue(buildBaseChatContext());
  });

  it('renders loading indicator when older messages are being fetched', () => {
    const base = buildBaseChatContext();
    useChatMock.mockReturnValue({
      ...base,
      messagePagination: {
        chat_1: {
          initialized: true,
          loadingMore: true,
          nextIndex: 1,
          totalCount: 5,
          remainingCount: 4,
          hasMore: true,
          limit: 20,
        },
      },
    });

    renderWithMantine(<ChatDetail chatId="chat_1" />);

    expect(screen.getByText('Loading more messages...')).toBeInTheDocument();
  });

  it('loads older messages when scrolling near the top and more history exists', () => {
    const { container } = renderWithMantine(<ChatDetail chatId="chat_1" />);
    const messageList = container.querySelector('.overflow-y-auto') as HTMLDivElement;

    Object.defineProperty(messageList, 'scrollTop', {
      value: 0,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(messageList, 'scrollHeight', {
      value: 640,
      configurable: true,
    });

    fireEvent.scroll(messageList);

    expect(loadMoreMessagesMock).toHaveBeenCalledWith('chat_1');
  });

  it('does not load older messages when there is no remaining history', () => {
    const base = buildBaseChatContext();
    useChatMock.mockReturnValue({
      ...base,
      messagePagination: {
        chat_1: {
          initialized: true,
          loadingMore: false,
          nextIndex: 2,
          totalCount: 2,
          remainingCount: 0,
          hasMore: false,
          limit: 20,
        },
      },
    });

    const { container } = renderWithMantine(<ChatDetail chatId="chat_1" />);
    const messageList = container.querySelector('.overflow-y-auto') as HTMLDivElement;

    Object.defineProperty(messageList, 'scrollTop', {
      value: 0,
      configurable: true,
      writable: true,
    });

    fireEvent.scroll(messageList);

    expect(loadMoreMessagesMock).not.toHaveBeenCalled();
  });

  it('keeps message input when send is blocked by terms consent', async () => {
    sendMessageMock.mockResolvedValue(false);
    renderWithMantine(<ChatDetail chatId="chat_1" />);

    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Blocked draft' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('chat_1', 'Blocked draft');
    });
    expect(input.value).toBe('Blocked draft');
  });

  it('clears message input after a message is sent', async () => {
    sendMessageMock.mockResolvedValue(true);
    renderWithMantine(<ChatDetail chatId="chat_1" />);

    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Sent draft' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('chat_1', 'Sent draft');
    });
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });
  it('returns focus to the connected chat entry when Escape unmounts the window', async () => {
    let open = false;
    let rerender: (ui: ReactNode) => void = () => {};
    const view = renderWithMantine(
      <button type="button" id="chat-entry" data-chat-entry-id="chat_1">Open chat</button>,
    );
    rerender = view.rerender;
    const opener = document.getElementById('chat-entry') as HTMLButtonElement;
    opener.focus();

    closeChatWindowMock.mockImplementation(() => {
      open = false;
      rerender(
        <>
          <button type="button" id="chat-entry" data-chat-entry-id="chat_1">Open chat</button>
          {open ? <ChatDetail chatId="chat_1" /> : null}
        </>,
      );
    });

    open = true;
    rerender(
      <>
        <button type="button" id="chat-entry" data-chat-entry-id="chat_1">Open chat</button>
        <ChatDetail chatId="chat_1" />
      </>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Weekend League' });
    const closeButton = screen.getByRole('button', { name: 'Close chat' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(closeChatWindowMock).toHaveBeenCalledWith('chat_1');
    await waitFor(() => expect(document.getElementById('chat-entry')).toHaveFocus());
  });


  it('names the modeless window, focuses its close action, and closes on local Escape', async () => {
    const view = renderWithMantine(
      <>
        <button type="button" id="chat-entry" data-chat-entry-id="chat_1">Open chat</button>
      </>,
    );
    const opener = view.container.querySelector('#chat-entry') as HTMLButtonElement;
    opener.focus();

    view.rerender(
      <>
        <button type="button" id="chat-entry" data-chat-entry-id="chat_1">Open chat</button>
        <ChatDetail chatId="chat_1" />
      </>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Weekend League' });
    const closeButton = screen.getByRole('button', { name: 'Close chat' });
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(dialog).not.toHaveAttribute('aria-modal');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(closeChatWindowMock).toHaveBeenCalledWith('chat_1');
    await waitFor(() => expect(document.getElementById('chat-entry')).toHaveFocus());
  });
});
