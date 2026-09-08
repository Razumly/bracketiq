import {
  buildIframeSnippet,
  buildScriptSnippet,
  buildWidgetEmbedUrl,
} from "../organizationWidgetSnippets";

it("carries the same filters into iframe URLs and script attributes", () => {
  const options = {
    limit: "99",
    showDateFilter: true,
    showEventTypeFilter: true,
    dateRule: "week" as const,
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    eventTypes: ["EVENT", "LEAGUE"],
    eventIds: ["second", "first"],
    divisionId: "adult",
    includeChildWeeklyEvents: false,
    teamOpenRegistrationOnly: true,
    productPurchaseMode: "subscription" as const,
  };
  const url = buildWidgetEmbedUrl(
    "https://bracket-iq.com",
    "river-city",
    "all",
    options,
  );
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
    limit: "24",
    showDateFilter: "1",
    showEventTypeFilter: "1",
    dateRule: "week",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    eventTypes: "EVENT,LEAGUE",
    eventIds: "second,first",
    divisionId: "adult",
    includeChildWeeklyEvents: "0",
    teamOpenRegistrationOnly: "1",
    productPurchaseMode: "subscription",
  });
  const script = new DOMParser().parseFromString(
    buildScriptSnippet("https://bracket-iq.com", "river-city", "all", options),
    "text/html",
  );
  const widget = script.querySelector("[data-bracketiq-widget]");
  if (!widget) throw new Error("The generated widget element is missing.");
  expect(widget.getAttribute("data-limit")).toBe("24");
  expect(widget.getAttribute("data-date-rule")).toBe("week");
  expect(widget.getAttribute("data-event-ids")).toBe("second,first");
  expect(widget.getAttribute("data-event-types")).toBe("EVENT,LEAGUE");
  expect(widget.getAttribute("data-include-child-weekly-events")).toBe("0");
  expect(widget.getAttribute("data-team-open-registration-only")).toBe("1");
  expect(widget.getAttribute("data-product-purchase-mode")).toBe(
    "subscription",
  );
  const iframe = new DOMParser()
    .parseFromString(buildIframeSnippet(url, "all"), "text/html")
    .querySelector("iframe");
  expect(iframe?.getAttribute("src")).toBe(url);
});

it("omits inactive options and normalizes an invalid limit in both outputs", () => {
  const options = {
    limit: "invalid",
    dateRule: "all" as const,
    productPurchaseMode: "all" as const,
    showDateFilter: false,
    showEventTypeFilter: false,
    includeChildWeeklyEvents: true,
    teamOpenRegistrationOnly: false,
    eventTypes: [],
    eventIds: [],
    dateFrom: "",
    dateTo: "",
    divisionId: null,
  };
  expect(
    buildWidgetEmbedUrl(
      "https://bracket-iq.com",
      "river-city",
      "events",
      options,
    ),
  ).toBe("https://bracket-iq.com/embed/river-city/events?limit=6");
  expect(
    buildScriptSnippet(
      "https://bracket-iq.com",
      "river-city",
      "events",
      options,
    ),
  ).toBe(
    '<div data-bracketiq-widget data-org="river-city" data-kind="events" data-limit="6"></div>\n<script async src="https://bracket-iq.com/embed.js"></script>',
  );
});

it("keeps query values encoded and clamps a limit below one", () => {
  const url = new URL(
    buildWidgetEmbedUrl("https://bracket-iq.com", "river-city", "standings", {
      limit: "-1",
      eventIds: ["league & cup"],
      divisionId: "Adult / Open",
    }),
  );
  expect(url.searchParams.get("limit")).toBe("1");
  expect(url.searchParams.get("eventIds")).toBe("league & cup");
  expect(url.searchParams.get("divisionId")).toBe("Adult / Open");
});
