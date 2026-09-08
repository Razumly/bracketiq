import {
  buildPayRunLedger,
  filterPayRuns,
  payRunStaffOptions,
  preparePayRunUpdate,
} from "../organizationPayrollModel";
import { buildPayRunCsv } from "../organizationFinanceCsv";
import type { StaffPayRun, StaffPayRunItem } from "../organizationFinanceTypes";

const item = (patch: Partial<StaffPayRunItem> = {}): StaffPayRunItem => ({
  id: "item-1",
  userId: "user-1",
  staffMemberId: "staff-1",
  label: "Alex Rivera",
  amountCents: 2500,
  paidMinutes: 60,
  status: "DRAFT",
  payoutStatus: "NOT_STARTED",
  ...patch,
});
const run = (patch: Partial<StaffPayRun> = {}): StaffPayRun => ({
  id: "run-1",
  title: "June payroll",
  periodStart: "2026-06-01T00:00:00.000",
  periodEnd: "2026-06-30T23:59:59.999",
  status: "DRAFT",
  payoutStatus: "NOT_STARTED",
  totalAmountCents: 2500,
  itemCount: 1,
  items: [item()],
  ...patch,
});
const allFilters = { status: "ALL" as const, staff: "ALL", from: "", to: "" };

it("filters whole pay runs by status, staff, and overlapping dates", () => {
  const matching = run({
    items: [item(), item({ id: "item-2", userId: "user-2", label: "Sam Lee" })],
  });
  const approved = run({ id: "approved", status: "APPROVED" });
  const later = run({
    id: "later",
    periodStart: "2026-07-01T00:00:00.000",
    periodEnd: "2026-07-31T23:59:59.999",
  });
  const missingStaff = run({
    id: "other",
    items: [
      item({ userId: "other", staffMemberId: "other", label: "Other staff" }),
    ],
  });
  const result = filterPayRuns([matching, approved, later, missingStaff], {
    status: "DRAFT",
    staff: "user-1",
    from: "2026-06-15",
    to: "2026-06-30",
  });
  expect(result).toEqual([matching]);
  expect(result[0].items).toHaveLength(2);
  expect(
    filterPayRuns([matching], { ...allFilters, staff: "staff-1" }),
  ).toEqual([matching]);
  expect(
    filterPayRuns([matching], { ...allFilters, staff: "Alex Rivera" }),
  ).toEqual([matching]);
});

it("includes date boundaries and retains the existing invalid-date filter behavior", () => {
  const firstInstant = run({ periodEnd: "2026-06-15T00:00:00.000" });
  const lastInstant = run({
    id: "last",
    periodStart: "2026-06-15T23:59:59.999",
  });
  expect(
    filterPayRuns([firstInstant, lastInstant], {
      ...allFilters,
      from: "2026-06-15",
      to: "2026-06-15",
    }),
  ).toEqual([firstInstant, lastInstant]);
  const invalidPeriod = run({ periodStart: "invalid", periodEnd: "invalid" });
  expect(
    filterPayRuns([invalidPeriod], {
      ...allFilters,
      from: "2026-06-15",
      to: "2026-06-15",
    }),
  ).toEqual([invalidPeriod]);
  expect(
    filterPayRuns([firstInstant], {
      ...allFilters,
      from: "invalid",
      to: "invalid",
    }),
  ).toEqual([firstInstant]);
});

it("deduplicates staff choices by identity and keeps the first display name", () => {
  const result = payRunStaffOptions([
    run({
      items: [
        item({ label: "Zoe Hart" }),
        item({ label: "New name" }),
        item({ userId: null, staffMemberId: "staff-2", label: "Bea Lane" }),
        item({ userId: null, staffMemberId: null, label: "Cam Reed" }),
      ],
    }),
  ]);
  expect(result).toEqual([
    { value: "ALL", label: "All staff" },
    { value: "staff-2", label: "Bea Lane" },
    { value: "Cam Reed", label: "Cam Reed" },
    { value: "user-1", label: "Zoe Hart" },
  ]);
});

it("groups ledger amounts by item status without changing source records", () => {
  const runs = [
    run({
      items: [
        item(),
        item({
          id: "approved",
          status: "APPROVED",
          amountCents: 1200,
          paidMinutes: null,
        }),
        item({
          id: "paid",
          status: "PAID",
          amountCents: 3300,
          paidMinutes: 90,
        }),
        item({ id: "void", status: "VOID", amountCents: -500, paidMinutes: 0 }),
        item({
          id: "second",
          userId: "user-2",
          label: "Sam Lee",
          amountCents: 8000,
        }),
      ],
    }),
  ];
  const before = JSON.stringify(runs);
  expect(buildPayRunLedger(runs)).toEqual([
    {
      key: "user-2",
      label: "Sam Lee",
      itemCount: 1,
      minutes: 60,
      draftCents: 8000,
      approvedCents: 0,
      paidCents: 0,
      totalCents: 8000,
    },
    {
      key: "user-1",
      label: "Alex Rivera",
      itemCount: 4,
      minutes: 150,
      draftCents: 2500,
      approvedCents: 1200,
      paidCents: 3300,
      totalCents: 6500,
    },
  ]);
  expect(JSON.stringify(runs)).toBe(before);
});

it("exports the existing CSV column order, quoted text, zero values, and payout fallback", () => {
  const csv = buildPayRunCsv([
    run({
      title: 'June, "final"',
      exportCount: 0,
      payoutProvider: "Bank",
      payoutProviderBatchId: "batch-1",
      notes: "Run note",
      items: [
        item({
          label: 'Alex "Ace" Rivera',
          eventStaffAssignmentId: "assignment",
          teamStaffLaborEntryId: "team-labor",
          eventId: "event-1",
          teamId: "team-1",
          eventTeamId: "event-team-1",
          wageType: "HOURLY",
          rateCents: 1234,
          amountCents: -50,
          paidMinutes: 0,
          payoutProviderTransferId: "transfer-1",
        }),
      ],
    }),
  ]);
  expect(csv).toBe(
    [
      '"Pay Run","Pay Run Status","Payout Status","Period Start","Period End","Scheduled Pay Date","Exported At","Export Count","Export Format","Staff","User ID","Staff Member ID","Source Type","Event ID","Team ID","Event Team ID","Service Start","Service End","Wage Type","Rate","Paid Minutes","Amount","Payout Provider","Batch Reference","Transfer Reference","Item Status","Item Payout Status","Notes"',
      '"June, ""final""","DRAFT","NOT_STARTED","2026-06-01T00:00:00.000","2026-06-30T23:59:59.999","","","0","","Alex ""Ace"" Rivera","user-1","staff-1","Event labor","event-1","team-1","event-team-1","","","HOURLY","12.34","0","-0.50","Bank","batch-1","transfer-1","DRAFT","NOT_STARTED","Run note"',
    ].join("\n"),
  );
});

it("retains explicit empty payout values and multiline notes in CSV", () => {
  const csv = buildPayRunCsv([
    run({
      payoutProvider: "Parent bank",
      notes: "Parent note",
      items: [
        item({
          payoutProvider: "",
          notes: "First line\nSecond line",
          rateCents: NaN,
        }),
      ],
    }),
  ]);
  expect(csv).not.toContain("Parent bank");
  expect(csv).not.toContain("Parent note");
  expect(csv).toContain('"First line\nSecond line"');
  expect(csv).toContain('"Staff labor"');
  expect(csv).not.toContain("NaN");
  expect(buildPayRunCsv([]).split("\n")).toHaveLength(1);
});

it("preserves omitted update fields and clears only explicitly empty fields", () => {
  expect(preparePayRunUpdate("APPROVE")).toEqual({ action: "APPROVE" });
  expect(
    preparePayRunUpdate("MARK_PAID", {
      payoutProvider: " Bank ",
      payoutProviderBatchId: " ",
      notes: " Note ",
      exportFormat: null,
    }),
  ).toEqual({
    action: "MARK_PAID",
    payoutProvider: "Bank",
    payoutProviderBatchId: null,
    notes: "Note",
    exportFormat: null,
  });
  expect(preparePayRunUpdate("VOID", { voidReason: " Duplicate " })).toEqual({
    action: "VOID",
    voidReason: "Duplicate",
  });
});

it("passes the selected transfer references without changing their meaning", () => {
  const itemTransfers = [
    { itemId: "item-1", payoutProviderTransferId: null },
    { itemId: "item-2", payoutProviderTransferId: "transfer" },
  ];
  expect(
    preparePayRunUpdate("UPDATE_ITEM_TRANSFERS", { itemTransfers }),
  ).toEqual({
    action: "UPDATE_ITEM_TRANSFERS",
    itemTransfers,
  });
  expect(
    preparePayRunUpdate("RECORD_EXPORT", { exportFormat: " CSV " }),
  ).toEqual({ action: "RECORD_EXPORT", exportFormat: "CSV" });
});
