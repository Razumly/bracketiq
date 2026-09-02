'use client';

import Image from 'next/image';
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  Pencil,
  Search,
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
  updatingHomePagePreference?: boolean;
  onSetHomePage?: (checked: boolean) => void;
  canCreateEvent?: boolean;
  createEventDisabled?: boolean;
  createEventHelperText?: string | null;
  onCreateEvent?: () => void;
  overviewEmpty?: boolean;
  children?: ReactNode;
};

function OrganizationShellLoadingState() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" data-testid="organization-shell-loading">
      <div className="h-36 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none sm:h-52" />
      <div className="-mt-10 space-y-4 px-2 sm:-mt-14 sm:px-6">
        <div className="h-24 w-24 animate-pulse rounded-full border-4 border-background bg-muted motion-reduce:animate-none sm:h-28 sm:w-28" />
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          <div className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
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
      <Card className="w-full border-destructive/30 bg-destructive/5">
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
      <Card className="w-full text-center">
        <CardContent className="flex flex-col items-center gap-4 p-8 sm:p-12">
          <div className="grid size-16 place-content-center rounded-full bg-muted text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">You do not have permission</h1>
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
    </main>
  );
}

function OrganizationShellEmptyOverview({
  organization,
  canCreateEvent,
  createEventDisabled,
  onCreateEvent,
  onEditOrganization,
}: Pick<OrganizationManagementShellProps, 'organization' | 'canCreateEvent' | 'createEventDisabled' | 'onCreateEvent' | 'onEditOrganization'>) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="organization-overview-empty">
      <Card className="lg:col-span-2">
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
              <Button disabled={createEventDisabled} onClick={onCreateEvent}>
                <CalendarDays data-icon="inline-start" aria-hidden="true" />
                Create event
              </Button>
            )}
            {onEditOrganization && (
              <Button variant="outline" onClick={onEditOrganization}>
                <Pencil data-icon="inline-start" aria-hidden="true" />
                Complete profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
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
        className="max-h-[min(90dvh,48rem)] gap-0 rounded-t-3xl p-0"
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
              <SheetTitle id={titleId} className="truncate">{organization.name}</SheetTitle>
              <SheetDescription>Organization sections</SheetDescription>
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
  canEditOrganization = false,
  onEditOrganization,
  canToggleHomePagePreference = false,
  isCurrentOrganizationHomePage = false,
  updatingHomePagePreference = false,
  onSetHomePage,
  canCreateEvent = false,
  createEventDisabled = false,
  createEventHelperText,
  onCreateEvent,
  overviewEmpty = false,
  children,
}: OrganizationManagementShellProps) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const homePageCheckboxId = useId();

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
        <Card className="w-full text-center">
          <CardContent className="p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Organization not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This Organization is no longer available.</p>
            <Button className="mt-6" onClick={onBackToOrganizations}>Back to My organizations</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const logoUrl = organization.logoUrl
    ?? (organization.logoId
      ? `/api/files/${organization.logoId}/preview?w=160&h=160&fit=contain`
      : `/api/avatars/initials?name=${encodeURIComponent(organization.name)}&size=160`);

  return (
    <div className="min-w-0 bg-background text-foreground" data-testid="organization-management-shell">
      <section className="relative overflow-hidden bg-slate-950">
        <div
          aria-hidden="true"
          className="h-36 bg-[radial-gradient(circle_at_78%_18%,rgba(20,184,166,0.36),transparent_28%),linear-gradient(120deg,#0f172a_0%,#172554_55%,#0f766e_140%)] sm:h-52"
          style={organization.brandPrimaryColor ? { backgroundColor: organization.brandPrimaryColor } : undefined}
        >
          <div className="mx-auto h-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="h-full w-1/2 border-r border-white/10 opacity-60" />
          </div>
        </div>
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="relative -mt-12 flex flex-col gap-4 pb-5 sm:-mt-16 sm:pb-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-end gap-4">
                <div className="grid size-24 shrink-0 place-content-center overflow-hidden rounded-full border-4 border-background bg-card shadow-lg sm:size-32">
                  <Image src={logoUrl} alt={`${organization.name} logo`} width={128} height={128} unoptimized className="size-full object-contain" />
                </div>
                <div className="min-w-0 pb-1 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Organization</p>
                  <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{organization.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
                    {organization.location && (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4 shrink-0" />
                        <span className="break-words">{organization.location}</span>
                      </span>
                    )}
                    {organization.website && (
                      <a href={organization.website} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 underline-offset-4 hover:underline">
                        <Globe2 aria-hidden="true" className="size-4 shrink-0" />
                        <span className="max-w-64 truncate">Website</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
                {canEditOrganization && onEditOrganization && (
                  <Button variant="default" onClick={onEditOrganization} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    <span>Edit organization</span>
                  </Button>
                )}
                {headerActions}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-36">
              {organization.sports?.map((sport) => (
                <span key={sport} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85">
                  {sport}
                </span>
              ))}
              {headerBadges}
              {canToggleHomePagePreference && onSetHomePage && (
                <label htmlFor={homePageCheckboxId} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-white/75 hover:bg-white/10">
                  <Checkbox
                    id={homePageCheckboxId}
                    checked={isCurrentOrganizationHomePage}
                    disabled={updatingHomePagePreference}
                    onCheckedChange={(checked) => onSetHomePage(Boolean(checked))}
                    className="text-white before:border-white/50 before:bg-transparent data-checked:before:border-accent data-checked:before:bg-accent"
                  />
                  Set as home page
                </label>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="md:hidden">
          <Button
            variant="outline"
            aria-haspopup="dialog"
            aria-expanded={sectionsOpen}
            onClick={() => setSectionsOpen(true)}
            className="w-full justify-between bg-card text-left"
          >
            <span className="min-w-0 truncate">
              <span className="mr-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Organization sections</span>
              <span>{getOrganizationTabLabel(availableTabs, activeTab)}</span>
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          </Button>
          <OrganizationSectionDrawer
            organization={organization}
            availableTabs={availableTabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
            open={sectionsOpen}
            onOpenChange={setSectionsOpen}
          />
        </div>

        <div className="hidden md:block">
          <Tabs value={activeTab} onValueChange={onTabChange}>
            <TabsList variant="line" aria-label="Organization sections" className="w-full gap-x-1 gap-y-0 border-b border-border rounded-none p-0">
              {availableTabs.map((option) => {
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
          </Tabs>
        </div>

        {activeTab === 'overview' && (
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Organization overview</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage the profile, activity, and people connected to this Organization.</p>
            </div>
            {canCreateEvent && onCreateEvent && (
              <div className="flex flex-col items-end gap-1">
                <Button disabled={createEventDisabled} onClick={onCreateEvent}>
                  <CalendarDays data-icon="inline-start" aria-hidden="true" />
                  Create event
                </Button>
                {createEventHelperText && <p className="max-w-64 text-right text-xs text-muted-foreground">{createEventHelperText}</p>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && overviewEmpty ? (
          <div className="mt-6">
            <OrganizationShellEmptyOverview
              organization={organization}
              canCreateEvent={canCreateEvent}
              createEventDisabled={createEventDisabled}
              onCreateEvent={onCreateEvent}
              onEditOrganization={onEditOrganization}
            />
          </div>
        ) : (
          <div className="mt-6 min-w-0" data-slot="organization-tab-content">{children}</div>
        )}
      </div>
    </div>
  );
}
