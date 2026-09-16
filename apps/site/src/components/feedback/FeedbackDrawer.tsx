'use client';

import { useEffect, useInsertionEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import FeedbackForm from './FeedbackForm';
import type { FeedbackFormDraft } from './FeedbackForm';
import type { FeedbackEntrySource } from '@/lib/feedbackService';
import {
  normalizeFeedbackPathCategory,
  trackFeedbackOpened,
} from '@/lib/analytics/feedbackAnalytics';

export type FeedbackDrawerProps = {
  opened: boolean;
  onClose: () => void;
  authenticatedEmail?: string | null;
  entrySource: 'desktop_header' | 'mobile_menu';
  fallbackFocusRef?: RefObject<HTMLElement | null> | HTMLElement | null;
};

type FocusTarget = RefObject<HTMLElement | null> | HTMLElement | null | undefined;

const resolveFocusTarget = (target: FocusTarget): HTMLElement | null => {
  if (!target) return null;
  return 'current' in target ? target.current : target;
};

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

const restoreFocusTarget = (
  opener: HTMLElement | null,
  fallback: HTMLElement | null,
) => {
  const resolveRestoreTarget = (): HTMLElement | null => {
    if (isFocusableCandidate(opener)) return opener;
    if (isFocusableCandidate(fallback)) return fallback;
    return findVisibleLauncher(['Send feedback', 'Open navigation menu']);
  };

  const focusTarget = resolveRestoreTarget();
  if (!focusTarget) return;
  focusTarget.focus();

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      const followUpTarget = resolveRestoreTarget();
      if (followUpTarget) followUpTarget.focus();
    });
  }
};

type SheetActions = {
  close: () => void;
  unmount: () => void;
};

export function FeedbackDrawer({
  opened,
  onClose,
  authenticatedEmail,
  entrySource,
  fallbackFocusRef,
}: FeedbackDrawerProps) {
  const [formVersion, setFormVersion] = useState(0);
  const [draft, setDraft] = useState<FeedbackFormDraft | null>(null);
  const sheetActionsRef = useRef<SheetActions | null>(null);
  const wasOpenRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);

  useInsertionEffect(() => {
    if (!opened || wasOpenRef.current) return;

    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    openerRef.current = (
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null
    );
  }, [opened]);

  useEffect(() => {
    if (opened && !wasOpenRef.current) {
      const path = typeof window !== 'undefined' ? window.location.pathname : '/';
      trackFeedbackOpened({
        entrySource: entrySource as FeedbackEntrySource,
        pathCategory: normalizeFeedbackPathCategory(path),
      });
    }

    if (!opened && wasOpenRef.current) {
      restoreFocusTarget(openerRef.current, resolveFocusTarget(fallbackFocusRef));
    }

    wasOpenRef.current = opened;
  }, [entrySource, fallbackFocusRef, opened]);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;

    onClose();
  };

  const requestClose = () => {
    if (sheetActionsRef.current) {
      sheetActionsRef.current.close();
      return;
    }
    onClose();
  };

  return (
    <Sheet
      open={opened}
      actionsRef={sheetActionsRef}
      onOpenChange={handleSheetOpenChange}
    >
      <SheetContent
        keepMounted
        side="right"
        initialFocus
        finalFocus={false}
        style={{ width: 'min(100vw, 520px)' }}
      >
        <SheetHeader>
          <SheetTitle>Send feedback</SheetTitle>
          <SheetDescription>
            Share a bug, suggest an idea, or send general feedback. We will save your submission so our team can review it.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <FeedbackForm
            key={formVersion}
            authenticatedEmail={authenticatedEmail}
            entrySource={entrySource}
            draft={draft ?? undefined}
            onDraftChange={setDraft}
            onCancel={requestClose}
            onDone={() => {
              setDraft(null);
              setFormVersion((value) => value + 1);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default FeedbackDrawer;
