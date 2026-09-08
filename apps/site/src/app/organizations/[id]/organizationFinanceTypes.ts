import type { OrganizationCustomerRouteType } from "./organizationTabs";

export type FinanceLineItem = {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  scope: "EVENT" | "TEAM" | "ORGANIZATION" | "EVENT_TEAM";
  label: string;
  sourceName?: string | null;
  sourceEntityType?: "event" | "rental" | "organization" | "team" | null;
  sourceEntityId?: string | null;
  customerType?: OrganizationCustomerRouteType | null;
  customerId?: string | null;
  customerName?: string | null;
  description?: string | null;
  category: string;
  amountCents: number;
  quantity?: number | null;
  unitLabel?: string | null;
  classification: string;
  status: string;
  timing: "ACTUAL" | "FUTURE" | "POTENTIAL" | "WARNING";
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  isGenerated: boolean;
};

export type StaffPayRunItem = {
  id: string;
  staffMemberId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
  eventStaffAssignmentId?: string | null;
  teamStaffLaborEntryId?: string | null;
  label: string;
  description?: string | null;
  wageType?: "HOURLY" | "SALARY" | "FLAT_PER_EVENT" | null;
  rateCents?: number | null;
  paidMinutes?: number | null;
  amountCents: number;
  status: string;
  payoutStatus: string;
  approvedAt?: string | null;
  paidAt?: string | null;
  payoutProvider?: string | null;
  payoutProviderTransferId?: string | null;
  notes?: string | null;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
};

export type AccountingSyncRecord = {
  id: string;
  provider: "QUICKBOOKS_ONLINE";
  sourceType: "STAFF_PAY_RUN" | "FINANCE_JOURNAL_ENTRY";
  staffPayRunId?: string | null;
  sourceKey?: string | null;
  status: "PENDING" | "SYNCED" | "FAILED" | "REAUTH_REQUIRED" | "VOID";
  externalTxnId?: string | null;
  externalTxnType?: string | null;
  externalTxnDocNumber?: string | null;
  intuitTid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  syncedAt?: string | null;
  syncedByUserId?: string | null;
};

export type StaffPayRun = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  scheduledPayDate?: string | null;
  status: string;
  payoutStatus: string;
  totalAmountCents: number;
  itemCount: number;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  paidAt?: string | null;
  paidByUserId?: string | null;
  exportedAt?: string | null;
  exportedByUserId?: string | null;
  exportCount?: number | null;
  lastExportFormat?: string | null;
  payoutProvider?: string | null;
  payoutProviderBatchId?: string | null;
  notes?: string | null;
  items: StaffPayRunItem[];
  accountingSyncs?: AccountingSyncRecord[];
};

export type LineItemStatus =
  | "ESTIMATED"
  | "APPROVED"
  | "ACTUAL"
  | "PAID"
  | "VOID";

export type LineItemDraft = {
  title: string;
  category: string;
  description: string;
  amount: string | number;
  status: LineItemStatus;
  serviceStartDate: string;
  serviceEndDate: string;
  quantity: string | number;
  unitLabel: string;
};

export type PayRunAction =
  | "APPROVE"
  | "MARK_PAID"
  | "VOID"
  | "UPDATE_ITEM_TRANSFERS"
  | "RECORD_EXPORT";

export type MarkPaidDraft = {
  payoutProvider: string;
  payoutProviderBatchId: string;
  notes: string;
};

export type PayRunStatusFilter = "ALL" | "DRAFT" | "APPROVED" | "PAID" | "VOID";
