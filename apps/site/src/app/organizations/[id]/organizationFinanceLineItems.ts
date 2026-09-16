import type {
  FinanceLineItem,
  LineItemDraft,
  LineItemStatus,
} from "./organizationFinanceTypes";
import {
  dateInputToIso,
  dateInputValue,
  dateValueFromIso,
} from "./organizationFinanceDates";

export const LINE_ITEM_STATUS_OPTIONS = [
  { value: "ESTIMATED", label: "Estimated" },
  { value: "APPROVED", label: "Approved" },
  { value: "ACTUAL", label: "Incurred" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
] satisfies Array<{ value: LineItemStatus; label: string }>;

export const LINE_ITEM_STATUS_LABELS = new Map<LineItemStatus, string>(
  LINE_ITEM_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const dollarsToCents = (value: string | number): number => {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/^\$/, ""));
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
};

const dollarsFromCents = (
  amountCents: number | null | undefined,
): string => {
  if (!Number.isFinite(amountCents)) {
    return "";
  }
  return (Number(amountCents) / 100).toFixed(2);
};

export const defaultLineItemDraft = (): LineItemDraft => ({
  title: "",
  category: "Operations",
  description: "",
  amount: "",
  status: "ACTUAL",
  serviceStartDate: dateInputValue(),
  serviceEndDate: "",
  quantity: "",
  unitLabel: "",
});

export const lineItemDraftFromItem = (
  item: FinanceLineItem,
): LineItemDraft => ({
  title: item.label,
  category: item.category,
  description: item.description ?? "",
  amount: dollarsFromCents(Math.abs(item.amountCents)),
  status: LINE_ITEM_STATUS_OPTIONS.some(
    (option) => option.value === item.status,
  )
    ? (item.status as LineItemStatus)
    : "ACTUAL",
  serviceStartDate: dateValueFromIso(item.serviceStartAt),
  serviceEndDate: dateValueFromIso(item.serviceEndAt),
  quantity: item.quantity ?? "",
  unitLabel: item.unitLabel ?? "",
});

export function lineItemCategoryOptions(
  categories: string[],
  items: FinanceLineItem[],
) {
  const names = new Map<string, string>();
  const customCategories = items
    .filter((item) => !item.isGenerated)
    .map((item) => item.category);
  for (const category of [...categories, ...customCategories]) {
    const name = category.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
function lineItemBody(draft: LineItemDraft) {
  const serviceStartAt = dateInputToIso(draft.serviceStartDate);
  return {
    title: draft.title.trim(),
    category: draft.category.trim(),
    description: draft.description.trim() || null,
    amountCents: dollarsToCents(draft.amount),
    quantity: draft.quantity === "" ? null : Number(draft.quantity),
    unitLabel: draft.unitLabel.trim() || null,
    status: draft.status,
    occurredAt: serviceStartAt,
    serviceStartAt,
    serviceEndAt: dateInputToIso(draft.serviceEndDate, true),
  };
}
type LineItemBody = ReturnType<typeof lineItemBody>;
type PreparedLineItem =
  | { body: LineItemBody; error: null }
  | { body: null; error: string };
function dateRangeError(body: LineItemBody) {
  if (
    body.serviceStartAt &&
    body.serviceEndAt &&
    new Date(body.serviceEndAt).getTime() <
      new Date(body.serviceStartAt).getTime()
  ) {
    return "End date must be on or after the start date.";
  }
  return null;
}
export function prepareLineItem(draft: LineItemDraft): PreparedLineItem {
  const body = lineItemBody(draft);
  if (!body.title || !body.category || body.amountCents <= 0) {
    return { body: null, error: "Title, category, and amount are required." };
  }
  const dateError = dateRangeError(body);
  if (dateError) return { body: null, error: dateError };
  if (
    body.quantity != null &&
    (!Number.isFinite(body.quantity) || body.quantity <= 0)
  ) {
    return { body: null, error: "Quantity must be greater than zero." };
  }
  return { body, error: null };
}
