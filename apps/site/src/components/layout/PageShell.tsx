import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface PageShellProps extends ComponentPropsWithoutRef<'div'> {
  footer: ReactNode;
}

export function PageShell({
  children,
  className,
  footer,
  ...props
}: PageShellProps): React.JSX.Element {
  return (
    <div
      className={cn('flex min-h-screen flex-col bg-background text-foreground', className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {footer}
    </div>
  );
}

