'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useApp } from '@/app/providers';
import { getHomePathForUser } from '@/lib/homePage';

const marketingNavItems = [
  { label: 'Platform', href: '#platform' },
  { label: 'Operations', href: '#operations' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Fees', href: '#fees' },
  { label: 'Resources', href: '#resources' },
];

type MarketingNavItem = {
  label: string;
  href: string;
};

type MarketingHeaderProps = {
  brandHref?: string;
  anchorHrefPrefix?: string;
  navItems?: MarketingNavItem[];
  hideRequestDemoCta?: boolean;
};

const resolveAnchorHref = (href: string, prefix: string) => (
  prefix && href.startsWith('#') ? `${prefix}${href}` : href
);

type MarketingActionProps = {
  appHref: string;
  showAppCta: boolean;
  hideRequestDemoCta: boolean;
};

function MarketingDesktopActions({
  appHref,
  showAppCta,
  hideRequestDemoCta,
}: MarketingActionProps) {
  return (
    <div className="landing-header-actions landing-header-pill hidden items-center justify-end gap-2 xl:flex">
      {showAppCta ? (
        <>
          {!hideRequestDemoCta ? (
            <Link href="/request-demo" className="landing-btn-secondary landing-btn-compact">
              Request demo
            </Link>
          ) : null}
          <Link href={appHref} className="landing-btn-primary landing-btn-compact">
            Go to app
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </>
      ) : (
        <>
          <Link href="/login" className="landing-btn-secondary landing-btn-compact">
            Sign in
          </Link>
          {!hideRequestDemoCta ? (
            <Link href="/request-demo" className="landing-btn-secondary landing-btn-compact">
              Request demo
            </Link>
          ) : null}
          <Link href="/login" className="landing-btn-primary landing-btn-compact">
            Sign up
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}

function MarketingMobileActions({
  appHref,
  showAppCta,
  hideRequestDemoCta,
  closeMobileMenu,
}: MarketingActionProps & { closeMobileMenu: () => void }) {
  return (
    <div className="mt-4 grid gap-2">
      {showAppCta ? (
        <>
          {!hideRequestDemoCta ? (
            <Link href="/request-demo" className="landing-btn-secondary landing-btn-full" onClick={closeMobileMenu}>
              Request demo
            </Link>
          ) : null}
          <Link href={appHref} className="landing-btn-primary landing-btn-full" onClick={closeMobileMenu}>
            Go to app
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </>
      ) : (
        <>
          <Link href="/login" className="landing-btn-secondary landing-btn-full" onClick={closeMobileMenu}>
            Sign in
          </Link>
          {!hideRequestDemoCta ? (
            <Link href="/request-demo" className="landing-btn-secondary landing-btn-full" onClick={closeMobileMenu}>
              Request demo
            </Link>
          ) : null}
          <Link href="/login" className="landing-btn-primary landing-btn-full" onClick={closeMobileMenu}>
            Sign up
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}

function MarketingMobileControls({
  isMobileMenuOpen,
  showAppCta,
  toggleMobileMenu,
}: {
  isMobileMenuOpen: boolean;
  showAppCta: boolean;
  toggleMobileMenu: () => void;
}) {
  return (
    <div className="flex items-center gap-2 xl:hidden">
      {showAppCta ? (
        <div
          id="mobile-navigation-chat-action"
          data-mobile-chat-action-slot=""
          className="flex size-11 items-center justify-center lg:hidden"
        />
      ) : null}
      <button
        type="button"
        className="landing-menu-button inline-flex xl:hidden"
        aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMobileMenuOpen}
        onClick={toggleMobileMenu}
      >
        {isMobileMenuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
      </button>
    </div>
  );
}

function MarketingMobileNavigation({
  navItems,
  showAppCta,
  appHref,
  hideRequestDemoCta,
  closeMobileMenu,
}: MarketingActionProps & {
  navItems: MarketingNavItem[];
  closeMobileMenu: () => void;
}) {
  return (
    <div className="landing-mobile-menu xl:hidden">
      <nav className="grid gap-2" aria-label="Mobile navigation">
        {navItems.map((item) => (
          <a key={item.href} href={item.href} className="landing-mobile-nav-link" onClick={closeMobileMenu}>
            {item.label}
          </a>
        ))}
      </nav>
      <MarketingMobileActions
        appHref={appHref}
        showAppCta={showAppCta}
        hideRequestDemoCta={hideRequestDemoCta}
        closeMobileMenu={closeMobileMenu}
      />
    </div>
  );
}

export default function MarketingHeader({
  brandHref = '/',
  anchorHrefPrefix = '',
  navItems: providedNavItems,
  hideRequestDemoCta = false,
}: MarketingHeaderProps) {
  const { user, isAuthenticated, isGuest } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHeaderJoined, setIsHeaderJoined] = useState(false);
  const isHeaderJoinedRef = useRef(false);
  const appHref = getHomePathForUser(user);
  const showAppCta = isAuthenticated && !isGuest;

  useEffect(() => {
    let frameId = 0;

    const updateHeaderState = () => {
      frameId = 0;
      const nextIsJoined = isHeaderJoinedRef.current ? window.scrollY > 28 : window.scrollY > 92;

      if (nextIsJoined !== isHeaderJoinedRef.current) {
        isHeaderJoinedRef.current = nextIsJoined;
        setIsHeaderJoined(nextIsJoined);
      }
    };

    const onScroll = () => {
      if (frameId === 0) {
        frameId = window.requestAnimationFrame(updateHeaderState);
      }
    };

    updateHeaderState();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const toggleMobileMenu = () => setIsMobileMenuOpen((open) => !open);
  const navItems = (providedNavItems ?? marketingNavItems).map((item) => ({
    ...item,
    href: resolveAnchorHref(item.href, anchorHrefPrefix),
  }));

  return (
    <header className="landing-header z-30" data-scrolled={isHeaderJoined ? 'true' : 'false'}>
      <div className="container-responsive py-3">
        <div className="landing-header-shell flex min-h-14 items-center justify-between gap-4 px-3 sm:px-4">
          <Link href={brandHref} className="landing-brand inline-flex items-center gap-3" onClick={closeMobileMenu}>
            <Image
              src="/BIQ_drawing.svg"
              alt="BracketIQ logo"
              width={44}
              height={44}
              className="landing-brand-mark"
              priority
            />
            <span className="landing-brand-name">BracketIQ</span>
          </Link>

          <nav className="landing-nav landing-header-pill hidden items-center gap-1 xl:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="landing-nav-link">
                {item.label}
              </a>
            ))}
          </nav>

          <MarketingDesktopActions
            appHref={appHref}
            showAppCta={showAppCta}
            hideRequestDemoCta={hideRequestDemoCta}
          />

          <MarketingMobileControls
            isMobileMenuOpen={isMobileMenuOpen}
            showAppCta={showAppCta}
            toggleMobileMenu={toggleMobileMenu}
          />
        </div>

        {isMobileMenuOpen ? (
          <MarketingMobileNavigation
            navItems={navItems}
            appHref={appHref}
            showAppCta={showAppCta}
            hideRequestDemoCta={hideRequestDemoCta}
            closeMobileMenu={closeMobileMenu}
          />
        ) : null}
      </div>
    </header>
  );
}
