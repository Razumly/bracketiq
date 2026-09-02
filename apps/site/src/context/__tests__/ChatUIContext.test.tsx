import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatUIProvider, useChatUI } from '../ChatUIContext';

function ChatUIHarness() {
  const {
    isChatListOpen,
    setChatListOpen,
    openChatWindows,
    isInviteModalOpen,
    setInviteModalOpen,
    openChatList,
    closeChatList,
    openChatWindow,
    closeChatWindow,
    closeAllChatWindows,
    isFloatingButtonVisible,
  } = useChatUI();

  return (
    <>
      <output data-testid="list-state">{isChatListOpen ? 'open' : 'closed'}</output>
      <output data-testid="invite-state">{isInviteModalOpen ? 'open' : 'closed'}</output>
      <output data-testid="windows-state">{openChatWindows.join(',')}</output>
      <output data-testid="floating-state">{isFloatingButtonVisible ? 'visible' : 'hidden'}</output>
      <button type="button" onClick={openChatList}>Open list</button>
      <button type="button" onClick={closeChatList}>Close list</button>
      <button type="button" onClick={() => setChatListOpen(true)}>Set list open</button>
      <button type="button" onClick={() => setChatListOpen(false)}>Set list closed</button>
      <button type="button" onClick={() => setInviteModalOpen(true)}>Open invite</button>
      <button type="button" onClick={() => setInviteModalOpen(false)}>Close invite</button>
      <button type="button" onClick={() => openChatWindow('chat_1')}>Open one</button>
      <button type="button" onClick={() => openChatWindow('chat_2')}>Open two</button>
      <button type="button" onClick={() => openChatWindow('chat_3')}>Open three</button>
      <button type="button" onClick={() => openChatWindow('chat_4')}>Open four</button>
      <button type="button" onClick={() => closeChatWindow('chat_3')}>Close three</button>
      <button type="button" onClick={closeAllChatWindows}>Close all</button>
    </>
  );
}

describe('ChatUIContext', () => {
  it('transitions list, invite, and floating-button visibility without sharing state', async () => {
    const user = userEvent.setup();
    render(
      <ChatUIProvider>
        <ChatUIHarness />
      </ChatUIProvider>,
    );

    expect(screen.getByTestId('list-state')).toHaveTextContent(/^closed$/);
    expect(screen.getByTestId('invite-state')).toHaveTextContent(/^closed$/);
    expect(screen.getByTestId('floating-state')).toHaveTextContent(/^visible$/);

    await user.click(screen.getByRole('button', { name: 'Open list' }));
    expect(screen.getByTestId('list-state')).toHaveTextContent(/^open$/);
    expect(screen.getByTestId('floating-state')).toHaveTextContent(/^hidden$/);

    await user.click(screen.getByRole('button', { name: 'Open invite' }));
    expect(screen.getByTestId('invite-state')).toHaveTextContent(/^open$/);
    expect(screen.getByTestId('list-state')).toHaveTextContent(/^open$/);
    await user.click(screen.getByRole('button', { name: 'Close invite' }));
    await user.click(screen.getByRole('button', { name: 'Close list' }));
    expect(screen.getByTestId('invite-state')).toHaveTextContent(/^closed$/);
    expect(screen.getByTestId('floating-state')).toHaveTextContent(/^visible$/);

    await user.click(screen.getByRole('button', { name: 'Set list open' }));
    await user.click(screen.getByRole('button', { name: 'Set list closed' }));
    expect(screen.getByTestId('list-state')).toHaveTextContent(/^closed$/);
  });

  it('deduplicates windows, evicts the oldest at three, and closes by id', async () => {
    const user = userEvent.setup();
    render(
      <ChatUIProvider>
        <ChatUIHarness />
      </ChatUIProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open one' }));
    await user.click(screen.getByRole('button', { name: 'Open one' }));
    expect(screen.getByTestId('windows-state')).toHaveTextContent(/^chat_1$/);

    await user.click(screen.getByRole('button', { name: 'Open two' }));
    await user.click(screen.getByRole('button', { name: 'Open three' }));
    expect(screen.getByTestId('windows-state')).toHaveTextContent(/^chat_1,chat_2,chat_3$/);
    expect(screen.getByTestId('floating-state')).toHaveTextContent(/^hidden$/);

    await user.click(screen.getByRole('button', { name: 'Open four' }));
    expect(screen.getByTestId('windows-state')).toHaveTextContent(/^chat_2,chat_3,chat_4$/);

    await user.click(screen.getByRole('button', { name: 'Close three' }));
    expect(screen.getByTestId('windows-state')).toHaveTextContent(/^chat_2,chat_4$/);
    await user.click(screen.getByRole('button', { name: 'Close all' }));
    expect(screen.getByTestId('windows-state')).toHaveTextContent(/^$/);
    expect(screen.getByTestId('floating-state')).toHaveTextContent(/^visible$/);
  });
});
