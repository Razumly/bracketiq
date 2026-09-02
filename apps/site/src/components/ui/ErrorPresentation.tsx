'use client';

import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';

export interface ErrorPresentationProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry: () => void;
}

export function ErrorPresentation({
  title = 'Something went wrong',
  message = 'We could not load this page. Try again.',
  retryLabel = 'Try again',
  onRetry,
}: ErrorPresentationProps): React.JSX.Element {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-[50vh] min-w-0 items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6 lg:px-10">
      <section
        role="region"
        aria-labelledby={headingId}
        className="w-full max-w-xl rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8"
      >
        <h1
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {title}
        </h1>
        <p role="alert" className="mt-3 text-muted-foreground">{message}</p>
        <Button className="mt-6" onClick={onRetry}>
          {retryLabel}
        </Button>
      </section>
    </main>
  );
}
