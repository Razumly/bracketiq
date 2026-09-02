'use client';

import React, { useEffect, useInsertionEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { useApp } from '@/app/providers';
import { formatDisplayTime } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoaderCircleIcon, SendIcon, XIcon } from 'lucide-react';
import { type Message } from '@/lib/chatService';
import { resolveChatGroupInitial, resolveChatGroupTitle } from './chatGroupDisplay';


interface ChatDetailProps {
    chatId: string;
}
function restoreChatFocus(chatId: string, opener: HTMLElement | null) {
    if (typeof document === 'undefined') {
        return;
    }
    if (opener?.isConnected) {
        opener.focus();
        return;
    }

    const chatEntry = Array.from(
        document.querySelectorAll<HTMLElement>('[data-chat-entry-id]'),
    ).find((element) => element.dataset.chatEntryId === chatId);
    if (chatEntry?.isConnected) {
        chatEntry.focus();
        return;
    }

    const nextWindow = Array.from(
        document.querySelectorAll<HTMLElement>('[data-chat-window-close]'),
    ).find((element) => element.dataset.chatWindowClose !== chatId);
    if (nextWindow?.isConnected) {
        nextWindow.focus();
        return;
    }

    document.querySelector<HTMLElement>('[data-chat-entry]')?.focus();
}
type ChatDetailHeaderProps = {
    chatId: string;
    chatInitial: string;
    chatMemberCount: number;
    chatTitle: string;
    closeButtonRef: React.RefObject<HTMLButtonElement | null>;
    onClose: () => void;
};

function ChatDetailHeader({
    chatId,
    chatInitial,
    chatMemberCount,
    chatTitle,
    closeButtonRef,
    onClose,
}: ChatDetailHeaderProps) {
    return (
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/50 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
                    aria-hidden="true"
                >
                    {chatInitial}
                </div>
                <div className="min-w-0">
                    <h2 id={`chat-window-title-${chatId}`} className="truncate text-sm font-medium text-foreground">
                        {chatTitle}
                    </h2>
                    <div className="text-xs text-muted-foreground">
                        {chatMemberCount} members
                    </div>
                </div>
            </div>
            <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                data-chat-window-close={chatId}
                aria-label="Close chat"
            >
                <XIcon aria-hidden="true" />
            </Button>
        </div>
    );
}

type ChatMessagesProps = {
    chatMessages: Message[];
    loadingMore: boolean;
    messageListRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    userId?: string;
};

function ChatMessage({ message, isCurrentUser, index }: {
    message: Message;
    isCurrentUser: boolean;
    index: number;
}) {
    return (
        <div
            key={`${message.$id || 'message'}-${message.sentTime || ''}-${index}`}
            className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
        >
            <div
                className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                    isCurrentUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                }`}
            >
                <div>{message.body}</div>
                <div className={`mt-1 text-xs ${
                    isCurrentUser ? 'text-primary-foreground/80' : 'text-muted-foreground'
                }`}>
                    {formatDisplayTime(message.sentTime)}
                </div>
            </div>
        </div>
    );
}

function ChatMessages({
    chatMessages,
    loadingMore,
    messageListRef,
    onScroll,
    userId,
}: ChatMessagesProps) {
    return (
        <div
            ref={messageListRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
        >
            {loadingMore ? (
                <div className="text-center text-xs text-muted-foreground" role="status">
                    Loading more messages...
                </div>
            ) : null}
            {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                    <div className="text-sm">No messages yet</div>
                    <div className="text-xs">Start the conversation!</div>
                </div>
            ) : (
                chatMessages.map((message, index) => (
                    <ChatMessage
                        key={`${message.$id || 'message'}-${message.sentTime || ''}-${index}`}
                        message={message}
                        isCurrentUser={message.userId === userId}
                        index={index}
                    />
                ))
            )}
        </div>
    );
}

type ChatComposerProps = {
    messageInput: string;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    onSubmit: React.FormEventHandler<HTMLFormElement>;
    sending: boolean;
};

function ChatComposer({ messageInput, onChange, onSubmit, sending }: ChatComposerProps) {
    return (
        <div className="flex-shrink-0 border-t border-border p-3">
            <form onSubmit={onSubmit} className="flex gap-2">
                <Input
                    type="text"
                    value={messageInput}
                    onChange={onChange}
                    placeholder="Type a message..."
                    aria-label="Message"
                    className="min-w-0 flex-1"
                    disabled={sending}
                />
                <Button
                    type="submit"
                    size="icon-sm"
                    disabled={!messageInput.trim() || sending}
                    aria-label="Send message"
                >
                    {sending ? (
                        <LoaderCircleIcon className="motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                        <SendIcon aria-hidden="true" />
                    )}
                </Button>
            </form>
        </div>
    );
}



export function ChatDetail({ chatId }: ChatDetailProps) {
    const { messages, messagePagination, sendMessage, loadMoreMessages, chatGroups } = useChat();
    const { closeChatWindow } = useChatUI();
    const { user } = useApp();
    const [messageInput, setMessageInput] = useState('');
    const [sending, setSending] = useState(false);
    const messageListRef = useRef<HTMLDivElement>(null);
    const pendingLoadMoreRestoreRef = useRef<{ previousTop: number; previousHeight: number } | null>(null);
    const previousMessageCountRef = useRef(0);
    const previousLastMessageKeyRef = useRef('');
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    useInsertionEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        const activeElement = document.activeElement;
        openerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : null;
    }, [chatId]);

    useEffect(() => {
        closeButtonRef.current?.focus();
    }, [chatId]);


    const chatMessages = useMemo(() => messages[chatId] || [], [messages, chatId]);
    const pagination = messagePagination[chatId];
    const loadingMore = pagination?.loadingMore ?? false;
    const hasMore = pagination?.hasMore ?? false;
    const chatGroup = chatGroups.find(chat => chat.$id === chatId);
    const chatTitle = resolveChatGroupTitle(chatGroup, 'Chat');
    const chatInitial = resolveChatGroupInitial(chatGroup, 'C');
    const chatMemberCount = Array.isArray(chatGroup?.userIds) ? chatGroup.userIds.length : 0;

    useEffect(() => {
        previousMessageCountRef.current = 0;
        previousLastMessageKeyRef.current = '';
        pendingLoadMoreRestoreRef.current = null;
    }, [chatId]);

    useEffect(() => {
        const container = messageListRef.current;
        if (!container) {
            return;
        }

        if (pendingLoadMoreRestoreRef.current) {
            const { previousHeight, previousTop } = pendingLoadMoreRestoreRef.current;
            const heightDelta = container.scrollHeight - previousHeight;
            container.scrollTop = previousTop + Math.max(heightDelta, 0);
            pendingLoadMoreRestoreRef.current = null;
        } else {
            const previousCount = previousMessageCountRef.current;
            const previousLastMessageKey = previousLastMessageKeyRef.current;
            const latestMessage = chatMessages[chatMessages.length - 1];
            const latestKey = latestMessage ? `${latestMessage.$id}::${latestMessage.sentTime}` : '';
            const appendedAtBottom = chatMessages.length > previousCount
                && previousLastMessageKey.length > 0
                && latestKey.length > 0
                && latestKey !== previousLastMessageKey;

            if (previousCount === 0 || appendedAtBottom) {
                container.scrollTop = container.scrollHeight;
            }
        }

        const nextLast = chatMessages[chatMessages.length - 1];
        previousLastMessageKeyRef.current = nextLast ? `${nextLast.$id}::${nextLast.sentTime}` : '';
        previousMessageCountRef.current = chatMessages.length;
    }, [chatMessages]);

    const handleMessagesScroll = () => {
        const container = messageListRef.current;
        if (!container || loadingMore || !hasMore) {
            return;
        }

        if (container.scrollTop <= 24) {
            pendingLoadMoreRestoreRef.current = {
                previousTop: container.scrollTop,
                previousHeight: container.scrollHeight,
            };
            void loadMoreMessages(chatId);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageInput.trim() || sending) return;

        setSending(true);
        try {
            const sent = await sendMessage(chatId, messageInput.trim());
            if (sent) {
                setMessageInput('');
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleClose = () => {
        const opener = openerRef.current;
        restoreChatFocus(chatId, opener);
        closeChatWindow(chatId);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
        if (
            event.key !== 'Escape'
            || !(event.target instanceof Node)
            || !(activeElement instanceof Node)
            || !event.currentTarget.contains(event.target)
            || !event.currentTarget.contains(activeElement)
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        handleClose();
    };

    return (
        <div
            role="dialog"
            aria-labelledby={`chat-window-title-${chatId}`}
            onKeyDown={handleKeyDown}
            className="flex h-full flex-col bg-background text-foreground"
        >
            <ChatDetailHeader
                chatId={chatId}
                chatInitial={chatInitial}
                chatMemberCount={chatMemberCount}
                chatTitle={chatTitle}
                closeButtonRef={closeButtonRef}
                onClose={handleClose}
            />
            <ChatMessages
                chatMessages={chatMessages}
                loadingMore={loadingMore}
                messageListRef={messageListRef}
                onScroll={handleMessagesScroll}
                userId={user?.$id}
            />
            <ChatComposer
                messageInput={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onSubmit={handleSendMessage}
                sending={sending}
            />
        </div>
    );
}
