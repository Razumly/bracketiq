"use client";

import type { CSSProperties } from "react";
import OrganizationPublicDraftPreview from "./OrganizationPublicDraftPreview";
import { OrganizationTabHeading } from "@/components/organization/OrganizationTabLayout";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Chip,
  ColorInput,
  DatePickerInput,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@/components/organization/organization-operation-ui";
import { notifications } from "@/lib/organizationNotifications";
import { organizationService } from "@/lib/organizationService";
import { resolveClientPublicOrigin } from "@/lib/clientPublicOrigin";
import { formatEnumDisplayLabel } from "@/lib/enumUtils";
import { slugifyPublicOrganizationName } from "@/lib/publicOrganizationSlug";
import type { EventType, Organization } from "@/types";

import {
  buildWidgetEmbedUrl,
  buildIframeSnippet,
  buildScriptSnippet,
  normalizeLimitInput,
  type WidgetKind,
  type WidgetSectionKind,
  type WidgetDateRule,
  type WidgetProductPurchaseMode,
  type WidgetEventSelectionDateRule,
  type WidgetEventSelection,
  type WidgetSnippetOptions,
} from "./organizationWidgetSnippets";
import {
  idleSlugCheck,
  getSlugCheckState,
  initialPublicPageDraft,
  publicPagePayload,
  publicPageStatus,
  type PublicPageDraft,
  type SlugCheckState,
} from "./organizationPublicSettingsModel";
import { WidgetEventSearchPicker } from "./WidgetEventSearchPicker";
export {
  WidgetEventSearchPicker,
  type WidgetEventSearchPickerProps,
} from "./WidgetEventSearchPicker";

type OrganizationPublicSettingsPanelProps = {
  organization: Organization;
  onUpdated: (organization: Organization) => void | Promise<void>;
};

const slugify = slugifyPublicOrganizationName;

const WIDGET_KIND_OPTIONS: Array<{ value: WidgetKind; label: string }> = [
  { value: "events", label: "Events" },
  { value: "standings", label: "Standings preview" },
  { value: "brackets", label: "Bracket view" },
  { value: "all", label: "All sections" },
  { value: "teams", label: "Teams" },
  { value: "rentals", label: "Rentals" },
  { value: "products", label: "Products" },
];

const DATE_RULE_OPTIONS: Array<{ value: WidgetDateRule; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Starts today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];
const WIDGET_EVENT_SELECTION_DATE_RULE_OPTIONS: Array<{
  value: WidgetEventSelectionDateRule;
  label: string;
}> = [
  { value: "upcoming", label: "Upcoming events" },
  { value: "all", label: "All events" },
];

const EVENT_TYPE_OPTIONS = [
  "EVENT",
  "TOURNAMENT",
  "LEAGUE",
  "WEEKLY_EVENT",
] as const;
const STANDINGS_EVENT_TYPE_OPTIONS: EventType[] = ["LEAGUE"];
const BRACKETS_EVENT_TYPE_OPTIONS: EventType[] = ["LEAGUE", "TOURNAMENT"];
const PRODUCT_PURCHASE_MODE_OPTIONS: Array<{
  value: WidgetProductPurchaseMode;
  label: string;
}> = [
  { value: "all", label: "Both" },
  { value: "single", label: "Single purchase" },
  { value: "subscription", label: "Subscription" },
];
const WIDGET_TYPE_CONTROL_WIDTH = 216;
const buildResponsiveWidthRange = (
  minWidth: number,
  grow: number = 1,
): CSSProperties => ({
  flex: `${grow} 1 ${minWidth}px`,
  minWidth: `min(100%, ${minWidth}px)`,
  maxWidth: `min(100%, ${Math.round(minWidth * 1.25)}px)`,
});
const SECTION_WIDTH_STYLES = {
  common: buildResponsiveWidthRange(180),
  events: buildResponsiveWidthRange(720),
  teams: buildResponsiveWidthRange(320),
  products: buildResponsiveWidthRange(220),
  selection: buildResponsiveWidthRange(720),
} satisfies Record<
  "common" | "events" | "teams" | "products" | "selection",
  CSSProperties
>;
const EVENT_CONTROL_WIDTH_STYLES = {
  datePreset: buildResponsiveWidthRange(160),
  startDate: buildResponsiveWidthRange(170),
  endDate: buildResponsiveWidthRange(170),
  eventType: buildResponsiveWidthRange(380),
  widgetControls: buildResponsiveWidthRange(300),
} satisfies Record<
  "datePreset" | "startDate" | "endDate" | "eventType" | "widgetControls",
  CSSProperties
>;

const BRAND_COLOR_SWATCHES = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#f59e0b",
  "#16a34a",
  "#111827",
  "#ffffff",
];

const formatDateParam = (value: Date | null): string | null => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parsePickerDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const widgetIncludesEvents = (kind: WidgetKind): boolean =>
  kind === "all" || kind === "events";
const widgetIncludesStandings = (kind: WidgetKind): boolean =>
  kind === "standings";
const widgetIncludesBrackets = (kind: WidgetKind): boolean =>
  kind === "brackets";
const widgetIncludesTeams = (kind: WidgetKind): boolean =>
  kind === "all" || kind === "teams";
const widgetIncludesProducts = (kind: WidgetKind): boolean =>
  kind === "all" || kind === "products";
const getVisibleWidgetSections = (kind: WidgetKind): WidgetSectionKind[] =>
  kind === "all" ? ["events", "teams", "rentals", "products"] : [kind];

function usePublicPageDraft(organization: Organization) {
  const [state, setState] = useState(() => ({
    source: organization,
    values: initialPublicPageDraft(organization),
    dirty: false,
  }));
  const keepDraft = state.source.$id === organization.$id && state.dirty;
  if (state.source !== organization) {
    setState({
      source: organization,
      values: keepDraft ? state.values : initialPublicPageDraft(organization),
      dirty: keepDraft,
    });
  }
  const setField = <K extends keyof PublicPageDraft>(
    key: K,
    value: PublicPageDraft[K],
  ) => {
    setState((current) => ({
      ...current,
      dirty: true,
      values: { ...current.values, [key]: value },
    }));
  };
  const markEdited = () =>
    setState((current) =>
      current.dirty ? current : { ...current, dirty: true },
    );
  const resetAfterSave = () =>
    setState((current) => ({ ...current, dirty: false }));
  return {
    values: state.values,
    setField,
    markEdited,
    resetAfterSave,
    keepDraft,
  };
}
function useWidgetPreset(organization: Organization, keepSelection: boolean) {
  const [widgetKind, setWidgetKind] = useState<WidgetKind>("events");
  const [widgetLimit, setWidgetLimit] = useState("6");
  const [snippetEventTypes, setSnippetEventTypes] = useState<string[]>([
    ...EVENT_TYPE_OPTIONS,
  ]);
  const [snippetDateRule, setSnippetDateRule] = useState<WidgetDateRule>("all");
  const [snippetDateFrom, setSnippetDateFrom] = useState<Date | null>(null);
  const [snippetDateTo, setSnippetDateTo] = useState<Date | null>(null);
  const [snippetShowDateFilter, setSnippetShowDateFilter] = useState(true);
  const [snippetShowEventTypeFilter, setSnippetShowEventTypeFilter] =
    useState(true);
  const [snippetIncludeChildWeeklyEvents, setSnippetIncludeChildWeeklyEvents] =
    useState(true);
  const [snippetTeamOpenRegistrationOnly, setSnippetTeamOpenRegistrationOnly] =
    useState(false);
  const [snippetProductPurchaseMode, setSnippetProductPurchaseMode] =
    useState<WidgetProductPurchaseMode>("all");
  const [standingsShowDateFilter, setStandingsShowDateFilter] = useState(true);
  const [standingsDateRule, setStandingsDateRule] =
    useState<WidgetEventSelectionDateRule>("upcoming");
  const [standingsSelectedEvents, setStandingsSelectedEvents] = useState<
    WidgetEventSelection[]
  >([]);
  const [bracketsShowDateFilter, setBracketsShowDateFilter] = useState(true);
  const [bracketsDateRule, setBracketsDateRule] =
    useState<WidgetEventSelectionDateRule>("upcoming");
  const [bracketsSelectedEvents, setBracketsSelectedEvents] = useState<
    WidgetEventSelection[]
  >([]);

  const [selectionSource, setSelectionSource] = useState(organization);
  if (selectionSource !== organization) {
    setSelectionSource(organization);
    if (!keepSelection) {
      setStandingsSelectedEvents([]);
      setBracketsSelectedEvents([]);
    }
  }
  const selectedAllEventTypes =
    snippetEventTypes.length === EVENT_TYPE_OPTIONS.length;
  const visibleWidgetSections = getVisibleWidgetSections(widgetKind);
  const widgetOptions = useMemo(() => {
    const eventPresetOptions = {
      showDateFilter: snippetShowDateFilter,
      showEventTypeFilter: snippetShowEventTypeFilter,
      dateRule: snippetDateFrom || snippetDateTo ? "all" : snippetDateRule,
      dateFrom: formatDateParam(snippetDateFrom),
      dateTo: formatDateParam(snippetDateTo),
      eventTypes: selectedAllEventTypes ? [] : snippetEventTypes,
      includeChildWeeklyEvents: snippetIncludeChildWeeklyEvents,
    } satisfies WidgetSnippetOptions;
    const standingsPresetOptions = {
      showDateFilter: standingsShowDateFilter,
      dateRule: standingsDateRule,
      eventIds: standingsSelectedEvents.map((event) => event.id),
    } satisfies WidgetSnippetOptions;
    const bracketPresetOptions = {
      showDateFilter: bracketsShowDateFilter,
      dateRule: bracketsDateRule,
      eventIds: bracketsSelectedEvents.map((event) => event.id),
    } satisfies WidgetSnippetOptions;
    const widgetOptions: WidgetSnippetOptions = widgetIncludesStandings(
      widgetKind,
    )
      ? standingsPresetOptions
      : widgetIncludesBrackets(widgetKind)
        ? bracketPresetOptions
        : {
            limit: widgetLimit,
            ...(widgetIncludesEvents(widgetKind) ? eventPresetOptions : {}),
            ...(widgetIncludesTeams(widgetKind)
              ? { teamOpenRegistrationOnly: snippetTeamOpenRegistrationOnly }
              : {}),
            ...(widgetIncludesProducts(widgetKind)
              ? { productPurchaseMode: snippetProductPurchaseMode }
              : {}),
          };

    return widgetOptions;
  }, [
    widgetKind,
    widgetLimit,
    snippetShowDateFilter,
    snippetShowEventTypeFilter,
    snippetDateFrom,
    snippetDateTo,
    snippetDateRule,
    snippetEventTypes,
    selectedAllEventTypes,
    snippetIncludeChildWeeklyEvents,
    standingsShowDateFilter,
    standingsDateRule,
    standingsSelectedEvents,
    bracketsShowDateFilter,
    bracketsDateRule,
    bracketsSelectedEvents,
    snippetTeamOpenRegistrationOnly,
    snippetProductPurchaseMode,
  ]);
  return {
    widgetKind,
    setWidgetKind,
    widgetLimit,
    setWidgetLimit,
    snippetEventTypes,
    setSnippetEventTypes,
    snippetDateRule,
    setSnippetDateRule,
    snippetDateFrom,
    setSnippetDateFrom,
    snippetDateTo,
    setSnippetDateTo,
    snippetShowDateFilter,
    setSnippetShowDateFilter,
    snippetShowEventTypeFilter,
    setSnippetShowEventTypeFilter,
    snippetIncludeChildWeeklyEvents,
    setSnippetIncludeChildWeeklyEvents,
    snippetTeamOpenRegistrationOnly,
    setSnippetTeamOpenRegistrationOnly,
    snippetProductPurchaseMode,
    setSnippetProductPurchaseMode,
    standingsShowDateFilter,
    setStandingsShowDateFilter,
    standingsDateRule,
    setStandingsDateRule,
    standingsSelectedEvents,
    setStandingsSelectedEvents,
    bracketsShowDateFilter,
    setBracketsShowDateFilter,
    bracketsDateRule,
    setBracketsDateRule,
    bracketsSelectedEvents,
    setBracketsSelectedEvents,
    selectedAllEventTypes,
    visibleWidgetSections,
    widgetOptions,
  };
}
type WidgetPreset = ReturnType<typeof useWidgetPreset>;
type PublicPageStatus = ReturnType<typeof publicPageStatus>;

export default function OrganizationPublicSettingsPanel({
  organization,
  onUpdated,
}: OrganizationPublicSettingsPanelProps) {
  const pageDraft = usePublicPageDraft(organization);
  const {
    publicSlug,
    publicPageEnabled,
    publicWidgetsEnabled,
    brandPrimaryColor,
    brandAccentColor,
    publicHeadline,
    publicIntroText,
    embedAllowedDomains,
    publicCompletionRedirectUrl,
  } = pageDraft.values;
  const setPublicSlug = (value: PublicPageDraft["publicSlug"]) =>
    pageDraft.setField("publicSlug", value);
  const setPublicPageEnabled = (value: PublicPageDraft["publicPageEnabled"]) =>
    pageDraft.setField("publicPageEnabled", value);
  const setPublicWidgetsEnabled = (
    value: PublicPageDraft["publicWidgetsEnabled"],
  ) => pageDraft.setField("publicWidgetsEnabled", value);
  const setBrandPrimaryColor = (value: PublicPageDraft["brandPrimaryColor"]) =>
    pageDraft.setField("brandPrimaryColor", value);
  const setBrandAccentColor = (value: PublicPageDraft["brandAccentColor"]) =>
    pageDraft.setField("brandAccentColor", value);
  const setPublicHeadline = (value: PublicPageDraft["publicHeadline"]) =>
    pageDraft.setField("publicHeadline", value);
  const setPublicIntroText = (value: PublicPageDraft["publicIntroText"]) =>
    pageDraft.setField("publicIntroText", value);
  const setEmbedAllowedDomains = (
    value: PublicPageDraft["embedAllowedDomains"],
  ) => pageDraft.setField("embedAllowedDomains", value);
  const setPublicCompletionRedirectUrl = (
    value: PublicPageDraft["publicCompletionRedirectUrl"],
  ) => pageDraft.setField("publicCompletionRedirectUrl", value);
  const preset = useWidgetPreset(organization, pageDraft.keepDraft);
  const {
    widgetKind,
    snippetEventTypes,
    setSnippetEventTypes,
    snippetDateRule,
    setSnippetDateRule,
    snippetDateFrom,
    setSnippetDateFrom,
    snippetDateTo,
    setSnippetDateTo,
    snippetShowDateFilter,
    setSnippetShowDateFilter,
    snippetShowEventTypeFilter,
    setSnippetShowEventTypeFilter,
    snippetIncludeChildWeeklyEvents,
    setSnippetIncludeChildWeeklyEvents,
    snippetTeamOpenRegistrationOnly,
    setSnippetTeamOpenRegistrationOnly,
    snippetProductPurchaseMode,
    setSnippetProductPurchaseMode,
    standingsShowDateFilter,
    setStandingsShowDateFilter,
    standingsDateRule,
    setStandingsDateRule,
    standingsSelectedEvents,
    setStandingsSelectedEvents,
    bracketsShowDateFilter,
    setBracketsShowDateFilter,
    bracketsDateRule,
    setBracketsDateRule,
    bracketsSelectedEvents,
    setBracketsSelectedEvents,
    selectedAllEventTypes,
    visibleWidgetSections,
    widgetOptions,
  } = preset;
  const [slugCheck, setSlugCheck] = useState<SlugCheckState>(idleSlugCheck);
  const [saving, setSaving] = useState(false);

  const origin = useMemo(() => {
    const resolved = resolveClientPublicOrigin();
    if (resolved) {
      return resolved;
    }
    return typeof window !== "undefined"
      ? window.location.origin
      : "https://bracket-iq.com";
  }, []);

  const status = publicPageStatus(
    organization,
    pageDraft.values,
    slugCheck,
    origin,
  );
  const {
    normalizedSlug,
    organizationNameSlug,
    savedPublicSlug,
    slugMissingForEnabledSurface,
    slugBlocksSave,
    widgetsReady,
  } = status;
  const { widgetPreviewUrl, iframeSnippet, scriptSnippet } = widgetPreview(
    origin,
    savedPublicSlug,
    widgetKind,
    widgetOptions,
    widgetsReady,
  );

  useEffect(() => {
    if (!normalizedSlug) {
      setSlugCheck({
        status: "invalid",
        checkedSlug: null,
        message:
          publicPageEnabled || publicWidgetsEnabled
            ? "Set a slug before enabling the public page or widgets."
            : "",
      });
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setSlugCheck({
        status: "checking",
        checkedSlug: normalizedSlug,
        message: "Checking availability.",
      });
      organizationService
        .checkPublicSlug(normalizedSlug, organization.$id ?? "", {
          signal: controller.signal,
        })
        .then((result) => {
          if (!controller.signal.aborted) {
            setSlugCheck(getSlugCheckState(result));
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }
          setSlugCheck({
            status: "error",
            checkedSlug: normalizedSlug,
            message:
              error instanceof Error
                ? error.message
                : "Could not check slug availability.",
          });
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    normalizedSlug,
    organization.$id,
    publicPageEnabled,
    publicWidgetsEnabled,
  ]);

  const copySnippet = async (value: string, label: string) => {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    notifications.show({ color: "green", message: `${label} copied.` });
  };

  const handleSave = async () => {
    if (!organization.$id) {
      return;
    }
    if (slugBlocksSave) {
      notifications.show({
        color: "red",
        message: slugMissingForEnabledSurface
          ? "Set an available public slug before enabling the public page or widgets."
          : slugCheck.message ||
            "Choose an available public slug before saving.",
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await organizationService.updateOrganization(
        organization.$id,
        publicPagePayload(pageDraft.values, normalizedSlug),
      );
      pageDraft.resetAfterSave();
      await onUpdated(updated);
      notifications.show({
        color: "green",
        message: "Public page settings saved.",
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save public page settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg" className="org-section org-public-settings">
      <PublicPageHeading organization={organization} status={status} />
      <div className="org-public-workspace">
        <Paper
          withBorder
          p="md"
          radius="md"
          className="org-public-form"
          onChangeCapture={pageDraft.markEdited}
          onClickCapture={pageDraft.markEdited}
        >
          <Title order={3} size="sm" mb="md">
            Page settings
          </Title>
          <Group
            align="flex-end"
            gap="sm"
            wrap="wrap"
            className="org-public-fields"
          >
            <TextInput
              label="Public slug"
              description="Used in /o/slug and /embed/slug URLs."
              value={publicSlug}
              onChange={(event) =>
                setPublicSlug(slugify(event.currentTarget.value))
              }
              placeholder={organizationNameSlug || "organization-name"}
              style={{ flex: "1 1 320px", minWidth: 260 }}
            />
            <Button
              variant="default"
              onClick={() => setPublicSlug(slugify(organization.name))}
            >
              Use organization name
            </Button>
            <ColorInput
              label="Primary color"
              description="Choose a color or paste a hex value."
              value={brandPrimaryColor}
              onChange={setBrandPrimaryColor}
              placeholder="#0f766e"
              format="hex"
              swatches={BRAND_COLOR_SWATCHES}
              style={{ flex: "1 1 220px", minWidth: 190 }}
            />
            <ColorInput
              label="Accent color"
              description="Choose a color or paste a hex value."
              value={brandAccentColor}
              onChange={setBrandAccentColor}
              placeholder="#f59e0b"
              format="hex"
              swatches={BRAND_COLOR_SWATCHES}
              style={{ flex: "1 1 220px", minWidth: 190 }}
            />
            <Stack gap={6} style={{ flex: "0 1 170px", minWidth: 150 }}>
              <Text size="sm" fw={500}>
                Public page
              </Text>
              <Switch
                label="Enable"
                checked={publicPageEnabled}
                onChange={(event) =>
                  setPublicPageEnabled(event.currentTarget.checked)
                }
              />
            </Stack>
            <Stack gap={6} style={{ flex: "0 1 170px", minWidth: 150 }}>
              <Text size="sm" fw={500}>
                Widgets
              </Text>
              <Switch
                label="Enable"
                checked={publicWidgetsEnabled}
                onChange={(event) =>
                  setPublicWidgetsEnabled(event.currentTarget.checked)
                }
              />
            </Stack>
          </Group>

          <PublicSlugSummary status={status} slugCheck={slugCheck} />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
            <Textarea
              label="Public headline"
              value={publicHeadline}
              onChange={(event) => setPublicHeadline(event.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Textarea
              label="Public intro text"
              value={publicIntroText}
              onChange={(event) =>
                setPublicIntroText(event.currentTarget.value)
              }
              autosize
              minRows={2}
            />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
            <TextInput
              label="Allowed embed domains"
              description="Optional comma-separated hostnames. Leave blank for broad embed testing."
              value={embedAllowedDomains}
              onChange={(event) =>
                setEmbedAllowedDomains(event.currentTarget.value)
              }
              placeholder="example.com, www.example.com"
            />
            <TextInput
              label="Completion redirect URL"
              description="Optional. Send public customers here after registrations, rentals, or purchases."
              value={publicCompletionRedirectUrl}
              onChange={(event) =>
                setPublicCompletionRedirectUrl(event.currentTarget.value)
              }
              placeholder="https://example.com/thank-you"
            />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={slugBlocksSave && !saving}
            >
              Save
            </Button>
          </Group>
        </Paper>
        <OrganizationPublicDraftPreview
          organization={organization}
          headline={publicHeadline}
          intro={publicIntroText}
          primary={brandPrimaryColor}
          accent={brandAccentColor}
        />
      </div>

      <Paper withBorder p="md" radius="md" className="org-tab-surface">
        <Title order={5} mb="sm">
          Preview and snippets
        </Title>
        <Stack gap="sm">
          <WidgetPreviewToolbar
            preset={preset}
            status={status}
            widgetPreviewUrl={widgetPreviewUrl}
          />
          <div>
            <Title order={6}>Widget preset builder</Title>
            <Text size="sm" c="dimmed">
              Build iframe and script snippets with the same public filters
              visitors should see in each widget section.
            </Text>
          </div>
          <Group align="stretch" gap="md" wrap="wrap">
            <WidgetCommonSettings preset={preset} />
            {visibleWidgetSections.includes("events") ? (
              <Paper
                withBorder
                p="sm"
                radius="md"
                className="org-tab-item"
                style={SECTION_WIDTH_STYLES.events}
              >
                <Stack gap="xs">
                  <Title order={6}>Events settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Date preset"
                      data={DATE_RULE_OPTIONS}
                      value={snippetDateRule}
                      onChange={(value) =>
                        setSnippetDateRule(
                          (value as WidgetDateRule | null) ?? "all",
                        )
                      }
                      style={EVENT_CONTROL_WIDTH_STYLES.datePreset}
                    />
                    <DatePickerInput
                      label="Start date"
                      value={snippetDateFrom}
                      onChange={(value) =>
                        setSnippetDateFrom(parsePickerDate(value))
                      }
                      clearable
                      valueFormat="MMM D, YYYY"
                      placeholder="No start date"
                      highlightToday
                      style={EVENT_CONTROL_WIDTH_STYLES.startDate}
                    />
                    <DatePickerInput
                      label="End date"
                      value={snippetDateTo}
                      onChange={(value) =>
                        setSnippetDateTo(parsePickerDate(value))
                      }
                      clearable
                      valueFormat="MMM D, YYYY"
                      placeholder="No end date"
                      minDate={snippetDateFrom ?? undefined}
                      highlightToday
                      style={EVENT_CONTROL_WIDTH_STYLES.endDate}
                    />
                    <Stack gap={6} style={EVENT_CONTROL_WIDTH_STYLES.eventType}>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Event type
                      </Text>
                      <Group gap="xs" wrap="wrap">
                        <Chip
                          radius="xl"
                          checked={selectedAllEventTypes}
                          onChange={(checked) =>
                            setSnippetEventTypes(
                              checked ? [...EVENT_TYPE_OPTIONS] : [],
                            )
                          }
                        >
                          All
                        </Chip>
                        {EVENT_TYPE_OPTIONS.map((type) => (
                          <Chip
                            key={type}
                            radius="xl"
                            checked={snippetEventTypes.includes(type)}
                            onChange={(checked) => {
                              if (checked) {
                                const next = new Set(snippetEventTypes);
                                next.add(type);
                                setSnippetEventTypes(
                                  EVENT_TYPE_OPTIONS.filter((option) =>
                                    next.has(option),
                                  ),
                                );
                              } else {
                                setSnippetEventTypes(
                                  snippetEventTypes.filter(
                                    (value) => value !== type,
                                  ),
                                );
                              }
                            }}
                          >
                            {formatEnumDisplayLabel(type, "Event")}
                          </Chip>
                        ))}
                      </Group>
                    </Stack>
                    <Stack
                      gap={6}
                      style={EVENT_CONTROL_WIDTH_STYLES.widgetControls}
                    >
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Widget controls
                      </Text>
                      <Group gap="sm" wrap="wrap">
                        <Checkbox
                          checked={snippetShowDateFilter}
                          onChange={(event) =>
                            setSnippetShowDateFilter(
                              event.currentTarget.checked,
                            )
                          }
                          label="Date filter"
                        />
                        <Checkbox
                          checked={snippetShowEventTypeFilter}
                          onChange={(event) =>
                            setSnippetShowEventTypeFilter(
                              event.currentTarget.checked,
                            )
                          }
                          label="Event type filter"
                        />
                        <Checkbox
                          checked={!snippetIncludeChildWeeklyEvents}
                          onChange={(event) =>
                            setSnippetIncludeChildWeeklyEvents(
                              !event.currentTarget.checked,
                            )
                          }
                          label="Hide weekly events"
                        />
                      </Group>
                    </Stack>
                  </Group>
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes("teams") ? (
              <Paper
                withBorder
                p="sm"
                radius="md"
                className="org-tab-item"
                style={SECTION_WIDTH_STYLES.teams}
              >
                <Stack gap="xs">
                  <Title order={6}>Teams settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Checkbox
                      checked={snippetTeamOpenRegistrationOnly}
                      onChange={(event) =>
                        setSnippetTeamOpenRegistrationOnly(
                          event.currentTarget.checked,
                        )
                      }
                      label="Only show teams with open registration"
                    />
                  </Group>
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes("products") ? (
              <Paper
                withBorder
                p="sm"
                radius="md"
                className="org-tab-item"
                style={SECTION_WIDTH_STYLES.products}
              >
                <Stack gap="xs">
                  <Title order={6}>Products settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Show"
                      data={PRODUCT_PURCHASE_MODE_OPTIONS}
                      value={snippetProductPurchaseMode}
                      onChange={(value) =>
                        setSnippetProductPurchaseMode(
                          (value as WidgetProductPurchaseMode | null) ?? "all",
                        )
                      }
                      style={buildResponsiveWidthRange(200)}
                    />
                  </Group>
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes("standings") ? (
              <Paper
                withBorder
                p="sm"
                radius="md"
                className="org-tab-item"
                style={SECTION_WIDTH_STYLES.selection}
              >
                <Stack gap="sm">
                  <Title order={6}>Standings settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Default event set"
                      data={WIDGET_EVENT_SELECTION_DATE_RULE_OPTIONS}
                      value={standingsDateRule}
                      onChange={(value) =>
                        setStandingsDateRule(
                          (value as WidgetEventSelectionDateRule | null) ??
                            "upcoming",
                        )
                      }
                      style={EVENT_CONTROL_WIDTH_STYLES.datePreset}
                    />
                    <Checkbox
                      checked={standingsShowDateFilter}
                      onChange={(event) =>
                        setStandingsShowDateFilter(event.currentTarget.checked)
                      }
                      label="Show date filter"
                    />
                  </Group>
                  <WidgetEventSearchPicker
                    label="Specific league events"
                    description="Search this organization's league events. Selected events page left and right in the order added."
                    organizationId={organization.$id}
                    eventTypes={STANDINGS_EVENT_TYPE_OPTIONS}
                    selectedEvents={standingsSelectedEvents}
                    onChange={setStandingsSelectedEvents}
                  />
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes("brackets") ? (
              <Paper
                withBorder
                p="sm"
                radius="md"
                className="org-tab-item"
                style={SECTION_WIDTH_STYLES.selection}
              >
                <Stack gap="sm">
                  <Title order={6}>Bracket settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Default event set"
                      data={WIDGET_EVENT_SELECTION_DATE_RULE_OPTIONS}
                      value={bracketsDateRule}
                      onChange={(value) =>
                        setBracketsDateRule(
                          (value as WidgetEventSelectionDateRule | null) ??
                            "upcoming",
                        )
                      }
                      style={EVENT_CONTROL_WIDTH_STYLES.datePreset}
                    />
                    <Checkbox
                      checked={bracketsShowDateFilter}
                      onChange={(event) =>
                        setBracketsShowDateFilter(event.currentTarget.checked)
                      }
                      label="Show date filter"
                    />
                  </Group>
                  <WidgetEventSearchPicker
                    label="Specific bracket events"
                    description="Search this organization's leagues and tournaments. Selected events page left and right in the order added."
                    organizationId={organization.$id}
                    eventTypes={BRACKETS_EVENT_TYPE_OPTIONS}
                    selectedEvents={bracketsSelectedEvents}
                    onChange={setBracketsSelectedEvents}
                  />
                </Stack>
              </Paper>
            ) : null}
          </Group>
          <WidgetSnippetOutput
            iframeSnippet={iframeSnippet}
            scriptSnippet={scriptSnippet}
            widgetsReady={widgetsReady}
            copySnippet={copySnippet}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}

function PublicPageHeading({
  organization,
  status,
}: {
  organization: Organization;
  status: PublicPageStatus;
}) {
  const { savedPublicPageUrl, publicPageReady } = status;
  return (
    <OrganizationTabHeading
      title="Public page"
      description="Control what visitors see on your organization profile."
    >
      <Badge
        variant="light"
        color={organization.publicPageEnabled ? "green" : "gray"}
      >
        {organization.publicPageEnabled ? "Published" : "Private"}
      </Badge>
      <Button
        component="a"
        href={savedPublicPageUrl || "#"}
        target="_blank"
        rel="noreferrer"
        variant="outline"
        disabled={!publicPageReady}
      >
        View public page
      </Button>
    </OrganizationTabHeading>
  );
}
function PublicSlugSummary({
  status,
  slugCheck,
}: {
  status: PublicPageStatus;
  slugCheck: SlugCheckState;
}) {
  const {
    normalizedSlug,
    organizationNameSlug,
    slugCheckIsPending,
    slugStatusColor,
    slugStatusLabel,
    draftPublicPageUrl,
    showSlugStatusMessage,
  } = status;
  return (
    <>
      <Group gap="xs" wrap="wrap" mt="xs">
        <Text size="xs" c="dimmed">
          Preview slug:{" "}
          <Text span fw={700} c="dark">
            {normalizedSlug || organizationNameSlug || "organization-name"}
          </Text>
        </Text>
        {slugCheckIsPending ? <Loader size="xs" /> : null}
        <Badge size="xs" variant="light" color={slugStatusColor}>
          {slugStatusLabel}
        </Badge>
        {normalizedSlug ? (
          <Text size="xs" c="dimmed">
            Public page: {draftPublicPageUrl}
          </Text>
        ) : null}
      </Group>
      {showSlugStatusMessage && slugCheck.message ? (
        <Text size="xs" c={slugStatusColor === "red" ? "red" : "dimmed"} mt={4}>
          {slugCheck.message}
        </Text>
      ) : null}
    </>
  );
}
function WidgetCommonSettings({ preset }: { preset: WidgetPreset }) {
  const { widgetKind, widgetLimit, setWidgetLimit } = preset;
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      className="org-tab-item"
      style={SECTION_WIDTH_STYLES.common}
    >
      <Stack gap="xs">
        <Title order={6}>Common settings</Title>
        {widgetIncludesStandings(widgetKind) ||
        widgetIncludesBrackets(widgetKind) ? (
          <Text size="sm" c="dimmed">
            Standings and bracket widgets page through one event at a time, so
            there is no card limit to set here.
          </Text>
        ) : (
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              label="Data limit"
              inputMode="numeric"
              value={widgetLimit}
              onChange={(event) =>
                setWidgetLimit(
                  event.currentTarget.value.replace(/\D/g, "").slice(0, 2),
                )
              }
              onBlur={() => setWidgetLimit(normalizeLimitInput(widgetLimit))}
              style={{ flex: "0 1 110px", minWidth: 100 }}
            />
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
function WidgetPreviewToolbar({
  preset,
  status,
  widgetPreviewUrl,
}: {
  preset: WidgetPreset;
  status: PublicPageStatus;
  widgetPreviewUrl: string;
}) {
  const { widgetKind, setWidgetKind } = preset;
  const { savedPublicPageUrl, publicPageReady, previewHelpMessage } = status;
  return (
    <>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Button
          component="a"
          href={savedPublicPageUrl || "#"}
          target="_blank"
          rel="noreferrer"
          disabled={!publicPageReady}
        >
          Open public page
        </Button>
        <Button
          component="a"
          href={widgetPreviewUrl || "#"}
          target="_blank"
          rel="noreferrer"
          variant="default"
          disabled={!widgetPreviewUrl}
        >
          Open widget preview
        </Button>
        <Select
          label="Widget type"
          data={WIDGET_KIND_OPTIONS}
          value={widgetKind}
          onChange={(value) =>
            setWidgetKind((value as WidgetKind | null) ?? "events")
          }
          style={{
            width: WIDGET_TYPE_CONTROL_WIDTH,
            minWidth: WIDGET_TYPE_CONTROL_WIDTH,
            maxWidth: WIDGET_TYPE_CONTROL_WIDTH,
          }}
        />
      </Group>
      {previewHelpMessage ? (
        <Text size="sm" c="dimmed">
          {previewHelpMessage}
        </Text>
      ) : null}
    </>
  );
}
function WidgetSnippetOutput({
  iframeSnippet,
  scriptSnippet,
  widgetsReady,
  copySnippet,
}: {
  iframeSnippet: string;
  scriptSnippet: string;
  widgetsReady: boolean;
  copySnippet: (value: string, label: string) => Promise<void>;
}) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Stack gap="xs">
        <Textarea
          label="Iframe snippet"
          value={iframeSnippet}
          readOnly
          autosize
          minRows={4}
        />
        <Button
          variant="default"
          onClick={() => copySnippet(iframeSnippet, "Iframe snippet")}
          disabled={!iframeSnippet || !widgetsReady}
        >
          Copy iframe snippet
        </Button>
      </Stack>
      <Stack gap="xs">
        <Textarea
          label="Script snippet"
          value={scriptSnippet}
          readOnly
          autosize
          minRows={4}
        />
        <Button
          variant="default"
          onClick={() => copySnippet(scriptSnippet, "Script snippet")}
          disabled={!scriptSnippet || !widgetsReady}
        >
          Copy script snippet
        </Button>
      </Stack>
    </SimpleGrid>
  );
}

function widgetPreview(
  origin: string,
  savedPublicSlug: string,
  widgetKind: WidgetKind,
  widgetOptions: WidgetSnippetOptions,
  widgetsReady: boolean,
) {
  const widgetPreviewUrl =
    widgetsReady && savedPublicSlug
      ? buildWidgetEmbedUrl(origin, savedPublicSlug, widgetKind, widgetOptions)
      : "";
  const iframeSnippet = widgetPreviewUrl
    ? buildIframeSnippet(widgetPreviewUrl, widgetKind)
    : "";
  const scriptSnippet = widgetsReady
    ? buildScriptSnippet(origin, savedPublicSlug, widgetKind, widgetOptions)
    : "";

  return { widgetPreviewUrl, iframeSnippet, scriptSnippet };
}
