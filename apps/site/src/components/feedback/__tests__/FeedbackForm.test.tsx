import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedbackForm from '../FeedbackForm';
import { createFeedbackSubmission } from '@/lib/feedbackService';
import { trackFeedbackSubmitted } from '@/lib/analytics/feedbackAnalytics';

jest.mock('@/lib/feedbackService', () => ({
  createFeedbackSubmission: jest.fn(),
}));
jest.mock('@/lib/analytics/feedbackAnalytics', () => ({
  normalizeFeedbackPathCategory: jest.fn(() => 'discover'),
  trackFeedbackSubmitted: jest.fn(),
}));

const createFeedbackMock = createFeedbackSubmission as jest.MockedFunction<typeof createFeedbackSubmission>;

const renderForm = (props: Partial<ComponentProps<typeof FeedbackForm>> = {}) => render(
  <FeedbackForm entrySource="standalone_page" {...props} />,
);

const successResponse = {
  ok: true as const,
  submission: { id: 'feedback_1', status: 'NEW' as const, createdAt: '2026-08-06T20:00:00.000Z' },
};

describe('FeedbackForm', () => {
  beforeEach(() => {
    createFeedbackMock.mockResolvedValue(successResponse);
  });

  it('exposes labeled single-choice controls and the correct context field', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByRole('radiogroup', { name: /what kind of feedback is this/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/what did you expect/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Bug' }));
    expect(screen.getByLabelText(/what did you expect/i)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Idea' }));
    expect(screen.getByLabelText(/what are you trying to accomplish/i)).toBeInTheDocument();
  });

  it('uses a unique accessible label id for each form instance', () => {
    render(
      <>
        <FeedbackForm entrySource="standalone_page" />
        <FeedbackForm entrySource="desktop_header" />
      </>,
    );

    const labelIds = screen
      .getAllByRole('radiogroup')
      .map((control) => control.getAttribute('aria-labelledby'));
    expect(new Set(labelIds).size).toBe(2);
  });

  it('does not submit hidden context after switching to General', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: 'Bug' }));
    await user.type(screen.getByLabelText(/what did you expect/i), 'I expected the selected court to remain visible.');
    await user.click(screen.getByRole('radio', { name: 'General' }));
    await user.type(screen.getByLabelText(/your feedback/i), 'Please make the schedule easier to scan.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(createFeedbackMock).toHaveBeenCalled());
    const submittedInput = createFeedbackMock.mock.calls[createFeedbackMock.mock.calls.length - 1]?.[0];
    expect(submittedInput).toEqual(expect.objectContaining({ type: 'GENERAL' }));
    expect(submittedInput).not.toHaveProperty('additionalContext');
  });

  it('keeps fields editable and supports retry after a recoverable request error', async () => {
    const user = userEvent.setup();
    createFeedbackMock.mockRejectedValueOnce(new Error('Temporary server error'));
    renderForm();

    const message = screen.getByLabelText(/your feedback/i);
    await user.type(message, 'This message should remain after an error.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary server error');
    expect(message).not.toHaveAttribute('aria-invalid');
    expect(message).not.toHaveAttribute('aria-describedby');
    expect(message).toHaveValue('This message should remain after an error.');

    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(await screen.findByTestId('feedback-confirmation')).toBeInTheDocument();
  });

  it('prefills authenticated email and sends it only with consent', async () => {
    const user = userEvent.setup();
    renderForm({ authenticatedEmail: 'member@example.com' });

    const consent = screen.getByRole('checkbox', { name: /contact me/i });
    await user.click(consent);
    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com');
    await user.type(screen.getByLabelText(/your feedback/i), 'Please make the schedule easier to scan.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(createFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      allowContact: true,
      contactEmail: 'member@example.com',
      sourcePath: '/',
      clientContext: expect.objectContaining({ surface: 'WEB' }),
    })));

    await user.click(screen.getByRole('button', { name: /send another/i }));
    expect(screen.getByRole('checkbox', { name: /contact me/i })).not.toBeChecked();
    await user.type(screen.getByLabelText(/your feedback/i), 'No contact should be included here.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    await waitFor(() => expect(createFeedbackMock).toHaveBeenLastCalledWith(expect.objectContaining({
      allowContact: false,
      contactEmail: undefined,
    })));
  });

  it('applies authenticated email that arrives after the form mounts', async () => {
    const user = userEvent.setup();
    const view = renderForm();

    view.rerender(
      <FeedbackForm entrySource="standalone_page" authenticatedEmail="member@example.com" />,
    );
    await user.click(screen.getByRole('checkbox', { name: /contact me/i }));

    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com');
  });

  it('shows the consent validation error without submitting', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('checkbox', { name: /contact me/i }));
    await user.type(screen.getByLabelText(/your feedback/i), 'A valid message without an email address.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter an email address/i);
    const email = screen.getByLabelText(/email address/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby');
    const message = screen.getByLabelText(/your feedback/i);
    expect(message).not.toHaveAttribute('aria-invalid');
    expect(message).not.toHaveAttribute('aria-describedby');
    expect(createFeedbackMock).not.toHaveBeenCalled();
  });

  it('captures context, honeypot, current path, viewport, and submission analytics', async () => {
    const user = userEvent.setup();
    const originalPath = window.location.pathname;
    window.history.pushState({}, '', '/events/example');
    renderForm();

    await user.click(screen.getByRole('radio', { name: 'Bug' }));
    await user.type(screen.getByLabelText(/what did you expect/i), 'Keep the selected court visible.');
    await user.type(screen.getByLabelText(/your feedback/i), 'Please make the schedule easier to scan.');

    const honeypot = document.querySelector('input[name="companyWebsite"]');
    expect(honeypot).toBeInstanceOf(HTMLInputElement);
    await user.type(honeypot as HTMLInputElement, 'https://spam.example');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(createFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'BUG',
      additionalContext: 'Keep the selected court visible.',
      sourcePath: '/events/example',
      clientContext: {
        surface: 'WEB',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
      companyWebsite: 'https://spam.example',
    })));
    expect(trackFeedbackSubmitted).toHaveBeenCalledWith(expect.objectContaining({ type: 'BUG' }));
    window.history.replaceState({}, '', originalPath);
  });

  it('rejects feedback longer than 5,000 characters', async () => {
    const user = userEvent.setup();
    renderForm();

    const message = screen.getByLabelText(/your feedback/i);
    fireEvent.change(message, { target: { value: 'x'.repeat(5001) } });
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/5,000 characters or fewer/i);
    expect(createFeedbackMock).not.toHaveBeenCalled();
  });

  it('shows validation, loading, success, and Send another states', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((value: typeof successResponse) => void) | undefined;
    createFeedbackMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    renderForm();

    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 10 characters/i);
    const message = screen.getByLabelText(/your feedback/i);
    expect(message).toHaveAttribute('aria-invalid', 'true');
    expect(message).toHaveAttribute('aria-describedby');

    await user.type(screen.getByLabelText(/your feedback/i), 'This is a valid feedback message.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled();
    resolveRequest?.(successResponse);

    expect(await screen.findByTestId('feedback-confirmation')).toBeInTheDocument();
    expect(trackFeedbackSubmitted).toHaveBeenCalledWith(expect.objectContaining({ type: 'GENERAL' }));
    await user.click(screen.getByRole('button', { name: /send another/i }));
    expect(screen.getByLabelText(/your feedback/i)).toHaveValue('');
  });

  it('copies the confirmation identifier and calls Done and Cancel once', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onDone = jest.fn();
    const onCancel = jest.fn();
    renderForm({ onDone, onCancel });

    await user.type(screen.getByLabelText(/your feedback/i), 'This is a valid feedback message.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    await screen.findByTestId('feedback-confirmation');
    await user.click(screen.getByRole('button', { name: /copy confirmation identifier/i }));
    expect(writeText).toHaveBeenCalledWith('feedback_1');

    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });
});
