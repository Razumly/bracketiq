'use client';

import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Popover,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@/components/organization/organization-operation-ui';
import { Download, ExternalLink, Pencil, Plus, Settings2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { formatBillAmount } from '@/types';
import {
  buildOrganizationCustomerPath,
  buildOrganizationTabPath,
} from './organizationTabs';

import type {
  FinanceLineItem, StaffPayRunItem, AccountingSyncRecord, StaffPayRun,
  LineItemStatus, LineItemDraft, PayRunAction, MarkPaidDraft, PayRunStatusFilter,
} from './organizationFinanceTypes';
import { dateInputValue, monthStartValue, dateInputToIso } from './organizationFinanceDates';
import {
  LINE_ITEM_STATUS_OPTIONS, LINE_ITEM_STATUS_LABELS, defaultLineItemDraft,
  lineItemDraftFromItem, prepareLineItem,
  lineItemCategoryOptions as buildLineItemCategoryOptions,
} from './organizationFinanceLineItems';
import {
  sourceLabelForPayRunItem, filterPayRuns, buildPayRunLedger,
  payRunStaffOptions as buildPayRunStaffOptions, preparePayRunUpdate,
  type PayRunUpdateDetails,
} from './organizationPayrollModel';
import { buildProfitabilityRows } from './organizationProfitabilityModel';
import { buildPayRunCsv, csvCell } from './organizationFinanceCsv';

import OrganizationFinanceCharts from './OrganizationFinanceCharts';
import { OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import { OrganizationDataLoadingProvider, OrganizationLoadingValue, OrganizationTableBody } from '@/components/organization/OrganizationDataLoading';

type OrganizationFinanceSummary = {
  organizationId: string;
  grossRevenueCents: number;
  refundCents: number;
  feeCents: number;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  futureCostCents: number;
  potentialRevenueCents: number;
  projectedProfitCents: number;
  staffCostCents: number;
  customCostCents: number;
  lineItems: FinanceLineItem[];
  warnings: Array<{ code: string; message: string }>;
};

type FinanceCategoryAccountingEntryType = 'REVENUE' | 'EXPENSE' | 'LIABILITY' | 'ASSET';

type CategoryAccountingMapping = {
  id: string;
  provider: 'QUICKBOOKS_ONLINE';
  category: string;
  categoryKey: string;
  entryType: FinanceCategoryAccountingEntryType;
  accountExternalId?: string | null;
  accountName?: string | null;
  notes?: string | null;
  isActive: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type FinanceResponse = {
  finance: OrganizationFinanceSummary;
  payRuns: StaffPayRun[];
  lineItemCategories?: string[];
  accountingConnections?: AccountingConnection[];
  categoryAccountingMappings?: CategoryAccountingMapping[];
};

type AccountingConnection = {
  id: string;
  provider: 'QUICKBOOKS_ONLINE';
  status: 'CONNECTED' | 'REAUTH_REQUIRED' | 'DISCONNECTED';
  externalCompanyId?: string | null;
  externalCompanyName?: string | null;
  environment: string;
  scopes: string[];
  tokenType?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  refreshTokenHardExpiresAt?: string | null;
  connectedAt?: string | null;
  connectedByUserId?: string | null;
  disconnectedAt?: string | null;
  disconnectedByUserId?: string | null;
  lastSyncedAt?: string | null;
  lastIntuitTid?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
  payrollExpenseAccountExternalId?: string | null;
  payrollExpenseAccountName?: string | null;
  payrollLiabilityAccountExternalId?: string | null;
  payrollLiabilityAccountName?: string | null;
  financeClearingAccountExternalId?: string | null;
  financeClearingAccountName?: string | null;
};

type QuickBooksAccount = {
  id: string;
  name: string;
  fullyQualifiedName?: string | null;
  displayName: string;
  accountType?: string | null;
  accountSubType?: string | null;
  classification?: string | null;
  accountNumber?: string | null;
  active: boolean;
};

type QuickBooksAccountsResponse = {
  accounts: QuickBooksAccount[];
};

type QuickBooksJournalPreviewLine = {
  id: string;
  lineItemId: string;
  lineItemLabel: string;
  category: string;
  sourceType: string;
  sourceName?: string | null;
  customerName?: string | null;
  postingType: 'Debit' | 'Credit';
  amountCents: number;
  accountExternalId?: string | null;
  accountName?: string | null;
  description: string;
  missingAccount: boolean;
  role: 'LINE_ITEM_ACCOUNT' | 'CLEARING_ACCOUNT';
};

type QuickBooksJournalPreview = {
  provider: 'QUICKBOOKS_ONLINE';
  txnDate: string;
  privateNote: string;
  includedLineItemCount: number;
  skippedLineItemCount: number;
  unmappedLineItemCount: number;
  debitTotalCents: number;
  creditTotalCents: number;
  isBalanced: boolean;
  readyToSync: boolean;
  warnings: string[];
  lines: QuickBooksJournalPreviewLine[];
};

type QuickBooksJournalSyncResponse = {
  preview: QuickBooksJournalPreview;
  syncRecord: AccountingSyncRecord;
  alreadySynced: boolean;
};

type PayRunItemTransferDraft = {
  itemId: string;
  label: string;
  payoutProviderTransferId: string;
};

type QuickBooksMappingDraft = {
  payrollExpenseAccountExternalId: string;
  payrollExpenseAccountName: string;
  payrollLiabilityAccountExternalId: string;
  payrollLiabilityAccountName: string;
  financeClearingAccountExternalId: string;
  financeClearingAccountName: string;
};

type QuickBooksAccountIntent = 'asset' | 'expense' | 'liability' | 'revenue';

type CategoryAccountingMappingDraft = {
  key: string;
  category: string;
  entryType: FinanceCategoryAccountingEntryType;
  accountExternalId: string;
  accountName: string;
  notes: string;
};

type OrganizationFinancePanelProps = {
  organizationId: string;
  isActive: boolean;
  canManage: boolean;
};

type LineItemNavigationTarget = {
  label: string;
  href: string;
};

const centsFromDollars = (amountCents: number): string => {
  const prefix = amountCents < 0 ? '-' : '';
  return `${prefix}${formatBillAmount(Math.abs(amountCents))}`;
};

const formatDate = (value?: string | null): string => {
  if (!value) {
    return 'No date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No date';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Not set';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not set';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatPeriod = (start?: string | null, end?: string | null): string => {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

const formatLineItemStatus = (status: string): string => (
  LINE_ITEM_STATUS_LABELS.get(status as LineItemStatus)?.toUpperCase() ?? status
);

const formatLineItemTiming = (timing: FinanceLineItem['timing']): string => (
  timing === 'ACTUAL' ? 'CURRENT' : timing
);

const formatQuantityAndUnit = (quantity?: number | null, unitLabel?: string | null): string => {
  const normalizedUnit = unitLabel?.trim();
  if (quantity == null || !Number.isFinite(quantity)) {
    return normalizedUnit || '-';
  }
  const quantityLabel = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const displayUnit = quantity === 1 && normalizedUnit === 'hours'
    ? 'hour'
    : normalizedUnit;
  return displayUnit ? `${quantityLabel} ${displayUnit}` : quantityLabel;
};

const formatLaborMinutes = (minutes?: number | null): string => {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) {
    return '-';
  }
  const wholeMinutes = Math.round(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  const remainder = wholeMinutes % 60;
  if (hours && remainder) {
    return `${hours}h ${remainder}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${remainder}m`;
};

const formatWageType = (wageType?: StaffPayRunItem['wageType']): string => {
  if (wageType === 'HOURLY') {
    return 'Hourly';
  }
  if (wageType === 'SALARY') {
    return 'Salary';
  }
  if (wageType === 'FLAT_PER_EVENT') {
    return 'Flat per event';
  }
  return 'No rate';
};

const formatWageRate = (item: StaffPayRunItem): string => {
  if (!item.rateCents || item.rateCents <= 0) {
    return formatWageType(item.wageType);
  }
  const suffix = item.wageType === 'HOURLY'
    ? '/hr'
    : item.wageType === 'SALARY'
      ? '/yr'
      : item.wageType === 'FLAT_PER_EVENT'
        ? '/event'
        : '';
  return `${formatWageType(item.wageType)} ${centsFromDollars(item.rateCents)}${suffix}`;
};

const payRunPayoutColor = (status: string): string => {
  if (status === 'PAID') {
    return 'green';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'red';
  }
  if (status === 'PROCESSING' || status === 'PENDING') {
    return 'orange';
  }
  return 'gray';
};

const accountingStatusColor = (status?: AccountingConnection['status'] | null): string => {
  if (status === 'CONNECTED') {
    return 'green';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'orange';
  }
  return 'gray';
};

const accountingStatusLabel = (status?: AccountingConnection['status'] | null): string => {
  if (status === 'CONNECTED') {
    return 'Connected';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'Reconnect required';
  }
  return 'Not connected';
};

const accountingSyncStatusColor = (status?: AccountingSyncRecord['status'] | null): string => {
  if (status === 'SYNCED') {
    return 'green';
  }
  if (status === 'FAILED') {
    return 'red';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'orange';
  }
  if (status === 'PENDING') {
    return 'yellow';
  }
  return 'gray';
};

const accountingSyncStatusLabel = (status?: AccountingSyncRecord['status'] | null): string => {
  if (status === 'SYNCED') {
    return 'Synced';
  }
  if (status === 'FAILED') {
    return 'Failed';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'Reconnect';
  }
  if (status === 'PENDING') {
    return 'Pending';
  }
  return 'Not synced';
};

const isRetryableQuickBooksReauthSync = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): boolean => (
  sync?.provider === 'QUICKBOOKS_ONLINE'
    && sync.status === 'REAUTH_REQUIRED'
    && connection?.status === 'CONNECTED'
);

const quickBooksSyncStatusColor = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): string => (
  isRetryableQuickBooksReauthSync(sync, connection)
    ? 'blue'
    : accountingSyncStatusColor(sync?.status)
);

const quickBooksSyncStatusLabel = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): string => (
  isRetryableQuickBooksReauthSync(sync, connection)
    ? 'Retry'
    : accountingSyncStatusLabel(sync?.status)
);

const quickBooksSyncErrorMessage = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): string | null => {
  if (!sync?.errorMessage) {
    return null;
  }
  if (isRetryableQuickBooksReauthSync(sync, connection)) {
    return 'QuickBooks reconnected. Try syncing this pay run again.';
  }
  return sync.errorMessage;
};

const quickBooksConnectionActionLabel = (connection?: AccountingConnection | null): string => (
  connection?.status === 'CONNECTED' || connection?.status === 'REAUTH_REQUIRED'
    ? 'Reconnect'
    : 'Connect'
);

const quickBooksPayRunActionLabel = (sync?: AccountingSyncRecord | null): string => (
  sync?.status === 'FAILED' || sync?.status === 'REAUTH_REQUIRED' ? 'Retry QBO' : 'Sync QBO'
);

const accountingEntryTypeLabel = (entryType: FinanceCategoryAccountingEntryType): string => {
  if (entryType === 'REVENUE') {
    return 'Revenue';
  }
  if (entryType === 'EXPENSE') {
    return 'Expense';
  }
  if (entryType === 'LIABILITY') {
    return 'Liability';
  }
  return 'Asset';
};

const accountingEntryTypeColor = (entryType: FinanceCategoryAccountingEntryType): string => {
  if (entryType === 'REVENUE') {
    return 'green';
  }
  if (entryType === 'EXPENSE') {
    return 'red';
  }
  if (entryType === 'LIABILITY') {
    return 'orange';
  }
  return 'blue';
};

const isQuickBooksPayRunSyncEligible = (payRun: StaffPayRun): boolean => (
  payRun.status === 'APPROVED' || payRun.status === 'PAID'
);

const getQuickBooksSync = (payRun: StaffPayRun): AccountingSyncRecord | null => (
  payRun.accountingSyncs?.find((sync) => sync.provider === 'QUICKBOOKS_ONLINE') ?? null
);

const categoryMappingKey = (category: string, entryType: FinanceCategoryAccountingEntryType): string => (
  `${category.trim().toLowerCase()}::${entryType}`
);

const inferLineItemEntryType = (item: FinanceLineItem): FinanceCategoryAccountingEntryType => (
  item.amountCents >= 0 ? 'REVENUE' : 'EXPENSE'
);

const buildCategoryAccountingMappingDrafts = ({
  lineItems,
  categories,
  mappings,
}: {
  lineItems: FinanceLineItem[];
  categories: string[];
  mappings: CategoryAccountingMapping[];
}): CategoryAccountingMappingDraft[] => {
  const rows = new Map<string, CategoryAccountingMappingDraft>();
  const addRow = (category: string, entryType: FinanceCategoryAccountingEntryType) => {
    const normalizedCategory = category.trim();
    if (!normalizedCategory) {
      return;
    }
    const key = categoryMappingKey(normalizedCategory, entryType);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        category: normalizedCategory,
        entryType,
        accountExternalId: '',
        accountName: '',
        notes: '',
      });
    }
  };

  lineItems.forEach((item) => addRow(item.category, inferLineItemEntryType(item)));
  categories.forEach((category) => addRow(category, 'EXPENSE'));
  mappings.forEach((mapping) => {
    addRow(mapping.category, mapping.entryType);
    const key = categoryMappingKey(mapping.category, mapping.entryType);
    const current = rows.get(key);
    if (current) {
      rows.set(key, {
        ...current,
        accountExternalId: mapping.accountExternalId ?? '',
        accountName: mapping.accountName ?? '',
        notes: mapping.notes ?? '',
      });
    }
  });

  return [...rows.values()].sort((a, b) => (
    a.category.localeCompare(b.category) || a.entryType.localeCompare(b.entryType)
  ));
};

const QUICKBOOKS_MAPPING_FIELDS = [
  'payrollExpenseAccountExternalId', 'payrollExpenseAccountName',
  'payrollLiabilityAccountExternalId', 'payrollLiabilityAccountName',
  'financeClearingAccountExternalId', 'financeClearingAccountName',
] as const;

const defaultQuickBooksMappingDraft = (connection?: AccountingConnection | null): QuickBooksMappingDraft => {
  const draft: QuickBooksMappingDraft = {
    payrollExpenseAccountExternalId: '', payrollExpenseAccountName: '',
    payrollLiabilityAccountExternalId: '', payrollLiabilityAccountName: '',
    financeClearingAccountExternalId: '', financeClearingAccountName: '',
  };
  for (const key of QUICKBOOKS_MAPPING_FIELDS) draft[key] = connection?.[key] ?? '';
  return draft;
};

const normalizeQuickBooksText = (value?: string | null): string => (
  value?.trim().toLowerCase() ?? ''
);

const quickBooksAccountHasKeyword = (account: QuickBooksAccount, keywords: string[]): boolean => {
  const searchable = [
    account.name,
    account.fullyQualifiedName,
    account.accountType,
    account.accountSubType,
    account.classification,
  ].map(normalizeQuickBooksText).join(' ');
  return keywords.some((keyword) => searchable.includes(keyword));
};

const QUICKBOOKS_ACCOUNT_RANKING: Record<QuickBooksAccountIntent, {
  types: string[]; keywords: string[]; subtypes: string[];
}> = {
  expense: {
    types: ['expense', 'cost of goods sold', 'other expense'],
    keywords: ['payroll', 'wage', 'salary', 'labor', 'staff', 'contractor'],
    subtypes: ['payroll', 'labor'],
  },
  revenue: {
    types: ['income', 'other income'],
    keywords: ['sales', 'revenue', 'income', 'registration', 'fees'],
    subtypes: ['income', 'sales'],
  },
  asset: {
    types: ['bank', 'accounts receivable', 'other current asset'],
    keywords: ['cash', 'bank', 'receivable', 'asset', 'clearing'],
    subtypes: ['cash', 'receivable'],
  },
  liability: {
    types: ['other current liability', 'long term liability', 'accounts payable'],
    keywords: ['payroll', 'liabil', 'clearing', 'accrued', 'payable', 'withholding'],
    subtypes: ['liabil', 'payroll'],
  },
};
const quickBooksMappingScore = (account: QuickBooksAccount, intent: QuickBooksAccountIntent): number => {
  const rule = QUICKBOOKS_ACCOUNT_RANKING[intent];
  const type = normalizeQuickBooksText(account.accountType);
  const subtype = normalizeQuickBooksText(account.accountSubType);
  return (rule.types.includes(type) ? 60 : 0)
    + (quickBooksAccountHasKeyword(account, rule.keywords) ? 30 : 0)
    + (rule.subtypes.some((keyword) => subtype.includes(keyword)) ? 10 : 0);
};

const sortQuickBooksAccountsForMapping = (
  accounts: QuickBooksAccount[],
  intent: QuickBooksAccountIntent,
): QuickBooksAccount[] => (
  [...accounts].sort((a, b) => {
    const scoreDelta = quickBooksMappingScore(b, intent) - quickBooksMappingScore(a, intent);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.displayName.localeCompare(b.displayName);
  })
);

const quickBooksAccountIntentForEntryType = (
  entryType: FinanceCategoryAccountingEntryType,
): QuickBooksAccountIntent => {
  if (entryType === 'REVENUE') {
    return 'revenue';
  }
  if (entryType === 'LIABILITY') {
    return 'liability';
  }
  if (entryType === 'ASSET') {
    return 'asset';
  }
  return 'expense';
};

const quickBooksAccountSelectOption = (account: QuickBooksAccount) => ({
  value: account.id,
  label: account.displayName,
});

const selectedQuickBooksAccountFallback = (
  id: string,
  name: string,
): QuickBooksAccount | null => {
  const trimmedId = id.trim();
  const trimmedName = name.trim();
  if (!trimmedId) {
    return null;
  }
  return {
    id: trimmedId,
    name: trimmedName || trimmedId,
    fullyQualifiedName: trimmedName || null,
    displayName: trimmedName ? `${trimmedName} · ${trimmedId}` : trimmedId,
    accountType: null,
    accountSubType: null,
    classification: null,
    accountNumber: null,
    active: true,
  };
};

const mergeSelectedQuickBooksAccount = (
  accounts: QuickBooksAccount[],
  selected: QuickBooksAccount | null,
): QuickBooksAccount[] => {
  if (!selected || accounts.some((account) => account.id === selected.id)) {
    return accounts;
  }
  return [selected, ...accounts];
};

const formatPayRunExportStatus = (payRun: StaffPayRun): string => {
  if (!payRun.exportedAt) {
    return 'Not exported';
  }
  const format = payRun.lastExportFormat === 'QUICKBOOKS_JOURNAL_ENTRY'
    ? 'QuickBooks'
    : payRun.lastExportFormat ?? 'CSV';
  return `${format} #${payRun.exportCount ?? 1}`;
};

const defaultMarkPaidDraft = (payRun?: StaffPayRun | null): MarkPaidDraft => ({
  payoutProvider: payRun?.payoutProvider ?? '',
  payoutProviderBatchId: payRun?.payoutProviderBatchId ?? '',
  notes: payRun?.notes ?? '',
});

const downloadCsv = (filename: string, csv: string): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const messageForError = (error: unknown, fallback: string): string => {
  if (isApiRequestError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

function FinanceMetric({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value?: number;
  description: string;
  tone: 'green' | 'red' | 'orange' | 'gray';
}) {
  const toneClassName = {
    green: 'border-green-200 bg-green-50 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    gray: 'border-gray-200 bg-gray-50 text-gray-800',
  }[tone];

  return (
    <Paper withBorder radius="md" p="md" className={`org-finance-metric ${toneClassName}`}>
      <Stack gap={4}>
        <Text size="sm" fw={500}>{label}</Text>
        <Text size="xl" fw={800}><OrganizationLoadingValue>{value === undefined ? '—' : centsFromDollars(value)}</OrganizationLoadingValue></Text>
        <Text size="xs">{description}</Text>
      </Stack>
    </Paper>
  );
}

function financeRequestPath(organizationId: string, fromDate: string, toDate: string) {
  const params = new URLSearchParams();
  if (fromDate.trim()) params.set('from', dateInputToIso(fromDate) ?? fromDate);
  if (toDate.trim()) params.set('to', dateInputToIso(toDate, true) ?? toDate);
  const query = params.toString();
  return `/api/organizations/${organizationId}/finance${query ? `?${query}` : ''}`;
}

function payRunSyncActions(available: boolean, connection: AccountingConnection | null, mapped: boolean, canManage: boolean) {
  const allowed = canManage && available;
  return {
    canSyncPayRunToQuickBooks: allowed && connection?.status === 'CONNECTED' && mapped,
    canReconnectQuickBooks: allowed && connection?.status === 'REAUTH_REQUIRED',
  };
}
function payRunSyncDisplay(sync: AccountingSyncRecord | null, connection: AccountingConnection | null, needsMapping: boolean) {
  return {
    color: needsMapping ? 'yellow' : quickBooksSyncStatusColor(sync, connection),
    label: needsMapping ? 'Needs mapping' : quickBooksSyncStatusLabel(sync, connection),
    error: needsMapping ? 'Set QuickBooks payroll account mapping before syncing.' : quickBooksSyncErrorMessage(sync, connection),
    errorColor: needsMapping ? 'orange' : isRetryableQuickBooksReauthSync(sync, connection) ? 'blue' : 'red',
  };
}
function payRunAccountingState(payRun: StaffPayRun, connection: AccountingConnection | null, mapped: boolean, canManage: boolean) {
  const quickBooksSync = getQuickBooksSync(payRun);
  const quickBooksSyncEligible = isQuickBooksPayRunSyncEligible(payRun);
  const available = quickBooksSyncEligible && quickBooksSync?.status !== 'SYNCED';
  const needsMapping = available && connection?.status === 'CONNECTED' && !mapped;
  const display = payRunSyncDisplay(quickBooksSync, connection, needsMapping);
  return {
    quickBooksSync, quickBooksSyncEligible,
    quickBooksSyncError: display.error, display,
    ...payRunSyncActions(available, connection, mapped, canManage),
  };
}

function sameQuickBooksMappingSource(before: AccountingConnection | null, after: AccountingConnection | null): boolean {
  if (before?.id !== after?.id) return false;
  return QUICKBOOKS_MAPPING_FIELDS.every((key) => before?.[key] === after?.[key]);
}

function useQuickBooksMappingDraft(connection: AccountingConnection | null) {
  const [state, setState] = useState(() => ({
    source: connection,
    draft: defaultQuickBooksMappingDraft(connection),
  }));
  // Keep local edits when only the connection status changes.
  if (!sameQuickBooksMappingSource(state.source, connection)) {
    setState({ source: connection, draft: defaultQuickBooksMappingDraft(connection) });
  }
  const setDraft = useCallback((update: SetStateAction<QuickBooksMappingDraft>) => {
    setState((current) => ({
      ...current,
      draft: typeof update === 'function' ? update(current.draft) : update,
    }));
  }, []);
  return [state.draft, setDraft] as const;
}

function quickBooksMappingAvailability(connection: AccountingConnection | null) {
  return {
    quickBooksMappingReady: Boolean(connection?.payrollExpenseAccountExternalId && connection?.payrollLiabilityAccountExternalId),
    quickBooksMappingDisabled: !connection || connection.status !== 'CONNECTED',
    quickBooksCategoryMappingDisabled: !connection || connection.status === 'DISCONNECTED',
  };
}

function financeMetricTones(finance: OrganizationFinanceSummary | null): {
  profitTone: 'green' | 'red';
  projectedTone: 'green' | 'red';
} {
  return {
    profitTone: (finance?.actualProfitCents ?? 0) >= 0 ? 'green' : 'red',
    projectedTone: (finance?.projectedProfitCents ?? 0) >= 0 ? 'green' : 'red',
  };
}

function syncTransactionLabel(sync: AccountingSyncRecord | null): string {
  if (!sync?.externalTxnId) return 'Not synced';
  return `${sync.externalTxnType ?? 'Txn'} ${sync.externalTxnDocNumber || sync.externalTxnId}`;
}

function quickBooksAccountDescription(account: QuickBooksAccount | null, fallback: string): string {
  if (!account?.accountType) return fallback;
  return `${account.accountType}${account.accountSubType ? ` - ${account.accountSubType}` : ''}`;
}

export default function OrganizationFinancePanel({
  organizationId,
  isActive,
  canManage,
}: OrganizationFinancePanelProps) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(monthStartValue);
  const [toDate, setToDate] = useState(() => dateInputValue());
  const [finance, setFinance] = useState<OrganizationFinanceSummary | null>(null);
  const [payRuns, setPayRuns] = useState<StaffPayRun[]>([]);
  const [lineItemCategories, setLineItemCategories] = useState<string[]>([]);
  const [accountingConnections, setAccountingConnections] = useState<AccountingConnection[]>([]);
  const [categoryAccountingMappings, setCategoryAccountingMappings] = useState<CategoryAccountingMapping[]>([]);
  const [loading, setLoading] = useState(isActive);
  const [error, setError] = useState<string | null>(null);
  const [payRunTitle, setPayRunTitle] = useState('');
  const [payRunStart, setPayRunStart] = useState(monthStartValue);
  const [payRunEnd, setPayRunEnd] = useState(() => dateInputValue());
  const [payRunPayDate, setPayRunPayDate] = useState(() => dateInputValue());
  const [payRunSaving, setPayRunSaving] = useState(false);
  const [updatingPayRunId, setUpdatingPayRunId] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [selectedPayRunId, setSelectedPayRunId] = useState<string | null>(null);
  const [markPaidPayRunId, setMarkPaidPayRunId] = useState<string | null>(null);
  const [markPaidDraft, setMarkPaidDraft] = useState<MarkPaidDraft>(() => defaultMarkPaidDraft());
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [voidPayRunId, setVoidPayRunId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [transferPayRunId, setTransferPayRunId] = useState<string | null>(null);
  const [transferDraft, setTransferDraft] = useState<PayRunItemTransferDraft[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [payRunStatusFilter, setPayRunStatusFilter] = useState<PayRunStatusFilter>('ALL');
  const [payRunStaffFilter, setPayRunStaffFilter] = useState('ALL');
  const [payRunFromFilter, setPayRunFromFilter] = useState('');
  const [payRunToFilter, setPayRunToFilter] = useState('');
  const [quickBooksSaving, setQuickBooksSaving] = useState(false);
  const [quickBooksMappingSaving, setQuickBooksMappingSaving] = useState(false);
  const [quickBooksAccounts, setQuickBooksAccounts] = useState<QuickBooksAccount[]>([]);
  const [quickBooksAccountsLoading, setQuickBooksAccountsLoading] = useState(false);
  const [quickBooksAccountsError, setQuickBooksAccountsError] = useState<string | null>(null);
  const [quickBooksSettingsOpen, setQuickBooksSettingsOpen] = useState(false);
  const [quickBooksManualMappingOpen, setQuickBooksManualMappingOpen] = useState(false);
  const [syncingQuickBooksPayRunId, setSyncingQuickBooksPayRunId] = useState<string | null>(null);
  const [quickBooksError, setQuickBooksError] = useState<string | null>(null);
  const [categoryMappingDrafts, setCategoryMappingDrafts] = useState<CategoryAccountingMappingDraft[]>([]);
  const [categoryMappingSaving, setCategoryMappingSaving] = useState(false);
  const [categoryMappingError, setCategoryMappingError] = useState<string | null>(null);
  const [journalPreview, setJournalPreview] = useState<QuickBooksJournalPreview | null>(null);
  const [journalPreviewLoading, setJournalPreviewLoading] = useState(false);
  const [journalPreviewError, setJournalPreviewError] = useState<string | null>(null);
  const [journalSyncLoading, setJournalSyncLoading] = useState(false);
  const [journalSyncError, setJournalSyncError] = useState<string | null>(null);
  const [journalSyncRecord, setJournalSyncRecord] = useState<AccountingSyncRecord | null>(null);
  const [lineItemModalOpen, setLineItemModalOpen] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<FinanceLineItem | null>(null);
  const [lineItemDraft, setLineItemDraft] = useState<LineItemDraft>(() => defaultLineItemDraft());
  const [lineItemSaving, setLineItemSaving] = useState(false);
  const [lineItemError, setLineItemError] = useState<string | null>(null);

  const loadFinance = useCallback(async () => {
    if (!isActive) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<FinanceResponse>(financeRequestPath(organizationId, fromDate, toDate));
      setFinance(response.finance);
      setPayRuns(response.payRuns ?? []);
      setLineItemCategories(response.lineItemCategories ?? []);
      setAccountingConnections(response.accountingConnections ?? []);
      setCategoryAccountingMappings(response.categoryAccountingMappings ?? []);
    } catch (loadError) {
      setError(messageForError(loadError, 'Failed to load organization finance.'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, isActive, organizationId, toDate]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const financeLineItems = finance?.lineItems;
  const sortedLineItems = useMemo(() => (
    [...(financeLineItems ?? [])].sort((a, b) => {
      const aDate = a.serviceStartAt ? new Date(a.serviceStartAt).getTime() : 0;
      const bDate = b.serviceStartAt ? new Date(b.serviceStartAt).getTime() : 0;
      return bDate - aDate;
    })
  ), [financeLineItems]);

  const selectedPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === selectedPayRunId) ?? null
  ), [payRuns, selectedPayRunId]);

  const markPaidPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === markPaidPayRunId) ?? null
  ), [markPaidPayRunId, payRuns]);

  const voidPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === voidPayRunId) ?? null
  ), [payRuns, voidPayRunId]);

  const transferPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === transferPayRunId) ?? null
  ), [payRuns, transferPayRunId]);

  const quickBooksConnection = useMemo(() => (
    accountingConnections.find((connection) => connection.provider === 'QUICKBOOKS_ONLINE') ?? null
  ), [accountingConnections]);

  const [quickBooksMappingDraft, setQuickBooksMappingDraft] = useQuickBooksMappingDraft(quickBooksConnection);
  const {
    quickBooksMappingReady, quickBooksMappingDisabled, quickBooksCategoryMappingDisabled,
  } = quickBooksMappingAvailability(quickBooksConnection);

  const activeQuickBooksAccounts = useMemo(() => (
    quickBooksAccounts.filter((account) => account.active)
  ), [quickBooksAccounts]);

  const configuredCategoryMappingCount = useMemo(() => (
    categoryAccountingMappings.filter((mapping) => mapping.isActive && mapping.accountExternalId).length
  ), [categoryAccountingMappings]);

  const expenseAccountOptions = useMemo(() => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      quickBooksMappingDraft.payrollExpenseAccountExternalId,
      quickBooksMappingDraft.payrollExpenseAccountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(activeQuickBooksAccounts, 'expense'),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollExpenseAccountExternalId,
    quickBooksMappingDraft.payrollExpenseAccountName,
  ]);

  const liabilityAccountOptions = useMemo(() => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      quickBooksMappingDraft.payrollLiabilityAccountExternalId,
      quickBooksMappingDraft.payrollLiabilityAccountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(activeQuickBooksAccounts, 'liability'),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollLiabilityAccountExternalId,
    quickBooksMappingDraft.payrollLiabilityAccountName,
  ]);

  const clearingAccountOptions = useMemo(() => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      quickBooksMappingDraft.financeClearingAccountExternalId,
      quickBooksMappingDraft.financeClearingAccountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(activeQuickBooksAccounts, 'asset'),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.financeClearingAccountExternalId,
    quickBooksMappingDraft.financeClearingAccountName,
  ]);

  const getCategoryAccountOptions = useCallback((draft: CategoryAccountingMappingDraft) => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      draft.accountExternalId,
      draft.accountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(
        activeQuickBooksAccounts,
        quickBooksAccountIntentForEntryType(draft.entryType),
      ),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [activeQuickBooksAccounts]);

  const getSelectedCategoryAccount = useCallback((draft: CategoryAccountingMappingDraft) => (
    activeQuickBooksAccounts.find((account) => account.id === draft.accountExternalId)
      ?? selectedQuickBooksAccountFallback(draft.accountExternalId, draft.accountName)
  ), [activeQuickBooksAccounts]);

  const selectedExpenseAccount = useMemo(() => (
    activeQuickBooksAccounts.find((account) => account.id === quickBooksMappingDraft.payrollExpenseAccountExternalId)
      ?? selectedQuickBooksAccountFallback(
        quickBooksMappingDraft.payrollExpenseAccountExternalId,
        quickBooksMappingDraft.payrollExpenseAccountName,
      )
  ), [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollExpenseAccountExternalId,
    quickBooksMappingDraft.payrollExpenseAccountName,
  ]);

  const selectedLiabilityAccount = useMemo(() => (
    activeQuickBooksAccounts.find((account) => account.id === quickBooksMappingDraft.payrollLiabilityAccountExternalId)
      ?? selectedQuickBooksAccountFallback(
        quickBooksMappingDraft.payrollLiabilityAccountExternalId,
        quickBooksMappingDraft.payrollLiabilityAccountName,
      )
  ), [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollLiabilityAccountExternalId,
    quickBooksMappingDraft.payrollLiabilityAccountName,
  ]);

  const selectedClearingAccount = useMemo(() => (
    activeQuickBooksAccounts.find((account) => account.id === quickBooksMappingDraft.financeClearingAccountExternalId)
      ?? selectedQuickBooksAccountFallback(
        quickBooksMappingDraft.financeClearingAccountExternalId,
        quickBooksMappingDraft.financeClearingAccountName,
      )
  ), [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.financeClearingAccountExternalId,
    quickBooksMappingDraft.financeClearingAccountName,
  ]);

  const payRunStaffOptions = useMemo(() => buildPayRunStaffOptions(payRuns), [payRuns]);

  const filteredPayRuns = useMemo(() => filterPayRuns(payRuns, {
    status: payRunStatusFilter,
    staff: payRunStaffFilter,
    from: payRunFromFilter,
    to: payRunToFilter,
  }), [payRunFromFilter, payRunStaffFilter, payRunStatusFilter, payRunToFilter, payRuns]);

  const payRunLedgerRows = useMemo(() => buildPayRunLedger(filteredPayRuns), [filteredPayRuns]);
  const profitabilityRows = useMemo(() => buildProfitabilityRows(financeLineItems ?? []), [financeLineItems]);
  const lineItemCategoryOptions = useMemo(
    () => buildLineItemCategoryOptions(lineItemCategories, financeLineItems ?? []),
    [financeLineItems, lineItemCategories],
  );

  useEffect(() => {
    setCategoryMappingDrafts(buildCategoryAccountingMappingDrafts({
      lineItems: financeLineItems ?? [],
      categories: lineItemCategories,
      mappings: categoryAccountingMappings,
    }));
  }, [categoryAccountingMappings, financeLineItems, lineItemCategories]);

  const updateLineItemDraft = useCallback((patch: Partial<LineItemDraft>) => {
    setLineItemDraft((current) => ({ ...current, ...patch }));
  }, []);

  const updateCategoryMappingDraft = useCallback((
    key: string,
    patch: Partial<Pick<CategoryAccountingMappingDraft, 'accountExternalId' | 'accountName' | 'notes'>>,
  ) => {
    setJournalPreview(null);
    setJournalSyncRecord(null);
    setCategoryMappingDrafts((current) => current.map((draft) => (
      draft.key === key ? { ...draft, ...patch } : draft
    )));
  }, []);

  const selectCategoryMappingAccount = useCallback((key: string, accountId: string | null) => {
    setJournalPreview(null);
    setJournalSyncRecord(null);
    setCategoryMappingDrafts((current) => current.map((draft) => {
      if (draft.key !== key) {
        return draft;
      }
      if (!accountId) {
        return {
          ...draft,
          accountExternalId: '',
          accountName: '',
        };
      }
      const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId);
      if (!account) {
        return {
          ...draft,
          accountExternalId: accountId,
        };
      }
      return {
        ...draft,
        accountExternalId: account.id,
        accountName: account.fullyQualifiedName ?? account.name ?? '',
      };
    }));
  }, [activeQuickBooksAccounts]);

  const getLineItemSourceTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    const sourceId = item.sourceEntityId?.trim();
    const sourceType = item.sourceEntityType;
    if (!sourceId || !sourceType) {
      return null;
    }
    const label = item.sourceName?.trim() || 'Source';
    if (sourceType === 'event') {
      return { label, href: `/events/${encodeURIComponent(sourceId)}?tab=details` };
    }
    if (sourceType === 'rental') {
      return { label, href: buildOrganizationTabPath(organizationId, 'fields') };
    }
    if (sourceType === 'team') {
      return { label, href: buildOrganizationCustomerPath(organizationId, 'teams', sourceId) };
    }
    if (sourceType === 'organization') {
      return { label, href: buildOrganizationTabPath(organizationId, 'overview') };
    }
    return null;
  }, [organizationId]);

  const getLineItemCustomerTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    const customerId = item.customerId?.trim();
    const customerType = item.customerType;
    if (!customerId || (customerType !== 'users' && customerType !== 'teams')) {
      return null;
    }
    return {
      label: item.customerName?.trim() || (customerType === 'teams' ? 'Team customer' : 'Customer'),
      href: buildOrganizationCustomerPath(organizationId, customerType, customerId),
    };
  }, [organizationId]);

  const navigateToLineItemTarget = useCallback((target: LineItemNavigationTarget | null) => {
    if (!target) {
      return;
    }
    router.push(target.href);
  }, [router]);

  const getPayRunItemTargets = useCallback((item: StaffPayRunItem): LineItemNavigationTarget[] => {
    const targets: LineItemNavigationTarget[] = [];
    if (item.eventId) {
      targets.push({
        label: 'Event source',
        href: `/events/${encodeURIComponent(item.eventId)}?tab=details`,
      });
    }
    if (item.teamId) {
      targets.push({
        label: 'Team source',
        href: buildOrganizationCustomerPath(organizationId, 'teams', item.teamId),
      });
    }
    if (item.userId) {
      targets.push({
        label: 'Staff profile',
        href: buildOrganizationCustomerPath(organizationId, 'users', item.userId),
      });
    }
    return targets;
  }, [organizationId]);

  const openMarkPaidModal = useCallback((payRun: StaffPayRun) => {
    setMarkPaidPayRunId(payRun.id);
    setMarkPaidDraft(defaultMarkPaidDraft(payRun));
    setMarkPaidError(null);
    setPayrollError(null);
  }, []);

  const openVoidModal = useCallback((payRun: StaffPayRun) => {
    setVoidPayRunId(payRun.id);
    setVoidReason('');
    setVoidError(null);
    setPayrollError(null);
  }, []);

  const openTransferModal = useCallback((payRun: StaffPayRun) => {
    setTransferPayRunId(payRun.id);
    setTransferDraft(payRun.items.map((item) => ({
      itemId: item.id,
      label: item.label,
      payoutProviderTransferId: item.payoutProviderTransferId ?? '',
    })));
    setTransferError(null);
    setPayrollError(null);
  }, []);

  const connectQuickBooks = useCallback(async () => {
    setQuickBooksSaving(true);
    setQuickBooksError(null);
    try {
      const currentUrl = typeof window !== 'undefined'
        ? window.location.href
        : `/organizations/${organizationId}/finance`;
      const response = await apiRequest<{ authorizationUrl: string }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/connect`,
        {
          method: 'POST',
          body: {
            returnUrl: currentUrl,
            refreshUrl: currentUrl,
          },
        },
      );
      if (typeof window !== 'undefined') {
        window.location.assign(response.authorizationUrl);
      }
    } catch (connectError) {
      setQuickBooksError(messageForError(connectError, 'Failed to start QuickBooks connection.'));
      setQuickBooksSaving(false);
    }
  }, [organizationId]);

  const disconnectQuickBooks = useCallback(async () => {
    setQuickBooksSaving(true);
    setQuickBooksError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/integrations/quickbooks/disconnect`, {
        method: 'POST',
      });
      setQuickBooksAccounts([]);
      setQuickBooksAccountsError(null);
      await loadFinance();
    } catch (disconnectError) {
      setQuickBooksError(messageForError(disconnectError, 'Failed to disconnect QuickBooks.'));
    } finally {
      setQuickBooksSaving(false);
    }
  }, [loadFinance, organizationId]);

  const loadQuickBooksAccounts = useCallback(async () => {
    if (quickBooksMappingDisabled) {
      return;
    }
    setQuickBooksAccountsLoading(true);
    setQuickBooksAccountsError(null);
    try {
      const response = await apiRequest<QuickBooksAccountsResponse>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/accounts`,
        { timeoutMs: 30000 },
      );
      setQuickBooksAccounts(response.accounts ?? []);
    } catch (accountsError) {
      setQuickBooksAccountsError(messageForError(accountsError, 'Failed to load QuickBooks accounts.'));
      setQuickBooksManualMappingOpen(true);
    } finally {
      setQuickBooksAccountsLoading(false);
    }
  }, [organizationId, quickBooksMappingDisabled]);

  useEffect(() => {
    if (
      !quickBooksSettingsOpen
      || quickBooksMappingDisabled
      || quickBooksAccounts.length > 0
      || quickBooksAccountsLoading
      || quickBooksAccountsError
    ) {
      return;
    }
    void loadQuickBooksAccounts();
  }, [
    loadQuickBooksAccounts,
    quickBooksAccounts.length,
    quickBooksAccountsError,
    quickBooksAccountsLoading,
    quickBooksMappingDisabled,
    quickBooksSettingsOpen,
  ]);

  const updateQuickBooksMappingDraft = useCallback((patch: Partial<QuickBooksMappingDraft>) => {
    setQuickBooksMappingDraft((current) => ({ ...current, ...patch }));
  }, [setQuickBooksMappingDraft]);

  const selectQuickBooksExpenseAccount = useCallback((accountId: string | null) => {
    const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId) ?? null;
    updateQuickBooksMappingDraft({
      payrollExpenseAccountExternalId: account?.id ?? '',
      payrollExpenseAccountName: account?.fullyQualifiedName ?? account?.name ?? '',
    });
  }, [activeQuickBooksAccounts, updateQuickBooksMappingDraft]);

  const selectQuickBooksLiabilityAccount = useCallback((accountId: string | null) => {
    const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId) ?? null;
    updateQuickBooksMappingDraft({
      payrollLiabilityAccountExternalId: account?.id ?? '',
      payrollLiabilityAccountName: account?.fullyQualifiedName ?? account?.name ?? '',
    });
  }, [activeQuickBooksAccounts, updateQuickBooksMappingDraft]);

  const selectQuickBooksClearingAccount = useCallback((accountId: string | null) => {
    const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId) ?? null;
    updateQuickBooksMappingDraft({
      financeClearingAccountExternalId: account?.id ?? '',
      financeClearingAccountName: account?.fullyQualifiedName ?? account?.name ?? '',
    });
    setJournalPreview(null);
    setJournalSyncRecord(null);
  }, [activeQuickBooksAccounts, updateQuickBooksMappingDraft]);

  const saveQuickBooksMapping = useCallback(async () => {
    setQuickBooksMappingSaving(true);
    setQuickBooksError(null);
    try {
      const response = await apiRequest<{ connection: AccountingConnection }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/settings`,
        {
          method: 'PATCH',
          body: {
            payrollExpenseAccountExternalId: quickBooksMappingDraft.payrollExpenseAccountExternalId.trim() || null,
            payrollExpenseAccountName: quickBooksMappingDraft.payrollExpenseAccountName.trim() || null,
            payrollLiabilityAccountExternalId: quickBooksMappingDraft.payrollLiabilityAccountExternalId.trim() || null,
            payrollLiabilityAccountName: quickBooksMappingDraft.payrollLiabilityAccountName.trim() || null,
            financeClearingAccountExternalId: quickBooksMappingDraft.financeClearingAccountExternalId.trim() || null,
            financeClearingAccountName: quickBooksMappingDraft.financeClearingAccountName.trim() || null,
          },
        },
      );
      setAccountingConnections((current) => {
        const withoutQuickBooks = current.filter((connection) => connection.provider !== 'QUICKBOOKS_ONLINE');
        return [...withoutQuickBooks, response.connection];
      });
      setJournalPreview(null);
      setJournalSyncRecord(null);
    } catch (mappingError) {
      setQuickBooksError(messageForError(mappingError, 'Failed to save QuickBooks account mapping.'));
    } finally {
      setQuickBooksMappingSaving(false);
    }
  }, [organizationId, quickBooksMappingDraft]);

  const saveCategoryAccountingMappings = useCallback(async () => {
    setCategoryMappingSaving(true);
    setCategoryMappingError(null);
    setJournalPreview(null);
    setJournalSyncRecord(null);
    try {
      const response = await apiRequest<{ mappings: CategoryAccountingMapping[] }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/category-mappings`,
        {
          method: 'PATCH',
          body: {
            mappings: categoryMappingDrafts.map((draft) => ({
              category: draft.category,
              entryType: draft.entryType,
              accountExternalId: draft.accountExternalId.trim() || null,
              accountName: draft.accountName.trim() || null,
              notes: draft.notes.trim() || null,
            })),
          },
        },
      );
      setCategoryAccountingMappings(response.mappings ?? []);
    } catch (mappingError) {
      setCategoryMappingError(messageForError(mappingError, 'Failed to save financial category mappings.'));
    } finally {
      setCategoryMappingSaving(false);
    }
  }, [categoryMappingDrafts, organizationId]);

  const loadJournalEntryPreview = useCallback(async () => {
    setJournalPreviewLoading(true);
    setJournalPreviewError(null);
    setJournalSyncError(null);
    setJournalSyncRecord(null);
    try {
      const params = new URLSearchParams();
      if (fromDate.trim()) {
        params.set('from', dateInputToIso(fromDate) ?? fromDate);
      }
      if (toDate.trim()) {
        params.set('to', dateInputToIso(toDate, true) ?? toDate);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await apiRequest<{ preview: QuickBooksJournalPreview }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/journal-entry-preview${suffix}`,
        { timeoutMs: 30000 },
      );
      setJournalPreview(response.preview);
    } catch (previewError) {
      setJournalPreviewError(messageForError(previewError, 'Failed to build QuickBooks journal entry preview.'));
    } finally {
      setJournalPreviewLoading(false);
    }
  }, [fromDate, organizationId, toDate]);

  const syncJournalEntryToQuickBooks = useCallback(async () => {
    setJournalSyncLoading(true);
    setJournalSyncError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate.trim()) {
        params.set('from', dateInputToIso(fromDate) ?? fromDate);
      }
      if (toDate.trim()) {
        params.set('to', dateInputToIso(toDate, true) ?? toDate);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await apiRequest<QuickBooksJournalSyncResponse>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/journal-entry-sync${suffix}`,
        { method: 'POST', timeoutMs: 30000 },
      );
      setJournalPreview(response.preview);
      setJournalSyncRecord(response.syncRecord);
      await loadFinance();
    } catch (syncError) {
      setJournalSyncError(messageForError(syncError, 'Failed to sync QuickBooks journal entry.'));
    } finally {
      setJournalSyncLoading(false);
    }
  }, [fromDate, loadFinance, organizationId, toDate]);

  const syncPayRunToQuickBooks = useCallback(async (payRun: StaffPayRun) => {
    setSyncingQuickBooksPayRunId(payRun.id);
    setQuickBooksError(null);
    try {
      await apiRequest(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/pay-runs/${payRun.id}/sync`,
        { method: 'POST', timeoutMs: 30000 },
      );
      await loadFinance();
    } catch (syncError) {
      setQuickBooksError(messageForError(syncError, 'Failed to sync staff pay run to QuickBooks.'));
      await loadFinance();
    } finally {
      setSyncingQuickBooksPayRunId(null);
    }
  }, [loadFinance, organizationId]);

  const exportPayRunsCsv = useCallback(async (payRunsToExport: StaffPayRun[], filename = 'staff-pay-runs.csv') => {
    if (payRunsToExport.length === 0) {
      setPayrollError('No pay runs match the current export.');
      return;
    }
    setPayrollError(null);
    if (canManage) {
      try {
        await Promise.all(payRunsToExport.map((payRun) => apiRequest(
          `/api/organizations/${organizationId}/finance/pay-runs/${payRun.id}`,
          {
            method: 'PATCH',
            body: {
              action: 'RECORD_EXPORT',
              exportFormat: 'CSV',
            },
          },
        )));
      } catch (exportError) {
        setPayrollError(messageForError(exportError, 'Failed to record staff pay run export.'));
        return;
      }
    }
    downloadCsv(filename, buildPayRunCsv(payRunsToExport));
    if (canManage) {
      await loadFinance();
    }
  }, [canManage, loadFinance, organizationId]);

  const openNewLineItem = useCallback(() => {
    setEditingLineItem(null);
    setLineItemDraft(defaultLineItemDraft());
    setLineItemError(null);
    setLineItemModalOpen(true);
  }, []);

  const openEditLineItem = useCallback((item: FinanceLineItem) => {
    if (item.isGenerated || !item.sourceId) {
      return;
    }
    setEditingLineItem(item);
    setLineItemDraft(lineItemDraftFromItem(item));
    setLineItemError(null);
    setLineItemModalOpen(true);
  }, []);

  const saveLineItem = useCallback(async () => {
    const prepared = prepareLineItem(lineItemDraft);
    if (prepared.error !== null) {
      setLineItemError(prepared.error);
      return;
    }

    setLineItemSaving(true);
    setLineItemError(null);
    try {
      const baseBody = prepared.body;
      if (editingLineItem?.sourceId) {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items/${editingLineItem.sourceId}`, {
          method: 'PATCH',
          body: baseBody,
        });
      } else {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items`, {
          method: 'POST',
          body: {
            scope: 'ORGANIZATION',
            ...baseBody,
          },
        });
      }
      setLineItemModalOpen(false);
      setEditingLineItem(null);
      setLineItemDraft(defaultLineItemDraft());
      await loadFinance();
    } catch (saveError) {
      setLineItemError(messageForError(saveError, 'Failed to save line item.'));
    } finally {
      setLineItemSaving(false);
    }
  }, [editingLineItem?.sourceId, lineItemDraft, loadFinance, organizationId]);

  const createPayRun = useCallback(async () => {
    setPayRunSaving(true);
    setPayrollError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/pay-runs`, {
        method: 'POST',
        body: {
          title: payRunTitle.trim() || null,
          periodStart: dateInputToIso(payRunStart),
          periodEnd: dateInputToIso(payRunEnd, true),
          scheduledPayDate: payRunPayDate.trim() ? dateInputToIso(payRunPayDate) : null,
        },
      });
      setPayRunTitle('');
      setPayRunPayDate(dateInputValue());
      await loadFinance();
    } catch (createError) {
      setPayrollError(messageForError(createError, 'Failed to create staff pay run.'));
    } finally {
      setPayRunSaving(false);
    }
  }, [loadFinance, organizationId, payRunEnd, payRunPayDate, payRunStart, payRunTitle]);

  const updatePayRun = useCallback(async (
    payRunId: string,
    action: PayRunAction,
    details?: PayRunUpdateDetails,
  ): Promise<boolean> => {
    setUpdatingPayRunId(payRunId);
    setPayrollError(null);
    setMarkPaidError(null);
    setVoidError(null);
    setTransferError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/pay-runs/${payRunId}`, {
        method: 'PATCH',
        body: preparePayRunUpdate(action, details),
      });
      await loadFinance();
      return true;
    } catch (updateError) {
      const message = messageForError(updateError, 'Failed to update staff pay run.');
      if (action === 'MARK_PAID') {
        setMarkPaidError(message);
      } else if (action === 'VOID') {
        setVoidError(message);
      } else if (action === 'UPDATE_ITEM_TRANSFERS') {
        setTransferError(message);
      } else {
        setPayrollError(message);
      }
      return false;
    } finally {
      setUpdatingPayRunId(null);
    }
  }, [loadFinance, organizationId]);

  const markPayRunPaid = useCallback(async () => {
    if (!markPaidPayRunId) {
      return;
    }
    const didUpdate = await updatePayRun(markPaidPayRunId, 'MARK_PAID', markPaidDraft);
    if (didUpdate) {
      setMarkPaidPayRunId(null);
      setMarkPaidDraft(defaultMarkPaidDraft());
      setMarkPaidError(null);
    }
  }, [markPaidDraft, markPaidPayRunId, updatePayRun]);

  const voidSelectedPayRun = useCallback(async () => {
    if (!voidPayRunId) {
      return;
    }
    if (!voidReason.trim()) {
      setVoidError('A void reason is required.');
      return;
    }
    const didUpdate = await updatePayRun(voidPayRunId, 'VOID', { voidReason });
    if (didUpdate) {
      setVoidPayRunId(null);
      setVoidReason('');
      setVoidError(null);
    }
  }, [updatePayRun, voidPayRunId, voidReason]);

  const saveTransferReferences = useCallback(async () => {
    if (!transferPayRunId) {
      return;
    }
    const didUpdate = await updatePayRun(transferPayRunId, 'UPDATE_ITEM_TRANSFERS', {
      itemTransfers: transferDraft.map((item) => ({
        itemId: item.itemId,
        payoutProviderTransferId: item.payoutProviderTransferId.trim() || null,
      })),
    });
    if (didUpdate) {
      setTransferPayRunId(null);
      setTransferDraft([]);
      setTransferError(null);
    }
  }, [transferDraft, transferPayRunId, updatePayRun]);

  const { profitTone, projectedTone } = financeMetricTones(finance);

  const renderJournalSyncSuccess = (record: AccountingSyncRecord) => (
    <Alert color="green" variant="light">
      Synced to QuickBooks
      {record.externalTxnType ? ` ${record.externalTxnType}` : ''}
      {record.externalTxnId ? ` ${record.externalTxnId}` : ''}
      {record.externalTxnDocNumber ? ` (${record.externalTxnDocNumber})` : ''}.
    </Alert>
  );

  const renderJournalPreviewResult = (preview: QuickBooksJournalPreview) => (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge color={preview.readyToSync ? 'green' : 'yellow'} variant="light">
          {preview.readyToSync ? 'Ready to sync' : 'Needs mapping'}
        </Badge>
        <Badge color={preview.isBalanced ? 'green' : 'red'} variant="light">
          {preview.isBalanced ? 'Balanced' : 'Unbalanced'}
        </Badge>
        <Badge variant="light">
          {preview.includedLineItemCount} line items
        </Badge>
        {preview.skippedLineItemCount > 0 && (
          <Badge color="gray" variant="light">
            {preview.skippedLineItemCount} skipped
          </Badge>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Stack gap={1}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">Txn date</Text>
          <Text size="sm">{formatDate(preview.txnDate)}</Text>
        </Stack>
        <Stack gap={1}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">Debit total</Text>
          <Text size="sm" fw={700}>{centsFromDollars(preview.debitTotalCents)}</Text>
        </Stack>
        <Stack gap={1}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">Credit total</Text>
          <Text size="sm" fw={700}>{centsFromDollars(preview.creditTotalCents)}</Text>
        </Stack>
      </SimpleGrid>
      {preview.warnings.length > 0 && (
        <Alert color="yellow" variant="light">
          <Stack gap={2}>
            {preview.warnings.map((warning) => (
              <Text key={warning} size="sm">{warning}</Text>
            ))}
          </Stack>
        </Alert>
      )}
      <ScrollArea.Autosize mah={320} type="scroll" scrollHideDelay={900} offsetScrollbars>
        <Table striped highlightOnHover withColumnBorders style={{ minWidth: 980 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Line item</Table.Th>
              <Table.Th>Posting</Table.Th>
              <Table.Th>Account</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {preview.lines.length > 0 ? preview.lines.map((line) => (
              <Table.Tr key={line.id}>
                <Table.Td>
                  <Stack gap={1}>
                    <Text size="sm" fw={600}>{line.lineItemLabel}</Text>
                    <Text size="xs" c="dimmed">{line.category}</Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge
                    size="xs"
                    color={line.postingType === 'Debit' ? 'blue' : 'green'}
                    variant="light"
                  >
                    {line.postingType}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Stack gap={1}>
                    <Text size="sm" c={line.missingAccount ? 'red' : undefined} fw={line.missingAccount ? 700 : 500}>
                      {line.accountName || 'Missing account'}
                    </Text>
                    {line.accountExternalId && (
                      <Text size="xs" c="dimmed">ID {line.accountExternalId}</Text>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {line.role === 'CLEARING_ACCOUNT' ? 'Clearing' : 'Mapped category'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" lineClamp={2}>{line.description}</Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text fw={700}>{centsFromDollars(line.amountCents)}</Text>
                </Table.Td>
              </Table.Tr>
            )) : (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="dimmed">No journal entry rows are available for this range.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Stack>
  );

  const renderAccountingConnectionIdentity = () => (
    <>
      {quickBooksConnection?.lastIntuitTid && (
        <Text mt="sm" size="xs" c="dimmed">
          Last Intuit TID: {quickBooksConnection.lastIntuitTid}
        </Text>
      )}
      {quickBooksConnection?.scopes?.length ? (
        <Text mt="sm" size="xs" c="dimmed">
          {quickBooksConnection.scopes.join(' ')}
        </Text>
      ) : null}
    </>
  );

  const renderAccountingConnectionErrors = () => (
    <>
      {quickBooksConnection?.lastError && (
        <Text mt="sm" size="sm" c="red" fw={600}>
          {quickBooksConnection.lastError}
        </Text>
      )}
      {quickBooksError && (
        <Text mt="sm" size="sm" c="red" fw={600}>
          {quickBooksError}
        </Text>
      )}
    </>
  );

  const renderGeneratedLineItemActions = (item: FinanceLineItem, sourceTarget: LineItemNavigationTarget | null, customerTarget: LineItemNavigationTarget | null) => (
    <Popover width={260} position="bottom-start" shadow="md" withArrow withinPortal>
      <Popover.Target>
        <button
          type="button"
          aria-label={`Open actions for ${item.label}`}
          className="block w-full border-0 bg-transparent p-0 text-left"
          onClick={(event) => event?.stopPropagation?.()}
        >
          <Stack gap={1}>
            <Text size="sm" fw={600}>{item.label}</Text>
            <Text size="xs" c="dimmed">Generated</Text>
          </Stack>
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={4}>
          <Button
            size="xs"
            variant="subtle"
            justify="flex-start"
            aria-label={`Go to "${sourceTarget?.label ?? 'Source'}"`}
            leftSection={<ExternalLink size={14} />}
            disabled={!sourceTarget}
            onClick={() => navigateToLineItemTarget(sourceTarget)}
          >
            Go to &quot;{sourceTarget?.label ?? 'Source'}&quot;
          </Button>
          <Button
            size="xs"
            variant="subtle"
            justify="flex-start"
            aria-label={`Go to "${customerTarget?.label ?? 'Customer'}"`}
            leftSection={<UserRound size={14} />}
            disabled={!customerTarget}
            onClick={() => navigateToLineItemTarget(customerTarget)}
          >
            Go to &quot;{customerTarget?.label ?? 'Customer'}&quot;
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );

  const renderPayRunSyncMetadata = (quickBooksSync: AccountingSyncRecord | null) => (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="xs">
      <Stack gap={1}>
        <Text size="xs" c="dimmed">Transaction</Text>
        <Text size="sm">
          {syncTransactionLabel(quickBooksSync)}
        </Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" c="dimmed">Last synced</Text>
        <Text size="sm">{formatDateTime(quickBooksSync?.syncedAt)}</Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" c="dimmed">Synced by</Text>
        <Text size="sm">{quickBooksSync?.syncedByUserId || 'Not set'}</Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" c="dimmed">Intuit TID</Text>
        <Text size="sm">{quickBooksSync?.intuitTid || 'Not set'}</Text>
      </Stack>
    </SimpleGrid>
  );

  const renderSelectedPayRunActions = (payRun: StaffPayRun) => (
    <Group justify="flex-end">
      <Button
        variant="default"
        leftSection={<Download size={14} />}
        onClick={() => void exportPayRunsCsv([payRun], `${payRun.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payroll.csv`)}
      >
        Export CSV
      </Button>
      {canManage && payRun.status !== 'PAID' && payRun.status !== 'VOID' && (
        <Button
          variant="default"
          leftSection={<Pencil size={14} />}
          onClick={() => openTransferModal(payRun)}
        >
          Edit transfers
        </Button>
      )}
      {canManage && (
        <>
        {payRun.status === 'DRAFT' && (
          <Button
            variant="light"
            loading={updatingPayRunId === payRun.id}
            onClick={() => void updatePayRun(payRun.id, 'APPROVE')}
          >
            Approve
          </Button>
        )}
        {payRun.status === 'APPROVED' && (
          <Button
            color="green"
            variant="light"
            onClick={() => openMarkPaidModal(payRun)}
          >
            Mark paid
          </Button>
        )}
        {(payRun.status === 'DRAFT' || payRun.status === 'APPROVED') && (
          <Button
            variant="subtle"
            color="red"
            loading={updatingPayRunId === payRun.id}
            onClick={() => openVoidModal(payRun)}
          >
            Void
          </Button>
        )}
        </>
      )}
      </Group>
  );

  const renderQuickBooksAccountSettings = () => (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={6}>QuickBooks account settings</Title>
          <Button
            size="xs"
            variant="light"
            loading={quickBooksMappingSaving}
            disabled={quickBooksMappingDisabled}
            onClick={() => void saveQuickBooksMapping()}
          >
            Save account settings
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Pick accounts from the connected QuickBooks chart of accounts. The finance clearing account balances revenue, refund, fee, and expense journal-entry rows.
        </Text>
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <Select
            label="Payroll expense account"
            placeholder={quickBooksAccounts.length ? 'Select an expense account' : 'Load accounts or use manual entry'}
            searchable
            clearable
            nothingFoundMessage="No accounts found"
            data={expenseAccountOptions}
            value={quickBooksMappingDraft.payrollExpenseAccountExternalId || null}
            onChange={selectQuickBooksExpenseAccount}
            disabled={quickBooksMappingDisabled}
            description={quickBooksAccountDescription(selectedExpenseAccount, 'Expense and cost accounts appear first.')}
          />
          <Select
            label="Payroll liability or clearing account"
            placeholder={quickBooksAccounts.length ? 'Select a liability account' : 'Load accounts or use manual entry'}
            searchable
            clearable
            nothingFoundMessage="No accounts found"
            data={liabilityAccountOptions}
            value={quickBooksMappingDraft.payrollLiabilityAccountExternalId || null}
            onChange={selectQuickBooksLiabilityAccount}
            disabled={quickBooksMappingDisabled}
            description={quickBooksAccountDescription(selectedLiabilityAccount, 'Liability, payable, and clearing accounts appear first.')}
          />
          <Select
            label="Finance clearing account"
            placeholder={quickBooksAccounts.length ? 'Select a clearing account' : 'Load accounts or use manual entry'}
            searchable
            clearable
            nothingFoundMessage="No accounts found"
            data={clearingAccountOptions}
            value={quickBooksMappingDraft.financeClearingAccountExternalId || null}
            onChange={selectQuickBooksClearingAccount}
            disabled={quickBooksMappingDisabled}
            description={quickBooksAccountDescription(selectedClearingAccount, 'Asset, bank, receivable, and clearing accounts appear first.')}
          />
        </SimpleGrid>
        {quickBooksManualMappingOpen && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            <TextInput
              label="Expense account ID"
              value={quickBooksMappingDraft.payrollExpenseAccountExternalId}
              onChange={(event) => updateQuickBooksMappingDraft({
                payrollExpenseAccountExternalId: event.currentTarget.value,
              })}
              disabled={quickBooksMappingDisabled}
            />
            <TextInput
              label="Expense account name"
              value={quickBooksMappingDraft.payrollExpenseAccountName}
              onChange={(event) => updateQuickBooksMappingDraft({
                payrollExpenseAccountName: event.currentTarget.value,
              })}
              disabled={quickBooksMappingDisabled}
            />
            <TextInput
              label="Liability account ID"
              value={quickBooksMappingDraft.payrollLiabilityAccountExternalId}
              onChange={(event) => updateQuickBooksMappingDraft({
                payrollLiabilityAccountExternalId: event.currentTarget.value,
              })}
              disabled={quickBooksMappingDisabled}
            />
            <TextInput
              label="Liability account name"
              value={quickBooksMappingDraft.payrollLiabilityAccountName}
              onChange={(event) => updateQuickBooksMappingDraft({
                payrollLiabilityAccountName: event.currentTarget.value,
              })}
              disabled={quickBooksMappingDisabled}
            />
            <TextInput
              label="Finance clearing account ID"
              value={quickBooksMappingDraft.financeClearingAccountExternalId}
              onChange={(event) => {
                updateQuickBooksMappingDraft({
                  financeClearingAccountExternalId: event.currentTarget.value,
                });
                setJournalPreview(null);
                setJournalSyncRecord(null);
              }}
              disabled={quickBooksMappingDisabled}
            />
            <TextInput
              label="Finance clearing account name"
              value={quickBooksMappingDraft.financeClearingAccountName}
              onChange={(event) => {
                updateQuickBooksMappingDraft({
                  financeClearingAccountName: event.currentTarget.value,
                });
                setJournalPreview(null);
                setJournalSyncRecord(null);
              }}
              disabled={quickBooksMappingDisabled}
            />
          </SimpleGrid>
        )}
      </Stack>
    </Paper>
  );

  const renderCategoryMappings = () => (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Title order={6}>Financial category mappings</Title>
            <Text size="xs" c="dimmed">
              Map finance categories to QuickBooks accounts before previewing or syncing line-item JournalEntries.
            </Text>
          </Stack>
          <Button
            size="xs"
            variant="light"
            loading={categoryMappingSaving}
            disabled={quickBooksCategoryMappingDisabled || categoryMappingDrafts.length === 0}
            onClick={() => void saveCategoryAccountingMappings()}
          >
            Save category mappings
          </Button>
        </Group>
        {categoryMappingError && (
          <Alert color="red" variant="light">
            {categoryMappingError}
          </Alert>
        )}
        <ScrollArea.Autosize mah={360} type="scroll" scrollHideDelay={900} offsetScrollbars>
          <Table striped highlightOnHover withColumnBorders style={{ minWidth: quickBooksManualMappingOpen ? 1120 : 860 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>QuickBooks account</Table.Th>
                {quickBooksManualMappingOpen && (
                  <>
                    <Table.Th>Account ID</Table.Th>
                    <Table.Th>Account name</Table.Th>
                  </>
                )}
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {categoryMappingDrafts.length > 0 ? categoryMappingDrafts.map((draft) => {
                const selectedCategoryAccount = getSelectedCategoryAccount(draft);
                return (
                  <Table.Tr key={draft.key}>
                    <Table.Td>
                      <Text size="sm" fw={600}>{draft.category}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={accountingEntryTypeColor(draft.entryType)}>
                        {accountingEntryTypeLabel(draft.entryType)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Select
                        aria-label={`QuickBooks account for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                        placeholder={quickBooksAccounts.length ? 'Select account' : 'Load accounts or use manual entry'}
                        searchable
                        clearable
                        nothingFoundMessage="No accounts found"
                        data={getCategoryAccountOptions(draft)}
                        value={draft.accountExternalId || null}
                        onChange={(value) => selectCategoryMappingAccount(draft.key, value)}
                        disabled={quickBooksCategoryMappingDisabled}
                        description={quickBooksAccountDescription(selectedCategoryAccount, `${accountingEntryTypeLabel(draft.entryType)} accounts appear first.`)}
                      />
                    </Table.Td>
                    {quickBooksManualMappingOpen && (
                      <>
                        <Table.Td>
                          <TextInput
                            aria-label={`Account ID for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                            value={draft.accountExternalId}
                            onChange={(event) => updateCategoryMappingDraft(draft.key, {
                              accountExternalId: event.currentTarget.value,
                            })}
                            disabled={quickBooksCategoryMappingDisabled}
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            aria-label={`Account name for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                            value={draft.accountName}
                            onChange={(event) => updateCategoryMappingDraft(draft.key, {
                              accountName: event.currentTarget.value,
                            })}
                            disabled={quickBooksCategoryMappingDisabled}
                          />
                        </Table.Td>
                      </>
                    )}
                    <Table.Td>
                      <TextInput
                        aria-label={`Accounting notes for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                        value={draft.notes}
                        onChange={(event) => updateCategoryMappingDraft(draft.key, {
                          notes: event.currentTarget.value,
                        })}
                        disabled={quickBooksCategoryMappingDisabled}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              }) : (
                <Table.Tr>
                  <Table.Td colSpan={quickBooksManualMappingOpen ? 6 : 4}>
                    <Text size="sm" c="dimmed">No finance categories are available yet.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Stack>
    </Paper>
  );

  const renderJournalEntryPreview = () => (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Title order={6}>Journal entry preview</Title>
            <Text size="xs" c="dimmed">
              Preview the QuickBooks JournalEntry rows for the selected finance date range, then sync the reviewed rows when every account is mapped.
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              loading={journalPreviewLoading}
              disabled={quickBooksCategoryMappingDisabled || journalSyncLoading}
              onClick={() => void loadJournalEntryPreview()}
            >
              Preview journal entry
            </Button>
            <Button
              size="xs"
              loading={journalSyncLoading}
              disabled={quickBooksCategoryMappingDisabled || journalPreviewLoading || !journalPreview?.readyToSync}
              onClick={() => void syncJournalEntryToQuickBooks()}
            >
              Sync journal entry
            </Button>
          </Group>
        </Group>
        {journalPreviewError && (
          <Alert color="red" variant="light">
            {journalPreviewError}
          </Alert>
        )}
        {journalSyncError && (
          <Alert color="red" variant="light">
            {journalSyncError}
          </Alert>
        )}
        {journalSyncRecord?.status === 'SYNCED' && (
          renderJournalSyncSuccess(journalSyncRecord)
        )}
        {journalPreview && (
          renderJournalPreviewResult(journalPreview)
        )}
      </Stack>
    </Paper>
  );

  const renderAccountingConnectionMetadata = () => (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
      <Stack gap={1}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Company</Text>
        <Text size="sm">
          <OrganizationLoadingValue>
          {quickBooksConnection
            ? quickBooksConnection.externalCompanyName || accountingStatusLabel(quickBooksConnection.status)
            : 'Not connected'}
          </OrganizationLoadingValue>
        </Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Environment</Text>
        <Text size="sm" tt="capitalize"><OrganizationLoadingValue>{quickBooksConnection?.environment || 'sandbox'}</OrganizationLoadingValue></Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Connected</Text>
        <Text size="sm"><OrganizationLoadingValue>{formatDateTime(quickBooksConnection?.connectedAt)}</OrganizationLoadingValue></Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Access expires</Text>
        <Text size="sm"><OrganizationLoadingValue>{formatDateTime(quickBooksConnection?.accessTokenExpiresAt)}</OrganizationLoadingValue></Text>
      </Stack>
      <Stack gap={1}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Last synced</Text>
        <Text size="sm"><OrganizationLoadingValue>{formatDateTime(quickBooksConnection?.lastSyncedAt)}</OrganizationLoadingValue></Text>
      </Stack>
    </SimpleGrid>
  );

  const renderAccountingMappingStatus = () => (
    <Group gap="xs">
      <Badge size="sm" variant="light" color={quickBooksMappingReady ? 'green' : 'yellow'}>
        <OrganizationLoadingValue>{quickBooksMappingReady ? 'Payroll mapping ready' : 'Payroll mapping needed'}</OrganizationLoadingValue>
      </Badge>
      <Badge size="sm" variant="light" color={configuredCategoryMappingCount > 0 ? 'blue' : 'gray'}>
        <OrganizationLoadingValue>{configuredCategoryMappingCount}</OrganizationLoadingValue> category mappings
      </Badge>
    </Group>
  );

  const renderPayRunAccountingCell = (accounting: ReturnType<typeof payRunAccountingState>) => {
    const { quickBooksSync, quickBooksSyncError, display } = accounting;
    return (
    <Stack gap={2}>
      <Group gap={6}>
        <Badge
          size="xs"
          variant="light"
          color={display.color}
        >
          {display.label}
        </Badge>
        <Text size="xs" c="dimmed">QBO</Text>
      </Group>
      {quickBooksSync?.externalTxnId && (
        <Text size="xs" c="dimmed">
          {syncTransactionLabel(quickBooksSync)}
        </Text>
      )}
      {quickBooksSync?.syncedAt && (
        <Text size="xs" c="dimmed">{formatDateTime(quickBooksSync.syncedAt)}</Text>
      )}
      {quickBooksSync?.intuitTid && (
        <Text size="xs" c="dimmed">TID {quickBooksSync.intuitTid}</Text>
      )}
      {quickBooksSyncError && (
        <Text
          size="xs"
          c={
            display.errorColor
          }
        >
          {quickBooksSyncError}
        </Text>
      )}
    </Stack>
    );
  };

  const renderPayRunActions = (payRun: StaffPayRun, accounting: ReturnType<typeof payRunAccountingState>) => {
    const { quickBooksSync, canSyncPayRunToQuickBooks, canReconnectQuickBooks } = accounting;
    return (
    <Group gap="xs">
      <Button
        size="xs"
        variant="default"
        leftSection={<Download size={12} />}
        onClick={(event) => {
          event.stopPropagation();
          void exportPayRunsCsv([payRun], `${payRun.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payroll.csv`);
        }}
      >
        Export
      </Button>
      {(payRun.status === 'APPROVED' || payRun.status === 'PAID') && (
        <>
          {canReconnectQuickBooks && (
            <Button
              size="xs"
              variant="light"
              leftSection={<ExternalLink size={12} />}
              loading={quickBooksSaving}
              onClick={(event) => {
                event.stopPropagation();
                void connectQuickBooks();
              }}
            >
              Reconnect QBO
            </Button>
          )}
          <Button
            size="xs"
            variant="light"
            disabled={!canSyncPayRunToQuickBooks}
            loading={syncingQuickBooksPayRunId === payRun.id}
            onClick={(event) => {
              event.stopPropagation();
              void syncPayRunToQuickBooks(payRun);
            }}
          >
            {quickBooksPayRunActionLabel(quickBooksSync)}
          </Button>
        </>
      )}
      {payRun.status !== 'PAID' && payRun.status !== 'VOID' && (
        <Button
          size="xs"
          variant="default"
          leftSection={<Pencil size={12} />}
          onClick={(event) => {
            event.stopPropagation();
            openTransferModal(payRun);
          }}
        >
          Transfers
        </Button>
      )}
      {payRun.status === 'DRAFT' && (
        <Button
          size="xs"
          variant="light"
          loading={updatingPayRunId === payRun.id}
          onClick={(event) => {
            event.stopPropagation();
            void updatePayRun(payRun.id, 'APPROVE');
          }}
        >
          Approve
        </Button>
      )}
      {payRun.status === 'APPROVED' && (
        <Button
          size="xs"
          variant="light"
          color="green"
          loading={updatingPayRunId === payRun.id}
          onClick={(event) => {
            event.stopPropagation();
            openMarkPaidModal(payRun);
          }}
        >
          Mark paid
        </Button>
      )}
      {(payRun.status === 'DRAFT' || payRun.status === 'APPROVED') && (
        <Button
          size="xs"
          variant="subtle"
          color="red"
          loading={updatingPayRunId === payRun.id}
          onClick={(event) => {
            event.stopPropagation();
            openVoidModal(payRun);
          }}
        >
          Void
        </Button>
      )}
    </Group>
    );
  };

  const renderLineItemName = (item: FinanceLineItem, canEditLineItem: boolean) => {
    if (canEditLineItem) {
      return (
        <button
          type="button"
          aria-label={`Edit ${item.label}`}
          className="block w-full border-0 bg-transparent p-0 text-left"
          onClick={(event) => {
            event.stopPropagation();
            openEditLineItem(item);
          }}
        >
          <Stack gap={1}>
            <Text size="sm" fw={600}>{item.label}</Text>
            <Text size="xs" c="dimmed">Custom</Text>
          </Stack>
        </button>
      );
    }

    const sourceTarget = item.isGenerated ? getLineItemSourceTarget(item) : null;
    const customerTarget = item.isGenerated ? getLineItemCustomerTarget(item) : null;
    if (item.isGenerated && (sourceTarget || customerTarget)) {
      return (
        renderGeneratedLineItemActions(item, sourceTarget, customerTarget)
      );
    }

    return (
      <Stack gap={1}>
        <Text size="sm" fw={600}>{item.label}</Text>
        <Text size="xs" c="dimmed">{item.isGenerated ? 'Generated' : 'Custom'}</Text>
      </Stack>
    );
  };

  const renderQuickBooksPayRunSyncDetails = (payRun: StaffPayRun) => {
    const {
      quickBooksSync, quickBooksSyncEligible, quickBooksSyncError,
      canSyncPayRunToQuickBooks, canReconnectQuickBooks, display,
    } = payRunAccountingState(payRun, quickBooksConnection, quickBooksMappingReady, canManage);

    return (
      <Paper withBorder radius="md" p="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap={6}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">QuickBooks sync</Text>
              <Badge
                size="xs"
                variant="light"
                color={display.color}
              >
                {display.label}
              </Badge>
            </Group>
            {renderPayRunSyncMetadata(quickBooksSync)}
            {quickBooksSyncError && (
              <Text
                size="sm"
                c={
                  display.errorColor
                }
                fw={600}
              >
                {quickBooksSyncError}
              </Text>
            )}
          </Stack>
          {canManage && (
            <Group gap="xs">
              {canReconnectQuickBooks && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<ExternalLink size={12} />}
                  loading={quickBooksSaving}
                  onClick={() => void connectQuickBooks()}
                >
                  Reconnect QBO
                </Button>
              )}
              {quickBooksSyncEligible && (
                <Button
                  size="xs"
                  variant="light"
                  disabled={!canSyncPayRunToQuickBooks}
                  loading={syncingQuickBooksPayRunId === payRun.id}
                  onClick={() => void syncPayRunToQuickBooks(payRun)}
                >
                  {quickBooksPayRunActionLabel(quickBooksSync)}
                </Button>
              )}
            </Group>
          )}
        </Group>
      </Paper>
    );
  };

  const renderLineItemDialog = () => (
    <Modal
      opened={lineItemModalOpen}
      onClose={() => {
        setLineItemModalOpen(false);
        setLineItemError(null);
      }}
      title={editingLineItem ? 'Edit financial line item' : 'Add financial line item'}
      size="lg"
      centered
    >
      <Stack gap="md">
        {lineItemError && <Alert color="red">{lineItemError}</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="Title"
            aria-label="Line item title"
            placeholder="Field rental"
            value={lineItemDraft.title}
            onChange={(event) => updateLineItemDraft({ title: event.currentTarget.value })}
            required
          />
          <Autocomplete
            label="Category"
            aria-label="Line item category"
            placeholder="Rentals"
            data={lineItemCategoryOptions}
            value={lineItemDraft.category}
            onChange={(value) => updateLineItemDraft({ category: value })}
            comboboxProps={{ withinPortal: true }}
            required
          />
          <NumberInput
            label="Amount"
            aria-label="Line item amount"
            prefix="$"
            decimalScale={2}
            min={0}
            value={lineItemDraft.amount}
            onChange={(value) => updateLineItemDraft({ amount: value })}
            required
          />
          <Select
            label="Status"
            aria-label="Line item status"
            data={LINE_ITEM_STATUS_OPTIONS}
            value={lineItemDraft.status}
            onChange={(value) => updateLineItemDraft({ status: (value as LineItemStatus | null) ?? 'ACTUAL' })}
            allowDeselect={false}
          />
          <TextInput
            label="Start date"
            aria-label="Line item start date"
            type="date"
            value={lineItemDraft.serviceStartDate}
            onChange={(event) => updateLineItemDraft({ serviceStartDate: event.currentTarget.value })}
          />
          <TextInput
            label="End date"
            aria-label="Line item end date"
            type="date"
            value={lineItemDraft.serviceEndDate}
            onChange={(event) => updateLineItemDraft({ serviceEndDate: event.currentTarget.value })}
          />
          <NumberInput
            label="Quantity"
            aria-label="Line item quantity"
            decimalScale={2}
            min={0}
            value={lineItemDraft.quantity}
            onChange={(value) => updateLineItemDraft({ quantity: value })}
          />
          <TextInput
            label="Unit"
            aria-label="Line item unit"
            placeholder="hours"
            value={lineItemDraft.unitLabel}
            onChange={(event) => updateLineItemDraft({ unitLabel: event.currentTarget.value })}
          />
        </SimpleGrid>
        <Textarea
          label="Description"
          aria-label="Line item description"
          value={lineItemDraft.description}
          onChange={(event) => updateLineItemDraft({ description: event.currentTarget.value })}
          autosize
          minRows={3}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setLineItemModalOpen(false);
              setLineItemError(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void saveLineItem()} loading={lineItemSaving}>
            Save line item
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  const renderPayRunDetailsDialog = () => (
    <Modal
      opened={Boolean(selectedPayRun)}
      onClose={() => setSelectedPayRunId(null)}
      title="Staff pay run details"
      size="xl"
      centered
    >
      {selectedPayRun && (
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={2}>
              <Title order={5}>{selectedPayRun.title}</Title>
              <Text size="sm" c="dimmed">{formatPeriod(selectedPayRun.periodStart, selectedPayRun.periodEnd)}</Text>
            </Stack>
            <Group gap={6}>
              <Badge size="sm" variant="light">{selectedPayRun.status}</Badge>
              <Badge size="sm" variant="light" color={payRunPayoutColor(selectedPayRun.payoutStatus)}>
                {selectedPayRun.payoutStatus}
              </Badge>
            </Group>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Total</Text>
              <Text fw={800}>{centsFromDollars(selectedPayRun.totalAmountCents)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Items</Text>
              <Text fw={800}>{selectedPayRun.itemCount}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Pay date</Text>
              <Text size="sm">{formatDate(selectedPayRun.scheduledPayDate)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Approved</Text>
              <Text size="sm">{formatDateTime(selectedPayRun.approvedAt)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Paid</Text>
              <Text size="sm">{formatDateTime(selectedPayRun.paidAt)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Exported</Text>
              <Text size="sm">
                {selectedPayRun.exportedAt
                  ? `${formatDateTime(selectedPayRun.exportedAt)} (${formatPayRunExportStatus(selectedPayRun)})`
                  : 'Not exported'}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Provider</Text>
              <Text size="sm">{selectedPayRun.payoutProvider || 'Not set'}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Reference</Text>
              <Text size="sm">{selectedPayRun.payoutProviderBatchId || 'Not set'}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Approved by</Text>
              <Text size="sm">{selectedPayRun.approvedByUserId || 'Not set'}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Paid by</Text>
              <Text size="sm">{selectedPayRun.paidByUserId || 'Not set'}</Text>
            </Paper>
          </SimpleGrid>

          {selectedPayRun.notes && (
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Notes</Text>
              <Text size="sm">{selectedPayRun.notes}</Text>
            </Paper>
          )}

          {renderQuickBooksPayRunSyncDetails(selectedPayRun)}

          <ScrollArea.Autosize mah={360} type="scroll" scrollHideDelay={900} offsetScrollbars>
            <Table striped highlightOnHover withColumnBorders style={{ minWidth: 1180 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Staff</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Service</Table.Th>
                  <Table.Th>Wage</Table.Th>
                  <Table.Th>Transfer</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th ta="right">Amount</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {selectedPayRun.items.map((item) => {
                  const sourceLabel = item.eventStaffAssignmentId
                    ? 'Event labor'
                    : item.teamStaffLaborEntryId
                      ? 'Team labor'
                      : 'Staff labor';
                  const targets = getPayRunItemTargets(item);
                  return (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Stack gap={1}>
                          <Text size="sm" fw={600}>{item.label}</Text>
                          {item.description && <Text size="xs" c="dimmed">{item.description}</Text>}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text size="sm">{sourceLabel}</Text>
                          {targets.length > 0 && (
                            <Group gap={4}>
                              {targets.map((target) => (
                                <Button
                                  key={target.href}
                                  size="xs"
                                  variant="subtle"
                                  px={6}
                                  leftSection={<ExternalLink size={12} />}
                                  onClick={() => navigateToLineItemTarget(target)}
                                >
                                  {target.label}
                                </Button>
                              ))}
                            </Group>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={1}>
                          <Text size="sm">{formatPeriod(item.serviceStartAt, item.serviceEndAt)}</Text>
                          <Text size="xs" c="dimmed">{formatLaborMinutes(item.paidMinutes)}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={1}>
                          <Text size="sm">{formatWageRate(item)}</Text>
                          {item.payoutProvider && (
                            <Text size="xs" c="dimmed">{item.payoutProvider}</Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={item.payoutProviderTransferId ? undefined : 'dimmed'}>
                          {item.payoutProviderTransferId || '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <Badge size="xs" variant="light">{item.status}</Badge>
                          <Badge size="xs" variant="light" color={payRunPayoutColor(item.payoutStatus)}>
                            {item.payoutStatus}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fw={700}>{centsFromDollars(item.amountCents)}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>

          {renderSelectedPayRunActions(selectedPayRun)}
        </Stack>
      )}
    </Modal>
  );

  const renderMarkPaidDialog = () => (
    <Modal
      opened={Boolean(markPaidPayRunId)}
      onClose={() => {
        setMarkPaidPayRunId(null);
        setMarkPaidDraft(defaultMarkPaidDraft());
        setMarkPaidError(null);
      }}
      title="Record staff payout"
      size="md"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Mark {markPaidPayRun?.title ?? 'this pay run'} and its staff pay items as paid.
        </Text>
        <TextInput
          label="Payout provider"
          aria-label="Payout provider"
          placeholder="Check, ACH, manual, Stripe"
          value={markPaidDraft.payoutProvider}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setMarkPaidDraft((current) => ({
              ...current,
              payoutProvider: nextValue,
            }));
          }}
        />
        <TextInput
          label="Reference or batch ID"
          aria-label="Payout reference"
          placeholder="check-1024"
          value={markPaidDraft.payoutProviderBatchId}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setMarkPaidDraft((current) => ({
              ...current,
              payoutProviderBatchId: nextValue,
            }));
          }}
        />
        <Textarea
          label="Notes"
          aria-label="Payout notes"
          value={markPaidDraft.notes}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setMarkPaidDraft((current) => ({
              ...current,
              notes: nextValue,
            }));
          }}
          autosize
          minRows={3}
        />
        {markPaidError && <Text size="sm" c="red" fw={600}>{markPaidError}</Text>}
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setMarkPaidPayRunId(null);
              setMarkPaidDraft(defaultMarkPaidDraft());
              setMarkPaidError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            color="green"
            loading={Boolean(markPaidPayRunId && updatingPayRunId === markPaidPayRunId)}
            onClick={() => void markPayRunPaid()}
          >
            Mark paid
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  const renderVoidDialog = () => (
    <Modal
      opened={Boolean(voidPayRunId)}
      onClose={() => {
        setVoidPayRunId(null);
        setVoidReason('');
        setVoidError(null);
      }}
      title="Void staff pay run"
      size="md"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Void {voidPayRun?.title ?? 'this pay run'} and cancel its staff pay items.
        </Text>
        <Textarea
          label="Void reason"
          aria-label="Void reason"
          value={voidReason}
          onChange={(event) => setVoidReason(event.currentTarget.value)}
          autosize
          minRows={3}
          required
        />
        {voidError && <Text size="sm" c="red" fw={600}>{voidError}</Text>}
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setVoidPayRunId(null);
              setVoidReason('');
              setVoidError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={Boolean(voidPayRunId && updatingPayRunId === voidPayRunId)}
            onClick={() => void voidSelectedPayRun()}
          >
            Void pay run
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  const renderTransferDialog = () => (
    <Modal
      opened={Boolean(transferPayRunId)}
      onClose={() => {
        setTransferPayRunId(null);
        setTransferDraft([]);
        setTransferError(null);
      }}
      title="Edit transfer references"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Add item-level payout references for {transferPayRun?.title ?? 'this pay run'} before marking the batch paid.
        </Text>
        <ScrollArea.Autosize mah={360} type="scroll" scrollHideDelay={900} offsetScrollbars>
          <Stack gap="sm">
            {transferDraft.map((item) => (
              <TextInput
                key={item.itemId}
                label={item.label}
                aria-label={`Transfer reference for ${item.label}`}
                placeholder="transfer-1024"
                value={item.payoutProviderTransferId}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setTransferDraft((current) => current.map((draftItem) => (
                    draftItem.itemId === item.itemId
                      ? { ...draftItem, payoutProviderTransferId: nextValue }
                      : draftItem
                  )));
                }}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        {transferError && <Text size="sm" c="red" fw={600}>{transferError}</Text>}
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setTransferPayRunId(null);
              setTransferDraft([]);
              setTransferError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            loading={Boolean(transferPayRunId && updatingPayRunId === transferPayRunId)}
            onClick={() => void saveTransferReferences()}
          >
            Save references
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  const renderFinanceWarnings = () => (finance && !loading && finance.warnings.length > 0 && (
            <Alert color="yellow">
              <Stack gap={4}>
                {finance.warnings.map((warning) => (
                  <Text key={`${warning.code}-${warning.message}`} size="sm">{warning.message}</Text>
                ))}
              </Stack>
            </Alert>
          ));

  const renderFinanceHeading = () => (
    <OrganizationTabHeading title="Finance" description="Track revenue, refunds, costs, and staff pay runs.">
      <Popover><Popover.Target><Button variant="outline">{fromDate} – {toDate}</Button></Popover.Target><Popover.Dropdown>
        <Stack gap="sm">
          <TextInput label="From" type="date" value={fromDate} onChange={(event) => setFromDate(event.currentTarget.value)} />
          <TextInput label="To" type="date" value={toDate} onChange={(event) => setToDate(event.currentTarget.value)} />
          <Button onClick={() => void loadFinance()} loading={loading}>Apply</Button>
        </Stack>
      </Popover.Dropdown></Popover>
      <Button variant="outline" leftSection={<Download size={16} />} disabled={!finance} onClick={() => {
        if (!finance) return;
        const rows = [['Date', 'Item', 'Category', 'Status', 'Amount (USD)'], ...finance.lineItems.map((item) => [item.serviceStartAt || '', item.label, item.category, item.status, String(item.amountCents / 100)])];
        downloadCsv('organization-finance.csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'));
      }}>Export report</Button>
      <Button variant="subtle" onClick={() => void loadFinance()} loading={loading}>Refresh</Button>
    </OrganizationTabHeading>
  );

  const renderFinanceMetrics = () => (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
      <FinanceMetric
        label="Gross sales"
        value={finance?.grossRevenueCents}
        tone="green"
        description="Paid organization, event, team, rental, and product bills."
      />
      <FinanceMetric
        label="Refunds and fees"
        value={finance ? -(finance.refundCents + finance.feeCents) : undefined}
        tone="red"
        description="Refunds and payment processing fees."
      />
      <FinanceMetric
        label="Current profit"
        value={finance?.actualProfitCents}
        tone={profitTone}
        description="Net revenue minus staff and custom costs."
      />
      <FinanceMetric
        label="Projected profit"
        value={finance?.projectedProfitCents}
        tone={finance && finance.futureCostCents > 0 ? 'orange' : projectedTone}
        description="Potential revenue minus future costs."
      />
    </SimpleGrid>
  );

  const renderFinanceLineItems = () => (
    <Paper withBorder radius="md" p="md" className="org-tab-surface">
      <Group justify="space-between" align="center" mb="sm">
        <Title order={6}>Finance line items</Title>
        {canManage && (
          <Button size="xs" variant="light" leftSection={<Plus size={14} />} onClick={openNewLineItem}>
            Add line item
          </Button>
        )}
      </Group>
      <ScrollArea.Autosize mah={440} type="scroll" scrollHideDelay={900} offsetScrollbars>
        <Table striped highlightOnHover withColumnBorders style={{ minWidth: 900 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Quantity</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <OrganizationTableBody columns={6} label="finance line items" unavailable={!finance}>
            {sortedLineItems.length > 0 ? sortedLineItems.map((item) => {
              const canEditLineItem = canManage && !item.isGenerated && Boolean(item.sourceId);
              return (
                <Table.Tr
                  key={item.id}
                  data-testid={canEditLineItem ? `finance-line-item-${item.sourceId}` : undefined}
                  onClick={canEditLineItem ? () => openEditLineItem(item) : undefined}
                  style={{ cursor: canEditLineItem ? 'pointer' : undefined }}
                >
                  <Table.Td>{formatPeriod(item.serviceStartAt, item.serviceEndAt)}</Table.Td>
                  <Table.Td>
                    {renderLineItemName(item, canEditLineItem)}
                  </Table.Td>
                  <Table.Td>{item.category}</Table.Td>
                  <Table.Td>{formatQuantityAndUnit(item.quantity, item.unitLabel)}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Badge size="xs" variant="light">{formatLineItemStatus(item.status)}</Badge>
                      <Badge size="xs" color={item.timing === 'FUTURE' ? 'orange' : item.timing === 'WARNING' ? 'yellow' : 'green'} variant="light">
                        {formatLineItemTiming(item.timing)}
                      </Badge>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fw={700} c={item.amountCents >= 0 ? 'green' : 'red'}>
                      {centsFromDollars(item.amountCents)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            }) : (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="dimmed">No finance line items for this range.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </OrganizationTableBody>
        </Table>
      </ScrollArea.Autosize>
    </Paper>
  );

  const renderFinanceCostMetrics = () => (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Staff costs</Text>
        <Text size="lg" fw={800}><OrganizationLoadingValue>{finance ? centsFromDollars(-finance.staffCostCents) : '—'}</OrganizationLoadingValue></Text>
      </Paper>
      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Custom costs</Text>
        <Text size="lg" fw={800}><OrganizationLoadingValue>{finance ? centsFromDollars(-finance.customCostCents) : '—'}</OrganizationLoadingValue></Text>
      </Paper>
      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Warnings</Text>
        <Text size="lg" fw={800}><OrganizationLoadingValue>{finance?.warnings.length ?? '—'}</OrganizationLoadingValue></Text>
      </Paper>
    </SimpleGrid>
  );

  const renderFinanceLedgers = () => (
    <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Group justify="space-between" align="center" mb="sm">
          <Title order={6}>Staff payroll ledger</Title>
          <Text size="sm" c="dimmed"><OrganizationLoadingValue>{finance ? payRunLedgerRows.length : '—'}</OrganizationLoadingValue> staff</Text>
        </Group>
        <ScrollArea.Autosize mah={320} type="scroll" scrollHideDelay={900} offsetScrollbars>
          <Table striped highlightOnHover withColumnBorders style={{ minWidth: 720 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Staff</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Time</Table.Th>
                <Table.Th ta="right">Draft</Table.Th>
                <Table.Th ta="right">Approved</Table.Th>
                <Table.Th ta="right">Paid</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <OrganizationTableBody columns={7} label="payroll ledger" unavailable={!finance}>
              {payRunLedgerRows.length > 0 ? payRunLedgerRows.map((row) => (
                <Table.Tr key={row.key}>
                  <Table.Td>{row.label}</Table.Td>
                  <Table.Td>{row.itemCount}</Table.Td>
                  <Table.Td>{formatLaborMinutes(row.minutes)}</Table.Td>
                  <Table.Td ta="right">{centsFromDollars(row.draftCents)}</Table.Td>
                  <Table.Td ta="right">{centsFromDollars(row.approvedCents)}</Table.Td>
                  <Table.Td ta="right">{centsFromDollars(row.paidCents)}</Table.Td>
                  <Table.Td ta="right">
                    <Text fw={700}>{centsFromDollars(row.totalCents)}</Text>
                  </Table.Td>
                </Table.Tr>
              )) : (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text size="sm" c="dimmed">No payroll items match the current filters.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </OrganizationTableBody>
          </Table>
        </ScrollArea.Autosize>
      </Paper>

      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Group justify="space-between" align="center" mb="sm">
          <Title order={6}>Event and team profitability</Title>
          <Text size="sm" c="dimmed"><OrganizationLoadingValue>{finance ? profitabilityRows.length : '—'}</OrganizationLoadingValue> sources</Text>
        </Group>
        <ScrollArea.Autosize mah={320} type="scroll" scrollHideDelay={900} offsetScrollbars>
          <Table striped highlightOnHover withColumnBorders style={{ minWidth: 780 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Source</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th ta="right">Revenue</Table.Th>
                <Table.Th ta="right">Costs</Table.Th>
                <Table.Th ta="right">Profit</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <OrganizationTableBody columns={7} label="profitability" unavailable={!finance}>
              {profitabilityRows.length > 0 ? profitabilityRows.map((row) => {
                const target = row.type === 'Event' && row.sourceId
                  ? { label: row.name, href: `/events/${encodeURIComponent(row.sourceId)}?tab=details` }
                  : row.type === 'Team' && row.sourceId
                    ? { label: row.name, href: buildOrganizationCustomerPath(organizationId, 'teams', row.sourceId) }
                    : null;
                return (
                  <Table.Tr key={row.key}>
                    <Table.Td>{row.name}</Table.Td>
                    <Table.Td>{row.type}</Table.Td>
                    <Table.Td>{row.itemCount}</Table.Td>
                    <Table.Td ta="right">{centsFromDollars(row.revenueCents)}</Table.Td>
                    <Table.Td ta="right">{centsFromDollars(-row.costCents)}</Table.Td>
                    <Table.Td ta="right">
                      <Text fw={700} c={row.profitCents >= 0 ? 'green' : 'red'}>
                        {centsFromDollars(row.profitCents)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<ExternalLink size={12} />}
                        disabled={!target}
                        onClick={() => navigateToLineItemTarget(target)}
                      >
                        Open
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              }) : (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text size="sm" c="dimmed">No event or team line items for this range.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </OrganizationTableBody>
          </Table>
        </ScrollArea.Autosize>
      </Paper>
    </SimpleGrid>
  );

  const renderQuickBooksSettings = () => (
    <Modal
      opened={quickBooksSettingsOpen}
      onClose={() => setQuickBooksSettingsOpen(false)}
      title="QuickBooks settings"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Group gap="xs">
              <Badge
                size="sm"
                variant="light"
                color={accountingStatusColor(quickBooksConnection?.status)}
              >
                {accountingStatusLabel(quickBooksConnection?.status)}
              </Badge>
              <Badge size="sm" variant="light" color={quickBooksMappingReady ? 'green' : 'yellow'}>
                {quickBooksMappingReady ? 'Payroll mapping ready' : 'Payroll mapping needed'}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Configure QuickBooks account mappings for payroll and finance line-item JournalEntry sync.
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              loading={quickBooksAccountsLoading}
              disabled={quickBooksMappingDisabled}
              onClick={() => void loadQuickBooksAccounts()}
            >
              {quickBooksAccounts.length ? 'Refresh accounts' : 'Load accounts'}
            </Button>
            <Button
              size="xs"
              variant="subtle"
              disabled={quickBooksMappingDisabled}
              onClick={() => setQuickBooksManualMappingOpen((current) => !current)}
            >
              {quickBooksManualMappingOpen ? 'Hide manual entry' : 'Manual entry'}
            </Button>
          </Group>
        </Group>

        {quickBooksAccountsError && (
          <Alert color="yellow" variant="light">
            {quickBooksAccountsError}
          </Alert>
        )}

        {renderQuickBooksAccountSettings()}

        {renderCategoryMappings()}

        {renderJournalEntryPreview()}
      </Stack>
    </Modal>
  );

  const renderAccountingConnection = () => (
    <Paper withBorder radius="md" p="md" className="org-tab-surface">
      <Group justify="space-between" align="flex-start" mb="sm">
        <Stack gap={2}>
          <Group gap="xs">
            <Title order={6}>QuickBooks</Title>
            <Badge
              size="sm"
              variant="light"
              color={accountingStatusColor(quickBooksConnection?.status)}
            >
              <OrganizationLoadingValue>{accountingStatusLabel(quickBooksConnection?.status)}</OrganizationLoadingValue>
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Accounting connection for payroll handoffs and future sync.
          </Text>
        </Stack>
        {canManage && (
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<ExternalLink size={14} />}
              loading={quickBooksSaving}
              disabled={loading || !finance}
              onClick={() => void connectQuickBooks()}
            >
              {quickBooksConnectionActionLabel(quickBooksConnection)}
            </Button>
            {quickBooksConnection?.status === 'CONNECTED' && (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                loading={quickBooksSaving}
                onClick={() => void disconnectQuickBooks()}
              >
                Disconnect
              </Button>
            )}
          </Group>
        )}
      </Group>
      {renderAccountingConnectionMetadata()}
      {renderAccountingConnectionIdentity()}
      {canManage && (
        <Group mt="md" justify="space-between" align="center">
          {renderAccountingMappingStatus()}
          <Button
            size="xs"
            variant="light"
            leftSection={<Settings2 size={14} />}
            aria-label="QuickBooks settings"
            disabled={!quickBooksConnection}
            onClick={() => setQuickBooksSettingsOpen(true)}
          >
            Settings
          </Button>
        </Group>
      )}
      {renderAccountingConnectionErrors()}
    </Paper>
  );

  const renderPayrollHistory = () => (
    <Paper withBorder radius="md" p="md" className="org-tab-surface">
      <Group justify="space-between" align="flex-start" mb="sm">
        <Stack gap={2}>
          <Title order={6}>Staff pay runs</Title>
          <Text size="sm" c="dimmed">Create internal payroll batches from unpaid staff labor.</Text>
        </Stack>
        <Button
          size="xs"
          variant="default"
          leftSection={<Download size={14} />}
          onClick={() => void exportPayRunsCsv(filteredPayRuns)}
        >
          Export filtered CSV
        </Button>
      </Group>

      {canManage && (
        <Group align="end" gap="sm" mb="md">
          <TextInput
            label="Pay run title"
            placeholder="June payroll"
            value={payRunTitle}
            onChange={(event) => setPayRunTitle(event.currentTarget.value)}
          />
          <TextInput
            label="Period start"
            type="date"
            value={payRunStart}
            onChange={(event) => setPayRunStart(event.currentTarget.value)}
          />
          <TextInput
            label="Period end"
            type="date"
            value={payRunEnd}
            onChange={(event) => setPayRunEnd(event.currentTarget.value)}
          />
          <TextInput
            label="Pay date"
            type="date"
            value={payRunPayDate}
            onChange={(event) => setPayRunPayDate(event.currentTarget.value)}
          />
          <Button onClick={() => void createPayRun()} loading={payRunSaving}>
            Create pay run
          </Button>
          {payrollError && (
            <Text size="sm" c="red" fw={600}>
              {payrollError}
            </Text>
          )}
        </Group>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm" mb="md">
        <Select
          label="Payroll status"
          data={[
            { value: 'ALL', label: 'All statuses' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'PAID', label: 'Paid' },
            { value: 'VOID', label: 'Void' },
          ]}
          value={payRunStatusFilter}
          onChange={(value) => setPayRunStatusFilter((value as PayRunStatusFilter | null) ?? 'ALL')}
          allowDeselect={false}
        />
        <Select
          label="Staff"
          data={payRunStaffOptions}
          value={payRunStaffFilter}
          onChange={(value) => setPayRunStaffFilter(value ?? 'ALL')}
          searchable
          allowDeselect={false}
        />
        <TextInput
          label="Payroll from"
          type="date"
          value={payRunFromFilter}
          onChange={(event) => setPayRunFromFilter(event.currentTarget.value)}
        />
        <TextInput
          label="Payroll to"
          type="date"
          value={payRunToFilter}
          onChange={(event) => setPayRunToFilter(event.currentTarget.value)}
        />
      </SimpleGrid>

      <ScrollArea.Autosize mah={420} type="scroll" scrollHideDelay={900} offsetScrollbars>
        <Table striped highlightOnHover withColumnBorders style={{ minWidth: 1040 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pay run</Table.Th>
              <Table.Th>Period</Table.Th>
              <Table.Th>Pay date</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Export</Table.Th>
              <Table.Th>Accounting</Table.Th>
              <Table.Th>Items</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
              {canManage && <Table.Th>Actions</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <OrganizationTableBody columns={canManage ? 9 : 8} label="staff pay runs" unavailable={!finance}>
            {filteredPayRuns.length > 0 ? filteredPayRuns.map((payRun) => {
              const accounting = payRunAccountingState(payRun, quickBooksConnection, quickBooksMappingReady, canManage);
              return (
              <Table.Tr
                key={payRun.id}
                onClick={() => setSelectedPayRunId(payRun.id)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>
                  <Stack gap={1}>
                    <button
                      type="button"
                      aria-label={`View pay run ${payRun.title}`}
                      className="block w-full border-0 bg-transparent p-0 text-left"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPayRunId(payRun.id);
                      }}
                    >
                      <Text size="sm" fw={600}>{payRun.title}</Text>
                    </button>
                    {payRun.items.slice(0, 2).map((item) => (
                      <Text key={item.id} size="xs" c="dimmed">{item.label} • {centsFromDollars(item.amountCents)}</Text>
                    ))}
                    {payRun.items.length > 2 && (
                      <Text size="xs" c="dimmed">+{payRun.items.length - 2} more</Text>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td>{formatPeriod(payRun.periodStart, payRun.periodEnd)}</Table.Td>
                <Table.Td>{formatDate(payRun.scheduledPayDate)}</Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Badge size="xs" variant="light">{payRun.status}</Badge>
                    <Badge size="xs" variant="light" color={payRunPayoutColor(payRun.payoutStatus)}>
                      {payRun.payoutStatus}
                    </Badge>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Stack gap={1}>
                    <Text size="sm" fw={payRun.exportedAt ? 600 : 400} c={payRun.exportedAt ? undefined : 'dimmed'}>
                      {formatPayRunExportStatus(payRun)}
                    </Text>
                    {payRun.exportedAt && (
                      <Text size="xs" c="dimmed">{formatDateTime(payRun.exportedAt)}</Text>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  {renderPayRunAccountingCell(accounting)}
                </Table.Td>
                <Table.Td>{payRun.itemCount}</Table.Td>
                <Table.Td ta="right">
                  <Text fw={700}>{centsFromDollars(payRun.totalAmountCents)}</Text>
                </Table.Td>
                {canManage && (
                  <Table.Td>
                    {renderPayRunActions(payRun, accounting)}
                  </Table.Td>
                )}
              </Table.Tr>
              );
            }) : (
              <Table.Tr>
                <Table.Td colSpan={canManage ? 9 : 8}>
                  <Text size="sm" c="dimmed">No staff pay runs match the current filters.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </OrganizationTableBody>
        </Table>
      </ScrollArea.Autosize>
    </Paper>
  );

  return (
    <Stack gap="md" className="org-section org-finance">
      {renderLineItemDialog()}

      {renderPayRunDetailsDialog()}

      {renderMarkPaidDialog()}

      {renderVoidDialog()}

      {renderTransferDialog()}

      {renderFinanceHeading()}

      {error && <Alert color="red">{error}</Alert>}

      <OrganizationDataLoadingProvider loading={loading}>
          {renderFinanceMetrics()}

          <OrganizationFinanceCharts items={financeLineItems ?? []} unavailable={!finance} />

          {renderFinanceLineItems()}

          {renderFinanceCostMetrics()}

          {renderFinanceWarnings()}

          {renderFinanceLedgers()}

          {canManage && renderQuickBooksSettings()}

          {renderAccountingConnection()}

          {renderPayrollHistory()}
      </OrganizationDataLoadingProvider>
    </Stack>
  );
}
