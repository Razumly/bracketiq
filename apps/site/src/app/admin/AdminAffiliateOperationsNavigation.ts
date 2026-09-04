"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AFFILIATE_OPERATIONS_VIEWS,
  type AffiliateOperationsFilters,
  type AffiliateOperationsView,
} from "@/types/affiliateOperations";
export type QueryNavigationMode = "push" | "replace";
export const filterKeysByView: Record<
  AffiliateOperationsView,
  readonly (keyof AffiliateOperationsFilters)[]
> = {
  overview: ["range", "status", "market", "sport", "profile"],
  coverage: ["market", "city", "sport", "profile", "range", "status"],
  jobs: ["range", "status", "lane", "role", "reason"],
  intake: ["city", "profile", "range", "status", "reason"],
  review: ["city", "range", "status", "role", "reason"],
  sources: ["city", "profile", "range", "status", "reason"],
  candidates: ["city", "sport", "profile", "range", "status"],
  alerts: [],
  cutover: [],
};

const projectionFilterKeys: readonly (keyof AffiliateOperationsFilters)[] = [
  "market",
  "city",
  "sport",
  "profile",
  "range",
  "status",
  "lane",
  "role",
  "reason",
];
export const normalizeProjectionSearchParams = (
  params: URLSearchParams,
): void => {
  const requestedView = params.get("view");
  const view = (AFFILIATE_OPERATIONS_VIEWS as readonly string[]).includes(
    requestedView ?? "",
  )
    ? (requestedView as AffiliateOperationsView)
    : "overview";
  const supported = filterKeysByView[view];
  projectionFilterKeys.forEach((key) => {
    if (!supported.includes(key)) params.delete(key);
  });
};

export const useQueryNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (
      changes: Readonly<Record<string, string | null | undefined>>,
      mode: QueryNavigationMode = "push",
    ) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", "affiliateOperations");
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "")
          nextParams.delete(key);
        else nextParams.set(key, value);
      });
      normalizeProjectionSearchParams(nextParams);
      const href = `${pathname}?${nextParams.toString()}`;
      if (mode === "replace") {
        if (typeof router.replace === "function")
          router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );
};

const PROJECTION_INTERNAL_ORIGIN = "https://bracket-iq.local";

export const isExternalProjectionHref = (href: string): boolean => {
  try {
    const target = new URL(href, PROJECTION_INTERNAL_ORIGIN);
    return (
      (target.protocol === "http:" || target.protocol === "https:") &&
      target.origin !== PROJECTION_INTERNAL_ORIGIN
    );
  } catch {
    return false;
  }
};

export const mergeProjectionHref = (
  current: URLSearchParams,
  href: string,
): string => {
  if (isExternalProjectionHref(href)) return href;
  const target = new URL(href, PROJECTION_INTERNAL_ORIGIN);
  const nextParams = new URLSearchParams(current.toString());
  target.searchParams.forEach((value, key) => nextParams.set(key, value));
  if (
    !target.searchParams.has("selected") &&
    !target.searchParams.has("selectedType")
  ) {
    nextParams.delete("selected");
    nextParams.delete("selectedType");
  }
  normalizeProjectionSearchParams(nextParams);
  const query = nextParams.toString();
  return `${target.pathname}${query ? `?${query}` : ""}${target.hash}`;
};

export const useProjectionNavigation = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  return useCallback(
    (href: string) => {
      router.push(
        mergeProjectionHref(new URLSearchParams(searchParams.toString()), href),
        { scroll: false },
      );
    },
    [router, searchParams],
  );
};
