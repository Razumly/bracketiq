import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InviteUsersModal } from '../InviteUsersModal';

const mockSearchUsers = jest.fn();
const mockCreateChatGroup = jest.fn();
const mockUseChatUI = jest.fn();

jest.mock('@/lib/userService', () => ({
  userService: {
    searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
  },
}));

jest.mock('@/context/ChatContext', () => ({
  useChat: () => ({ createChatGroup: mockCreateChatGroup }),
}));

jest.mock('@/context/ChatUIContext', () => ({
  useChatUI: () => mockUseChatUI(),
}));

const users = [
  {
    $id: 'user_1',
    firstName: 'Alice',
    lastName: 'Smith',
    userName: 'alice',
  },
  {
    $id: 'user_2',
    firstName: 'Bob',
    lastName: 'Jones',
    userName: 'bobby',
  },
];

describe('InviteUsersModal', () => {
  let isOpen = true;
  const setInviteModalOpen = jest.fn((nextOpen: boolean) => {
    isOpen = nextOpen;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    isOpen = true;
    mockSearchUsers.mockReset();
    mockCreateChatGroup.mockReset();
    mockCreateChatGroup.mockResolvedValue(undefined);
    mockUseChatUI.mockImplementation(() => ({
      isInviteModalOpen: isOpen,
      setInviteModalOpen,
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('focuses search, debounces results, filters selected users, and resets on close', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSearchUsers.mockResolvedValue(users);

    const { rerender } = render(
      <>
        <button type="button" id="invite-trigger">Invite users</button>
        <InviteUsersModal />
      </>,
    );
    const trigger = document.getElementById('invite-trigger') as HTMLButtonElement;
    trigger.focus();

    const input = screen.getByRole('textbox', { name: 'Search users' });
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: 'Al' } });
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(mockSearchUsers).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(mockSearchUsers).toHaveBeenCalledWith('Al'));
    expect(screen.getByRole('button', { name: 'Add Alice Smith to chat' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Alice Smith to chat' }));
    expect(screen.getByRole('button', { name: 'Remove Alice Smith' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Alice Smith to chat' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setInviteModalOpen).toHaveBeenCalledWith(false);
    rerender(
      <>
        <button type="button" id="invite-trigger">Invite users</button>
        <InviteUsersModal />
      </>,
    );
    isOpen = true;
    rerender(
      <>
        <button type="button" id="invite-trigger">Invite users</button>
        <InviteUsersModal />
      </>,
    );

    const reopenedInput = screen.getByRole('textbox', { name: 'Search users' });
    expect(reopenedInput).toHaveValue('');
    await waitFor(() => expect(reopenedInput).toHaveFocus());
  });

  it('creates one-to-one and group chats with the existing default names', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSearchUsers.mockResolvedValue(users);

    const { rerender } = render(<InviteUsersModal />);
    const input = screen.getByRole('textbox', { name: 'Search users' });
    fireEvent.change(input, { target: { value: 'Al' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await user.click(screen.getByRole('button', { name: 'Add Alice Smith to chat' }));
    await user.click(screen.getByRole('button', { name: 'Create Chat (1)' }));
    await waitFor(() => {
      expect(mockCreateChatGroup).toHaveBeenCalledWith('Chat with Alice Smith', ['user_1']);
    });

    isOpen = true;
    rerender(<InviteUsersModal />);
    mockCreateChatGroup.mockClear();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), {
      target: { value: 'users' },
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await user.click(screen.getByRole('button', { name: 'Add Alice Smith to chat' }));
    await user.click(screen.getByRole('button', { name: 'Add Bob Jones to chat' }));
    await user.click(screen.getByRole('button', { name: 'Create Chat (2)' }));

    await waitFor(() => {
      expect(mockCreateChatGroup).toHaveBeenCalledWith('Group Chat', ['user_1', 'user_2']);
    });
  });
});
