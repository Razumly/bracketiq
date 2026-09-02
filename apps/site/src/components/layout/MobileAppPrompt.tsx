'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  getMobileAppLinks,
} from '@/lib/mobileAppLinks';

type MobilePlatform = 'ios' | 'android' | 'other';

const DISMISSED_UNTIL_KEY = 'mvp_mobile_app_prompt_dismissed_until';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const isOnboardingPromptPath = (pathname: string | null): boolean => (
  pathname === '/' || pathname === '/onboarding'
);

const detectMobilePlatform = (ua: string, maxTouchPoints: number): MobilePlatform => {
  const userAgent = ua.toLowerCase();
  if (userAgent.includes('android')) return 'android';
  if (userAgent.includes('iphone') || userAgent.includes('ipod') || userAgent.includes('ipad')) return 'ios';
  if (userAgent.includes('macintosh') && maxTouchPoints > 1) return 'ios';
  return 'other';
};

const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || navigatorStandalone;
};

export const supportsNativeIosSmartAppBanner = (ua: string, maxTouchPoints: number): boolean => {
  const platform = detectMobilePlatform(ua, maxTouchPoints);
  if (platform !== 'ios') return false;

  const userAgent = ua.toLowerCase();
  const isSafariEngine = userAgent.includes('safari');
  const isOtherIosBrowser =
    userAgent.includes('crios')
    || userAgent.includes('fxios')
    || userAgent.includes('edgios')
    || userAgent.includes('opios')
    || userAgent.includes('mercury')
    || userAgent.includes('gsa');

  return isSafariEngine && !isOtherIosBrowser;
};

const shouldSuppressMobileAppPrompt = (
  onboardingPromptPath: boolean,
  showAppPrompt: string | undefined,
): boolean => {
  if (onboardingPromptPath) return true;
  return showAppPrompt === '0';
};

const isSupportedMobilePlatform = (
  platform: MobilePlatform,
): platform is Exclude<MobilePlatform, 'other'> => platform !== 'other';

const isDismissedUntilActive = (dismissedUntilValue: string | null, now: number): boolean => {
  const dismissedUntil = Number(dismissedUntilValue || '0');
  return Number.isFinite(dismissedUntil) && dismissedUntil > now;
};

export default function MobileAppPrompt() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<MobilePlatform>('other');
  const [visible, setVisible] = useState(false);
  const onboardingPromptPath = isOnboardingPromptPath(pathname);

  const { iosStoreUrl, androidStoreUrl, iosDeepLink, androidDeepLink } = getMobileAppLinks();

  const storeUrl = useMemo(() => {
    if (platform === 'ios') return iosStoreUrl;
    if (platform === 'android') return androidStoreUrl;
    return '';
  }, [androidStoreUrl, iosStoreUrl, platform]);

  const deepLink = useMemo(() => {
    if (platform === 'ios') return iosDeepLink;
    if (platform === 'android') return androidDeepLink;
    return '';
  }, [androidDeepLink, iosDeepLink, platform]);

  useEffect(() => {
    if (shouldSuppressMobileAppPrompt(onboardingPromptPath, process.env.NEXT_PUBLIC_SHOW_APP_PROMPT)) return;
    if (typeof window === 'undefined') return;

    const userAgent = window.navigator.userAgent || '';
    const maxTouchPoints = window.navigator.maxTouchPoints || 0;
    const detected = detectMobilePlatform(userAgent, maxTouchPoints);
    if (!isSupportedMobilePlatform(detected)) return;
    if (isStandaloneDisplayMode()) return;
    if (supportsNativeIosSmartAppBanner(userAgent, maxTouchPoints)) return;
    if (isDismissedUntilActive(window.localStorage.getItem(DISMISSED_UNTIL_KEY), Date.now())) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPlatform(detected);
      setVisible(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [onboardingPromptPath]);

  if (onboardingPromptPath || !visible || platform === 'other') return null;

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS));
    }
    setVisible(false);
  };

  const openApp = () => {
    if (typeof window === 'undefined' || !deepLink) return;
    const fallbackUrl = storeUrl;
    const start = Date.now();

    window.location.href = deepLink;
    if (!fallbackUrl) return;

    window.setTimeout(() => {
      // If app switch did not occur, send user to store.
      if (Date.now() - start < 1800) {
        window.location.href = fallbackUrl;
      }
    }, 1200);
  };

  return (
    <Card
      role="region"
      aria-label="Mobile app prompt"
      className="rounded-md p-3"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1200,
        margin: '0 auto',
        maxWidth: 520,
        overflow: 'visible',
      }}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Use the BracketIQ app</p>
          <p className="text-xs text-muted-foreground">
            Open this page in the mobile app for a better experience.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button type="button" size="xs" variant="outline" onClick={dismiss}>
            Not now
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => {
              if (storeUrl) window.location.href = storeUrl;
            }}
          >
            Get App
          </Button>
          <Button type="button" size="xs" onClick={openApp}>
            Open App
          </Button>
        </div>
      </div>
    </Card>
  );
}
