import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErrorPresentation } from '../ErrorPresentation';

describe('ErrorPresentation', () => {
  it('labels the error region, alerts only its message, focuses the heading, and retries once', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(<ErrorPresentation onRetry={onRetry} />);

    const heading = screen.getByRole('heading', { name: 'Something went wrong' });
    const region = screen.getByRole('region', { name: 'Something went wrong' });
    const alert = screen.getByRole('alert');
    const retryButton = screen.getByRole('button', { name: 'Try again' });

    expect(region).toBeInTheDocument();
    expect(alert).toHaveTextContent('We could not load this page. Try again.');
    expect(alert).not.toContainElement(retryButton);
    expect(heading).toHaveFocus();

    await user.tab();
    expect(retryButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses custom copy and calls retry once for each activation', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(
      <ErrorPresentation
        title="Organization unavailable"
        message="The organization could not be loaded."
        retryLabel="Reload organization"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('region', { name: 'Organization unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Organization unavailable' })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('The organization could not be loaded.');

    const retryButton = screen.getByRole('button', { name: 'Reload organization' });
    await user.tab();
    expect(retryButton).toHaveFocus();
    await user.keyboard(' ');
    await user.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
