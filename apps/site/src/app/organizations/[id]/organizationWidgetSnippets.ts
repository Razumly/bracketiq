export type WidgetSnippetOptions = {
  limit?: string;
  showDateFilter?: boolean;
  showEventTypeFilter?: boolean;
  dateRule?: "all" | "upcoming" | "today" | "week" | "month";
  dateFrom?: string | null;
  dateTo?: string | null;
  eventTypes?: string[];
  eventIds?: string[];
  divisionId?: string | null;
  includeChildWeeklyEvents?: boolean;
  teamOpenRegistrationOnly?: boolean;
  productPurchaseMode?: "all" | "single" | "subscription";
};

export type WidgetKind =
  | "all"
  | "events"
  | "teams"
  | "rentals"
  | "products"
  | "standings"
  | "brackets";
export type WidgetDateRule = NonNullable<WidgetSnippetOptions["dateRule"]>;
export type WidgetProductPurchaseMode = NonNullable<
  WidgetSnippetOptions["productPurchaseMode"]
>;
export type WidgetSectionKind = Exclude<WidgetKind, "all">;
export type WidgetEventSelection = {
  id: string;
  name: string;
  eventType: string;
  start: string | null;
};
export type WidgetEventSelectionDateRule = Extract<
  WidgetDateRule,
  "all" | "upcoming"
>;

export const normalizeLimitInput = (value: string): string => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return "6";
  }
  return String(Math.min(Math.max(parsed, 1), 24));
};

export const buildIframeSnippet = (widgetUrl: string, kind: string): string =>
  `<iframe src="${widgetUrl}" title="BracketIQ ${kind}" width="100%" height="640" style="border:0;max-width:100%;" loading="lazy"></iframe>`;

function compact(
  pairs: Array<[string, string | undefined]>,
): Array<[string, string]> {
  return pairs.filter(
    (pair): pair is [string, string] => pair[1] !== undefined,
  );
}
function commonWidgetOptions(options: WidgetSnippetOptions) {
  return compact([
    ["limit", options.limit ? normalizeLimitInput(options.limit) : undefined],
    ["showDateFilter", options.showDateFilter ? "1" : undefined],
    ["showEventTypeFilter", options.showEventTypeFilter ? "1" : undefined],
  ]);
}
function dateWidgetOptions(options: WidgetSnippetOptions) {
  return compact([
    [
      "dateRule",
      options.dateRule && options.dateRule !== "all"
        ? options.dateRule
        : undefined,
    ],
    ["dateFrom", options.dateFrom || undefined],
    ["dateTo", options.dateTo || undefined],
  ]);
}
function eventWidgetOptions(options: WidgetSnippetOptions) {
  return compact([
    [
      "eventTypes",
      options.eventTypes?.length ? options.eventTypes.join(",") : undefined,
    ],
    [
      "eventIds",
      options.eventIds?.length ? options.eventIds.join(",") : undefined,
    ],
    ["divisionId", options.divisionId || undefined],
    [
      "includeChildWeeklyEvents",
      options.includeChildWeeklyEvents === false ? "0" : undefined,
    ],
  ]);
}
function commerceWidgetOptions(options: WidgetSnippetOptions) {
  return compact([
    [
      "teamOpenRegistrationOnly",
      options.teamOpenRegistrationOnly ? "1" : undefined,
    ],
    [
      "productPurchaseMode",
      options.productPurchaseMode && options.productPurchaseMode !== "all"
        ? options.productPurchaseMode
        : undefined,
    ],
  ]);
}
function widgetOptionPairs(options: WidgetSnippetOptions) {
  return [
    ...commonWidgetOptions(options),
    ...dateWidgetOptions(options),
    ...eventWidgetOptions(options),
    ...commerceWidgetOptions(options),
  ];
}
export function buildWidgetEmbedUrl(
  origin: string,
  slug: string,
  kind: string,
  options: WidgetSnippetOptions = {},
) {
  const query = new URLSearchParams(widgetOptionPairs(options)).toString();
  return `${origin}/embed/${slug}/${kind}${query ? `?${query}` : ""}`;
}
export function buildScriptSnippet(
  origin: string,
  slug: string,
  kind: string,
  options: WidgetSnippetOptions = {},
) {
  const attrs = [
    "data-bracketiq-widget",
    `data-org="${slug}"`,
    `data-kind="${kind}"`,
    ...widgetOptionPairs(options).map(
      ([key, value]) =>
        `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${value}"`,
    ),
  ].join(" ");
  return `<div ${attrs}></div>\n<script async src="${origin}/embed.js"></script>`;
}
