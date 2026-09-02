import React from 'react';
import { render, screen } from '@testing-library/react';

import Loading from '../Loading';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    alt ? <span role="img" aria-label={alt} /> : <span aria-hidden="true" />,
}));

describe('Loading', () => {
  it('announces caller text through a polite status without a fake busy lifecycle', () => {
    render(<Loading text="Loading teams..." />);

    const status = screen.getByRole('status', { name: 'Loading teams...' });

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('Loading teams...')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'BracketIQ logo' })).not.toBeInTheDocument();
  });

  it('keeps the default inline status and full-screen logo modes', () => {
    const view = render(<Loading size="sm" />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'BracketIQ logo' })).not.toBeInTheDocument();

    view.rerender(
      <Loading
        size="lg"
        fullScreen
        belowNavigation
        text="Opening event..."
      />,
    );

    expect(screen.getByRole('status', { name: 'Opening event...' })).toBeInTheDocument();
    expect(screen.getByText('Opening event...')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BracketIQ logo' })).toBeInTheDocument();
  });
});
