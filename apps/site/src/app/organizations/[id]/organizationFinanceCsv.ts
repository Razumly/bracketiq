import type { StaffPayRun, StaffPayRunItem } from "./organizationFinanceTypes";
import { sourceLabelForPayRunItem } from "./organizationPayrollModel";

export const csvCell = (value: string | number | null | undefined): string => {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
};

const centsToCsvDollars = (amountCents?: number | null): string =>
  Number.isFinite(amountCents) ? (Number(amountCents) / 100).toFixed(2) : "";

const PAY_RUN_CSV_HEADERS = [
  "Pay Run",
  "Pay Run Status",
  "Payout Status",
  "Period Start",
  "Period End",
  "Scheduled Pay Date",
  "Exported At",
  "Export Count",
  "Export Format",
  "Staff",
  "User ID",
  "Staff Member ID",
  "Source Type",
  "Event ID",
  "Team ID",
  "Event Team ID",
  "Service Start",
  "Service End",
  "Wage Type",
  "Rate",
  "Paid Minutes",
  "Amount",
  "Payout Provider",
  "Batch Reference",
  "Transfer Reference",
  "Item Status",
  "Item Payout Status",
  "Notes",
];

function payRunCsvFields(run: StaffPayRun) {
  return [
    run.title,
    run.status,
    run.payoutStatus,
    run.periodStart,
    run.periodEnd,
    run.scheduledPayDate ?? "",
    run.exportedAt ?? "",
    run.exportCount ?? "",
    run.lastExportFormat ?? "",
  ];
}
function sourceCsvFields(item: StaffPayRunItem) {
  return [
    item.label,
    item.userId ?? "",
    item.staffMemberId ?? "",
    sourceLabelForPayRunItem(item),
    item.eventId ?? "",
    item.teamId ?? "",
    item.eventTeamId ?? "",
  ];
}
function laborCsvFields(item: StaffPayRunItem) {
  return [
    item.serviceStartAt ?? "",
    item.serviceEndAt ?? "",
    item.wageType ?? "",
    centsToCsvDollars(item.rateCents),
    item.paidMinutes ?? "",
    centsToCsvDollars(item.amountCents),
  ];
}
function payoutCsvFields(run: StaffPayRun, item: StaffPayRunItem) {
  return [
    item.payoutProvider ?? run.payoutProvider ?? "",
    run.payoutProviderBatchId ?? "",
    item.payoutProviderTransferId ?? "",
    item.status,
    item.payoutStatus,
    item.notes ?? run.notes ?? "",
  ];
}
export function buildPayRunCsv(payRuns: StaffPayRun[]): string {
  const rows = payRuns.flatMap((run) =>
    run.items.map((item) => [
      ...payRunCsvFields(run),
      ...sourceCsvFields(item),
      ...laborCsvFields(item),
      ...payoutCsvFields(run, item),
    ]),
  );
  return [
    PAY_RUN_CSV_HEADERS.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}
