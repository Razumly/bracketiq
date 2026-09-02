'use client';

import { ErrorPresentation } from '@/components/ui/ErrorPresentation';

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return <ErrorPresentation onRetry={reset} />;
}
