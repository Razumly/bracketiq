import {
  defaultLineItemDraft,
  lineItemCategoryOptions,
  lineItemDraftFromItem,
  prepareLineItem,
} from "../organizationFinanceLineItems";
import {
  dateInputToIso,
  dateInputValue,
  dateValueFromIso,
  monthStartValue,
} from "../organizationFinanceDates";
import type {
  FinanceLineItem,
  LineItemDraft,
} from "../organizationFinanceTypes";

const lineItem = (patch: Partial<FinanceLineItem> = {}): FinanceLineItem => ({
  id: "custom:1",
  sourceType: "custom_line_item",
  sourceId: "1",
  scope: "ORGANIZATION",
  label: "Court supplies",
  category: "Operations",
  amountCents: -12550,
  classification: "custom_cost",
  status: "ACTUAL",
  timing: "ACTUAL",
  isGenerated: false,
  ...patch,
});
const draft = (patch: Partial<LineItemDraft> = {}): LineItemDraft => ({
  ...defaultLineItemDraft(),
  title: " Court supplies ",
  category: " Operations ",
  amount: "125.50",
  serviceStartDate: "2026-06-01",
  serviceEndDate: "2026-06-02",
  ...patch,
});

it("prepares the exact custom cost payload without changing the draft", () => {
  const input = draft({
    description: " New nets ",
    quantity: "2",
    unitLabel: " nets ",
  });
  const before = { ...input };
  expect(prepareLineItem(input)).toEqual({
    error: null,
    body: {
      title: "Court supplies",
      category: "Operations",
      description: "New nets",
      amountCents: 12550,
      quantity: 2,
      unitLabel: "nets",
      status: "ACTUAL",
      occurredAt: new Date("2026-06-01T00:00:00.000").toISOString(),
      serviceStartAt: new Date("2026-06-01T00:00:00.000").toISOString(),
      serviceEndAt: new Date("2026-06-02T23:59:59.999").toISOString(),
    },
  });
  expect(input).toEqual(before);
});

it.each([
  { title: " " },
  { category: " " },
  { amount: "invalid" },
  { amount: 0 },
  { amount: -1 },
])("rejects missing required cost values: %j", (patch) => {
  expect(prepareLineItem(draft(patch))).toEqual({
    body: null,
    error: "Title, category, and amount are required.",
  });
});

it("rejects reversed dates before checking quantity", () => {
  expect(
    prepareLineItem(draft({ serviceEndDate: "2026-05-31", quantity: 0 })),
  ).toEqual({
    body: null,
    error: "End date must be on or after the start date.",
  });
  expect(
    prepareLineItem(draft({ serviceEndDate: "2026-06-01" })).error,
  ).toBeNull();
});

it.each([0, -1, "invalid", Infinity])(
  "rejects invalid quantity %s",
  (quantity) => {
    expect(prepareLineItem(draft({ quantity }))).toEqual({
      body: null,
      error: "Quantity must be greater than zero.",
    });
  },
);

it("keeps optional values null and rounds dollar input to cents", () => {
  expect(
    prepareLineItem(
      draft({
        description: " ",
        unitLabel: " ",
        amount: "$12.345",
        serviceStartDate: "",
        serviceEndDate: "",
        quantity: "",
      }),
    ),
  ).toEqual({
    error: null,
    body: {
      title: "Court supplies",
      category: "Operations",
      description: null,
      amountCents: 1235,
      quantity: null,
      unitLabel: null,
      status: "ACTUAL",
      occurredAt: null,
      serviceStartAt: null,
      serviceEndAt: null,
    },
  });
});

it("opens existing negative costs as editable positive dollars and retains valid statuses", () => {
  expect(
    lineItemDraftFromItem(
      lineItem({
        status: "APPROVED",
        quantity: 0,
        unitLabel: "hours",
        description: "Court 1",
        serviceStartAt: "2026-06-01T12:00:00.000",
        serviceEndAt: "2026-06-02T12:00:00.000",
      }),
    ),
  ).toEqual({
    title: "Court supplies",
    category: "Operations",
    description: "Court 1",
    amount: "125.50",
    status: "APPROVED",
    quantity: 0,
    unitLabel: "hours",
    serviceStartDate: "2026-06-01",
    serviceEndDate: "2026-06-02",
  });
  expect(
    lineItemDraftFromItem(
      lineItem({ status: "unknown", serviceStartAt: "invalid" }),
    ),
  ).toMatchObject({
    status: "ACTUAL",
    serviceStartDate: "",
    serviceEndDate: "",
    description: "",
    unitLabel: "",
    quantity: "",
  });
});

it("merges catalog and custom categories while excluding generated categories", () => {
  expect(
    lineItemCategoryOptions(
      [" Rentals ", "operations", "", "RENTALS"],
      [
        lineItem({ category: "Operations" }),
        lineItem({ category: "Supplies" }),
        lineItem({ category: "generated", isGenerated: true }),
      ],
    ),
  ).toEqual(["operations", "Rentals", "Supplies"]);
});

it("uses local calendar dates for defaults and round trips", () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 5, 15));
  try {
    expect(defaultLineItemDraft().serviceStartDate).toBe("2026-09-05");
    expect(monthStartValue()).toBe("2026-09-01");
    expect(dateInputValue(new Date(2026, 0, 2))).toBe("2026-01-02");
    expect(dateValueFromIso(dateInputToIso("2026-09-05"))).toBe("2026-09-05");
    expect(dateInputToIso("invalid")).toBeNull();
    expect(dateInputToIso(" ")).toBeNull();
    expect(dateValueFromIso("invalid")).toBe("");
  } finally {
    jest.useRealTimers();
  }
});
