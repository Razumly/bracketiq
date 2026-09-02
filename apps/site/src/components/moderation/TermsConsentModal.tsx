'use client';

import { type RefObject, useEffect, useInsertionEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type TermsConsentLikeState = {
  summary?: string[];
  url?: string;
} | null;

type TermsConsentModalProps = {
  open: boolean;
  state: TermsConsentLikeState;
  loading?: boolean;
  allowClose?: boolean;
  onAccept: () => void;
  onClose?: () => void;
  title?: string;
  intro?: string;
  confirmLabel?: string;
  dismissLabel?: string;
};

const DEFAULT_SUMMARY = [
  'There is no tolerance for objectionable content or abusive users.',
  'Users can report chats, events, and abusive users.',
  'Moderation acts on reports within 24 hours.',
];
function resolveTermsSummary(state: TermsConsentLikeState) {
  return state?.summary && state.summary.length > 0
    ? state.summary
    : DEFAULT_SUMMARY;
}
type TermsOpenChangeDetails = {
  cancel: () => void;
};

function handleTermsOpenChange(
  nextOpen: boolean,
  eventDetails: TermsOpenChangeDetails,
  canClose: boolean,
  onClose?: () => void,
) {
  if (nextOpen) {
    return;
  }

  if (!canClose) {
    eventDetails.cancel();
    return;
  }

  onClose?.();
}
function resolveCanClose(allowClose: boolean, onClose?: () => void) {
  return allowClose && Boolean(onClose);
}



function TermsConsentBody({
  acceptButtonRef,
  termsLinkRef,
  canClose,
  confirmLabel,
  dismissLabel,
  intro,
  loading,
  onAccept,
  onClose,
  summary,
  termsUrl,
  title,
}: {
  acceptButtonRef: RefObject<HTMLButtonElement | null>;
  termsLinkRef: RefObject<HTMLAnchorElement | null>;
  canClose: boolean;
  confirmLabel: string;
  dismissLabel: string;
  intro: string;
  loading: boolean;
  onAccept: () => void;
  onClose?: () => void;
  summary: string[];
  termsUrl: string;
  title: string;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{intro}</DialogDescription>
      </DialogHeader>

      <ul className="space-y-2 text-sm text-foreground">
        {summary.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-primary" aria-hidden="true">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        Moderation reports are reviewed within 24 hours. Confirmed objectionable content is removed and abusive users are ejected or suspended.
      </p>

      <DialogFooter className="mt-2 flex-row items-center justify-between gap-3 border-t-0 bg-transparent p-0">
        <Link
          ref={termsLinkRef}
          href={termsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary hover:text-primary/80"
        >
          Read full terms
        </Link>
        <div className="flex gap-2">
          {canClose && onClose && (
            <Button type="button" variant="outline" onClick={onClose}>
              {dismissLabel}
            </Button>
          )}
          <Button
            ref={acceptButtonRef}
            type="button"
            onClick={onAccept}
            disabled={loading}
          >
            {loading ? 'Saving...' : confirmLabel}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}


export function TermsConsentModal({
  open,
  state,
  loading = false,
  allowClose = true,
  onAccept,
  onClose,
  title = 'Agree to the Terms and EULA',
  intro = 'Sending chat messages, creating events, or other user-generated content in BracketIQ requires agreement to the Terms and EULA.',
  confirmLabel = 'Agree',
  dismissLabel = 'Not now',
}: TermsConsentModalProps) {
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const termsLinkRef = useRef<HTMLAnchorElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const canClose = resolveCanClose(allowClose, onClose);

  useInsertionEffect(() => {
    if (!open || wasOpenRef.current || typeof document === 'undefined') {
      return;
    }

    const activeElement = document.activeElement;
    openerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null;
  }, [open]);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      const opener = openerRef.current;
      const restoreFocus = () => {
        if (opener?.isConnected) {
          opener.focus();
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreFocus);
      } else {
        restoreFocus();
      }
    }

    wasOpenRef.current = open;
  }, [open]);


  const summary = resolveTermsSummary(state);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => (
        handleTermsOpenChange(nextOpen, eventDetails, canClose, onClose)
      )}
    >
      <DialogContent
        className="pointer-events-auto z-[70] max-w-lg"
        initialFocus={loading ? termsLinkRef : acceptButtonRef}
        finalFocus={false}
        showCloseButton={canClose}
      >
        <TermsConsentBody
          termsLinkRef={termsLinkRef}
          acceptButtonRef={acceptButtonRef}
          canClose={canClose}
          confirmLabel={confirmLabel}
          dismissLabel={dismissLabel}
          intro={intro}
          loading={loading}
          onAccept={onAccept}
          onClose={onClose}
          summary={summary}
          termsUrl={state?.url ?? '/terms'}
          title={title}
        />
      </DialogContent>
    </Dialog>
  );
}
