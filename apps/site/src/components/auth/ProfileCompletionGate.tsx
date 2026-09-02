'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { getHomePathForUser } from '@/lib/homePage';
import type { UserData } from '@/types';

const safeNextPath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const next = value.trim();
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (/[\u0000-\u001F\u007F-\u009F]/.test(next)) return null;
  if (next.startsWith('/login')) return null;
  if (next.startsWith('/complete-profile')) return null;
  return next;
};

type SearchParams = Pick<URLSearchParams, 'get' | 'toString'>;
type RedirectDecisionInput = {
  loading: boolean;
  isGuest: boolean;
  isAuthenticated: boolean;
  requiresProfileCompletion: boolean;
  pathname: string | null;
  currentPath: string | null;
  searchParams: SearchParams;
  user: UserData | null;
};

const getIncompleteRedirect = (currentPath: string | null): string => {
  const next = safeNextPath(currentPath);
  return next === null ? '/complete-profile' : `/complete-profile?next=${encodeURIComponent(next)}`;
};

const getCompletedRedirect = (
  searchParams: SearchParams,
  user: UserData | null,
): string => {
  const next = safeNextPath(searchParams.get('next'));
  return next ?? (user ? getHomePathForUser(user) : '/discover');
};

const getRedirectPath = ({
  loading,
  isGuest,
  isAuthenticated,
  requiresProfileCompletion,
  pathname,
  currentPath,
  searchParams,
  user,
}: RedirectDecisionInput): string | null => {
  if (loading || isGuest || !isAuthenticated || !pathname) return null;
  if (requiresProfileCompletion) {
    return pathname === '/complete-profile' ? null : getIncompleteRedirect(currentPath);
  }
  return pathname === '/complete-profile' ? getCompletedRedirect(searchParams, user) : null;
};


export default function ProfileCompletionGate() {
  const {
    user,
    loading,
    isGuest,
    isAuthenticated,
    requiresProfileCompletion,
  } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPath = useMemo(() => {
    if (!pathname) return null;
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    const redirectPath = getRedirectPath({
      loading,
      isGuest,
      isAuthenticated,
      requiresProfileCompletion,
      pathname,
      currentPath,
      searchParams,
      user,
    });
    if (redirectPath !== null) {
      router.replace(redirectPath);
    }
  }, [
    currentPath,
    isAuthenticated,
    isGuest,
    loading,
    pathname,
    requiresProfileCompletion,
    router,
    searchParams,
    user,
  ]);

  return null;
}
