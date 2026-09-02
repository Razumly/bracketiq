'use client';

import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Check, Loader2, MessageSquare, Plus, Send, X } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useAgentContext } from '@/context/AgentContext';
import { MarkdownMessageContent } from '@/components/agent/MarkdownMessageContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type {
  AgentActivePageContext,
  AgentChatLoadResponse,
  AgentChatMessage,
  AgentChatSendResponse,
  AgentConfirmResponse,
  AgentPageContext,
  AgentPendingConfirmation,
} from '@/lib/agent/types';

const INTRO_MESSAGE: AgentChatMessage = {
  id: 'intro',
  role: 'assistant',
  content: 'Ask me how to navigate BracketIQ or draft event schedule changes. Draft changes appear on the page for you to save or discard.',
};

const readJsonResponse = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : response.statusText || 'AI request failed.');
  }
  return body as T;
};

type AIAssistantDrawerProps = {
  enabled?: boolean;
};

type AssistantHeaderProps = {
  activePageContext: AgentActivePageContext | null;
  enabled: boolean;
  loading: boolean;
  sending: boolean;
  onNewChat: () => void;
};

function getAssistantDescription(
  enabled: boolean,
  activePageContext: AgentActivePageContext | null,
): string {
  if (!enabled) return 'AI assistant is disabled.';
  if (activePageContext?.hasUnsavedChanges) {
    return 'AI drafts will be added to your unsaved changes.';
  }
  return 'Schedule changes are drafted on the page.';
}

function AssistantHeader({
  activePageContext,
  enabled,
  loading,
  sending,
  onNewChat,
}: AssistantHeaderProps) {
  return (
    <>
      <SheetHeader className="shrink-0 border-b px-4 py-3 pr-16">
        <SheetTitle className="flex items-center gap-2">
          <MessageSquare size={18} aria-hidden="true" />
          <span>AI Assistant</span>
          {activePageContext?.kind === 'event_schedule' ? (
            <Badge variant="outline">Schedule</Badge>
          ) : null}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Ask for help or a saved schedule change.
        </SheetDescription>
      </SheetHeader>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          {getAssistantDescription(enabled, activePageContext)}
        </p>
        <Button
          size="xs"
          variant="ghost"
          onClick={onNewChat}
          disabled={!enabled || loading || sending}
        >
          <Plus size={14} aria-hidden="true" />
          <span>New chat</span>
        </Button>
      </div>
      <Separator />
    </>
  );
}

function AssistantStatus({ children }: { children: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      <span>{children}</span>
    </div>
  );
}

function AssistantMessageCard({ message }: { message: AgentChatMessage }) {
  const isAssistant = message.role === 'assistant';
  const Icon = isAssistant ? Bot : MessageSquare;
  return (
    <Card
      size="sm"
      className={
        isAssistant
          ? 'mr-8 border-border bg-muted p-3 [overflow-wrap:anywhere]'
          : 'ml-8 border-primary bg-primary p-3 text-primary-foreground [overflow-wrap:anywhere]'
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon size={14} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase">
          {isAssistant ? 'Assistant' : 'You'}
        </span>
      </div>
      <MarkdownMessageContent content={message.content} inverted={!isAssistant} />
    </Card>
  );
}

type PendingConfirmationCardProps = {
  confirmation: AgentPendingConfirmation;
  confirmingId: string | null;
  enabled: boolean;
  onConfirm: (confirmationId: string, confirmed: boolean) => void;
};

function PendingConfirmationCard({
  confirmation,
  confirmingId,
  enabled,
  onConfirm,
}: PendingConfirmationCardProps) {
  const isConfirming = confirmingId === confirmation.id;
  const actionsDisabled = !enabled || Boolean(confirmingId);
  return (
    <Card size="sm" className="border-border p-3 [overflow-wrap:anywhere]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">Confirmation required</Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(confirmation.expiresAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="text-sm">{confirmation.summary}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={actionsDisabled}
            onClick={() => onConfirm(confirmation.id, false)}
          >
            <X size={14} aria-hidden="true" />
            <span>Cancel</span>
          </Button>
          <Button
            size="xs"
            disabled={actionsDisabled}
            onClick={() => onConfirm(confirmation.id, true)}
          >
            {isConfirming ? (
              <Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}
            <span>Confirm</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}

type AssistantMessagesProps = {
  messages: AgentChatMessage[];
  pendingConfirmations: AgentPendingConfirmation[];
  loading: boolean;
  sending: boolean;
  confirmingId: string | null;
  enabled: boolean;
  error: string | null;
  onConfirm: (confirmationId: string, confirmed: boolean) => void;
};

function AssistantMessages({
  messages,
  pendingConfirmations,
  loading,
  sending,
  confirmingId,
  enabled,
  error,
  onConfirm,
}: AssistantMessagesProps) {
  return (
    <div className="flex flex-col gap-3">
      {loading ? <AssistantStatus>Loading chat...</AssistantStatus> : null}
      {messages.map((message) => (
        <AssistantMessageCard key={message.id} message={message} />
      ))}
      {pendingConfirmations.map((confirmation) => (
        <PendingConfirmationCard
          key={confirmation.id}
          confirmation={confirmation}
          confirmingId={confirmingId}
          enabled={enabled}
          onConfirm={onConfirm}
        />
      ))}
      {sending ? <AssistantStatus>Thinking...</AssistantStatus> : null}
      {error ? <FieldError id="ai-assistant-error">{error}</FieldError> : null}
    </div>
  );
}

type AssistantFooterProps = {
  input: string;
  isAuthenticated: boolean;
  isGuest: boolean;
  loading: boolean;
  sending: boolean;
  enabled: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  error: string | null;
};

type AssistantSendButtonProps = {
  input: string;
  loading: boolean;
  sending: boolean;
  enabled: boolean;
  onSend: () => void;
};

function AssistantSendButton({
  input,
  loading,
  sending,
  enabled,
  onSend,
}: AssistantSendButtonProps) {
  const SendIcon = sending ? Loader2 : Send;
  return (
    <Button onClick={onSend} disabled={!enabled || !input.trim() || sending || loading}>
      <SendIcon
        size={16}
        aria-hidden="true"
        className={sending ? 'animate-spin motion-reduce:animate-none' : undefined}
      />
      <span>Send</span>
    </Button>
  );
}

function AssistantFooter({
  input,
  isAuthenticated,
  isGuest,
  loading,
  sending,
  enabled,
  onChange,
  onKeyDown,
  onSend,
  error,
}: AssistantFooterProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2 p-4">
      <label htmlFor="ai-assistant-input" className="sr-only">
        Ask the AI assistant
      </label>
      <Textarea
        id="ai-assistant-input"
        className="min-h-24 max-h-40 resize-y overflow-y-auto md:min-h-20 md:max-h-48"
        value={input}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask for help or a saved schedule change..."
        disabled={!enabled || sending || loading}
        aria-describedby={error ? 'ai-assistant-error' : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {isAuthenticated && !isGuest ? 'Signed in' : 'Guest help mode'}
        </span>
        <AssistantSendButton
          input={input}
          loading={loading}
          sending={sending}
          enabled={enabled}
          onSend={onSend}
        />
      </div>
    </div>
  );
}

const isFocusableCandidate = (target: HTMLElement | null): target is HTMLElement => {
  if (
    !target
    || !target.isConnected
    || target.matches(':disabled')
    || target.getAttribute('aria-disabled') === 'true'
    || target.hidden
  ) {
    return false;
  }

  if (typeof window === 'undefined') return false;

  const style = window.getComputedStyle(target);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && target.getClientRects().length > 0;
};

const findVisibleLauncher = (labels: readonly string[]): HTMLElement | null => {
  if (typeof document === 'undefined') return null;

  for (const label of labels) {
    const launcher = Array.from(document.querySelectorAll<HTMLElement>('[aria-label]'))
      .find((candidate) => (
        candidate.getAttribute('aria-label') === label
        && isFocusableCandidate(candidate)
      ));
    if (launcher) return launcher;
  }

  return null;
};

function useAssistantFocus(isAssistantOpen: boolean) {
  const wasOpenRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const initialFocus = useCallback(() => {
    if (typeof document === 'undefined') return null;
    const input = document.getElementById('ai-assistant-input');
    if (input instanceof HTMLTextAreaElement && !input.disabled) return input;
    return true;
  }, []);

  useInsertionEffect(() => {
    if (!isAssistantOpen || wasOpenRef.current) return;

    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    openerRef.current = (
      typeof HTMLElement !== 'undefined'
      && activeElement instanceof HTMLElement
      && activeElement !== document.body
        ? activeElement
        : null
    );
  }, [isAssistantOpen]);

  useEffect(() => {
    if (!isAssistantOpen && wasOpenRef.current) {
      const resolveRestoreTarget = () => {
        if (isFocusableCandidate(openerRef.current)) return openerRef.current;
        return findVisibleLauncher(['Open AI assistant', 'Open navigation menu']);
      };
      const restoreFocus = () => {
        const focusTarget = resolveRestoreTarget();
        if (focusTarget) focusTarget.focus();
      };

      restoreFocus();
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreFocus);
      }
    }

    wasOpenRef.current = isAssistantOpen;
  }, [isAssistantOpen]);

  return initialFocus;
}

type ApplySendResponseArgs = {
  data: AgentChatSendResponse;
  appendAssistantMessage: (content: string) => void;
  setPendingConfirmations: Dispatch<SetStateAction<AgentPendingConfirmation[]>>;
  dispatchClientActions: (
    actions: AgentChatSendResponse['clientActions']
  ) => Promise<{ errors: string[] }>;
  refreshActivePage: () => Promise<void>;
};

async function applySendResponse({
  data,
  appendAssistantMessage,
  setPendingConfirmations,
  dispatchClientActions,
  refreshActivePage,
}: ApplySendResponseArgs) {
  appendAssistantMessage(data.reply || 'Done.');
  setPendingConfirmations(data.pendingConfirmations);
  const clientActions = data.clientActions ?? [];
  if (clientActions.length > 0) {
    const dispatchResult = await dispatchClientActions(clientActions);
    if (dispatchResult.errors.length > 0) {
      appendAssistantMessage(`I could not apply the draft changes: ${dispatchResult.errors.join(' ')}`);
    }
  }
  if (data.changes.length > 0) {
    await refreshActivePage();
  }
}


export function AIAssistantDrawer({ enabled = true }: AIAssistantDrawerProps) {
  const pathname = usePathname();
  const { loading: authLoading, isAuthenticated, isGuest } = useApp();
  const {
    activePageContext,
    closeAssistant,
    dispatchClientActions,
    isAssistantOpen,
    refreshActivePage,
  } = useAgentContext();
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingConfirmations, setPendingConfirmations] = useState<AgentPendingConfirmation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const initialFocus = useAssistantFocus(isAssistantOpen);

  const pageContext = useMemo<AgentPageContext>(() => ({
    pathname: pathname ?? '/',
    auth: {
      isAuthenticated: authLoading ? false : isAuthenticated,
      isGuest: authLoading ? false : isGuest,
    },
    page: activePageContext,
  }), [activePageContext, authLoading, isAuthenticated, isGuest, pathname]);

  const visibleMessages = messages.length > 0 ? messages : [INTRO_MESSAGE];


  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, pendingConfirmations, sending]);

  const loadConversation = useCallback(async () => {
    if (!enabled) {
      setLoaded(true);
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/chat', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await readJsonResponse<AgentChatLoadResponse>(response);
      setMessages(data.messages);
      setPendingConfirmations(data.pendingConfirmations);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load AI chat.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!isAssistantOpen || loaded || loading) return;
    void loadConversation();
  }, [isAssistantOpen, loadConversation, loaded, loading]);

  const handleNewChat = useCallback(async () => {
    if (!enabled) {
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/chat/new', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJsonResponse<AgentChatLoadResponse>(response);
      setMessages(data.messages);
      setPendingConfirmations(data.pendingConfirmations);
      setLoaded(true);
    } catch (newChatError) {
      setError(newChatError instanceof Error ? newChatError.message : 'Failed to start a new chat.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
      },
    ]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!enabled) {
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }

    setInput('');
    setSending(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      },
    ]);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text, pageContext }),
      });
      const data = await readJsonResponse<AgentChatSendResponse>(response);
      await applySendResponse({
        data,
        appendAssistantMessage,
        setPendingConfirmations,
        dispatchClientActions,
        refreshActivePage,
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Failed to send message.';
      appendAssistantMessage(`Error: ${message}`);
      setError(message);
    } finally {
      setSending(false);
    }
  }, [appendAssistantMessage, dispatchClientActions, enabled, input, pageContext, refreshActivePage, sending]);

  const handleConfirm = useCallback(async (confirmationId: string, confirmed: boolean) => {
    if (!enabled) {
      setError('AI assistant is disabled by OPENAI_AGENT_ENABLED.');
      return;
    }
    setConfirmingId(confirmationId);
    setError(null);
    try {
      const response = await fetch('/api/agent/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmationId, confirmed, pageContext }),
      });
      const data = await readJsonResponse<AgentConfirmResponse>(response);
      appendAssistantMessage(data.reply);
      if (data.status !== 'save_required') {
        setPendingConfirmations((prev) => prev.filter((entry) => entry.id !== confirmationId));
      }
      if (data.changes.length > 0) {
        await refreshActivePage();
      }
    } catch (confirmError) {
      const message = confirmError instanceof Error ? confirmError.message : 'Failed to confirm action.';
      appendAssistantMessage(`Error: ${message}`);
      setError(message);
    } finally {
      setConfirmingId(null);
    }
  }, [appendAssistantMessage, enabled, pageContext, refreshActivePage]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <Sheet
      open={isAssistantOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeAssistant();
      }}
    >
      <SheetContent
        side="right"
        className="z-[70] min-h-dvh gap-0 overflow-hidden"
        style={{ width: 'min(100vw, 460px)', height: '100dvh' }}
        initialFocus={initialFocus}
        finalFocus={false}
      >
        <AssistantHeader
          activePageContext={activePageContext}
          enabled={enabled}
          loading={loading}
          sending={sending}
          onNewChat={() => { void handleNewChat(); }}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={viewportRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          >
            <AssistantMessages
              messages={visibleMessages}
              pendingConfirmations={pendingConfirmations}
              loading={loading}
              sending={sending}
              confirmingId={confirmingId}
              enabled={enabled}
              error={error}
              onConfirm={(confirmationId, confirmed) => {
                void handleConfirm(confirmationId, confirmed);
              }}
            />
          </div>
          <Separator />
          <AssistantFooter
            input={input}
            isAuthenticated={isAuthenticated}
            isGuest={isGuest}
            loading={loading}
            sending={sending}
            enabled={enabled}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => { void handleSend(); }}
            error={error}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
