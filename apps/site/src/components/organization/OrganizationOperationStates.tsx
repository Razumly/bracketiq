'use client';

import { ArrowLeft, CalendarDays, LockKeyhole } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type OrganizationOperationLoadingStateProps = {
  label: string;
};

export function OrganizationOperationLoadingState({ label }: OrganizationOperationLoadingStateProps) {
  return (
    <div className="grid gap-4" data-testid="organization-tab-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading {label}</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-56 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    </div>
  );
}

type OrganizationOperationErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function OrganizationOperationErrorState({ title = 'We could not load this section', message, onRetry }: OrganizationOperationErrorStateProps) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {onRetry && <CardContent><Button onClick={onRetry}>Try again</Button></CardContent>}
    </Card>
  );
}

type OrganizationOperationPermissionStateProps = {
  organizationName?: string;
  onBackToOrganizations?: () => void;
};

export function OrganizationOperationPermissionState({ organizationName, onBackToOrganizations }: OrganizationOperationPermissionStateProps) {
  return (
    <Card className="text-center">
      <CardContent className="flex flex-col items-center gap-4 p-8 sm:p-12">
        <div className="grid size-16 place-content-center rounded-full bg-muted text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-8" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">You do not have permission</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You cannot open this Organization section{organizationName ? ` for ${organizationName}` : ''}.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={onBackToOrganizations}>
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to My organizations
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('/organizations')}>
            View organizations
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type OrganizationOperationEmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function OrganizationOperationEmptyState({ title, message, actionLabel, onAction }: OrganizationOperationEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:px-12">
        <div className="grid size-14 place-content-center rounded-full bg-accent/15 text-accent-foreground">
          <CalendarDays aria-hidden="true" className="size-7" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{message}</p>
        </div>
        {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
      </CardContent>
    </Card>
  );
}
