'use client';

import Image from 'next/image';
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CircleDot,
  ClipboardList,
  FileText,
  Globe2,
  LayoutDashboard,
  MapPin,
  Pencil,
  Search,
  Share2,
  Settings2,
  ShieldCheck,
  Store,
  TicketCheck,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrganizationOperationPermissionState } from '@/components/organization/OrganizationOperationStates';
import { OrganizationDataLoadingProvider } from './OrganizationDataLoading';
import type { Organization } from '@/types';
import type { OrganizationTab, OrganizationTabOption } from '@/app/organizations/[id]/organizationTabs';

export type OrganizationShellStatus = 'loading' | 'ready' | 'empty' | 'error' | 'permission-denied';

type OrganizationShellOrganization = Pick<
  Organization,
  '$id' | 'name' | 'description' | 'website' | 'sports' | 'location' | 'logoId' | 'logoUrl' | 'imageUrl' | 'brandPrimaryColor'
>;

type OrganizationTabGroup = {
  label: string;
  values: OrganizationTab[];
};

const ORGANIZATION_TAB_GROUPS: OrganizationTabGroup[] = [
  {
    label: 'Organization',
    values: ['overview', 'reviews', 'events', 'teams', 'users', 'fields'],
  },
  {
    label: 'Manage',
    values: ['divisions', 'eventTemplates', 'templates', 'staff', 'discounts', 'finance', 'refunds', 'publicPage', 'store'],
  },
];

const ORGANIZATION_TAB_ICONS: Record<OrganizationTab, LucideIcon> = {
  overview: LayoutDashboard,
  reviews: ShieldCheck,
  divisions: BarChart3,
  events: CalendarDays,
  eventTemplates: ClipboardList,
  teams: Users,
  users: Users,
  fields: Building2,
  staff: Users,
  discounts: TicketCheck,
  finance: CircleDollarSign,
  refunds: CircleDollarSign,
  publicPage: Globe2,
  store: Store,
  templates: FileText,
};

const getOrganizationTabLabel = (availableTabs: OrganizationTabOption[], tab: OrganizationTab): string => (
  availableTabs.find((option) => option.value === tab)?.label ?? tab
);

export type OrganizationManagementShellProps = {
  organization?: OrganizationShellOrganization;
  status: OrganizationShellStatus;
  availableTabs: OrganizationTabOption[];
  activeTab: OrganizationTab;
  onTabChange: (value: string) => void;
  onRetry?: () => void;
  errorMessage?: string | null;
  onBackToOrganizations?: () => void;
  headerBadges?: ReactNode;
  headerActions?: ReactNode;
  canEditOrganization?: boolean;
  onEditOrganization?: () => void;
  canToggleHomePagePreference?: boolean;
  isCurrentOrganizationHomePage?: boolean;
  isUpdatingHomePagePreference?: boolean;
  onSetHomePage?: (checked: boolean) => void;
  canCreateEvent?: boolean;
  isCreateEventDisabled?: boolean;
  createEventHelperText?: string | null;
  onCreateEvent?: () => void;
  isOverviewEmpty?: boolean;
  isTabLoading?: boolean;
  onShareOrganization?: () => void;
  children?: ReactNode;
};

function OrganizationShellLoadingState() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" data-testid="organization-shell-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading Organization overview</span>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="size-24 shrink-0 animate-pulse rounded-full border border-border bg-muted motion-reduce:animate-none sm:size-28" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-5 w-80 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          </div>
        </div>
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="h-72 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-72 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

function OrganizationShellErrorState({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
      <Card className="w-full rounded-lg border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle>We could not load this overview</CardTitle>
          <CardDescription>
            {message ?? 'The Organization overview is not available right now. Try again.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {onRetry && <Button onClick={onRetry}>Try again</Button>}
          <Button variant="outline" onClick={() => window.location.assign('/organizations')}>
            Go to My organizations
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function OrganizationShellPermissionState({
  organizationName,
  onBackToOrganizations,
}: {
  organizationName?: string;
  onBackToOrganizations?: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[55vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
      <div className="w-full">
        <OrganizationOperationPermissionState organizationName={organizationName} onBackToOrganizations={onBackToOrganizations} />
      </div>
    </main>
  );
}

function OrganizationShellEmptyOverview({
  organization,
  canCreateEvent,
  isCreateEventDisabled,
  canEditOrganization,
  onCreateEvent,
  onEditOrganization,
}: Pick<OrganizationManagementShellProps, 'organization' | 'canCreateEvent' | 'isCreateEventDisabled' | 'onCreateEvent' | 'onEditOrganization'> & { canEditOrganization?: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="organization-overview-empty">
      <Card className="rounded-lg lg:col-span-2">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:px-12">
          <div className="grid size-14 place-content-center rounded-full bg-accent/15 text-accent-foreground">
            <CalendarDays aria-hidden="true" className="size-7" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Start building {organization?.name}</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Add your first event or complete your Organization profile so people can find and trust it.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {canCreateEvent && onCreateEvent && (
              <Button disabled={isCreateEventDisabled} onClick={onCreateEvent}>
                <CalendarDays data-icon="inline-start" aria-hidden="true" />
                Create event
              </Button>
            )}
            {canEditOrganization && onEditOrganization && (
              <Button variant="outline" onClick={onEditOrganization}>
                <Pencil data-icon="inline-start" aria-hidden="true" />
                Complete profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Finish Organization setup</CardTitle>
          <CardDescription>Complete these steps to make the profile ready for your community.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Settings2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Add a description and contact details.</span>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Publish an event for players to discover.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrganizationSectionDrawer({
  organization,
  availableTabs,
  activeTab,
  onTabChange,
  open,
  onOpenChange,
}: {
  organization: OrganizationShellOrganization;
  availableTabs: OrganizationTabOption[];
  activeTab: OrganizationTab;
  onTabChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const titleId = useId();
  const groups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return ORGANIZATION_TAB_GROUPS
      .map((group) => ({
        ...group,
        tabs: group.values
          .map((value) => availableTabs.find((option) => option.value === value))
          .filter((option): option is OrganizationTabOption => Boolean(option))
          .filter((option) => !normalizedSearch || option.label.toLowerCase().includes(normalizedSearch)),
      }))
      .filter((group) => group.tabs.length > 0);
  }, [availableTabs, search]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-labelledby={titleId}
        className="max-h-[min(90dvh,48rem)] gap-0 rounded-t-xl p-0"
      >
        <SheetHeader className="border-b border-border pb-4">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <div className="flex items-start gap-3">
            <div className="grid size-12 shrink-0 place-content-center overflow-hidden rounded-xl border border-border bg-muted">
              {organization.logoId || organization.logoUrl ? (
                <Image
                  src={organization.logoUrl ?? `/api/files/${organization.logoId}/preview?w=96&h=96&fit=contain`}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                  className="size-full object-contain"
                />
              ) : (
                <Building2 aria-hidden="true" className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle id={titleId}>Organization sections</SheetTitle>
              <SheetDescription className="truncate">{organization.name}</SheetDescription>
            </div>
            <SheetClose aria-label="Close Organization sections" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X aria-hidden="true" className="size-5" />
            </SheetClose>
          </div>
          <label className="relative mt-4 block">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              aria-label="Find an Organization section"
              placeholder="Find a section"
              className="pl-10"
            />
          </label>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-8 sm:px-6">
          {groups.length > 0 ? groups.map((group) => (
            <section key={group.label} aria-labelledby={`${titleId}-${group.label}`} className="pt-5">
              <h3 id={`${titleId}-${group.label}`} className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </h3>
              <div className="mt-2 space-y-1">
                {group.tabs.map((option) => {
                  const Icon = ORGANIZATION_TAB_ICONS[option.value];
                  const isActive = option.value === activeTab;
                  return (
                  <button
                      key={option.value}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none ${isActive ? 'bg-accent/15 text-accent-foreground' : 'text-foreground hover:bg-muted'}`}
                      onClick={() => {
                        onTabChange(option.value);
                        onOpenChange(false);
                      }}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {isActive && <Check aria-hidden="true" className="size-4 shrink-0" />}
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </section>
          )) : (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">No sections match your search.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type OrganizationIdentityHeaderProps = Pick<OrganizationManagementShellProps,
  'headerBadges' | 'headerActions' | 'canEditOrganization' | 'onEditOrganization' | 'canToggleHomePagePreference' | 'isCurrentOrganizationHomePage' | 'isUpdatingHomePagePreference' | 'onSetHomePage' | 'onShareOrganization'
> & { organization: OrganizationShellOrganization };

function organizationLogoUrl(organization: OrganizationShellOrganization): string {
  if (organization.logoUrl) return organization.logoUrl;
  if (organization.logoId) return `/api/files/${organization.logoId}/preview?w=160&h=160&fit=contain`;
  return `/api/avatars/initials?name=${encodeURIComponent(organization.name)}&size=160`;
}

function OrganizationIdentityHeader({ organization, headerBadges, headerActions, canEditOrganization, onEditOrganization, canToggleHomePagePreference, isCurrentOrganizationHomePage, isUpdatingHomePagePreference, onSetHomePage, onShareOrganization }: OrganizationIdentityHeaderProps) {
  const homePageCheckboxId = useId();
  const logoUrl = organizationLogoUrl(organization);
  return (
      <section className="bg-background">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-5 sm:py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex w-full min-w-0 flex-1 items-center gap-4 sm:w-auto">
                <div className="grid size-24 shrink-0 place-content-center overflow-hidden rounded-full border border-border bg-card shadow-sm sm:size-28">
                  <Image src={logoUrl} alt={`${organization.name} logo`} width={128} height={128} unoptimized className="size-full object-contain" />
                </div>
                <div className="min-w-0 text-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{organization.name}</h1>
                    {headerBadges}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-muted-foreground sm:text-sm">
                    {organization.location && (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4 shrink-0" />
                        <span className="break-words">{organization.location}</span>
                      </span>
                    )}
                    {organization.sports?.map((sport, index) => (
                      <span key={sport} className="org-shell-sport">
                        <CircleDot aria-hidden="true" className={`size-5 ${index % 2 === 0 ? 'text-accent' : 'text-violet-500'}`} />
                        <span>{sport}</span>
                      </span>
                    ))}
                    {canToggleHomePagePreference && onSetHomePage && (
                      <label htmlFor={homePageCheckboxId} className="inline-flex min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground hover:bg-muted">
                        <Checkbox
                          id={homePageCheckboxId}
                          checked={Boolean(isCurrentOrganizationHomePage)}
                          disabled={isUpdatingHomePagePreference}
                          onCheckedChange={(checked) => onSetHomePage(Boolean(checked))}
                          className="text-white before:border-white/50 before:bg-transparent data-checked:before:border-accent data-checked:before:bg-accent"
                        />
                        Set as home page
                      </label>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
                {onShareOrganization && (
                  <Button variant="outline" onClick={onShareOrganization} className="border-border bg-background text-foreground hover:bg-muted">
                    <Share2 data-icon="inline-start" aria-hidden="true" />
                    <span>Share</span>
                  </Button>
                )}
                {canEditOrganization && onEditOrganization && (
                  <Button variant="default" onClick={onEditOrganization} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    <span>Edit organization</span>
                  </Button>
                )}
                {headerActions}
              </div>
            </div>
          </div>
        </div>
      </section>
  );
}

function OrganizationOverviewHeading({ canCreateEvent, isCreateEventDisabled, createEventHelperText, onCreateEvent }: Pick<OrganizationManagementShellProps, 'canCreateEvent' | 'isCreateEventDisabled' | 'createEventHelperText' | 'onCreateEvent'>) {
  return (
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Organization overview</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage the profile, activity, and people connected to this Organization.</p>
            </div>
            {canCreateEvent && onCreateEvent && (
              <div className="flex flex-col items-end gap-1">
                <Button disabled={isCreateEventDisabled} onClick={onCreateEvent}>
                  <CalendarDays data-icon="inline-start" aria-hidden="true" />
                  Create event
                </Button>
                {createEventHelperText && <p className="max-w-64 text-right text-xs text-muted-foreground">{createEventHelperText}</p>}
              </div>
            )}
          </div>
  );
}

function OrganizationRefreshError({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <h2 className="font-semibold">Organization data could not refresh</h2>
      <p className="mt-2 text-sm">{message}</p>
      {onRetry && <Button variant="outline" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

function isEmptyOverview({ activeTab, isOverviewEmpty, isTabLoading }: Pick<OrganizationManagementShellProps, 'activeTab' | 'isOverviewEmpty' | 'isTabLoading'>) {
  return activeTab === 'overview' && isOverviewEmpty && !isTabLoading;
}

export function OrganizationManagementShell({
  organization,
  status,
  availableTabs,
  activeTab,
  onTabChange,
  onRetry,
  errorMessage,
  onBackToOrganizations,
  headerBadges,
  headerActions,
  canEditOrganization,
  onEditOrganization,
  canToggleHomePagePreference,
  isCurrentOrganizationHomePage,
  isUpdatingHomePagePreference,
  onSetHomePage,
  canCreateEvent,
  isCreateEventDisabled,
  createEventHelperText,
  onCreateEvent,
  isOverviewEmpty,
  isTabLoading,
  onShareOrganization,
  children,
}: OrganizationManagementShellProps) {
  const [isSectionsOpen, setIsSectionsOpen] = useState(false);

  if (status === 'loading') {
    return <OrganizationShellLoadingState />;
  }
  if (status === 'error') {
    return <OrganizationShellErrorState message={errorMessage} onRetry={onRetry} />;
  }
  if (status === 'permission-denied') {
    return (
      <OrganizationShellPermissionState
        organizationName={organization?.name}
        onBackToOrganizations={onBackToOrganizations}
      />
    );
  }
  if (status === 'empty' || !organization) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-xl items-center px-4 py-12 sm:px-6">
        <Card className="w-full rounded-lg text-center">
          <CardContent className="p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Organization not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This Organization is no longer available.</p>
            <Button className="mt-6" onClick={onBackToOrganizations}>Back to My organizations</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="org-page-shell organization-management-shell min-w-0 bg-background text-foreground" data-testid="organization-management-shell">
      <OrganizationIdentityHeader organization={organization} headerBadges={headerBadges} headerActions={headerActions} canEditOrganization={canEditOrganization} onEditOrganization={onEditOrganization} canToggleHomePagePreference={canToggleHomePagePreference} isCurrentOrganizationHomePage={isCurrentOrganizationHomePage} isUpdatingHomePagePreference={isUpdatingHomePagePreference} onSetHomePage={onSetHomePage} onShareOrganization={onShareOrganization} />

      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="md:hidden">
          <Button
            variant="outline"
            aria-haspopup="dialog"
            aria-expanded={isSectionsOpen}
            aria-label={getOrganizationTabLabel(availableTabs, activeTab)}
            onClick={() => setIsSectionsOpen(true)}
            className="w-full justify-between bg-card text-left"
          >
            <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
              <span className="truncate font-semibold">{getOrganizationTabLabel(availableTabs, activeTab)}</span>
              <span className="text-xs font-normal text-muted-foreground">Organization sections</span>
            </span>
            <ChevronDown aria-hidden="true" className="size-5 shrink-0" />
          </Button>
            <OrganizationSectionDrawer
            organization={organization}
            availableTabs={availableTabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
              open={isSectionsOpen}
              onOpenChange={setIsSectionsOpen}
          />
        </div>

        <div className="hidden md:block">
          <Tabs value={activeTab} onValueChange={onTabChange}>
            {ORGANIZATION_TAB_GROUPS.map((group) => {
              const groupTabs = group.values
                .map((value) => availableTabs.find((option) => option.value === value))
                .filter((option): option is OrganizationTabOption => Boolean(option));
              if (groupTabs.length === 0) return null;
              return (
                <TabsList key={group.label} variant="line" aria-label={`${group.label} sections`} className="w-full gap-x-1 gap-y-0 border-b border-border rounded-none p-0">
                  {groupTabs.map((option) => {
                    const Icon = ORGANIZATION_TAB_ICONS[option.value];
                    return (
                      <TabsTrigger
                        key={option.value}
                        value={option.value}
                        className="min-h-12 rounded-none px-3 text-sm lg:px-4"
                      >
                        <Icon aria-hidden="true" className="hidden size-4 lg:inline-block" />
                        {option.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              );
            })}
          </Tabs>
        </div>

        {activeTab === 'overview' && <OrganizationOverviewHeading canCreateEvent={canCreateEvent} isCreateEventDisabled={isCreateEventDisabled} createEventHelperText={createEventHelperText} onCreateEvent={onCreateEvent} />}

        <OrganizationRefreshError message={errorMessage} onRetry={onRetry} />
        {isEmptyOverview({ activeTab, isOverviewEmpty, isTabLoading }) ? (
          <div className="mt-6">
            <OrganizationShellEmptyOverview
              organization={organization}
              canCreateEvent={canCreateEvent}
              isCreateEventDisabled={isCreateEventDisabled}
              canEditOrganization={canEditOrganization}
              onCreateEvent={onCreateEvent}
              onEditOrganization={onEditOrganization}
            />
          </div>
        ) : (
          <div className="mt-6 min-w-0" data-slot="organization-tab-content">
            <OrganizationDataLoadingProvider loading={Boolean(isTabLoading)}>{children}</OrganizationDataLoadingProvider>
          </div>
        )}
      </div>
    </div>
  );
}
