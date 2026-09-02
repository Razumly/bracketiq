'use client';

import { useEffect, useInsertionEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Bot, Building2, CalendarDays, Compass, Info, LogIn, Menu as MenuIcon, MessageSquarePlus, ShieldCheck, Smartphone, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useAgentContext } from '@/context/AgentContext';
import { getHomePathForUser } from '@/lib/homePage';
import { getUserFullName, type NavItem, type UserData } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import FeedbackDrawer from '@/components/feedback/FeedbackDrawer';

type FeedbackEntrySource = 'desktop_header' | 'mobile_menu';
type MobileNavigationHandoff = 'assistant' | 'feedback';

type AuthUserIdentity = {
  email: string;
  name?: string;
};

type AdminAccessOptions = {
  authLoading: boolean;
  isPublicViewer: boolean;
  userId?: string;
};

type NavigationHeaderProps = {
  homeHref: string;
  homeLinkRef: RefObject<HTMLAnchorElement | null>;
  items: NavItem[];
  pathname: string;
  isPublicViewer: boolean;
  isMobileAppActive: boolean;
  isProfileActive: boolean;
  userDisplayName: string;
  userInitial: string;
  openAssistant: () => void;
  openFeedback: () => void;
  isMenuOpen: boolean;
  menuTriggerRef: RefObject<HTMLButtonElement | null>;
};

type AuthenticatedDesktopActionsProps = {
  isMobileAppActive: boolean;
  isProfileActive: boolean;
  userDisplayName: string;
  userInitial: string;
  openAssistant: () => void;
  openFeedback: () => void;
};

type MobileNavigationContentProps = {
  items: NavItem[];
  pathname: string;
  isPublicViewer: boolean;
  isMobileAppActive: boolean;
  isProfileActive: boolean;
  userDisplayName: string;
  userInitial: string;
  authenticatedEmail?: string | null;
  closeMenu: () => void;
  openAssistant: () => void;
  openFeedback: () => void;
};

const baseNav: NavItem[] = [
  { label: 'Info', href: '/info' },
  { label: 'Guides', href: '/guides' },
  { label: 'Discover', href: '/discover' },
  { label: 'My Organizations', href: '/organizations' },
  { label: 'My Schedule', href: '/my-schedule' },
];
const mobileAppNavItem = { label: 'Get The Mobile App', href: '/mobile-app' } satisfies NavItem;
const routeIcons: Record<string, LucideIcon> = {
  '/info': Info,
  '/guides': BookOpen,
  '/discover': Compass,
  '/organizations': Building2,
  '/my-schedule': CalendarDays,
  '/admin': ShieldCheck,
};
const primaryMobileRouteHrefs = ['/discover', '/organizations', '/my-schedule'] as const;
const resourceMobileRouteHrefs = ['/info', '/guides'] as const;
const adminMobileRouteHrefs = ['/admin'] as const;

const isPathActive = (pathname: string, href: string) => (
  pathname === href || pathname.startsWith(`${href}/`)
);

const getIsPublicViewer = (authLoading: boolean, isGuest: boolean, isAuthenticated: boolean) => (
  !authLoading && (isGuest || !isAuthenticated)
);

const getNavigationItems = (isRazumlyAdmin: boolean, isPublicViewer: boolean): NavItem[] => (
  isRazumlyAdmin && !isPublicViewer
    ? [...baseNav, { label: 'Admin', href: '/admin' }]
    : baseNav
);

const getNavigationDisplayName = (
  user: UserData | null,
  authUser: AuthUserIdentity | null,
): string => {
  const fallbackName = authUser?.email.split('@')[0] ?? '';
  return user ? getUserFullName(user) : authUser?.name || fallbackName;
};

const getMobileMenuInitialFocus = () => (
  typeof document === 'undefined'
    ? null
    : document.getElementById('mobile-navigation-menu-close')
);

const fetchAdminAccess = async (): Promise<boolean> => {
  const res = await fetch('/api/admin/access', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return false;

  const payload = await res.json().catch(() => ({}));
  return Boolean(payload?.allowed);
};

function useAdminAccess({ authLoading, isPublicViewer, userId }: AdminAccessOptions): boolean {
  const [isRazumlyAdmin, setIsRazumlyAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      if (authLoading || isPublicViewer) {
        if (!cancelled) setIsRazumlyAdmin(false);
        return;
      }

      try {
        const allowed = await fetchAdminAccess();
        if (!cancelled) setIsRazumlyAdmin(allowed);
      } catch {
        if (!cancelled) setIsRazumlyAdmin(false);
      }
    };

    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isPublicViewer, userId]);

  return isRazumlyAdmin;
}

function useMenuFocusReturn(
  isMenuOpen: boolean,
  skipFocusRestoreRef: MutableRefObject<boolean>,
): void {
  const menuWasOpenRef = useRef(false);
  const menuOpenerRef = useRef<HTMLElement | null>(null);

  useInsertionEffect(() => {
    if (!isMenuOpen || menuWasOpenRef.current) return;

    skipFocusRestoreRef.current = false;
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    menuOpenerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null;
  }, [isMenuOpen, skipFocusRestoreRef]);

  useEffect(() => {
    let resetSkipTimer: number | null = null;
    if (!isMenuOpen && menuWasOpenRef.current) {
      const opener = menuOpenerRef.current;
      if (!skipFocusRestoreRef.current && opener?.isConnected) {
        const restoreFocus = () => {
          if (!opener.isConnected) return;
          opener.focus();
        };

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(restoreFocus);
        } else {
          restoreFocus();
        }
      } else if (skipFocusRestoreRef.current && typeof window !== 'undefined') {
        resetSkipTimer = window.setTimeout(() => {
          skipFocusRestoreRef.current = false;
        }, 300);
      }
    }

    menuWasOpenRef.current = isMenuOpen;
    return () => {
      if (resetSkipTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(resetSkipTimer);
      }
    };
  }, [isMenuOpen, skipFocusRestoreRef]);
}

function useCloseMenuOnDesktop(
  isMenuOpen: boolean,
  closeMenu: () => void,
  skipFocusRestoreRef: MutableRefObject<boolean>,
  desktopFocusPendingRef: MutableRefObject<boolean>,
): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(min-width: 64rem)');
    const closeForDesktop = () => {
      skipFocusRestoreRef.current = true;
      desktopFocusPendingRef.current = true;
      closeMenu();
    };
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches && isMenuOpen) closeForDesktop();
    };

    if (mediaQuery.matches && isMenuOpen) closeForDesktop();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [closeMenu, desktopFocusPendingRef, isMenuOpen, skipFocusRestoreRef]);
}

function BracketIQWordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`whitespace-nowrap text-lg font-extrabold tracking-tight lg:text-2xl ${
        inverted ? 'text-[var(--bq-on-action)]' : 'text-foreground'
      }`}
    >
      Bracket<span className="text-[var(--bq-brand)]">IQ</span>
    </span>
  );
}

function DesktopNavigationLinks({
  items,
  pathname,
  isPublicViewer,
}: Pick<NavigationHeaderProps, 'items' | 'pathname' | 'isPublicViewer'>) {
  return (
    <div className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
      {items.map((item) => {
        const active = isPathActive(pathname, item.href);
        const Icon = routeIcons[item.href] ?? Info;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            title={item.label}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium outline-none transition-colors motion-reduce:transition-none xl:px-3 ${
              isPublicViewer
                ? active
                  ? 'bg-primary/10 text-primary focus-visible:ring-[3px] focus-visible:ring-ring'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring'
                : active
                  ? 'bg-[var(--bq-ink-muted)] text-[var(--bq-on-action)] focus-visible:ring-[3px] focus-visible:ring-[var(--bq-on-action)]'
                  : 'text-[var(--bq-on-action)] hover:bg-[var(--bq-ink-muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--bq-on-action)]'
            }`}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="hidden xl:inline">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function PublicDesktopActions({
  pathname,
  isMobileAppActive,
}: Pick<NavigationHeaderProps, 'pathname' | 'isMobileAppActive'>) {
  const isLoginActive = isPathActive(pathname, '/login');

  return (
    <>
      <Link
        href={mobileAppNavItem.href}
        aria-current={isMobileAppActive ? 'page' : undefined}
        aria-label={mobileAppNavItem.label}
        title={mobileAppNavItem.label}
        className={`hidden size-11 items-center justify-center rounded-lg outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring lg:inline-flex ${
          isMobileAppActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Smartphone className="size-5" aria-hidden="true" />
      </Link>
      <Link
        href="/login"
        aria-current={isLoginActive ? 'page' : undefined}
        aria-label="Login / Signup"
        title="Login / Signup"
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-0 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring lg:px-3 ${
          isLoginActive
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        <LogIn className="size-5" aria-hidden="true" />
        <span className="hidden lg:inline">Login / Signup</span>
      </Link>
    </>
  );
}

function AuthenticatedDesktopActions({
  isMobileAppActive,
  isProfileActive,
  userDisplayName,
  userInitial,
  openAssistant,
  openFeedback,
}: AuthenticatedDesktopActionsProps) {
  const darkHeaderActionClass = 'text-[var(--bq-on-action)] hover:bg-[var(--bq-ink-muted)] hover:text-[var(--bq-on-action)] focus-visible:border-[var(--bq-on-action)] focus-visible:ring-[var(--bq-on-action)]';

  return (
    <>
      <Link
        href={mobileAppNavItem.href}
        aria-current={isMobileAppActive ? 'page' : undefined}
        aria-label={mobileAppNavItem.label}
        title={mobileAppNavItem.label}
        className={`hidden size-11 items-center justify-center rounded-lg outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] lg:inline-flex ${
          isMobileAppActive
            ? 'bg-[var(--bq-ink-muted)] text-[var(--bq-on-action)] focus-visible:ring-[var(--bq-on-action)]'
            : darkHeaderActionClass
        }`}
      >
        <Smartphone className="size-5" aria-hidden="true" />
      </Link>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={openFeedback}
        className={`hidden lg:inline-flex ${darkHeaderActionClass}`}
        aria-label="Send feedback"
        title="Send feedback"
      >
        <MessageSquarePlus className="size-5" aria-hidden="true" />
      </Button>

      <div
        id="mobile-navigation-chat-action"
        data-mobile-chat-action-slot=""
        className="flex size-11 items-center justify-center lg:hidden"
      />

      <Button
        type="button"
        variant="default"
        size="icon"
        onClick={openAssistant}
        className="hidden bg-[var(--bq-action)] text-[var(--bq-on-action)] hover:bg-[var(--bq-action-hover)] focus-visible:border-[var(--bq-on-action)] focus-visible:ring-[var(--bq-on-action)] lg:inline-flex"
        aria-label="Open AI assistant"
        title="AI assistant"
      >
        <Bot className="size-5" aria-hidden="true" />
      </Button>

      <Link
        href="/profile"
        aria-current={isProfileActive ? 'page' : undefined}
        aria-label={`Profile: ${userDisplayName}`}
        title={`Profile: ${userDisplayName}`}
        className={`inline-flex size-11 items-center justify-center rounded-full border border-[var(--bq-ink-muted)] outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-[var(--bq-on-action)] ${
          isProfileActive
            ? 'bg-[var(--bq-ink-muted)] ring-2 ring-inset ring-[var(--bq-brand)]'
            : 'hover:bg-[var(--bq-ink-muted)]'
        }`}
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-[var(--bq-brand)] text-sm font-bold text-[var(--bq-ink)]"
        >
          {userInitial}
        </span>
      </Link>
    </>
  );
}

function MobileMenuTrigger({
  isMenuOpen,
  isPublicViewer,
  menuTriggerRef,
}: {
  isMenuOpen: boolean;
  isPublicViewer: boolean;
  menuTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <SheetTrigger
      aria-controls="mobile-navigation-menu"
      render={(
        <Button
          ref={menuTriggerRef}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation-menu"
          title={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className={`lg:hidden ${
            isPublicViewer
              ? ''
              : 'text-[var(--bq-on-action)] hover:bg-[var(--bq-ink-muted)] hover:text-[var(--bq-on-action)] focus-visible:border-[var(--bq-on-action)] focus-visible:ring-[var(--bq-on-action)]'
          }`}
        />
      )}
    >
      {isMenuOpen ? <X aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
    </SheetTrigger>
  );
}

function NavigationHeader({
  homeHref,
  homeLinkRef,
  items,
  pathname,
  isPublicViewer,
  isMobileAppActive,
  isProfileActive,
  userDisplayName,
  userInitial,
  openAssistant,
  openFeedback,
  isMenuOpen,
  menuTriggerRef,
}: NavigationHeaderProps) {
  return (
    <nav
      className={`sticky top-0 z-50 border-b pt-[env(safe-area-inset-top)] ${
        isPublicViewer
          ? 'border-border bg-background text-foreground'
          : 'border-[var(--bq-ink-muted)] bg-[var(--bq-ink)] text-[var(--bq-on-action)] shadow-sm'
      }`}
      aria-label="Primary navigation"
    >
      <div className="container-responsive">
        <div className="relative flex h-16 items-center gap-4">
          <MobileMenuTrigger
            isMenuOpen={isMenuOpen}
            isPublicViewer={isPublicViewer}
            menuTriggerRef={menuTriggerRef}
          />

          <Link
            ref={homeLinkRef}
            href={homeHref}
            aria-label="BracketIQ home"
            className={`absolute left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center rounded-lg outline-none focus-visible:ring-[3px] lg:static lg:translate-x-0 ${
              isPublicViewer
                ? 'focus-visible:ring-ring'
                : 'focus-visible:ring-[var(--bq-on-action)]'
            }`}
          >
            <BracketIQWordmark inverted={!isPublicViewer} />
          </Link>

          <DesktopNavigationLinks
            items={items}
            pathname={pathname}
            isPublicViewer={isPublicViewer}
          />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {isPublicViewer ? (
              <PublicDesktopActions pathname={pathname} isMobileAppActive={isMobileAppActive} />
            ) : (
              <AuthenticatedDesktopActions
                isMobileAppActive={isMobileAppActive}
                isProfileActive={isProfileActive}
                userDisplayName={userDisplayName}
                userInitial={userInitial}
                openAssistant={openAssistant}
                openFeedback={openFeedback}
              />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function MobileIconSlot({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-5 shrink-0 items-center justify-center ${active ? 'text-primary' : 'text-muted-foreground'}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

const getMobileItemClass = (active: boolean) => (
  `flex min-h-11 items-center gap-3 rounded-lg border-l-4 px-3 py-3 font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring ${
    active
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-transparent text-foreground hover:bg-muted'
  }`
);

function MobileAccountLink({
  isProfileActive,
  userDisplayName,
  userInitial,
  authenticatedEmail,
  closeMenu,
}: Pick<MobileNavigationContentProps, 'isProfileActive' | 'userDisplayName' | 'userInitial' | 'authenticatedEmail' | 'closeMenu'>) {
  return (
    <Link
      href="/profile"
      aria-current={isProfileActive ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg border border-border border-l-4 px-3 py-3 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring ${
        isProfileActive
          ? 'border-l-primary bg-primary/10 text-primary'
          : 'border-l-transparent bg-muted/60 text-foreground hover:bg-muted'
      }`}
      onClick={closeMenu}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {userInitial}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{userDisplayName}</div>
        {authenticatedEmail ? (
          <div className="truncate text-sm text-muted-foreground">{authenticatedEmail}</div>
        ) : null}
        <div className="text-xs text-muted-foreground">Profile</div>
      </div>
    </Link>
  );
}

function MobileAppMenuLink({
  isMobileAppActive,
  closeMenu,
}: Pick<MobileNavigationContentProps, 'isMobileAppActive' | 'closeMenu'>) {
  return (
    <Link
      href={mobileAppNavItem.href}
      aria-current={isMobileAppActive ? 'page' : undefined}
      className={getMobileItemClass(isMobileAppActive)}
      onClick={closeMenu}
    >
      <MobileIconSlot icon={Smartphone} active={isMobileAppActive} />
      {mobileAppNavItem.label}
    </Link>
  );
}

function MobileFeedbackAction({
  openFeedback,
  closeMenu,
}: Pick<MobileNavigationContentProps, 'openFeedback' | 'closeMenu'>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      className="w-full justify-start rounded-lg border-l-4 border-transparent px-3 text-left font-medium"
      onClick={() => {
        closeMenu();
        openFeedback();
      }}
    >
      <MobileIconSlot icon={MessageSquarePlus} active={false} />
      Feedback
    </Button>
  );
}

function MobileAssistantAction({
  openAssistant,
  closeMenu,
}: Pick<MobileNavigationContentProps, 'openAssistant' | 'closeMenu'>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      className="w-full justify-start rounded-lg border-l-4 border-transparent px-3 text-left font-medium"
      onClick={() => {
        closeMenu();
        openAssistant();
      }}
      aria-label="Open AI assistant"
    >
      <MobileIconSlot icon={Bot} active={false} />
      AI assistant
    </Button>
  );
}

function MobileLoginLink({
  pathname,
  closeMenu,
}: Pick<MobileNavigationContentProps, 'pathname' | 'closeMenu'>) {
  const active = isPathActive(pathname, '/login');

  return (
    <Link
      href="/login"
      aria-current={active ? 'page' : undefined}
      className={getMobileItemClass(active)}
      onClick={closeMenu}
    >
      <MobileIconSlot icon={LogIn} active={active} />
      Login / Signup
    </Link>
  );
}

function MobileRouteGroup({
  headingId,
  label,
  hrefs,
  items,
  pathname,
  closeMenu,
}: Pick<MobileNavigationContentProps, 'items' | 'pathname' | 'closeMenu'> & {
  headingId: string;
  label: string;
  hrefs: readonly string[];
}) {
  const hasItems = hrefs.some((href) => items.some((item) => item.href === href));
  if (!hasItems) return null;

  return (
    <section aria-labelledby={headingId} className="border-t border-border pt-4">
      <h2 id={headingId} className="px-3 pb-2 text-xs font-semibold text-muted-foreground">
        {label}
      </h2>
      <div className="flex flex-col gap-1">
        {hrefs.map((href) => {
          const item = items.find((candidate) => candidate.href === href);
          if (!item) return null;

          const active = isPathActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={getMobileItemClass(active)}
              onClick={closeMenu}
            >
              <MobileIconSlot icon={routeIcons[item.href] ?? Info} active={active} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function MobileNavigationContent({
  items,
  pathname,
  isPublicViewer,
  isMobileAppActive,
  isProfileActive,
  userDisplayName,
  userInitial,
  authenticatedEmail,
  closeMenu,
  openAssistant,
  openFeedback,
}: MobileNavigationContentProps) {
  return (
    <div
      data-mobile-navigation-scroll-region=""
      className="h-0 min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4"
    >
      <div className="flex flex-col gap-4">
        <section aria-labelledby="mobile-navigation-account">
          <h2
            id="mobile-navigation-account"
            className="px-3 pb-2 text-xs font-semibold text-muted-foreground"
          >
            Account
          </h2>
          {isPublicViewer ? (
            <MobileLoginLink pathname={pathname} closeMenu={closeMenu} />
          ) : (
            <MobileAccountLink
              isProfileActive={isProfileActive}
              userDisplayName={userDisplayName}
              userInitial={userInitial}
              authenticatedEmail={authenticatedEmail}
              closeMenu={closeMenu}
            />
          )}
        </section>

        <MobileRouteGroup
          headingId="mobile-navigation-explore"
          label="Explore"
          hrefs={primaryMobileRouteHrefs}
          items={items}
          pathname={pathname}
          closeMenu={closeMenu}
        />

        <MobileRouteGroup
          headingId="mobile-navigation-resources"
          label="Resources"
          hrefs={resourceMobileRouteHrefs}
          items={items}
          pathname={pathname}
          closeMenu={closeMenu}
        />

        <section aria-labelledby="mobile-navigation-support" className="border-t border-border pt-4">
          <h2
            id="mobile-navigation-support"
            className="px-3 pb-2 text-xs font-semibold text-muted-foreground"
          >
            Support
          </h2>
          <div className="flex flex-col gap-1">
            <MobileAppMenuLink
              isMobileAppActive={isMobileAppActive}
              closeMenu={closeMenu}
            />
            {!isPublicViewer ? (
              <MobileAssistantAction openAssistant={openAssistant} closeMenu={closeMenu} />
            ) : null}
            {!isPublicViewer ? (
              <MobileFeedbackAction openFeedback={openFeedback} closeMenu={closeMenu} />
            ) : null}
          </div>
        </section>

        <MobileRouteGroup
          headingId="mobile-navigation-administration"
          label="Administration"
          hrefs={adminMobileRouteHrefs}
          items={items}
          pathname={pathname}
          closeMenu={closeMenu}
        />
      </div>
    </div>
  );
}

function MobileNavigationSheet({
  items,
  pathname,
  isPublicViewer,
  isMobileAppActive,
  isProfileActive,
  userDisplayName,
  userInitial,
  authenticatedEmail,
  closeMenu,
  openAssistant,
  openFeedback,
}: MobileNavigationContentProps) {

  return (
    <SheetContent
      id="mobile-navigation-menu"
      side="left"
      showCloseButton={false}
      initialFocus={getMobileMenuInitialFocus}
      finalFocus={false}
      className="data-[side=left]:w-[min(16rem,calc(100vw-3rem))] h-dvh max-h-dvh gap-0 overflow-hidden"
    >
      <SheetHeader className="shrink-0 border-b border-border px-4 py-3 pr-16">
        <div className="flex min-h-11 items-center">
          <BracketIQWordmark />
        </div>
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SheetDescription className="sr-only">
          Use the links and actions to move through BracketIQ.
        </SheetDescription>
      </SheetHeader>

      <SheetClose
        render={(
          <Button
            type="button"
            variant="ghost"
            size="icon"
            id="mobile-navigation-menu-close"
            aria-label="Close menu"
            title="Close menu"
            className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))]"
          />
        )}
      >
        <X aria-hidden="true" />
      </SheetClose>

      <MobileNavigationContent
        items={items}
        pathname={pathname}
        isPublicViewer={isPublicViewer}
        isMobileAppActive={isMobileAppActive}
        isProfileActive={isProfileActive}
        userDisplayName={userDisplayName}
        userInitial={userInitial}
        authenticatedEmail={authenticatedEmail}
        closeMenu={closeMenu}
        openAssistant={openAssistant}
        openFeedback={openFeedback}
      />
    </SheetContent>
  );
}

export default function Navigation() {
  const {
    user,
    authUser,
    loading: authLoading,
    isGuest,
    isAuthenticated,
  } = useApp();
  const { openAssistant } = useAgentContext();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [feedbackOpened, setFeedbackOpened] = useState(false);
  const [feedbackEntrySource, setFeedbackEntrySource] = useState<FeedbackEntrySource>('desktop_header');
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const homeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const desktopFocusPendingRef = useRef(false);
  const skipFocusRestoreRef = useRef(false);
  const pendingMobileHandoffRef = useRef<MobileNavigationHandoff | null>(null);
  const mobileHandoffTimerRef = useRef<number | null>(null);
  const isPublicViewer = getIsPublicViewer(authLoading, isGuest, isAuthenticated);
  const closeMenu = () => setIsMenuOpen(false);
  const isRazumlyAdmin = useAdminAccess({
    authLoading,
    isPublicViewer,
    userId: authUser?.$id,
  });

  useMenuFocusReturn(isMenuOpen, skipFocusRestoreRef);
  useCloseMenuOnDesktop(isMenuOpen, closeMenu, skipFocusRestoreRef, desktopFocusPendingRef);
  useEffect(() => {
    if (!isMenuOpen || pendingMobileHandoffRef.current === null) return;

    pendingMobileHandoffRef.current = null;
    if (mobileHandoffTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(mobileHandoffTimerRef.current);
      mobileHandoffTimerRef.current = null;
    }
  }, [isMenuOpen]);

  useEffect(() => () => {
    if (mobileHandoffTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(mobileHandoffTimerRef.current);
    }
  }, []);

  if (authLoading) return null;

  const items = getNavigationItems(isRazumlyAdmin, isPublicViewer);
  const homeHref = getHomePathForUser(user);
  const isProfileActive = isPathActive(pathname, '/profile');
  const isMobileAppActive = isPathActive(pathname, mobileAppNavItem.href);
  const userDisplayName = getNavigationDisplayName(user, authUser);
  const userInitial = userDisplayName.slice(0, 1).toUpperCase();
  const openFeedback = (entrySource: FeedbackEntrySource) => {
    setFeedbackEntrySource(entrySource);
    setFeedbackOpened(true);
  };
  const completeMobileHandoff = (focusTarget: HTMLElement | null = null) => {
    const pendingHandoff = pendingMobileHandoffRef.current;
    if (pendingHandoff === null) return;

    pendingMobileHandoffRef.current = null;
    if (mobileHandoffTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(mobileHandoffTimerRef.current);
      mobileHandoffTimerRef.current = null;
    }
    const fallbackFocusTarget = focusTarget?.isConnected ? focusTarget : menuTriggerRef.current;
    if (fallbackFocusTarget?.isConnected) fallbackFocusTarget.focus();
    if (pendingHandoff === 'feedback') {
      openFeedback('mobile_menu');
      return;
    }
    openAssistant();
  };
  const requestMobileHandoff = (handoff: MobileNavigationHandoff) => {
    pendingMobileHandoffRef.current = handoff;
    closeMenu();
    if (typeof window === 'undefined') {
      completeMobileHandoff();
      return;
    }
    mobileHandoffTimerRef.current = window.setTimeout(completeMobileHandoff, 250);
  };
  const handleMenuClosed = () => {
    const desktopFocusTarget = desktopFocusPendingRef.current ? homeLinkRef.current : null;
    desktopFocusPendingRef.current = false;
    skipFocusRestoreRef.current = false;
    if (pendingMobileHandoffRef.current !== null) {
      completeMobileHandoff(desktopFocusTarget);
      return;
    }
    if (desktopFocusTarget?.isConnected) desktopFocusTarget.focus();
  };

  return (
    <Sheet
      open={isMenuOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) desktopFocusPendingRef.current = false;
        setIsMenuOpen(nextOpen);
      }}
      onOpenChangeComplete={(open) => {
        if (!open) handleMenuClosed();
      }}
    >
      <NavigationHeader
        homeHref={homeHref}
        homeLinkRef={homeLinkRef}
        items={items}
        pathname={pathname}
        isPublicViewer={isPublicViewer}
        isMobileAppActive={isMobileAppActive}
        isProfileActive={isProfileActive}
        userDisplayName={userDisplayName}
        userInitial={userInitial}
        openAssistant={openAssistant}
        openFeedback={() => openFeedback('desktop_header')}
        isMenuOpen={isMenuOpen}
        menuTriggerRef={menuTriggerRef}
      />

      <MobileNavigationSheet
        items={items}
        pathname={pathname}
        isPublicViewer={isPublicViewer}
        isMobileAppActive={isMobileAppActive}
        isProfileActive={isProfileActive}
        userDisplayName={userDisplayName}
        userInitial={userInitial}
        authenticatedEmail={authUser?.email}
        closeMenu={closeMenu}
        openAssistant={() => requestMobileHandoff('assistant')}
        openFeedback={() => requestMobileHandoff('feedback')}
      />

      {!isPublicViewer ? (
        <FeedbackDrawer
          opened={feedbackOpened}
          onClose={() => setFeedbackOpened(false)}
          authenticatedEmail={authUser?.email}
          entrySource={feedbackEntrySource}
          fallbackFocusRef={menuTriggerRef}
        />
      ) : null}
    </Sheet>
  );
}
