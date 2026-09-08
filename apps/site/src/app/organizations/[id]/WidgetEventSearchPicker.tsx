"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@/components/organization/organization-operation-ui";
import { OrganizationDataPlaceholder } from "@/components/organization/OrganizationDataLoading";
import { eventService } from "@/lib/eventService";
import { formatEnumDisplayLabel } from "@/lib/enumUtils";
import type { Event, EventType } from "@/types";
import type { WidgetEventSelection } from "./organizationWidgetSnippets";

const formatWidgetEventDate = (value: string | null): string => {
  if (!value) {
    return "Date TBD";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date TBD";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const toWidgetEventSelection = (event: Event): WidgetEventSelection | null => {
  const id = typeof event.$id === "string" ? event.$id.trim() : "";
  const name = typeof event.name === "string" ? event.name.trim() : "";
  if (!id || !name) {
    return null;
  }
  const rawStart = event.start as unknown;
  const start =
    rawStart instanceof Date
      ? rawStart.toISOString()
      : typeof rawStart === "string"
        ? rawStart
        : null;
  return {
    id,
    name,
    eventType: typeof event.eventType === "string" ? event.eventType : "EVENT",
    start,
  };
};

export type WidgetEventSearchPickerProps = {
  label: string;
  description: string;
  organizationId?: string;
  eventTypes: EventType[];
  selectedEvents: WidgetEventSelection[];
  onChange: (events: WidgetEventSelection[]) => void;
};
type WidgetEventSearchState = {
  searchKey: string;
  status: "idle" | "loading" | "ready" | "error";
  results: WidgetEventSelection[];
  error: string | null;
};

export function WidgetEventSearchPicker({
  label,
  description,
  organizationId,
  eventTypes,
  selectedEvents,
  onChange,
}: WidgetEventSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<WidgetEventSearchState>({
    searchKey: "",
    status: "idle",
    results: [],
    error: null,
  });

  const normalizedQuery = query.trim();
  const selectedIds = useMemo(
    () => new Set(selectedEvents.map((event) => event.id)),
    [selectedEvents],
  );
  const eventTypesKey = eventTypes.join(",");
  const searchKey =
    organizationId && normalizedQuery
      ? `${organizationId}:${eventTypesKey}:${normalizedQuery}`
      : "";
  const searchStateIsCurrent =
    Boolean(searchKey) && searchState.searchKey === searchKey;
  const visibleResults = searchStateIsCurrent
    ? searchState.results.filter((event) => !selectedIds.has(event.id))
    : [];
  const visibleLoading =
    Boolean(searchKey) &&
    (!searchStateIsCurrent || searchState.status === "loading");
  const visibleError =
    searchStateIsCurrent && searchState.status === "error"
      ? searchState.error
      : null;

  useEffect(() => {
    if (!searchKey) {
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setSearchState({
        searchKey,
        status: "loading",
        results: [],
        error: null,
      });
      eventService
        .getEventsPaginated(
          {
            query: normalizedQuery,
            organizationId,
            eventTypes,
          },
          8,
          0,
          "SOONEST",
        )
        .then((events) => {
          if (cancelled) {
            return;
          }
          const nextResults = events
            .map((event) => toWidgetEventSelection(event))
            .filter((event): event is WidgetEventSelection => Boolean(event));
          setSearchState((current) =>
            current.searchKey === searchKey
              ? {
                  searchKey,
                  status: "ready",
                  results: nextResults,
                  error: null,
                }
              : current,
          );
        })
        .catch((searchError) => {
          if (cancelled) {
            return;
          }
          setSearchState((current) =>
            current.searchKey === searchKey
              ? {
                  searchKey,
                  status: "error",
                  results: [],
                  error:
                    searchError instanceof Error
                      ? searchError.message
                      : "Failed to search events.",
                }
              : current,
          );
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [eventTypes, normalizedQuery, organizationId, searchKey]);

  const addEvent = (event: WidgetEventSelection) => {
    if (selectedIds.has(event.id)) {
      return;
    }
    onChange([...selectedEvents, event]);
    setQuery("");
  };

  const removeEvent = (eventId: string) => {
    onChange(selectedEvents.filter((event) => event.id !== eventId));
  };

  return (
    <Stack gap="xs">
      <TextInput
        label={label}
        description={description}
        placeholder="Search events by name"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        disabled={!organizationId}
      />

      <WidgetSelectedEvents
        selectedEvents={selectedEvents}
        removeEvent={removeEvent}
      />
      <Text size="xs" c="dimmed">
        Selected events override the date rule and stay in the order added.
      </Text>

      <WidgetSearchResults
        query={normalizedQuery}
        loading={visibleLoading}
        error={visibleError}
        results={visibleResults}
        onAdd={addEvent}
      />
    </Stack>
  );
}

function WidgetSelectedEvents({
  selectedEvents,
  removeEvent,
}: {
  selectedEvents: WidgetEventSelection[];
  removeEvent: (eventId: string) => void;
}) {
  return (
    <>
      {selectedEvents.length ? (
        <Stack gap="xs">
          {selectedEvents.map((event) => (
            <Paper
              key={event.id}
              withBorder
              p="xs"
              radius="md"
              className="org-tab-nested-item"
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Text size="sm" fw={600}>
                    {event.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatEnumDisplayLabel(event.eventType, "Event")} -{" "}
                    {formatWidgetEventDate(event.start)}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => removeEvent(event.id)}
                >
                  Remove
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          No specific events selected. The widget will use the date rule
          instead.
        </Text>
      )}
    </>
  );
}
function WidgetSearchResults({
  query: normalizedQuery,
  loading: visibleLoading,
  error: visibleError,
  results: visibleResults,
  onAdd: addEvent,
}: {
  query: string;
  loading: boolean;
  error: string | null;
  results: WidgetEventSelection[];
  onAdd: (event: WidgetEventSelection) => void;
}) {
  return (
    <>
      {normalizedQuery ? (
        <Paper withBorder p="xs" radius="md" className="org-tab-item">
          <Stack gap="xs">
            {visibleLoading ? (
              <OrganizationDataPlaceholder label="events" count={2} />
            ) : null}
            {!visibleLoading && visibleError ? (
              <Text size="xs" c="red">
                {visibleError}
              </Text>
            ) : null}
            {!visibleLoading && !visibleError && !visibleResults.length ? (
              <Text size="xs" c="dimmed">
                No matching events found.
              </Text>
            ) : null}
            {!visibleLoading && !visibleError
              ? visibleResults.map((event) => (
                  <Paper
                    key={event.id}
                    withBorder
                    p="xs"
                    radius="md"
                    className="org-tab-nested-item"
                  >
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <div>
                        <Text size="sm" fw={600}>
                          {event.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatEnumDisplayLabel(event.eventType, "Event")} -{" "}
                          {formatWidgetEventDate(event.start)}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => addEvent(event)}
                      >
                        Add
                      </Button>
                    </Group>
                  </Paper>
                ))
              : null}
          </Stack>
        </Paper>
      ) : null}
    </>
  );
}
