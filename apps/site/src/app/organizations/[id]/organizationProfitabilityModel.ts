import type { FinanceLineItem } from "./organizationFinanceTypes";

type ProfitabilityRow = {
  key: string;
  name: string;
  type: "Team" | "Event";
  sourceId: string | null;
  customerType: "teams" | null;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  itemCount: number;
};
function sourceType(item: FinanceLineItem): ProfitabilityRow["type"] | null {
  if (
    item.sourceEntityType === "team" ||
    item.scope === "TEAM" ||
    item.scope === "EVENT_TEAM"
  )
    return "Team";
  if (item.sourceEntityType === "event" || item.scope === "EVENT")
    return "Event";
  return null;
}
function emptyProfitabilityRow(
  item: FinanceLineItem,
  type: ProfitabilityRow["type"],
): ProfitabilityRow {
  const sourceId =
    item.sourceEntityId ?? item.customerId ?? item.sourceId ?? null;
  return {
    key: `${type}:${sourceId ?? item.sourceName ?? item.label}`,
    name: item.sourceName ?? item.customerName ?? item.label,
    type,
    sourceId,
    customerType: type === "Team" ? "teams" : null,
    revenueCents: 0,
    costCents: 0,
    profitCents: 0,
    itemCount: 0,
  };
}
function addLineItem(row: ProfitabilityRow, item: FinanceLineItem) {
  if (item.amountCents >= 0) row.revenueCents += item.amountCents;
  else row.costCents += Math.abs(item.amountCents);
  row.profitCents += item.amountCents;
  row.itemCount += 1;
}
export function buildProfitabilityRows(
  lineItems: FinanceLineItem[],
): ProfitabilityRow[] {
  const rows = new Map<string, ProfitabilityRow>();
  for (const item of lineItems) {
    const type = sourceType(item);
    if (!type) continue;
    const candidate = emptyProfitabilityRow(item, type);
    const row = rows.get(candidate.key) ?? candidate;
    addLineItem(row, item);
    rows.set(row.key, row);
  }
  return [...rows.values()].sort((a, b) => b.profitCents - a.profitCents);
}
