"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Event, Field } from "@/types";
import {
  buildOrganizationEventQuery,
  ORGANIZATION_EVENTS_LIMIT,
  readOrganizationEventCache,
  readOrganizationHostedEvents,
  visibleOrganizationEvents,
  type OrganizationEventFilters,
} from "./organizationEventSource";

type EventCacheState = {
  events: Event[];
  offset: number;
  rentalEventIds: string[];
  hasMoreEvents: boolean;
  hasScopedEventCache: boolean;
  cacheStartDate?: string;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  eventsError: string | null;
};

type OrganizationEventsOptions = {
  organizationId: string;
  fields: readonly Pick<Field, "$id">[];
  hiddenEventIds: readonly string[];
  enabled: boolean;
  filters: OrganizationEventFilters;
};

const emptyCache = (): EventCacheState => ({
  events: [],
  offset: 0,
  rentalEventIds: [],
  hasMoreEvents: true,
  hasScopedEventCache: false,
  isLoadingInitial: true,
  isLoadingMore: false,
  eventsError: null,
});

function startRefresh(
  cache: EventCacheState,
  background: boolean,
): EventCacheState {
  return {
    ...cache,
    isLoadingInitial: background ? cache.isLoadingInitial : true,
    offset: background ? cache.offset : 0,
    hasMoreEvents: background ? cache.hasMoreEvents : true,
    isLoadingMore: false,
    eventsError: null,
  };
}

export function useOrganizationEvents(options: OrganizationEventsOptions) {
  const [cache, setCache] = useState(emptyCache);
  const latest = useRef(options);
  const request = useRef({ id: 0, pending: false });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    latest.current = options;
  }, [options]);

  const reload = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const current = latest.current;
      const requestId = ++request.current.id;
      request.current.pending = true;
      if (!current.organizationId.trim()) {
        request.current.pending = false;
        setCache({
          ...emptyCache(),
          hasMoreEvents: false,
          isLoadingInitial: false,
        });
        return;
      }
      setCache((previous) => startRefresh(previous, background));
      try {
        const query = buildOrganizationEventQuery(
          current.organizationId,
          current.filters,
        );
        const result = await readOrganizationEventCache(query, current.fields);
        if (request.current.id !== requestId) return;
        setCache((previous) => ({
          ...previous,
          ...result,
          events: visibleOrganizationEvents(
            result.events,
            latest.current.hiddenEventIds,
          ),
        }));
      } catch (error) {
        if (request.current.id !== requestId) return;
        console.error("Failed to load organization events:", error);
        setCache((previous) => ({
          ...previous,
          eventsError: "Failed to load events. Please try again.",
        }));
      } finally {
        if (request.current.id === requestId) {
          request.current.pending = false;
          setCache((previous) => ({ ...previous, isLoadingInitial: false }));
        }
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (
      cache.isLoadingInitial ||
      request.current.pending ||
      !cache.hasMoreEvents
    )
      return;
    const current = latest.current;
    const query = buildOrganizationEventQuery(
      current.organizationId,
      current.filters,
    );
    if (!query.includesHosted) return;
    const requestId = ++request.current.id;
    request.current.pending = true;
    setCache((previous) => ({
      ...previous,
      isLoadingMore: true,
      eventsError: null,
    }));
    try {
      const page = await readOrganizationHostedEvents(query, cache.offset);
      if (request.current.id !== requestId) return;
      setCache((previous) => ({
        ...previous,
        events: visibleOrganizationEvents(
          [...previous.events, ...page],
          latest.current.hiddenEventIds,
        ),
        offset: previous.offset + page.length,
        hasMoreEvents: page.length === ORGANIZATION_EVENTS_LIMIT,
      }));
    } catch (error) {
      if (request.current.id !== requestId) return;
      console.error("Failed to load more organization events:", error);
      setCache((previous) => ({
        ...previous,
        eventsError: "Failed to load more events. Please try again.",
      }));
    } finally {
      if (request.current.id === requestId) {
        request.current.pending = false;
        setCache((previous) => ({ ...previous, isLoadingMore: false }));
      }
    }
  }, [cache]);

  useEffect(() => {
    request.current = { id: request.current.id + 1, pending: false };
    setCache(emptyCache());
    return () => {
      request.current = { id: request.current.id + 1, pending: false };
    };
  }, [options.organizationId]);

  useEffect(() => {
    if (options.enabled && options.organizationId) void reload();
  }, [options.enabled, options.organizationId, reload]);

  useEffect(() => {
    if (!options.hiddenEventIds.length) return;
    setCache((previous) => {
      const events = visibleOrganizationEvents(previous.events, options.hiddenEventIds);
      return events.length === previous.events.length ? previous : { ...previous, events };
    });
  }, [options.hiddenEventIds]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!options.enabled || !element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [options.enabled, loadMore]);

  const { offset: _offset, ...data } = cache;
  return {
    data: { ...data, totalEvents: cache.events.length },
    reload,
    loadMore,
    sentinelRef,
  };
}
