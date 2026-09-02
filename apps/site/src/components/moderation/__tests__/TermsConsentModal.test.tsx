import type { ReactNode } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TermsConsentModal } from '../TermsConsentModal';

const state = {
  summary: ['Use respectful language.'],
  url: '/legal/terms',
};

describe('TermsConsentModal', () => {
  it('keeps a required consent dialog open for Escape and outside interaction', async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn();
    const onClose = jest.fn();

    render(
      <TermsConsentModal
        open
        state={state}
        onAccept={onAccept}
        onClose={onClose}
        allowClose={false}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Agree to the Terms and EULA' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agree' })).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Agree to the Terms and EULA' })).toBe(dialog);
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).toBeTruthy();
    fireEvent.pointerDown(overlay);
    fireEvent.pointerUp(overlay);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Agree to the Terms and EULA' })).toBeInTheDocument();
  });

  it('supports X, Not now, Escape, save state, and focus return when closable', async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn();
    let open = false;
    let rerender: (ui: ReactNode) => void = () => {};
    const onClose = jest.fn(() => {
      open = false;
      rerender(
        <>
          <button type="button" id="terms-trigger">Open terms</button>
          <TermsConsentModal open={open} state={state} onAccept={onAccept} onClose={onClose} />
        </>,
      );
    });

    const rendered = render(
      <>
        <button type="button" id="terms-trigger">Open terms</button>
        <TermsConsentModal open={open} state={state} onAccept={onAccept} onClose={onClose} />
      </>,
    );
    rerender = rendered.rerender;

    const trigger = document.getElementById('terms-trigger') as HTMLButtonElement;
    trigger.focus();
    open = true;
    rerender(
      <>
        <button type="button" id="terms-trigger">Open terms</button>
        <TermsConsentModal open={open} state={state} onAccept={onAccept} onClose={onClose} />
      </>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Agree' })).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Read full terms' })).toHaveAttribute('href', '/legal/terms');
    await user.click(screen.getByRole('button', { name: 'Agree' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());

    open = true;
    trigger.focus();
    rerender(
      <>
        <button type="button" id="terms-trigger">Open terms</button>
        <TermsConsentModal open={open} state={state} onAccept={onAccept} onClose={onClose} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    open = true;
    trigger.focus();
    rerender(
      <>
        <button type="button" id="terms-trigger">Open terms</button>
        <TermsConsentModal open={open} state={state} onAccept={onAccept} onClose={onClose} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows the saving label, focuses the terms link, and disables the accept action while loading', async () => {
    const onAccept = jest.fn();

    render(
      <TermsConsentModal
        open
        state={null}
        loading
        onAccept={onAccept}
      />,
    );

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByText('There is no tolerance for objectionable content or abusive users.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read full terms' })).toHaveAttribute('href', '/terms');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Read full terms' })).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
