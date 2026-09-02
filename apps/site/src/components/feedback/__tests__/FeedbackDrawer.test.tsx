import { useRef, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import FeedbackDrawer from '../FeedbackDrawer';
import { createFeedbackSubmission } from '@/lib/feedbackService';
import { trackFeedbackOpened } from '@/lib/analytics/feedbackAnalytics';

jest.mock('@/lib/feedbackService', () => ({
  createFeedbackSubmission: jest.fn(),
}));
jest.mock('@/lib/analytics/feedbackAnalytics', () => ({
  normalizeFeedbackPathCategory: jest.fn(() => 'discover'),
  trackFeedbackOpened: jest.fn(),
  trackFeedbackSubmitted: jest.fn(),
}));

const createFeedbackMock = createFeedbackSubmission as jest.MockedFunction<typeof createFeedbackSubmission>;
const mockRendered = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => [rect],
  });
};

describe('FeedbackDrawer', () => {
  beforeEach(() => {
    createFeedbackMock.mockResolvedValue({
      ok: true,
      submission: { id: 'feedback_1', status: 'NEW', createdAt: '2026-08-06T20:00:00.000Z' },
    });
  });

  it('tracks each open transition and preserves a draft when closed and reopened', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    function Harness() {
      const [opened, setOpened] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpened(true)}>Feedback trigger</button>
          <FeedbackDrawer
            opened={opened}
            onClose={() => {
              onClose();
              setOpened(false);
            }}
            entrySource="desktop_header"
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Feedback trigger' });
    mockRendered(trigger);
    trigger.focus();
    await user.click(trigger);

    expect(await screen.findByRole('dialog', { name: /send feedback/i })).toBeInTheDocument();
    expect(trackFeedbackOpened).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText(/your feedback/i), 'Keep this draft while I inspect another page.');
    expect(trackFeedbackOpened).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /send feedback/i })).not.toBeInTheDocument();
      const closedDialog = screen.getByRole('dialog', { hidden: true });
      expect(closedDialog).toHaveAttribute('hidden');
      expect(document.querySelector('[data-slot="sheet-overlay"]')).toHaveAttribute('hidden');
    });
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByLabelText(/your feedback/i)).toHaveValue(
        'Keep this draft while I inspect another page.',
      );
    });
    expect(trackFeedbackOpened).toHaveBeenCalledTimes(2);
  });

  it('closes once through Escape and the close button, then restores focus to the opener', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    function Harness() {
      const [opened, setOpened] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpened(true)}>Feedback trigger</button>
          <FeedbackDrawer
            opened={opened}
            onClose={() => {
              onClose();
              setOpened(false);
            }}
            entrySource="desktop_header"
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Feedback trigger' });
    mockRendered(trigger);

    trigger.focus();
    await user.click(trigger);
    await screen.findByRole('dialog', { name: /send feedback/i });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await screen.findByRole('dialog', { name: /send feedback/i });
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('uses a connected fallback focus target when the opener is gone', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [opened, setOpened] = useState(false);
      const fallbackFocusRef = useRef<HTMLButtonElement>(null);

      return (
        <>
          <button type="button" onClick={() => setOpened(true)}>Feedback trigger</button>
          <button type="button" ref={fallbackFocusRef}>Fallback focus target</button>
          <FeedbackDrawer
            opened={opened}
            onClose={() => setOpened(false)}
            entrySource="mobile_menu"
            fallbackFocusRef={fallbackFocusRef}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Feedback trigger' });
    const fallback = screen.getByRole('button', { name: 'Fallback focus target' });
    mockRendered(fallback);
    trigger.focus();
    await user.click(trigger);
    await screen.findByRole('dialog', { name: /send feedback/i });
    jest.spyOn(trigger, 'isConnected', 'get').mockReturnValue(false);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(fallback).toHaveFocus());
  });

  it('restores focus to the visible navigation launcher when a connected opener becomes hidden', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [opened, setOpened] = useState(false);
      const [mobile, setMobile] = useState(false);

      return (
        <>
          <button
            type="button"
            aria-label="Send feedback"
            style={{ display: mobile ? 'none' : 'inline-flex' }}
            onClick={() => {
              setOpened(true);
              setMobile(true);
            }}
          >
            Desktop feedback launcher
          </button>
          <button
            type="button"
            aria-label="Open navigation menu"
            style={{ display: mobile ? 'inline-flex' : 'none' }}
          >
            Mobile navigation launcher
          </button>
          <FeedbackDrawer
            opened={opened}
            onClose={() => setOpened(false)}
            entrySource="desktop_header"
          />
        </>
      );
    }

    render(<Harness />);
    const feedbackLauncher = screen.getByRole('button', { name: 'Send feedback' });
    const navigationLauncher = document.querySelector<HTMLElement>(
      '[aria-label="Open navigation menu"]',
    );
    if (!navigationLauncher) throw new Error('Missing navigation launcher fixture.');
    mockRendered(feedbackLauncher);
    mockRendered(navigationLauncher);
    feedbackLauncher.focus();
    await user.click(feedbackLauncher);
    await screen.findByRole('dialog', { name: /send feedback/i });

    expect(feedbackLauncher.isConnected).toBe(true);
    expect(feedbackLauncher).not.toBeVisible();
    expect(navigationLauncher).toBeVisible();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(navigationLauncher).toHaveFocus());
  });

  it('resets the mounted form after Done and keeps it empty on the next open', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    function Harness() {
      const [opened, setOpened] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpened(true)}>Feedback trigger</button>
          <FeedbackDrawer
            opened={opened}
            onClose={() => {
              onClose();
              setOpened(false);
            }}
            entrySource="desktop_header"
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Feedback trigger' });
    mockRendered(trigger);
    await user.click(trigger);
    await user.type(screen.getByLabelText(/your feedback/i), 'A complete feedback message for the drawer.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(await screen.findByTestId('feedback-confirmation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await waitFor(() => expect(screen.getByLabelText(/your feedback/i)).toHaveValue(''));
  });
});
