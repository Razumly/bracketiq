'use client';

import React, { useEffect, useState } from 'react';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { useApp } from '@/app/providers';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import { chatService } from '@/lib/chatService';
import { Button } from '@/components/ui/button';
import { EllipsisVerticalIcon, PlusIcon, XIcon } from 'lucide-react';
import { type ChatGroup } from '@/lib/chatService';
import { resolveChatGroupInitial, resolveChatGroupTitle } from './chatGroupDisplay';


type ChatGroupRowProps = {
    chatGroup: ChatGroup;
    formatTime: (timestamp: string) => string;
    isActionsOpen: boolean;
    isOpen: boolean;
    onHide: (chatId: string, currentTitle: string, userIds: string[]) => void | Promise<void>;
    onRename: (chatId: string, currentTitle: string) => void | Promise<void>;
    onReport: (chatId: string, currentTitle: string) => void | Promise<void>;
    onSelect: (chatId: string) => void;
    onToggleActions: (chatId: string) => void;
};

function ChatGroupActions({
    chatGroup,
    chatTitle,
    isActionsOpen,
    onHide,
    onRename,
    onReport,
    onToggleActions,
}: {
    chatGroup: ChatGroup;
    chatTitle: string;
    isActionsOpen: boolean;
    onHide: (chatId: string, currentTitle: string, userIds: string[]) => void | Promise<void>;
    onRename: (chatId: string, currentTitle: string) => void | Promise<void>;
    onReport: (chatId: string, currentTitle: string) => void | Promise<void>;
    onToggleActions: (chatId: string) => void;
}) {
    const actionButtonRef = React.useRef<HTMLButtonElement>(null);
    const handleActionsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape' || !isActionsOpen) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        onToggleActions(chatGroup.$id);
        actionButtonRef.current?.focus();
    };

    return (
        <div className="relative z-10" onClick={(event) => event.stopPropagation()} onKeyDown={handleActionsKeyDown}>
            <Button
                ref={actionButtonRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Chat actions for ${chatTitle}`}
                aria-expanded={isActionsOpen}
                aria-controls={`chat-actions-${chatGroup.$id}`}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggleActions(chatGroup.$id);
                }}
            >
                <EllipsisVerticalIcon aria-hidden="true" />
            </Button>
            {isActionsOpen && (
                <div
                    id={`chat-actions-${chatGroup.$id}`}
                    className="absolute right-0 mt-1 w-40 rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start rounded-none px-3 text-left text-sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            void onRename(chatGroup.$id, chatTitle);
                        }}
                    >
                        Rename chat
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start rounded-none px-3 text-left text-sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            void onReport(chatGroup.$id, chatTitle);
                        }}
                    >
                        Report chat
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start rounded-none px-3 text-left text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(event) => {
                            event.stopPropagation();
                            void onHide(chatGroup.$id, chatTitle, chatGroup.userIds);
                        }}
                    >
                        Leave chat
                    </Button>
                </div>
            )}
        </div>
    );
}

function ChatGroupRow({
    chatGroup,
    formatTime,
    isActionsOpen,
    isOpen,
    onHide,
    onRename,
    onReport,
    onSelect,
    onToggleActions,
}: ChatGroupRowProps) {
    const chatTitle = resolveChatGroupTitle(chatGroup, 'Unnamed Chat');
    const chatInitial = resolveChatGroupInitial(chatGroup, 'C');
    const unreadCount = Math.max(0, Number(chatGroup.unreadCount ?? 0));

    return (
        <div
            className={`relative flex items-center gap-1 p-1 transition-colors ${
                isOpen ? 'bg-muted/60' : 'hover:bg-muted/50'
            }`}
        >
            <Button
                type="button"
                variant="ghost"
                className={`min-w-0 flex-1 justify-start gap-3 rounded-md p-2 text-left ${
                    isOpen ? 'text-muted-foreground' : 'text-foreground'
                }`}
                onClick={() => onSelect(chatGroup.$id)}
                data-chat-entry-id={chatGroup.$id}
                aria-label={`Open ${chatTitle}, ${unreadCount} unread messages`}
            >
                <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full font-medium ${
                        isOpen
                            ? 'bg-muted-foreground/50 text-background'
                            : 'bg-primary text-primary-foreground'
                    }`}
                    aria-hidden="true"
                >
                    {chatInitial}
                </span>

                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{chatTitle}</span>
                        {chatGroup.lastMessage && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {formatTime(chatGroup.lastMessage.sentTime)}
                            </span>
                        )}
                    </span>

                    <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                            {chatGroup.lastMessage?.body || 'No messages yet'}
                        </span>
                        <span className="ml-2 flex shrink-0 items-center gap-2">
                            {unreadCount > 0 ? (
                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                                    {unreadCount}
                                </span>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                                {chatGroup.userIds.length} members
                            </span>
                        </span>
                    </span>
                </span>
            </Button>

            <ChatGroupActions
                chatGroup={chatGroup}
                chatTitle={chatTitle}
                isActionsOpen={isActionsOpen}
                onHide={onHide}
                onRename={onRename}
                onReport={onReport}
                onToggleActions={onToggleActions}
            />

            {isOpen && (
                <span
                    className="absolute right-2 top-2 size-2 rounded-full bg-primary"
                    aria-hidden="true"
                />
            )}
        </div>
    );
}

export function ChatList() {
    const { chatGroups, loading, loadChatGroups, markChatViewed, hideChatGroups } = useChat();
    const { openChatWindow, openChatWindows, closeChatList, closeChatWindow, setInviteModalOpen } = useChatUI();
    const { user } = useApp();
    const [actionError, setActionError] = useState<string | null>(null);
    const [openActionsChatId, setOpenActionsChatId] = useState<string | null>(null);
    const firstActionRef = React.useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!loading) {
            firstActionRef.current?.focus();
        }
    }, [loading]);


    const handleChatSelect = (chatId: string) => {
        setOpenActionsChatId(null);
        markChatViewed(chatId);
        // Only open if not already open
        if (!openChatWindows.includes(chatId)) {
            openChatWindow(chatId);
        }
    };
    const handleToggleActions = (chatId: string) => {
        setOpenActionsChatId((previous) => (previous === chatId ? null : chatId));
    };


    const handleRenameChat = async (chatId: string, currentTitle: string) => {
        const nextLabel = window.prompt('Rename chat', currentTitle === 'Unnamed Chat' ? '' : currentTitle);

        if (nextLabel === null) {
            setOpenActionsChatId(null);
            return;
        }

        const trimmed = nextLabel.trim();
        const nextName = trimmed.length > 0 ? trimmed : null;
        if (nextName === currentTitle || (currentTitle === 'Unnamed Chat' && nextName === null)) {
            return;
        }

        try {
            setActionError(null);
            await chatService.renameChatGroup(chatId, nextName);
            await loadChatGroups();
            setOpenActionsChatId(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to rename chat.';
            setActionError(message);
        }
    };

    const handleHideChat = async (chatId: string, currentTitle: string, userIds: string[]) => {
        if (!user) {
            return;
        }
        const confirmed = window.confirm(
            `Leave "${currentTitle}"? The chat will be hidden from your feed but preserved for moderation review.`,
        );
        if (!confirmed) {
            setOpenActionsChatId(null);
            return;
        }

        try {
            setActionError(null);
            await chatService.leaveChatGroup(
                chatId,
                userIds.filter((userId) => userId !== user.$id),
            );
            hideChatGroups([chatId]);
            closeChatWindow(chatId);
            await loadChatGroups();
            setOpenActionsChatId(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to leave chat.';
            setActionError(message);
        }
    };

    const handleReportChat = async (chatId: string, currentTitle: string) => {
        const notes = window.prompt(
            `Report "${currentTitle}". Add details for moderation, or leave the field blank to submit without extra notes.`,
            '',
        );
        if (notes === null) {
            setOpenActionsChatId(null);
            return;
        }

        const leaveChat = window.confirm(
            'Leave this chat after reporting? Select OK to leave the chat now, or Cancel to stay in the chat.',
        );

        try {
            setActionError(null);
            const result = await chatService.reportChat(chatId, {
                notes: notes.trim() || undefined,
                leaveChat,
            });
            if (result.removedChatIds.length > 0) {
                hideChatGroups(result.removedChatIds);
                result.removedChatIds.forEach((removedChatId) => closeChatWindow(removedChatId));
            }
            await loadChatGroups();
            setOpenActionsChatId(null);
        } catch (error) {

            const message = error instanceof Error ? error.message : 'Failed to report chat.';
            setActionError(message);
        }
    };

    const handleClose = () => {
        closeChatList();
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
        closeChatList();
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 24) {
            return formatDisplayTime(date);
        } else {
            return formatDisplayDate(date, { year: '2-digit' });
        }
    };


    return (
        <div
            role="dialog"
            aria-labelledby="chat-list-title"
            aria-busy={loading}
            onKeyDown={handleKeyDown}
            onClick={() => setOpenActionsChatId(null)}
            className="flex h-full flex-col bg-background text-foreground"
        >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/50 p-3">
                <h2 id="chat-list-title" className="font-semibold text-foreground">Messages</h2>
                <div className="flex items-center gap-2">
                    <Button
                        ref={firstActionRef}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setInviteModalOpen(true)}
                        aria-label="Start a new chat"
                    >
                        <PlusIcon aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={handleClose}
                        aria-label="Close chat list"
                    >
                        <XIcon aria-hidden="true" />
                    </Button>
                </div>
            </div>
            {actionError && (
                <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
                    {actionError}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex h-full items-center justify-center" role="status" aria-label="Loading messages">
                        <div
                            className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary motion-reduce:animate-none"
                            aria-hidden="true"
                        />
                    </div>
                ) : chatGroups.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <div className="mb-2 text-sm text-muted-foreground">No conversations yet</div>
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => setInviteModalOpen(true)}
                        >
                            Start your first chat
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y divide-border/60">
                        {chatGroups.map((chatGroup) => (
                            <ChatGroupRow
                                key={chatGroup.$id}
                                chatGroup={chatGroup}
                                formatTime={formatTime}
                                isActionsOpen={openActionsChatId === chatGroup.$id}
                                isOpen={openChatWindows.includes(chatGroup.$id)}
                                onHide={handleHideChat}
                                onRename={handleRenameChat}
                                onReport={handleReportChat}
                                onSelect={handleChatSelect}
                                onToggleActions={handleToggleActions}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
