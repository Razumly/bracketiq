import { buildProfitabilityRows } from "../organizationProfitabilityModel";
import type { FinanceLineItem } from "../organizationFinanceTypes";

const item = (patch: Partial<FinanceLineItem> = {}): FinanceLineItem => ({
  id: "bill:1",
  sourceType: "bill",
  scope: "EVENT",
  label: "Entry fee",
  sourceEntityType: "event",
  sourceEntityId: "event-1",
  sourceName: "Summer League",
  category: "registration",
  amountCents: 10000,
  classification: "revenue",
  status: "PAID",
  timing: "ACTUAL",
  isGenerated: true,
  ...patch,
});

it("groups revenue and signed costs without merging event and team identities", () => {
  const entries = [
    item(),
    item({ id: "cost", amountCents: -3500, label: "Court cost" }),
    item({ id: "refund", amountCents: -1000, label: "Refund" }),
    item({
      id: "team",
      sourceEntityType: "team",
      scope: "TEAM",
      sourceName: "Harbor Strikers",
      amountCents: 20000,
    }),
    item({
      id: "ignored",
      sourceEntityType: "organization",
      scope: "ORGANIZATION",
      amountCents: 99999,
    }),
  ];
  const before = JSON.stringify(entries);
  expect(buildProfitabilityRows(entries)).toEqual([
    {
      key: "Team:event-1",
      name: "Harbor Strikers",
      type: "Team",
      sourceId: "event-1",
      customerType: "teams",
      revenueCents: 20000,
      costCents: 0,
      profitCents: 20000,
      itemCount: 1,
    },
    {
      key: "Event:event-1",
      name: "Summer League",
      type: "Event",
      sourceId: "event-1",
      customerType: null,
      revenueCents: 10000,
      costCents: 4500,
      profitCents: 5500,
      itemCount: 3,
    },
  ]);
  expect(JSON.stringify(entries)).toBe(before);
});

it("preserves team scope precedence and source identity fallback order", () => {
  expect(
    buildProfitabilityRows([
      item({
        scope: "EVENT_TEAM",
        sourceEntityId: null,
        customerId: "team-1",
        sourceId: "bill-1",
        sourceName: null,
        customerName: "Harbor Strikers",
      }),
    ]),
  ).toEqual([
    {
      key: "Team:team-1",
      name: "Harbor Strikers",
      type: "Team",
      sourceId: "team-1",
      customerType: "teams",
      revenueCents: 10000,
      costCents: 0,
      profitCents: 10000,
      itemCount: 1,
    },
  ]);
});

it("sorts losses after profit and groups unnamed-source records by their existing labels", () => {
  const result = buildProfitabilityRows([
    item({
      sourceEntityId: null,
      sourceName: null,
      label: "Open gym",
      amountCents: -1500,
    }),
    item({
      sourceEntityId: null,
      sourceName: null,
      label: "Open gym",
      amountCents: 500,
    }),
    item({ sourceEntityId: "second", sourceName: "Cup", amountCents: 0 }),
  ]);
  expect(
    result.map((row) => [row.name, row.profitCents, row.itemCount]),
  ).toEqual([
    ["Cup", 0, 1],
    ["Open gym", -1000, 2],
  ]);
});
