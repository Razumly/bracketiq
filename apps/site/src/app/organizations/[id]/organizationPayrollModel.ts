import type {
  MarkPaidDraft,
  PayRunAction,
  PayRunStatusFilter,
  StaffPayRun,
  StaffPayRunItem,
} from "./organizationFinanceTypes";

export type PayRunFilters = {
  status: PayRunStatusFilter;
  staff: string;
  from: string;
  to: string;
};
export type PayRunUpdateDetails = Partial<MarkPaidDraft> & {
  voidReason?: string | null;
  exportFormat?: string | null;
  itemTransfers?: Array<{
    itemId: string;
    payoutProviderTransferId?: string | null;
  }>;
};

export function preparePayRunUpdate(
  action: PayRunAction,
  details?: PayRunUpdateDetails,
) {
  const body: {
    action: PayRunAction;
    payoutProvider?: string | null;
    payoutProviderBatchId?: string | null;
    notes?: string | null;
    voidReason?: string | null;
    exportFormat?: string | null;
    itemTransfers?: PayRunUpdateDetails["itemTransfers"];
  } = { action };
  const textFields = [
    "payoutProvider",
    "payoutProviderBatchId",
    "exportFormat",
    "notes",
    "voidReason",
  ] as const;
  for (const key of textFields) {
    const value = details?.[key];
    if (value !== undefined) body[key] = value?.trim() || null;
  }
  if (details?.itemTransfers !== undefined)
    body.itemTransfers = details.itemTransfers;
  return body;
}

function staffKey(item: StaffPayRunItem) {
  return item.userId ?? item.staffMemberId ?? item.label;
}
export function payRunStaffOptions(payRuns: StaffPayRun[]) {
  const staff = new Map<string, string>();
  for (const run of payRuns) {
    for (const item of run.items) {
      const key = staffKey(item);
      if (!staff.has(key)) staff.set(key, item.label);
    }
  }
  return [
    { value: "ALL", label: "All staff" },
    ...[...staff.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}
function matchesStaff(payRun: StaffPayRun, staff: string) {
  return (
    staff === "ALL" ||
    payRun.items.some(
      (item) =>
        item.userId === staff ||
        item.staffMemberId === staff ||
        item.label === staff,
    )
  );
}
function overlapsPeriod(
  payRun: StaffPayRun,
  start: number | null,
  end: number | null,
) {
  const runStart = new Date(payRun.periodStart).getTime();
  const runEnd = new Date(payRun.periodEnd).getTime();
  if (
    start != null &&
    Number.isFinite(start) &&
    Number.isFinite(runEnd) &&
    runEnd < start
  )
    return false;
  if (
    end != null &&
    Number.isFinite(end) &&
    Number.isFinite(runStart) &&
    runStart > end
  )
    return false;
  return true;
}
export function filterPayRuns(payRuns: StaffPayRun[], filters: PayRunFilters) {
  const start = filters.from.trim()
    ? new Date(`${filters.from}T00:00:00.000`).getTime()
    : null;
  const end = filters.to.trim()
    ? new Date(`${filters.to}T23:59:59.999`).getTime()
    : null;
  return payRuns.filter(
    (run) =>
      (filters.status === "ALL" || run.status === filters.status) &&
      matchesStaff(run, filters.staff) &&
      overlapsPeriod(run, start, end),
  );
}

type StaffLedgerRow = {
  key: string;
  label: string;
  itemCount: number;
  minutes: number;
  draftCents: number;
  approvedCents: number;
  paidCents: number;
  totalCents: number;
};
function emptyStaffLedgerRow(item: StaffPayRunItem): StaffLedgerRow {
  return {
    key: staffKey(item),
    label: item.label,
    itemCount: 0,
    minutes: 0,
    draftCents: 0,
    approvedCents: 0,
    paidCents: 0,
    totalCents: 0,
  };
}
function addLedgerItem(row: StaffLedgerRow, item: StaffPayRunItem) {
  row.itemCount += 1;
  row.minutes += item.paidMinutes ?? 0;
  row.totalCents += item.amountCents;
  if (item.status === "PAID") row.paidCents += item.amountCents;
  else if (item.status === "APPROVED") row.approvedCents += item.amountCents;
  else if (item.status === "DRAFT") row.draftCents += item.amountCents;
}
export function buildPayRunLedger(payRuns: StaffPayRun[]) {
  const rows = new Map<string, StaffLedgerRow>();
  for (const run of payRuns) {
    for (const item of run.items) {
      const key = staffKey(item);
      const row = rows.get(key) ?? emptyStaffLedgerRow(item);
      addLedgerItem(row, item);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export const sourceLabelForPayRunItem = (item: StaffPayRunItem): string => {
  if (item.eventStaffAssignmentId) {
    return "Event labor";
  }
  if (item.teamStaffLaborEntryId) {
    return "Team labor";
  }
  return "Staff labor";
};
