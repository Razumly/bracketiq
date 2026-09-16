'use client';

import React, { useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { ChatList } from './ChatList';
import { ChatDetail } from './ChatDetail';
import { TermsConsentModal } from '@/components/moderation/TermsConsentModal';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import chatAnimationData from '../../../public/chat.json';

const CHAT_POLL_INTERVAL_MS = 2000;
const INACTIVE_CHAT_REFRESH_MS = 30000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CHAT_DESKTOP_MEDIA_QUERY = '(min-width: 64rem)';
const CHAT_WINDOW_WIDTH = 320;
const CHAT_LIST_WIDTH = 320;
const CHAT_PANEL_HEIGHT = '50vh';
const MOBILE_CHAT_SLOT_ID = 'mobile-navigation-chat-action';

function getDesktopViewportPreference() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return true;
    }
    return window.matchMedia(CHAT_DESKTOP_MEDIA_QUERY).matches;
}

function useDesktopViewport() {
    const [isDesktop, setIsDesktop] = useState(getDesktopViewportPreference);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia(CHAT_DESKTOP_MEDIA_QUERY);
        const handleChange = () => setIsDesktop(mediaQuery.matches);
        handleChange();
        mediaQuery.addEventListener?.('change', handleChange);

        return () => mediaQuery.removeEventListener?.('change', handleChange);
    }, []);

    return isDesktop;
}


function getReducedMotionPreference() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function usePrefersReducedMotion() {
    const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
        const handleChange = () => setReducedMotion(mediaQuery.matches);
        handleChange();
        mediaQuery.addEventListener?.('change', handleChange);

        return () => mediaQuery.removeEventListener?.('change', handleChange);
    }, []);

    return reducedMotion;
}

function stopLottieAnimation(lottieRef: React.RefObject<LottieRefCurrentProps | null>) {
    try {
        lottieRef.current?.stop();
        lottieRef.current?.goToAndStop(0, true);
    } catch {}
}

function restoreChatListFocus(
    opener: HTMLElement | null,
    chatEntry: HTMLElement | null,
) {
    if (typeof document === 'undefined') {
        return;
    }

    if (opener?.isConnected) {
        opener.focus();
        return;
    }

    if (chatEntry?.isConnected) {
        chatEntry.focus();
        return;
    }

    const nextWindow = document.querySelector<HTMLElement>('[data-chat-window-close]');
    if (nextWindow?.isConnected) {
        nextWindow.focus();
        return;
    }

    document.querySelector<HTMLElement>('[data-chat-entry]')?.focus();
}
function getCurrentChatEntry(
    desktopChatEntry: HTMLElement | null,
    mobileChatEntry: HTMLElement | null,
) {
    const isDesktop = typeof window === 'undefined'
        || typeof window.matchMedia !== 'function'
        || window.matchMedia(CHAT_DESKTOP_MEDIA_QUERY).matches;
    const preferredEntry = isDesktop ? desktopChatEntry : mobileChatEntry;
    return preferredEntry?.isConnected
        ? preferredEntry
        : desktopChatEntry?.isConnected
            ? desktopChatEntry
            : mobileChatEntry?.isConnected
                ? mobileChatEntry
                : null;
}
function getChatListPanelStyle(isDesktop: boolean): React.CSSProperties {
    return {
        right: 0,
        width: isDesktop ? `${CHAT_LIST_WIDTH}px` : `min(${CHAT_LIST_WIDTH}px, 100vw)`,
        height: CHAT_PANEL_HEIGHT,
    };
}

function getChatWindowPanelStyle(
    isDesktop: boolean,
    isChatListOpen: boolean,
    index: number,
): React.CSSProperties {
    if (!isDesktop) {
        return {
            right: 0,
            width: '100vw',
            height: CHAT_PANEL_HEIGHT,
            zIndex: index + 1,
        };
    }

    const rightPosition = (isChatListOpen ? CHAT_LIST_WIDTH : 0) + (index * CHAT_WINDOW_WIDTH);
    return {
        right: `${rightPosition}px`,
        width: `${CHAT_WINDOW_WIDTH}px`,
        height: CHAT_PANEL_HEIGHT,
    };
}



export function ChatDrawer() {
    const {
        chatGroups,
        loadMessages,
        loadChatGroups,
        markChatViewed,
        chatTermsState,
        chatTermsLoading,
        chatTermsModalOpen,
        acceptChatTerms,
        closeChatTermsModal,
    } = useChat();
    const { isChatListOpen, openChatWindows, openChatList, isFloatingButtonVisible } = useChatUI();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [mobileChatSlot, setMobileChatSlot] = useState<HTMLElement | null>(null);
    const isDesktopViewport = useDesktopViewport();
    const pollingRef = useRef(false);
    const chatEntryRef = useRef<HTMLButtonElement>(null);
    const mobileChatEntryRef = useRef<HTMLButtonElement>(null);
    const chatListOpenerRef = useRef<HTMLElement | null>(null);
    const chatListOpenerCapturedRef = useRef(false);
    const wasChatListOpenRef = useRef(false);

    useInsertionEffect(() => {
        if (
            !isChatListOpen
            || wasChatListOpenRef.current
            || chatListOpenerCapturedRef.current
            || typeof document === 'undefined'
        ) {
            return;
        }

        const activeElement = document.activeElement;
        chatListOpenerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : null;
        chatListOpenerCapturedRef.current = true;
    }, [isChatListOpen]);

    useLayoutEffect(() => {
        if (mounted && typeof document !== 'undefined') {
            const nextSlot = document.getElementById(MOBILE_CHAT_SLOT_ID);
            setMobileChatSlot((currentSlot) => currentSlot === nextSlot ? currentSlot : nextSlot);
        }
    }, [mounted, pathname]);

    useLayoutEffect(() => {
        if (!isChatListOpen && wasChatListOpenRef.current) {
            restoreChatListFocus(
                chatListOpenerRef.current,
                getCurrentChatEntry(chatEntryRef.current, mobileChatEntryRef.current),
            );
            chatListOpenerCapturedRef.current = false;
        }

        wasChatListOpenRef.current = isChatListOpen;
    }, [isChatListOpen]);

    const uniqueOpenChatWindows = useMemo(
        () => Array.from(new Set(openChatWindows)),
        [openChatWindows],
    );
    const totalUnreadCount = useMemo(
        () => chatGroups.reduce((total, group) => total + Math.max(0, Number(group.unreadCount ?? 0)), 0),
        [chatGroups],
    );

    useEffect(() => {
        setMounted(true);
    }, []);

    // Load messages for each open chat window
    useEffect(() => {
        uniqueOpenChatWindows.forEach(chatId => {
            markChatViewed(chatId);
            loadMessages(chatId);
        });
    }, [uniqueOpenChatWindows, loadMessages, markChatViewed]);

    useEffect(() => {
        if (!mounted || uniqueOpenChatWindows.length === 0) {
            return;
        }

        const pollOpenChats = async () => {
            if (pollingRef.current) {
                return;
            }
            pollingRef.current = true;
            try {
                await Promise.all(uniqueOpenChatWindows.map((chatId) => loadMessages(chatId)));
            } finally {
                pollingRef.current = false;
            }
        };

        void pollOpenChats();
        const interval = window.setInterval(() => {
            void pollOpenChats();
        }, CHAT_POLL_INTERVAL_MS);

        return () => {
            window.clearInterval(interval);
            pollingRef.current = false;
        };
    }, [mounted, uniqueOpenChatWindows, loadMessages]);

    useEffect(() => {
        if (!mounted) {
            return;
        }

        const refreshInactiveChats = async () => {
            try {
                await loadChatGroups({ silent: true });
            } catch (error) {
                console.error('Failed to refresh inactive chats:', error);
            }
        };

        void refreshInactiveChats();
        const interval = window.setInterval(() => {
            void refreshInactiveChats();
        }, INACTIVE_CHAT_REFRESH_MS);

        return () => {
            window.clearInterval(interval);
        };
    }, [mounted, loadChatGroups]);

    if (!mounted) return null;

    const handleOpenChatList = async () => {
        const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
        const opener = activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : null;
        chatListOpenerRef.current = opener;
        chatListOpenerCapturedRef.current = true;

        await loadChatGroups();
        openChatList();
    };

    const handleAcceptChatTerms = async () => {
        await acceptChatTerms();
    };


    const drawerContent = (
        <div className="pointer-events-none fixed inset-0 z-50">
            {isChatListOpen && (
                <div
                    className="pointer-events-auto fixed bottom-0 rounded-tl-lg border border-border bg-background shadow-lg"
                    style={getChatListPanelStyle(isDesktopViewport)}
                >
                    <ChatList />
                </div>
            )}

            {uniqueOpenChatWindows.map((chatId, index) => (
                <div
                    key={chatId}
                    className="pointer-events-auto fixed bottom-0 rounded-tl-lg border border-border bg-background shadow-lg"
                    style={getChatWindowPanelStyle(isDesktopViewport, isChatListOpen, index)}
                >
                    <ChatDetail chatId={chatId} />
                </div>
            ))}

            {isFloatingButtonVisible ? (
                isDesktopViewport ? (
                    <FloatingChatButton
                        buttonRef={chatEntryRef}
                        onClick={handleOpenChatList}
                        unreadCount={totalUnreadCount}
                    />
                ) : mobileChatSlot ? (
                    createPortal(
                        <FloatingChatButton
                            buttonRef={mobileChatEntryRef}
                            onClick={handleOpenChatList}
                            unreadCount={totalUnreadCount}
                            mobile
                        />,
                        mobileChatSlot,
                    )
                ) : (
                    <FloatingChatButton
                        buttonRef={mobileChatEntryRef}
                        onClick={handleOpenChatList}
                        unreadCount={totalUnreadCount}
                        mobile
                        mobileFallback
                    />
                )
            ) : null}

            <TermsConsentModal
                open={chatTermsModalOpen}
                state={chatTermsState}
                loading={chatTermsLoading}
                onAccept={() => { void handleAcceptChatTerms(); }}
                onClose={closeChatTermsModal}
                intro="Sending chat messages in BracketIQ requires agreement to the Terms and EULA."
                allowClose
            />
        </div>
    );

    return createPortal(drawerContent, document.body);
}

function getFloatingChatButtonClassName(mobile: boolean, mobileFallback: boolean) {
    if (!mobile) {
        return 'pointer-events-auto fixed right-4 bottom-4 z-[60] rounded-full bg-transparent p-3 text-foreground shadow-lg transition-shadow hover:bg-transparent';
    }
    if (mobileFallback) {
        return 'pointer-events-auto fixed top-2.5 right-16 z-[60] flex size-11 items-center justify-center rounded-full bg-transparent text-foreground shadow-lg transition-shadow hover:bg-transparent';
    }
    return 'pointer-events-auto relative flex size-11 items-center justify-center rounded-full bg-transparent text-foreground shadow-lg transition-shadow hover:bg-transparent';
}

function playChatAnimation(
    lottieRef: React.RefObject<LottieRefCurrentProps | null>,
    animationData: typeof chatAnimationData,
    reducedMotion: boolean,
) {
    if (!animationData || reducedMotion) {
        stopLottieAnimation(lottieRef);
        return;
    }
    try {
        lottieRef.current?.goToAndPlay(0, true);
    } catch {}
}

function FloatingChatGraphic({
    animationData,
    lottieRef,
    mobile,
    onComplete,
}: {
    animationData: typeof chatAnimationData;
    lottieRef: React.RefObject<LottieRefCurrentProps | null>;
    mobile: boolean;
    onComplete: () => void;
}) {
    if (animationData) {
        return (
            <Lottie
                lottieRef={lottieRef}
                animationData={animationData}
                autoplay={false}
                loop={false}
                style={{
                    width: mobile ? 32 : 48,
                    height: mobile ? 32 : 48,
                }}
                onComplete={onComplete}
            />
        );
    }

    return (
        <svg
            className={mobile ? 'h-8 w-8' : 'h-12 w-12'}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.292-.307l-5.7 1.9a.75.75 0 01-.92-.92l1.9-5.7c-.207-.732-.308-1.494-.308-2.292C6 7.582 9.582 4 14 4s8 3.582 8 8z" />
        </svg>
    );
}

function FloatingChatUnreadBadge({ unreadCount }: { unreadCount: number }) {
    if (unreadCount <= 0) {
        return null;
    }

    return (
        <span className="absolute top-0 right-0 inline-flex min-w-5 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
        </span>
    );
}

function FloatingChatButton({
    buttonRef,
    onClick,
    unreadCount,
    mobile = false,
    mobileFallback = false,
}: {
    buttonRef: React.RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    unreadCount: number;
    mobile?: boolean;
    mobileFallback?: boolean;
}) {
    const animationData = chatAnimationData;
    const lottieRef = useRef<LottieRefCurrentProps>(null);
    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        if (animationData) {
            stopLottieAnimation(lottieRef);
        }
    }, [animationData, reducedMotion]);

    const handleMouseEnter = () => {
        playChatAnimation(lottieRef, animationData, reducedMotion);
    };

    const handleComplete = () => {
        stopLottieAnimation(lottieRef);
    };

    return (
        <button
            ref={buttonRef}
            type="button"
            aria-label="Open chat"
            data-chat-entry
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            className={getFloatingChatButtonClassName(mobile, mobileFallback)}
        >
            <FloatingChatGraphic
                animationData={animationData}
                lottieRef={lottieRef}
                mobile={mobile}
                onComplete={handleComplete}
            />
            <FloatingChatUnreadBadge unreadCount={unreadCount} />
        </button>
    );
}
