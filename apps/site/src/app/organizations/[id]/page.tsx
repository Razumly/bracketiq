"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationVerificationBadge from '@/components/ui/OrganizationVerificationBadge';
import { OrganizationClaimButton } from '@/components/ui/OrganizationClaimCallout';
import {
  Alert,
  Avatar,
  Badge,
  Checkbox,
  Group,
  Title,
  Text,
  Button,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  TextInput,
  PasswordInput,
  Select,
  NumberInput,
  Modal,
  Textarea,
  Switch,
  FileInput,
  Loader,
} from '@/components/organization/organization-operation-ui';
import { notifications } from '@/lib/organizationNotifications';
import TeamCard from '@/components/ui/TeamCard';
import { useApp } from '@/app/providers';
import type { BillingAddress, Event, Organization, OrganizationRole, Product, ProductType, Team, UserData, PaymentIntent, StaffMemberType, TemplateDocument } from '@/types';
import { formatPrice, getEventImageFallbackUrl, getEventImageUrl } from '@/types';
import OrganizationCustomerBills from './OrganizationCustomerBills';
import OrganizationCustomerDocuments from './OrganizationCustomerDocuments';
import { formatSummaryDateTime, getProfilePreviewUrl, getCustomerInitials, formatCustomerMetaToken, getStaffRoleLabel } from './organizationCustomerPresentation';
import { organizationService } from '@/lib/organizationService';
import { eventService } from '@/lib/eventService';
import { getStaffMemberTypesForOrganizationRole } from '@/lib/staff';
import { createId } from '@/lib/id';
import { buildOrganizationEventCreateUrl } from '@/lib/eventCreateNavigation';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import { isStripeConnectMfaRequiredError, paymentService } from '@/lib/paymentService';
import { userService } from '@/lib/userService';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { productService } from '@/lib/productService';
import { signedDocumentService, type DocumentAuditTrail } from '@/lib/signedDocumentService';
import { boldsignService } from '@/lib/boldsignService';
import PaymentModal from '@/components/ui/PaymentModal';
import OrganizationDivisionsPanel from './OrganizationDivisionsPanel';
import OrganizationFinanceTabContent from './OrganizationFinanceTabContent';
import { type RoleInviteRow } from './RoleRosterManager';
import { getOrganizationStaffPresentation } from './organizationStaffPresentation';
import OrganizationStaffTabContent from './OrganizationStaffTabContent';
import OrganizationFacilitiesTabContent from './OrganizationFacilitiesTabContent';
import OrganizationOverviewTabContent from './OrganizationOverviewTabContent';
import { useOrganizationData } from './useOrganizationData';
import { useOrganizationEvents } from './useOrganizationEvents';
import {
  ORGANIZATION_EVENTS_DEFAULT_MAX_DISTANCE as ORG_EVENTS_DEFAULT_MAX_DISTANCE,
  ORGANIZATION_EVENT_TYPES as ORG_EVENT_TYPE_OPTIONS,
  kmBetween,
  type OrganizationEventTypeFilter,
} from './organizationEventSource';
import OrganizationReviewsTabContent from './OrganizationReviewsTabContent';
import OrganizationRefundsTabContent from './OrganizationRefundsTabContent';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/dateUtils';
import { useLocation } from '@/app/hooks/useLocation';
import { useDebounce } from '@/app/hooks/useDebounce';
import { useSports } from '@/app/hooks/useSports';
import OrganizationEventsTabContent from './OrganizationEventsTabContent';
import OrganizationTeamsTabContent from './OrganizationTeamsTabContent';
import OrganizationCustomersTabContent from './OrganizationCustomersTabContent';
import OrganizationCustomerProfile, { type CustomerDetailTab } from './OrganizationCustomerProfile';
import OrganizationEventTemplatesTabContent from './OrganizationEventTemplatesTabContent';
import OrganizationDocumentTemplatesTabContent from './OrganizationDocumentTemplatesTabContent';
import OrganizationStoreTabContent from './OrganizationStoreTabContent';
import OrganizationProductEditorModal from './OrganizationProductEditorModal';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import {
  getRequiredSignerTypeLabel,
  normalizeRequiredSignerType,
} from '@/lib/templateSignerTypes';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import {
  defaultProductTypeForPeriod,
} from '@/lib/productTypes';
import { normalizePriceCents } from '@/lib/priceUtils';
import {
  canOrganizationUsePaidBilling,
  organizationVerificationStatusLabel,
  resolveOrganizationVerificationStatus,
} from '@/lib/organizationVerification';
import {
  buildOrganizationCustomerPath,
  buildOrganizationCustomerSelectionPath,
  buildOrganizationTabPath,
  pushOrganizationHistoryState,
  resolveOrganizationRouteTab,
  resolveOrganizationTabSelection,
  type OrganizationCustomerRouteType,
  type OrganizationTab,
} from './organizationTabs';
import OrganizationPublicSettingsTabContent from './OrganizationPublicSettingsTabContent';
import OrganizationDiscountsTabContent from './OrganizationDiscountsTabContent';
import OrganizationDivisionsTabContent from './OrganizationDivisionsTabContent';
import { buildTeamManagementPath } from '@/app/teams/teamRoutes';
import { describeDeleteOutcome } from '@/lib/deleteOutcome';
import { getOrganizationAccess } from './organizationAccess';
import { OrganizationManagementShell } from '@/components/organization/OrganizationManagementShell';
import {
  maybeCarryDefaultProductType,
  PRODUCT_PERIOD_OPTIONS,
  resolveProductEditorPeriod,
  resolveProductEditorType,
  isSinglePurchasePeriod,
} from './organizationStoreUtils';

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization..." />}>
      <OrganizationDetailContent />
    </Suspense>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOMER_PAGE_SIZE = 25;
const DOCUMENT_VOID_REASON_OPTIONS = [
  'Wrong Document Subject',
  'Wrong Document Requirement or Version',
  'Wrong scope',
  'Duplicate evidence',
  'Incomplete or unsigned document',
  'Unreadable or incorrect file',
  'Replaced by corrected evidence',
  'Other',
] as const;

type TemplateDocumentWithVersionState = TemplateDocument & {
  documentRequirementId: string;
  versionSequence: number;
};

const requireTemplateVersionState = (
  template: TemplateDocument,
): TemplateDocumentWithVersionState => {
  const documentRequirementId = template.documentRequirementId?.trim();
  const versionSequence = template.versionSequence;
  if (!documentRequirementId) {
    throw new Error('Template selection is missing documentRequirementId.');
  }
  if (typeof versionSequence !== 'number' || !Number.isInteger(versionSequence) || versionSequence < 1) {
    throw new Error('Template selection is missing a valid versionSequence.');
  }
  return {
    ...template,
    documentRequirementId,
    versionSequence,
  };
};


type PendingTemplateCreateCard = {
  localId: string;
  operationId: string;
  templateId?: string;
  templateDocumentId?: string;
  title: string;
  description?: string;
  signOnce: boolean;
  requiredSignerType: 'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD';
  status: string;
  error?: string;
};

import {
  mapOrganizationUserRow,
  mapOrganizationTeamCustomerRow,
  type OrganizationUserEventSummary,
  type OrganizationUserDocumentSummary,
  type OrganizationTeamMembershipSummary,
  type OrganizationUserSummary,
  type OrganizationCustomerTypeFilter,
  type OrganizationBillPaymentSummary,
  type OrganizationBillSummary,
  type OrganizationTeamMemberSummary,
  type OrganizationTeamStaffSummary,
  type OrganizationTeamCustomerSummary,
  type OrganizationCustomerRow,
} from './organizationCustomerModel';

const normalizeCustomerSearchValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const matchesCustomerSearch = (query: string, values: unknown[]): boolean => {
  if (!query) {
    return true;
  }
  return values.some((value) => normalizeCustomerSearchValue(value).includes(query));
};

function OrganizationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, authUser, loading: authLoading, isAuthenticated, updateUser } = useApp();
  const { location, requestLocation } = useLocation();
  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const routeCustomerType = Array.isArray(params?.customerType)
    ? params?.customerType[0]
    : (params?.customerType as string | undefined);
  const routeCustomerId = Array.isArray(params?.customerId)
    ? params?.customerId[0]
    : (params?.customerId as string | undefined);
  const queryCustomerType = searchParams?.get('customerType');
  const queryCustomerId = searchParams?.get('customerId');
  const requestedTab = resolveOrganizationRouteTab({
    pathname,
    organizationId: id,
    queryTab: searchParams?.get('tab'),
  });
  const requestedCustomerTypeValue = routeCustomerType ?? queryCustomerType;
  const requestedCustomerIdValue = routeCustomerId ?? queryCustomerId;
  const requestedCustomerType: OrganizationCustomerRouteType | null = requestedCustomerTypeValue === 'users' || requestedCustomerTypeValue === 'teams'
    ? requestedCustomerTypeValue
    : null;
  const requestedCustomerId = typeof requestedCustomerIdValue === 'string' && requestedCustomerIdValue.trim()
    ? requestedCustomerIdValue.trim()
    : null;
  const requestedCustomerKey = requestedCustomerType && requestedCustomerId
    ? `${requestedCustomerType}:${requestedCustomerId}`
    : null;
  const { org, setOrg, loading, organizationLoadError, organizationLoadingTab, loadOrg } = useOrganizationData(requestedTab ?? 'overview');
  const [activeTab, setActiveTab] = useState<OrganizationTab>(() => requestedTab ?? 'overview');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showEditOrganizationModal, setShowEditOrganizationModal] = useState(false);
  const sportOptions = useMemo(() => sports.map((sport) => sport.name), [sports]);
  const [eventSearchTerm, setEventSearchTerm] = useState('');
  const [selectedEventTypes, setSelectedEventTypes] =
    useState<OrganizationEventTypeFilter[]>([...ORG_EVENT_TYPE_OPTIONS]);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [hideWeeklyChildEvents, setHideWeeklyChildEvents] = useState(false);
  const [eventsTabMaxDistance, setEventsTabMaxDistance] = useState<number | null>(null);
  const [eventsTabSelectedStartDate, setEventsTabSelectedStartDate] = useState<Date | null>(null);
  const [eventsTabSelectedEndDate, setEventsTabSelectedEndDate] = useState<Date | null>(null);
  const organizationEvents = useOrganizationEvents({
    organizationId: id,
    fields: org?.fields ?? [],
    hiddenEventIds: user?.hiddenEventIds ?? [],
    enabled: !authLoading && activeTab === 'events' && org?.$id === id,
    filters: {
      searchTerm: eventSearchTerm, selectedEventTypes, selectedSports,
      selectedStartDate: eventsTabSelectedStartDate, selectedEndDate: eventsTabSelectedEndDate,
      location, maxDistance: eventsTabMaxDistance,
    },
  });
  const locationRequestAttemptedRef = useRef(false);
  const handledStripeStateRef = useRef<string | null>(null);
  const handledQuickBooksStateRef = useRef<string | null>(null);
  const [updatingEventHostId, setUpdatingEventHostId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffResults, setStaffResults] = useState<UserData[]>([]);
  const [staffSearchLoading, setStaffSearchLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffInvites, setStaffInvites] = useState<RoleInviteRow[]>([
    { firstName: '', lastName: '', email: '', types: ['STAFF'], roleId: null },
  ]);
  const [staffInviteError, setStaffInviteError] = useState<string | null>(null);
  const [invitingStaff, setInvitingStaff] = useState(false);
  const organizationVerificationStatus = resolveOrganizationVerificationStatus(org);
  const organizationHasStripeAccount = canOrganizationUsePaidBilling(org);
  const requiresStripeVerificationEmail =
    organizationVerificationStatus === 'UNVERIFIED'
    || organizationVerificationStatus === 'LEGACY_CONNECTED';
  const stripePrimaryActionLabel =
    organizationVerificationStatus === 'VERIFIED'
      ? 'Manage Stripe Account'
      : organizationVerificationStatus === 'ACTION_REQUIRED'
        ? 'Resolve verification issues'
        : organizationVerificationStatus === 'PENDING'
          ? 'Continue verification'
          : organizationVerificationStatus === 'LEGACY_CONNECTED'
            ? 'Complete verification'
            : 'Connect Stripe Account';
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [managingStripe, setManagingStripe] = useState(false);
  const [syncingOrganizationVerification, setSyncingOrganizationVerification] = useState(false);
  const [stripeEmail, setStripeEmail] = useState('');
  const [stripeEmailError, setStripeEmailError] = useState<string | null>(null);
  const [updatingHomePagePreference, setUpdatingHomePagePreference] = useState(false);
  const {
    canManageEvents,
    canManageFields,
    canManageTeams,
    canManageProducts,
    canManageStaff,
    canManageRoles,
    canManageStaffSurface,
    canManageRefunds,
    canManageStaffCompensation,
    canManageFinance,
    canManageDiscounts,
    canManageTemplates,
    canImportDocuments,
    canVoidDocuments,
    canViewDocumentAudit,
    canViewImportedDocuments,
    canManagePublicPage,
    isOwner,
    isOrganizationRoleMember,
    isCurrentOrganizationHomePage,
    canToggleHomePagePreference,
    canCreateOrganizationEvents,
    createEventHelperText,
    availableTabs,
  } = useMemo(() => getOrganizationAccess(org, user), [org, user]);
  const stripeEmailValid = useMemo(
    () => Boolean(stripeEmail && EMAIL_REGEX.test(stripeEmail.trim())),
    [stripeEmail],
  );

  useEffect(() => {
    if (!requiresStripeVerificationEmail || stripeEmail.trim().length > 0) {
      return;
    }
    const fallbackEmail =
      typeof authUser?.email === 'string' && authUser.email.trim().length > 0
        ? authUser.email.trim()
        : '';
    if (fallbackEmail) {
      setStripeEmail(fallbackEmail);
    }
  }, [authUser?.email, requiresStripeVerificationEmail, stripeEmail]);

  const overviewRecentEvents = useMemo(() => {
    const sourceEvents = Array.isArray(org?.events) ? org.events : [];
    return sourceEvents.filter((event) => {
      const normalizedEventType = typeof event.eventType === 'string' ? event.eventType.toUpperCase() : '';
      const isWeeklyEventType = normalizedEventType === 'WEEKLY_EVENT' || normalizedEventType === 'WEEKLY_EVENTS';
      const isWeeklyChildEvent = typeof event.parentEvent === 'string' && event.parentEvent.trim().length > 0;
      return !(isWeeklyEventType && isWeeklyChildEvent);
    });
  }, [org?.events]);

  const { staffRosterEntries, staffRosterNameError, eventHostOptions, currentOfficials } =
    useMemo(() => getOrganizationStaffPresentation(org, user), [org, user]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPeriod, setProductPeriod] = useState<Product['period']>('month');
  const [productType, setProductType] = useState<ProductType>('MEMBERSHIP');
  const [productPriceCents, setProductPriceCents] = useState(0);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null);
  const [purchasePaymentData, setPurchasePaymentData] = useState<PaymentIntent | null>(null);
  const [purchaseDiscountCode, setPurchaseDiscountCode] = useState('');
  const [productDiscountCodes, setProductDiscountCodes] = useState<Record<string, string>>({});
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [startingProductCheckoutId, setStartingProductCheckoutId] = useState<string | null>(null);
  const startingProductCheckoutRef = useRef<string | null>(null);
  const [, setSubscribing] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductDescription, setEditProductDescription] = useState('');
  const [editProductPeriod, setEditProductPeriod] = useState<Product['period']>('month');
  const [editProductType, setEditProductType] = useState<ProductType>('MEMBERSHIP');
  const [editProductPriceCents, setEditProductPriceCents] = useState(0);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const canCreateProduct = productName.trim().length > 0 && normalizePriceCents(productPriceCents) > 0;
  const canUpdateProduct = editProductName.trim().length > 0 && normalizePriceCents(editProductPriceCents) > 0;
  const [templateDocuments, setTemplateDocuments] = useState<TemplateDocument[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [eventTemplates, setEventTemplates] = useState<Array<{
    id: string;
    name: string;
    eventType?: string | null;
    sportId?: string | null;
    description?: string | null;
    updatedAt?: string | null;
  }>>([]);
  const [eventTemplatesLoading, setEventTemplatesLoading] = useState(false);
  const [eventTemplatesError, setEventTemplatesError] = useState<string | null>(null);
  const [eventTemplateCreateModalOpen, setEventTemplateCreateModalOpen] = useState(false);
  const [selectedCreateEventTemplateId, setSelectedCreateEventTemplateId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateType, setTemplateType] = useState<'PDF' | 'TEXT'>('PDF');
  const [templateContent, setTemplateContent] = useState('');
  const [templatePdfFile, setTemplatePdfFile] = useState<File | null>(null);
  const [templateSignOnce, setTemplateSignOnce] = useState(true);
  const [templateRequiredSignerType, setTemplateRequiredSignerType] = useState<
    'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD'
  >('PARTICIPANT');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateEmbedUrl, setTemplateEmbedUrl] = useState<string | null>(null);
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateEditContext, setTemplateEditContext] = useState<{
    requirementId: string;
    selectedVersion: number;
    nextVersionSequence?: number;
    isNewVersionRequired: boolean;
  } | null>(null);
  const [editingTextTemplate, setEditingTextTemplate] = useState<TemplateDocument | null>(null);
  const [textEditTitle, setTextEditTitle] = useState('');
  const [textEditDescription, setTextEditDescription] = useState('');
  const [textEditContent, setTextEditContent] = useState('');
  const [savingTemplateVersion, setSavingTemplateVersion] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [pendingTemplateCreates, setPendingTemplateCreates] = useState<PendingTemplateCreateCard[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDocument | null>(null);
  const [previewMode, setPreviewMode] = useState<'read' | 'sign'>('read');
  const [previewAccepted, setPreviewAccepted] = useState(false);
  const [previewSignComplete, setPreviewSignComplete] = useState(false);
  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUserSummary[]>([]);
  const [organizationTeamCustomers, setOrganizationTeamCustomers] = useState<OrganizationTeamCustomerSummary[]>([]);
  const [organizationUsersLoading, setOrganizationUsersLoading] = useState(false);
  const [organizationUsersError, setOrganizationUsersError] = useState<string | null>(null);
  const [customerTypeFilters, setCustomerTypeFilters] = useState<OrganizationCustomerTypeFilter[]>(['users', 'teams']);
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebounce(customerSearch, 250);
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(CUSTOMER_PAGE_SIZE);
  const customerSentinelRef = useRef<HTMLDivElement | null>(null);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [customerRefundAmountDraftByPaymentId, setCustomerRefundAmountDraftByPaymentId] = useState<Record<string, number>>({});
  const [refundingCustomerPaymentId, setRefundingCustomerPaymentId] = useState<string | null>(null);
  const [cancellingCustomerPaymentId, setCancellingCustomerPaymentId] = useState<string | null>(null);
  const [cancellingCustomerPlanBillId, setCancellingCustomerPlanBillId] = useState<string | null>(null);
  const [customerDocumentToVoid, setCustomerDocumentToVoid] = useState<OrganizationUserDocumentSummary | null>(null);
  const [customerDocumentVoidReason, setCustomerDocumentVoidReason] = useState<string | null>(null);
  const [customerDocumentVoidPassword, setCustomerDocumentVoidPassword] = useState('');
  const [isRecentProviderAuthUsed, setIsRecentProviderAuthUsed] = useState(false);
  const [customerDocumentVoidNote, setCustomerDocumentVoidNote] = useState('');
  const [isVoidingCustomerDocument, setIsVoidingCustomerDocument] = useState(false);
  const [customerDocumentAuditTarget, setCustomerDocumentAuditTarget] = useState<OrganizationUserDocumentSummary | null>(null);
  const [customerDocumentAuditTrail, setCustomerDocumentAuditTrail] = useState<DocumentAuditTrail | null>(null);
  const [isLoadingCustomerDocumentAudit, setIsLoadingCustomerDocumentAudit] = useState(false);
  const [previewSignedTextDocument, setPreviewSignedTextDocument] = useState<OrganizationUserDocumentSummary | null>(null);
  const [customerBillModalOpen, setCustomerBillModalOpen] = useState(false);
  const [editingCustomerBill, setEditingCustomerBill] = useState<OrganizationBillSummary | null>(null);
  const [creatingCustomerBill, setCreatingCustomerBill] = useState(false);
  const [customerBillLabel, setCustomerBillLabel] = useState('');
  const [customerBillAmount, setCustomerBillAmount] = useState<string | number>('');
  const [customerBillPaidAmount, setCustomerBillPaidAmount] = useState<string | number>(0);
  const [customerBillDueDate, setCustomerBillDueDate] = useState('');
  const [customerDocumentModalOpen, setCustomerDocumentModalOpen] = useState(false);
  const [selectedCustomerDocumentTemplateId, setSelectedCustomerDocumentTemplateId] = useState<string | null>(null);
  const [selectedCustomerDocumentEventId, setSelectedCustomerDocumentEventId] = useState<string | null>(null);
  const [sendingCustomerDocument, setSendingCustomerDocument] = useState(false);
  const [isCustomerImportModalOpen, setIsCustomerImportModalOpen] = useState(false);
  const [selectedCustomerImportTemplateId, setSelectedCustomerImportTemplateId] = useState<string | null>(null);
  const [selectedCustomerImportScopeId, setSelectedCustomerImportScopeId] = useState<string | null>(null);
  const [customerImportFile, setCustomerImportFile] = useState<File | null>(null);
  const [isCustomerImportPreviewReady, setIsCustomerImportPreviewReady] = useState(false);
  const customerImportPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [customerImportHistoricalSigningDate, setCustomerImportHistoricalSigningDate] = useState('');
  const [customerImportSourceNote, setCustomerImportSourceNote] = useState('');
  const [isCustomerImportAttestationAccepted, setIsCustomerImportAttestationAccepted] = useState(false);
  const [isImportingCustomerDocument, setIsImportingCustomerDocument] = useState(false);
  const selectedTemplateVersionByRequirement = useMemo(() => {
    const selectedRows = new Map<string, TemplateDocumentWithVersionState>();
    templateDocuments.forEach((template) => {
      const templateWithVersionState = requireTemplateVersionState(template);
      const current = selectedRows.get(templateWithVersionState.documentRequirementId);
      if (
        !current
        || current.versionSequence < templateWithVersionState.versionSequence
      ) {
        selectedRows.set(
          templateWithVersionState.documentRequirementId,
          templateWithVersionState,
        );
      }
    });
    return new Map(
      Array.from(selectedRows.entries()).map(([requirementId, template]) => [requirementId, template.$id]),
    );
  }, [templateDocuments]);

  const closeTemplateBuilder = useCallback(() => {
    setTemplateBuilderOpen(false);
    setTemplateEmbedUrl(null);
    setTemplateEditContext(null);
  }, []);

  const pollBoldSignOperation = useCallback(async (operationId: string) => {
    const intervalMs = 1_500;
    const timeoutMs = 90_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const operation = await boldsignService.getOperationStatus(operationId);
      const status = String(operation.status ?? '').toUpperCase();
      if (status === 'CONFIRMED') {
        return operation;
      }
      if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
        throw new Error(operation.error || `Synchronization ${status.toLowerCase().replace('_', ' ')}.`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }

    throw new Error('Synchronization is delayed. Please refresh in a moment.');
  }, []);

  const openTemplatePreview = useCallback((template: TemplateDocument) => {
    setPreviewTemplate(template);
    setPreviewMode(template.type === 'TEXT' ? 'sign' : 'read');
    setPreviewAccepted(false);
    setPreviewSignComplete(false);
  }, []);


  const syncOrganizationVerification = useCallback(async (orgId: string) => {
    setSyncingOrganizationVerification(true);
    try {
      await apiRequest(`/api/organizations/${orgId}/verification/sync`, {
        method: 'POST',
      });
      organizationService.invalidateCachedOrganization(orgId);
      const latest = await organizationService.getOrganizationById(orgId, true);
      if (latest) {
        setOrg(latest);
      }
      return latest ?? null;
    } finally {
      setSyncingOrganizationVerification(false);
    }
  }, [setOrg]);

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) => current.filter((sport) => sportOptions.includes(sport)));
  }, [sportOptions, sportsLoading]);


  const handleSetHomePage = useCallback(async (checked: boolean) => {
    if (!user?.$id || !org || !canToggleHomePagePreference) {
      return;
    }

    setUpdatingHomePagePreference(true);
    try {
      const updated = await updateUser({
        homePageOrganizationId: checked ? org.$id : null,
      });
      if (!updated) {
        throw new Error('Failed to update home page preference.');
      }
      notifications.show({
        color: 'green',
        message: checked
          ? `${org.name} is now your home page.`
          : 'Home page preference cleared.',
      });
    } catch (error) {
      console.error('Failed to update home page preference', error);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to update home page preference.',
      });
    } finally {
      setUpdatingHomePagePreference(false);
    }
  }, [canToggleHomePagePreference, org, updateUser, user?.$id]);

  const loadTemplates = useCallback(async (
    orgId: string,
    options?: { silent?: boolean },
  ): Promise<TemplateDocument[]> => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setTemplatesLoading(true);
    }
    try {
      if (!user?.$id) {
        return [];
      }
      const mappedRows = await boldsignService.getTemplates({
        organizationId: orgId,
        isVersionHistoryIncluded: true,
      });
      setTemplateDocuments(mappedRows);
      if (!silent) {
        setTemplatesError(null);
      }
      return mappedRows;
    } catch (error) {
      console.error('Failed to load templates', error);
      setTemplateDocuments([]);
      setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
      return [];
    } finally {
      if (!silent) {
        setTemplatesLoading(false);
      }
    }
  }, [user?.$id]);

  const monitorTemplateCreateOperation = useCallback((params: {
    organizationId: string;
    operationId: string;
    templateId?: string;
  }) => {
    void (async () => {
      try {
        const operation = await pollBoldSignOperation(params.operationId);
        const expectedTemplateId = operation.templateId ?? params.templateId;
        const expectedTemplateDocumentId = operation.templateDocumentId ?? undefined;

        setPendingTemplateCreates((current) => current.map((entry) => (
          entry.operationId === params.operationId
            ? {
              ...entry,
              status: String(operation.status ?? 'CONFIRMED'),
              templateId: expectedTemplateId ?? entry.templateId,
              templateDocumentId: expectedTemplateDocumentId ?? entry.templateDocumentId,
              error: undefined,
            }
            : entry
        )));

        const projectionTimeoutMs = 90_000;
        const intervalMs = 1_500;
        const startedAt = Date.now();
        let projected = false;

        while (Date.now() - startedAt < projectionTimeoutMs) {
          const templates = await loadTemplates(params.organizationId, { silent: true });
          projected = templates.some((template) => (
            (expectedTemplateDocumentId && template.$id === expectedTemplateDocumentId)
            || (expectedTemplateId && template.templateId === expectedTemplateId)
          ));

          if (projected) {
            setPendingTemplateCreates((current) => current.filter((entry) => entry.operationId !== params.operationId));
            notifications.show({ color: 'green', message: 'Template synced.' });
            return;
          }

          await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
        }

        throw new Error('Template creation is still syncing. Please refresh in a moment.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Template sync failed.';
        setPendingTemplateCreates((current) => current.map((entry) => (
          entry.operationId === params.operationId
            ? {
              ...entry,
              status: 'FAILED',
              error: message,
            }
            : entry
        )));
        setTemplatesError(message);
      }
    })();
  }, [loadTemplates, pollBoldSignOperation]);

  const loadEventTemplates = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setEventTemplatesLoading(true);
    }
    try {
      if (!user?.$id) {
        return;
      }
      const params = new URLSearchParams();
      params.set('organizationId', orgId);
      params.set('limit', '200');
      const response = await apiRequest<{ templates?: any[] }>(`/api/event-templates?${params.toString()}`);
      const rows = Array.isArray(response?.templates) ? response.templates : [];
      setEventTemplates(
        rows
          .map((row) => ({
            id: String(row?.id ?? ''),
            name: String(row?.name ?? 'Untitled Template'),
            eventType: typeof row?.eventType === 'string' ? row.eventType : null,
            sportId: typeof row?.sportId === 'string' ? row.sportId : null,
            description: typeof row?.description === 'string' ? row.description : null,
            updatedAt: typeof row?.updatedAt === 'string' ? row.updatedAt : null,
          }))
          .filter((row) => row.id.length > 0),
      );
      if (!silent) {
        setEventTemplatesError(null);
      }
    } catch (error) {
      console.error('Failed to load event templates', error);
      setEventTemplates([]);
      setEventTemplatesError(error instanceof Error ? error.message : 'Failed to load event templates.');
    } finally {
      if (!silent) {
        setEventTemplatesLoading(false);
      }
    }
  }, [user?.$id]);

  const loadOrganizationUsers = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setOrganizationUsersLoading(true);
    }
    try {
      if (!user?.$id) {
        return;
      }
      const response = await fetch(`/api/organizations/${orgId}/users`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load organization customers.');
      }
      const rows = Array.isArray(payload?.users) ? payload.users : [];
      const teamRows = Array.isArray(payload?.teams) ? payload.teams : [];
      setOrganizationUsers(rows.map((row: Record<string, any>) => mapOrganizationUserRow(row)));
      setOrganizationTeamCustomers(teamRows.map((row: Record<string, any>) => mapOrganizationTeamCustomerRow(row)));
      if (!silent) {
        setOrganizationUsersError(null);
      }
    } catch (error) {
      console.error('Failed to load organization customers', error);
      setOrganizationUsers([]);
      setOrganizationTeamCustomers([]);
      setOrganizationUsersError(error instanceof Error ? error.message : 'Failed to load organization customers.');
    } finally {
      if (!silent) {
        setOrganizationUsersLoading(false);
      }
    }
  }, [user?.$id]);

  useEffect(() => {
    if (!templateBuilderOpen) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
        return;
      }
      const payload = event.data;
      const eventName = typeof payload === 'string'
        ? payload
        : payload?.event || payload?.eventName || payload?.type || payload?.name || '';
      const normalized = eventName.toString().toLowerCase();
      if (!normalized.includes('template')) {
        return;
      }
      if (!normalized.includes('created') && !normalized.includes('saved') && !normalized.includes('publish')) {
        return;
      }

      const editContext = templateEditContext;
      closeTemplateBuilder();
      if (org?.$id) {
        void (async () => {
          const templates = await loadTemplates(org.$id, { silent: true });
          const isNewVersionRequired = Boolean(editContext?.isNewVersionRequired);
          const newVersion = isNewVersionRequired && editContext
            ? templates
              .map(requireTemplateVersionState)
              .filter((template) => (
                template.documentRequirementId === editContext.requirementId
                && template.versionSequence > editContext.selectedVersion
              ))
              .sort((left, right) => right.versionSequence - left.versionSequence)[0]
            : undefined;
          if (isNewVersionRequired && editContext) {
            const createdVersionSequence = newVersion?.versionSequence;
            if (!Number.isInteger(createdVersionSequence)) {
              notifications.show({
                color: 'red',
                message: 'Version state is missing. Refresh the template list before continuing.',
              });
              return;
            }
            notifications.show({
              color: 'green',
              message: `Created Version ${createdVersionSequence}; existing assignments remain pinned to Version ${editContext.selectedVersion}.`,
            });
            return;
          }
          notifications.show({
            color: 'green',
            message: 'Template saved successfully.',
          });
        })();
        return;
      }
      notifications.show({ color: 'green', message: 'Template saved successfully.' });
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [templateBuilderOpen, templateEditContext, closeTemplateBuilder, org?.$id, loadTemplates]);

  useEffect(() => {
    if (!authLoading) {
      if (id) {
        void loadOrg(id, {
          isRelationsIncluded: requestedTab !== 'users',
          tabRefresh: requestedTab ?? 'overview',
        });
      }
    }
  }, [authLoading, id, loadOrg, requestedTab]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user || !id) {
      return;
    }

    const stripeState = searchParams?.get('stripe');
    if (!stripeState) {
      handledStripeStateRef.current = null;
      return;
    }

    const handledKey = `${id}:${stripeState}`;
    if (handledStripeStateRef.current === handledKey) {
      return;
    }
    handledStripeStateRef.current = handledKey;

    if (stripeState === 'return') {
      void (async () => {
        try {
          const latest = await syncOrganizationVerification(id);
          const latestStatus = resolveOrganizationVerificationStatus(latest);
          notifications.show({
            color: latestStatus === 'VERIFIED' ? 'green' : latestStatus === 'ACTION_REQUIRED' ? 'yellow' : 'blue',
            message: latestStatus === 'VERIFIED'
              ? 'Organization verification is complete.'
              : latestStatus === 'ACTION_REQUIRED'
                ? 'Stripe still needs more information to verify this organization.'
                : 'Stripe onboarding was updated. Verification is still in progress.',
          });
        } catch (error) {
          console.error('Failed to sync organization verification after Stripe return', error);
          notifications.show({
            color: 'red',
            message: error instanceof Error ? error.message : 'Failed to refresh organization verification status.',
          });
        }
      })();
      return;
    }

    if (stripeState === 'refresh') {
      notifications.show({
        color: 'yellow',
        message: 'Stripe asked to reopen onboarding. Continue verification to finish setup.',
      });
    }
  }, [authLoading, id, isAuthenticated, searchParams, syncOrganizationVerification, user]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user || !id) {
      return;
    }

    const quickBooksState = searchParams?.get('quickbooks');
    if (!quickBooksState) {
      handledQuickBooksStateRef.current = null;
      return;
    }

    const reason = searchParams?.get('reason') ?? '';
    const handledKey = `${id}:${quickBooksState}:${reason}`;
    if (handledQuickBooksStateRef.current === handledKey) {
      return;
    }
    handledQuickBooksStateRef.current = handledKey;

    if (quickBooksState === 'return') {
      notifications.show({
        color: 'green',
        message: 'QuickBooks connected.',
      });
      return;
    }

    if (quickBooksState !== 'error') {
      return;
    }

    const message = reason === 'expired_state'
      ? 'QuickBooks authorization expired. Start the QuickBooks connection again.'
      : reason === 'invalid_state'
        ? 'QuickBooks connection could not be verified. Start the QuickBooks connection again.'
        : reason === 'missing_realm'
          ? 'QuickBooks did not return a company id. Choose a QuickBooks company and try again.'
          : reason === 'token_exchange_failed'
            ? 'QuickBooks approved access, but BracketIQ could not finish the token exchange.'
            : 'QuickBooks connection failed. Start the QuickBooks connection again.';

    notifications.show({
      color: reason === 'expired_state' ? 'yellow' : 'red',
      message,
    });
  }, [authLoading, id, isAuthenticated, searchParams, user]);

  useEffect(() => {
    if (location) {
      return;
    }
    if (locationRequestAttemptedRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    locationRequestAttemptedRef.current = true;
    requestLocation().catch(() => {});
  }, [location, requestLocation]);


  useEffect(() => {
    if (!org || !user) return;
    if (stripeEmail) return;
    const fallbackEmail = (org as any)?.email || authUser?.email || '';
    if (fallbackEmail) {
      setStripeEmail(fallbackEmail);
    }
  }, [org, user, authUser, stripeEmail]);

  useEffect(() => {
    if (org?.products) {
      setProducts(org.products);
    }
  }, [org?.products]);

  useEffect(() => {
    if (!org || !(canManageTemplates || canImportDocuments) || !user) {
      setTemplateDocuments([]);
      if (!canManageTemplates) {
        setPendingTemplateCreates([]);
      }
      return;
    }
    loadTemplates(org.$id);
  }, [canImportDocuments, canManageTemplates, org, user, loadTemplates]);

  useEffect(() => {
    if (pendingTemplateCreates.length === 0 || templateDocuments.length === 0) {
      return;
    }

    setPendingTemplateCreates((current) => current.filter((entry) => {
      return !templateDocuments.some((template) => (
        (entry.templateDocumentId && template.$id === entry.templateDocumentId)
        || (entry.templateId && template.templateId === entry.templateId)
      ));
    }));
  }, [pendingTemplateCreates.length, templateDocuments]);

  useEffect(() => {
    if (!org || !canManageTemplates || !user) {
      setEventTemplates([]);
      return;
    }
    void loadEventTemplates(org.$id);
  }, [org, canManageTemplates, user, loadEventTemplates]);

  useEffect(() => {
    if (!org || !user || !org.viewerCanAccessUsers) {
      setOrganizationUsers([]);
      setOrganizationTeamCustomers([]);
      setSelectedCustomerKey(null);
      return;
    }
    if (activeTab !== 'users') {
      return;
    }
    void loadOrganizationUsers(org.$id);
  }, [activeTab, org, user, loadOrganizationUsers]);

  useEffect(() => {
    if (!requestedCustomerKey || !requestedCustomerType) {
      setSelectedCustomerKey(null);
      return;
    }
    setActiveTab('users');
    setCustomerTypeFilters((current) => (
      current.includes(requestedCustomerType)
        ? current
        : [...current, requestedCustomerType]
    ));
    setSelectedCustomerKey(requestedCustomerKey);
  }, [requestedCustomerKey, requestedCustomerType]);

  useEffect(() => {
    const handlePopState = () => {
      const nextTab = resolveOrganizationRouteTab({
        pathname: window.location.pathname,
        organizationId: id,
        queryTab: new URLSearchParams(window.location.search).get('tab'),
      });
      setActiveTab(nextTab ?? 'overview');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [id]);

  useEffect(() => {
    const nextTab = resolveOrganizationTabSelection({
      activeTab,
      availableTabs,
      organizationLoaded: Boolean(org && !loading),
    });
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, availableTabs, loading, org]);

  useEffect(() => {
    if (!eventTemplateCreateModalOpen || selectedCreateEventTemplateId || eventTemplates.length === 0) {
      return;
    }
    setSelectedCreateEventTemplateId(eventTemplates[0].id);
  }, [eventTemplateCreateModalOpen, eventTemplates, selectedCreateEventTemplateId]);

  useEffect(() => {
    const teamIdParam = searchParams?.get('teamId')?.trim();
    if (!teamIdParam) {
      return;
    }
    router.replace(buildTeamManagementPath(teamIdParam));
  }, [router, searchParams]);

  const eventTemplateOptions = useMemo(
    () => eventTemplates
      .filter((template) => typeof template.id === 'string' && template.id.length > 0)
      .map((template) => ({
        value: template.id,
        label: template.name?.trim() || 'Untitled Template',
      })),
    [eventTemplates],
  );

  const navigateToEventCreate = useCallback((templateId?: string | null) => {
    if (!canCreateOrganizationEvents) {
      return;
    }
    const newId = createId();
    const normalizedTemplateId = templateId?.trim();
    router.push(
      buildOrganizationEventCreateUrl({
        eventId: newId,
        organizationId: id ?? '',
        templateId: normalizedTemplateId || undefined,
        skipTemplatePrompt: !normalizedTemplateId,
      }),
    );
  }, [canCreateOrganizationEvents, id, router]);

  const handleCreateEvent = useCallback(() => {
    if (!canCreateOrganizationEvents) {
      return;
    }
    setSelectedCreateEventTemplateId((previous) => {
      if (previous && eventTemplates.some((template) => template.id === previous)) {
        return previous;
      }
      return eventTemplates[0]?.id ?? null;
    });
    setEventTemplateCreateModalOpen(true);
    if (org?.$id && !eventTemplatesLoading && eventTemplates.length === 0) {
      void loadEventTemplates(org.$id);
    }
  }, [canCreateOrganizationEvents, eventTemplates, eventTemplatesLoading, loadEventTemplates, org?.$id]);

  const handleCreateEventWithoutTemplate = useCallback(() => {
    setEventTemplateCreateModalOpen(false);
    navigateToEventCreate();
  }, [navigateToEventCreate]);

  const handleCreateEventWithTemplate = useCallback(() => {
    if (!selectedCreateEventTemplateId) {
      return;
    }
    setEventTemplateCreateModalOpen(false);
    navigateToEventCreate(selectedCreateEventTemplateId);
  }, [navigateToEventCreate, selectedCreateEventTemplateId]);

  const handleCreateTemplate = useCallback(async () => {
    if (!org || !user) return;
    const trimmedTitle = templateTitle.trim();
    if (!trimmedTitle) {
      setTemplatesError('Template title is required.');
      return;
    }
    if (templateType === 'PDF' && !templatePdfFile) {
      setTemplatesError('Upload a PDF file to create a PDF template.');
      return;
    }
    const trimmedContent = templateContent.trim();
    if (templateType === 'TEXT' && !trimmedContent) {
      setTemplatesError('Template text is required.');
      return;
    }
    try {
      setCreatingTemplate(true);
      setTemplatesError(null);
      const createdTemplateType = templateType;
      const result = await boldsignService.createTemplate({
        organizationId: org.$id,
        userId: user.$id,
        title: trimmedTitle,
        description: templateDescription.trim() || undefined,
        signOnce: templateSignOnce,
        requiredSignerType: templateRequiredSignerType,
        type: templateType,
        content: templateType === 'TEXT' ? trimmedContent : undefined,
        file: templateType === 'PDF' ? templatePdfFile ?? undefined : undefined,
      });
      setTemplateEmbedUrl(result.createUrl ?? null);
      setTemplateBuilderOpen(Boolean(result.createUrl));
      setTemplateModalOpen(false);
      setTemplateTitle('');
      setTemplateDescription('');
      setTemplateType('PDF');
      setTemplateContent('');
      setTemplatePdfFile(null);
      setTemplateSignOnce(true);
      setTemplateRequiredSignerType('PARTICIPANT');

      if (createdTemplateType === 'PDF') {
        if (!result.operationId) {
          throw new Error('Template creation response is missing operation id.');
        }
        const operationId = result.operationId;
        setPendingTemplateCreates((current) => [
          {
            localId: `pending-template:${operationId}`,
            operationId,
            templateId: result.templateId,
            title: trimmedTitle,
            description: templateDescription.trim() || undefined,
            signOnce: templateSignOnce,
            requiredSignerType: templateRequiredSignerType,
            status: String(result.syncStatus ?? 'PENDING_WEBHOOK'),
          },
          ...current.filter((entry) => entry.operationId !== operationId),
        ]);
        notifications.show({ color: 'blue', message: 'Template creation submitted. Syncing\u2026' });
        monitorTemplateCreateOperation({
          organizationId: org.$id,
          operationId,
          templateId: result.templateId,
        });
      } else {
        await loadTemplates(org.$id, { silent: true });
        notifications.show({ color: 'green', message: 'Template synced.' });
      }
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Failed to create template.',
      );
    } finally {
      setCreatingTemplate(false);
    }
  }, [
    org,
    user,
    templateTitle,
    templateDescription,
    templateSignOnce,
    templateRequiredSignerType,
    templateType,
    templateContent,
    templatePdfFile,
    loadTemplates,
    monitorTemplateCreateOperation,
  ]);

  const handleEditPdfTemplate = useCallback(async (template: TemplateDocument) => {
    if (!org) return;
    if ((template.type ?? 'PDF') !== 'PDF') {
      return;
    }
    try {
      const templateVersionState = requireTemplateVersionState(template);
      setEditingTemplateId(template.$id);
      setTemplatesError(null);
      const session = await boldsignService.getTemplateEditSession({
        organizationId: org.$id,
        templateDocumentId: template.$id,
      });
      const isNewVersionRequired = Boolean(session.willCreateNewVersion);
      const selectedVersion = session.selectedVersion ?? templateVersionState.versionSequence;
      if (!Number.isInteger(selectedVersion) || selectedVersion < 1) {
        throw new Error('Cannot open the template editor because Version state is missing.');
      }
      if (isNewVersionRequired && (
        typeof session.nextVersionSequence !== 'number'
        || !Number.isInteger(session.nextVersionSequence)
        || session.nextVersionSequence < 1
      )) {
        throw new Error('Cannot open the template editor because the next Version is missing.');
      }
      setTemplateEditContext({
        requirementId: templateVersionState.documentRequirementId,
        selectedVersion,
        nextVersionSequence: session.nextVersionSequence,
        isNewVersionRequired,
      });
      if (isNewVersionRequired) {
        notifications.show({
          color: 'blue',
          message: `You are editing Version ${selectedVersion}; saving will create Version ${session.nextVersionSequence} and keep existing assignments pinned.`,
        });
      }
      setTemplateEmbedUrl(session.editUrl);
      setTemplateBuilderOpen(true);
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Failed to open template editor.',
      );
    } finally {
      setEditingTemplateId(null);
    }
  }, [org]);

  const handleEditTextTemplate = useCallback((template: TemplateDocument) => {
    if (template.type !== 'TEXT') {
      return;
    }
    try {
      requireTemplateVersionState(template);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Cannot edit the template because Version state is missing.';
      setTemplatesError(message);
      notifications.show({ color: 'red', message });
      return;
    }
    setEditingTextTemplate(template);
    setTextEditTitle(template.requirementTitle ?? template.title);
    setTextEditDescription(template.requirementDescription ?? template.description ?? '');
    setTextEditContent(template.content ?? '');
    setTemplatesError(null);
  }, []);
  const handleSaveTextTemplate = useCallback(async () => {
    if (!org || !editingTextTemplate) {
      return;
    }
    let templateVersionState: TemplateDocumentWithVersionState;
    try {
      templateVersionState = requireTemplateVersionState(editingTextTemplate);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Cannot save the template because Version state is missing.';
      setTemplatesError(message);
      notifications.show({ color: 'red', message });
      return;
    }
    if (!textEditContent.trim()) {
      setTemplatesError('Template text is required.');
      return;
    }
    try {
      setSavingTemplateVersion(true);
      setTemplatesError(null);
      const result = await boldsignService.updateTemplate({
        organizationId: org.$id,
        templateDocumentId: editingTextTemplate.$id,
        title: textEditTitle.trim(),
        description: textEditDescription.trim() || null,
        content: textEditContent.trim(),
      });
      const isNewVersionCreated = Boolean(result.newVersionCreated);
      if (isNewVersionCreated && !Number.isInteger(result.newVersionSequence)) {
        throw new Error('Template save returned incomplete Version state.');
      }
      setEditingTextTemplate(null);
      await loadTemplates(org.$id, { silent: true });
      notifications.show({
        color: 'green',
        message: isNewVersionCreated
          ? `Created Version ${result.newVersionSequence}; existing assignments remain pinned to Version ${templateVersionState.versionSequence}.`
          : 'Template Version updated.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save template.';
      setTemplatesError(message);
      notifications.show({ color: 'red', message });
    } finally {
      setSavingTemplateVersion(false);
    }
  }, [
    editingTextTemplate,
    loadTemplates,
    org,
    textEditContent,
    textEditDescription,
    textEditTitle,
  ]);
  const handleDeleteTemplate = useCallback(async (template: TemplateDocument) => {
    if (!org) return;

    const templateTitle = template.title?.trim() || 'Untitled Template';
    const confirmed = window.confirm(`Delete "${templateTitle}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingTemplateId(template.$id);
      setTemplatesError(null);
      const result = await boldsignService.deleteTemplate({
        organizationId: org.$id,
        templateDocumentId: template.$id,
      });
      if (result.operationId) {
        notifications.show({ color: 'blue', message: 'Template delete submitted. Syncing\u2026' });
        await pollBoldSignOperation(result.operationId);
      }
      if (previewTemplate?.$id === template.$id) {
        setPreviewTemplate(null);
        setPreviewAccepted(false);
        setPreviewSignComplete(false);
      }
      await loadTemplates(org.$id, { silent: true });
      notifications.show({ color: 'green', message: 'Template deleted.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template.';
      setTemplatesError(message);
      notifications.show({ color: 'red', message });
    } finally {
      setDeletingTemplateId(null);
    }
  }, [loadTemplates, org, pollBoldSignOperation, previewTemplate?.$id]);

  const toggleCustomerTypeFilter = useCallback((filter: OrganizationCustomerTypeFilter, checked: boolean) => {
    setCustomerTypeFilters((previous) => {
      if (checked) {
        return previous.includes(filter) ? previous : [...previous, filter];
      }
      return previous.filter((entry) => entry !== filter);
    });
  }, []);

  const resetCustomerFilters = useCallback(() => {
    setCustomerTypeFilters(['users', 'teams']);
    setCustomerSearch('');
  }, []);

  const handleOrganizationTabChange = useCallback((value: string) => {
    const nextTab = value as OrganizationTab;
    setActiveTab(nextTab);
    if (id) {
      pushOrganizationHistoryState(buildOrganizationTabPath(id, nextTab));
    }
  }, [id]);

  const handleShareOrganization = useCallback(async () => {
    if (typeof window === 'undefined' || !org) {
      return;
    }
    const shareData = { title: org.name, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      notifications.show({ color: 'green', message: 'Organization link copied.' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      notifications.show({ color: 'red', message: 'Could not share this Organization link.' });
    }
  }, [org]);

  const openOrganizationCustomer = useCallback((row: OrganizationCustomerRow) => {
    setSelectedCustomerKey(row.key);
    if (id) {
      pushOrganizationHistoryState(buildOrganizationCustomerSelectionPath(id, row.type, row.id));
    }
  }, [id]);

  const openOrganizationEvent = useCallback((eventId: string) => {
    const params = new URLSearchParams({ tab: 'details' });
    if (canManageEvents) {
      params.set('mode', 'edit');
    }
    router.push(`/events/${eventId}?${params.toString()}`);
  }, [canManageEvents, router]);

  const handleOrganizationEventClick = useCallback((event: Event) => {
    openOrganizationEvent(event.$id);
  }, [openOrganizationEvent]);

  const openSignedDocumentPreview = useCallback((document: OrganizationUserDocumentSummary) => {
    if (document.type === 'PDF') {
      if (!document.viewUrl) {
        notifications.show({
          color: 'red',
          message: 'This signed PDF is missing a preview link.',
        });
        return;
      }
      window.open(document.viewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPreviewSignedTextDocument(document);
  }, []);

  const handleConnectStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    const trimmedEmail = stripeEmail.trim();
    const isValidEmail = EMAIL_REGEX.test(trimmedEmail);
    if (requiresStripeVerificationEmail && !isValidEmail) {
      setStripeEmailError('Enter a valid email to start Stripe onboarding.');
      return;
    }
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe onboarding is only available in the browser.' });
      return;
    }
    try {
      setStripeEmailError(null);
      setConnectingStripe(true);
      const origin = resolveClientPublicOrigin();
      if (!origin) {
        notifications.show({ color: 'red', message: 'Unable to determine public URL for Stripe onboarding.' });
        return;
      }
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.connectStripeAccount({
        organization: org,
        organizationEmail: requiresStripeVerificationEmail ? trimmedEmail : undefined,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe onboarding did not return a link. Try again later.' });
      }
    } catch (error) {
      if (isStripeConnectMfaRequiredError(error)) {
        notifications.show({
          color: 'yellow',
          message: 'Set up an authenticator app, then return to connect Stripe.',
        });
        router.push(error.mfaSetupPath);
        return;
      }

      console.error('Failed to connect Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to start Stripe onboarding right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setConnectingStripe(false);
    }
  }, [org, isOwner, requiresStripeVerificationEmail, router, stripeEmail]);

  const handleManageStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe management is only available in the browser.' });
      return;
    }
    try {
      setManagingStripe(true);
      const origin = resolveClientPublicOrigin();
      if (!origin) {
        notifications.show({ color: 'red', message: 'Unable to determine public URL for Stripe management.' });
        return;
      }
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.manageStripeAccount({
        organization: org,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe did not return a management link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to manage Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to open Stripe management right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setManagingStripe(false);
    }
  }, [org, isOwner]);

  const refreshOrganizationProducts = useCallback(
    async (orgId: string) => {
      organizationService.invalidateCachedOrganization(orgId);
      const latest = await organizationService.getOrganizationById(orgId, true);
      if (latest) {
        setOrg(latest);
        setProducts(latest.products ?? []);
      }
    },
    [setOrg],
  );

  const handleCreateProduct = useCallback(async () => {
    if (!org || !user || !canManageProducts) return;
    const priceCents = normalizePriceCents(productPriceCents);
    if (!productName.trim()) {
      notifications.show({ color: 'red', message: 'Product name is required.' });
      return;
    }
    if (!priceCents || priceCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a valid price greater than zero.' });
      return;
    }
    try {
      setCreatingProduct(true);
      const created = await productService.createProduct({
        user,
        organizationId: org.$id,
        name: productName.trim(),
        description: productDescription.trim() || undefined,
        priceCents,
        period: productPeriod,
        productType,
      });
      notifications.show({ color: 'green', message: `Created product "${created.name}".` });
      setProductName('');
      setProductDescription('');
      setProductPriceCents(0);
      setProductPeriod('month');
      setProductType(defaultProductTypeForPeriod('month'));
      await refreshOrganizationProducts(org.$id);
    } catch (error) {
      console.error('Failed to create product', error);
      notifications.show({
        color: 'red',
        message: isApiRequestError(error) ? error.message : 'Failed to create product. Try again.',
      });
    } finally {
      setCreatingProduct(false);
    }
  }, [canManageProducts, org, productDescription, productName, productPeriod, productPriceCents, productType, refreshOrganizationProducts, user]);

  const openProductModal = useCallback((product: Product) => {
    setSelectedProduct(product);
    setEditProductName(product.name);
    setEditProductDescription(product.description ?? '');
    const normalizedPeriod = resolveProductEditorPeriod(product.period);
    setEditProductPeriod(normalizedPeriod);
    setEditProductType(resolveProductEditorType(product.productType, product.taxCategory, normalizedPeriod));
    setEditProductPriceCents(normalizePriceCents(product.priceCents));
    setProductModalOpen(true);
  }, []);

  const closeProductModal = useCallback(() => {
    setProductModalOpen(false);
    setSelectedProduct(null);
    setEditProductName('');
    setEditProductDescription('');
    setEditProductPeriod('month');
    setEditProductType(defaultProductTypeForPeriod('month'));
    setEditProductPriceCents(0);
  }, []);

  const handleProductPeriodChange = useCallback((value: string | null) => {
    const nextPeriod = resolveProductEditorPeriod(value);
    setProductType((currentProductType) => (
      maybeCarryDefaultProductType(currentProductType, productPeriod, nextPeriod)
    ));
    setProductPeriod(nextPeriod);
  }, [productPeriod]);

  const handleEditProductPeriodChange = useCallback((value: string | null) => {
    const nextPeriod = resolveProductEditorPeriod(value);
    setEditProductType((currentProductType) => (
      maybeCarryDefaultProductType(currentProductType, editProductPeriod, nextPeriod)
    ));
    setEditProductPeriod(nextPeriod);
  }, [editProductPeriod]);

  const handleUpdateProduct = useCallback(async () => {
    if (!org || !selectedProduct || !canManageProducts) return;
    const priceCents = normalizePriceCents(editProductPriceCents);
    if (!editProductName.trim()) {
      notifications.show({ color: 'red', message: 'Product name is required.' });
      return;
    }
    if (!priceCents || priceCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a valid price greater than zero.' });
      return;
    }
    try {
      setUpdatingProduct(true);
      await productService.updateProduct(selectedProduct.$id, {
        name: editProductName.trim(),
        description: editProductDescription.trim() || undefined,
        priceCents,
        period: editProductPeriod,
        productType: editProductType,
      });
      notifications.show({ color: 'green', message: 'Product updated.' });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to update product', error);
      notifications.show({
        color: 'red',
        message: isApiRequestError(error) ? error.message : 'Failed to update product. Try again.',
      });
    } finally {
      setUpdatingProduct(false);
    }
  }, [canManageProducts, closeProductModal, editProductDescription, editProductName, editProductPeriod, editProductPriceCents, editProductType, org, refreshOrganizationProducts, selectedProduct]);

  const handleDeleteProduct = useCallback(async () => {
    if (!org || !selectedProduct || !canManageProducts) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete product "${selectedProduct.name}"? If it has subscriptions or purchase history, it will be deactivated instead.`);
      if (!confirmed) {
        return;
      }
    }
    try {
      setDeletingProduct(true);
      const outcome = await productService.deleteProductResult(selectedProduct.$id);
      notifications.show({
        color: 'green',
        message: describeDeleteOutcome(outcome, {
          deleted: 'Product deleted.',
          deactivated: 'Product deactivated because it has billing history.',
          fallback: 'Product removed from active listings.',
        }),
      });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to delete product', error);
      notifications.show({ color: 'red', message: 'Failed to delete product. Try again.' });
    } finally {
      setDeletingProduct(false);
    }
  }, [canManageProducts, closeProductModal, org, refreshOrganizationProducts, selectedProduct]);

  const startProductCheckout = useCallback(
    async (product: Product, billingAddress?: BillingAddress, discountCode?: string | null) => {
      if (!org || !user) {
        throw new Error('You must be signed in to purchase.');
      }
      try {
        setPurchaseProduct(product);
        setPurchasePaymentData(null);
        const resolvedDiscountCode = (discountCode ?? productDiscountCodes[product.$id] ?? '').trim();
        setPurchaseDiscountCode(resolvedDiscountCode);
        const intent = isSinglePurchasePeriod(product.period)
          ? await paymentService.createProductPaymentIntent(user, product, org, billingAddress, resolvedDiscountCode || null)
          : await productService.createSubscriptionCheckout({
              productId: product.$id,
              billingAddress,
              discountCode: resolvedDiscountCode || null,
            });
        setPurchasePaymentData(intent);
        setShowPurchaseModal(true);
        setShowBillingAddressModal(false);
      } catch (error) {
        if (
          isApiRequestError(error)
          && error.data
          && typeof error.data === 'object'
          && 'billingAddressRequired' in error.data
          && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
        ) {
          setShowBillingAddressModal(true);
          return;
        }
        throw error;
      }
    },
    [org, productDiscountCodes, user],
  );

  const handlePurchaseProduct = useCallback(
    async (product: Product) => {
      if (!org || !user) {
        notifications.show({ color: 'red', message: 'You must be signed in to purchase.' });
        return;
      }
      if (startingProductCheckoutRef.current) {
        return;
      }
      try {
        startingProductCheckoutRef.current = product.$id;
        setStartingProductCheckoutId(product.$id);
        await startProductCheckout(product);
      } catch (error) {
        console.error('Failed to start purchase', error);
        notifications.show({ color: 'red', message: 'Unable to start checkout. Please try again.' });
      } finally {
        if (startingProductCheckoutRef.current === product.$id) {
          startingProductCheckoutRef.current = null;
        }
        setStartingProductCheckoutId((current) => (current === product.$id ? null : current));
      }
    },
    [org, startProductCheckout, user],
  );

  const handleProductPaymentSuccess = useCallback(async () => {
    if (!purchaseProduct) return;
    try {
      setSubscribing(true);
      notifications.show({
        color: 'green',
        message: isSinglePurchasePeriod(purchaseProduct.period)
          ? `Purchase completed for ${purchaseProduct.name}.`
          : `Subscription started for ${purchaseProduct.name}.`,
      });
      if (org?.$id) {
        await refreshOrganizationProducts(org.$id);
      }
    } catch (error) {
      console.error('Failed to refresh product state after payment', error);
      notifications.show({ color: 'red', message: 'Payment succeeded, but product state failed to refresh.' });
    } finally {
      setSubscribing(false);
      setShowPurchaseModal(false);
      setPurchasePaymentData(null);
      setPurchaseProduct(null);
    }
  }, [org?.$id, purchaseProduct, refreshOrganizationProducts]);

  const handleSearchStaff = useCallback(
    async (query: string) => {
      setStaffSearch(query);
      setStaffError(null);
      if (query.trim().length < 2) {
        setStaffResults([]);
        return;
      }
      try {
        setStaffSearchLoading(true);
        const results = await userService.searchUsers(query.trim());
        const selectedUserIds = new Set((org?.staffMembers ?? []).map((staffMember) => staffMember.userId));
        if (org?.ownerId) {
          selectedUserIds.add(org.ownerId);
        }
        const filtered = results.filter((candidate) => !selectedUserIds.has(candidate.$id));
        setStaffResults(filtered);
      } catch (error) {
        console.error('Failed to search staff:', error);
        setStaffError('Failed to search staff. Try again.');
      } finally {
        setStaffSearchLoading(false);
      }
    },
    [org?.ownerId, org?.staffMembers],
  );

  const resolveStaffAssignmentRole = useCallback(
    (roleId?: string | null): OrganizationRole | null => {
      const roles = Array.isArray(org?.staffRoles) ? org.staffRoles : [];
      if (roleId) {
        const selectedRole = roles.find((role) => role.$id === roleId);
        if (selectedRole) {
          return selectedRole;
        }
      }
      return roles.find((role) => getStaffMemberTypesForOrganizationRole(role).includes('STAFF'))
        ?? roles[0]
        ?? null;
    },
    [org?.staffRoles],
  );

  const handleInviteExistingStaff = useCallback(
    async (candidate: UserData, roleId: string, types: StaffMemberType[]) => {
      if (!org || !canManageStaff) return;
      try {
        await organizationService.inviteExistingStaff(org.$id, candidate.$id, types, roleId);
        await loadOrg(org.$id, { silent: true });
        setStaffResults((prev) => prev.filter((entry) => entry.$id !== candidate.$id));
        notifications.show({
          color: 'green',
          message: `${candidate.firstName || candidate.userName || 'Staff member'} invited.`,
        });
      } catch (error) {
        console.error('Failed to invite existing staff member:', error);
        notifications.show({ color: 'red', message: error instanceof Error ? error.message : 'Failed to invite staff member.' });
      }
    },
    [canManageStaff, loadOrg, org],
  );

  const handleInviteStaffEmails = useCallback(async () => {
    if (!org || !canManageStaff || !user) return;

    const sanitized = staffInvites.map((invite) => {
      const role = resolveStaffAssignmentRole(invite.roleId);
      return {
        firstName: invite.firstName.trim(),
        lastName: invite.lastName.trim(),
        email: invite.email.trim(),
        roleId: role?.$id ?? null,
        types: getStaffMemberTypesForOrganizationRole(role),
      };
    });

    for (const invite of sanitized) {
      if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email) || !invite.roleId || invite.types.length === 0) {
        setStaffInviteError('Enter first name, last name, email, and a role for every invite.');
        return;
      }
    }

    setStaffInviteError(null);
    setInvitingStaff(true);
    try {
      await userService.inviteUsersByEmail(
        user.$id,
        sanitized.map((invite) => ({
          ...invite,
          type: 'STAFF',
          organizationId: org.$id,
          staffTypes: invite.types,
          roleId: invite.roleId,
          replaceStaffTypes: true,
        })),
      );
      await loadOrg(org.$id, { silent: true });
      notifications.show({
        color: 'green',
        message: 'Staff invites sent.',
      });
      setStaffInvites([{ firstName: '', lastName: '', email: '', types: ['STAFF'], roleId: null }]);
    } catch (error) {
      setStaffInviteError(error instanceof Error ? error.message : 'Failed to invite staff.');
    } finally {
      setInvitingStaff(false);
    }
  }, [canManageStaff, loadOrg, org, resolveStaffAssignmentRole, staffInvites, user]);

  const handleRemoveStaffMember = useCallback(
    async (userIdToRemove: string) => {
      if (!org || !canManageStaff) return;
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm('Remove this staff member from the organization?');
        if (!confirmed) {
          return;
        }
      }
      try {
        await organizationService.removeStaffMember(org.$id, userIdToRemove);
        await loadOrg(org.$id, { silent: true });
      } catch (error) {
        console.error('Failed to remove staff member:', error);
        notifications.show({ color: 'red', message: 'Failed to remove staff member.' });
      }
    },
    [canManageStaff, loadOrg, org],
  );

  const handleUpdateStaffRole = useCallback(
    async (userIdToUpdate: string, roleId: string) => {
      if (!org || !canManageStaff || !roleId) return;
      const role = (org.staffRoles ?? []).find((entry) => entry.$id === roleId);
      if (!role) {
        const error = new Error('Select a valid staff role.');
        notifications.show({ color: 'red', message: error.message });
        throw error;
      }
      try {
        await organizationService.updateStaffMemberTypes(
          org.$id,
          userIdToUpdate,
          getStaffMemberTypesForOrganizationRole(role),
          roleId,
        );
        await loadOrg(org.$id, { silent: true });
      } catch (error) {
        console.error('Failed to update staff member role:', error);
        notifications.show({ color: 'red', message: 'Failed to update staff member role.' });
        throw error;
      }
    },
    [canManageStaff, loadOrg, org],
  );

  const applyStaffRoleUpdate = useCallback((role: OrganizationRole) => {
    setOrg((prev) => {
      if (!prev) return prev;
      const existingRoles = Array.isArray(prev.staffRoles) ? prev.staffRoles : [];
      const hasRole = existingRoles.some((entry) => entry.$id === role.$id);
      const nextRoles = hasRole
        ? existingRoles.map((entry) => (entry.$id === role.$id ? role : entry))
        : [...existingRoles, role];
      const nextStaffMembers = Array.isArray(prev.staffMembers)
        ? prev.staffMembers.map((staffMember) => (
          staffMember.roleId === role.$id
            ? { ...staffMember, role }
            : staffMember
        ))
        : prev.staffMembers;
      return {
        ...prev,
        staffRoles: nextRoles,
        staffMembers: nextStaffMembers,
      };
    });
  }, [setOrg]);

  const handleCreateStaffRole = useCallback(
    async (name: string, permissions: string[]) => {
      if (!org || !canManageRoles) return;
      const role = await organizationService.createStaffRole(org.$id, { name, permissions });
      applyStaffRoleUpdate(role);
    },
    [applyStaffRoleUpdate, canManageRoles, org],
  );

  const handleUpdateStaffRoleDefinition = useCallback(
    async (roleId: string, data: { name?: string; permissions?: string[] }) => {
      if (!org || !canManageRoles) return;
      const role = await organizationService.updateStaffRole(org.$id, roleId, data);
      applyStaffRoleUpdate(role);
    },
    [applyStaffRoleUpdate, canManageRoles, org],
  );

  const handleUpdateEventHost = useCallback(async (eventId: string, hostId: string) => {
    if (!org || !canManageEvents || !eventId || !hostId) return;
    try {
      setUpdatingEventHostId(eventId);
      await apiRequest(`/api/events/${eventId}/host`, {
        method: 'PUT',
        body: { hostId },
      });
      setOrg((prev) => {
        if (!prev) return prev;
        const nextEvents = (prev.events ?? []).map((event) => (
          event.$id === eventId
            ? { ...event, hostId }
            : event
        ));
        return { ...prev, events: nextEvents };
      });
      notifications.show({ color: 'green', message: 'Event host updated.' });
    } catch (error) {
      console.error('Failed to update event host', error);
      notifications.show({ color: 'red', message: 'Failed to update event host.' });
    } finally {
      setUpdatingEventHostId(null);
    }
	  }, [canManageEvents, org, setOrg]);

  const showUserCustomers = customerTypeFilters.includes('users');
  const showTeamCustomers = customerTypeFilters.includes('teams');
  const normalizedCustomerSearch = normalizeCustomerSearchValue(debouncedCustomerSearch);
  const filteredOrganizationUsers = useMemo(() => (
    organizationUsers.filter((summary) => matchesCustomerSearch(normalizedCustomerSearch, [
      summary.fullName,
      summary.firstName,
      summary.lastName,
      summary.userName,
      ...summary.teams.flatMap((team) => [
        team.teamName,
        team.division,
        team.sport,
        team.status,
        team.rosterRole,
      ]),
      ...summary.events.flatMap((eventSummary) => [
        eventSummary.eventName,
        eventSummary.status,
      ]),
      ...summary.documents.flatMap((documentSummary) => [
        documentSummary.title,
        documentSummary.status,
        documentSummary.eventName,
      ]),
      ...summary.bills.flatMap((bill) => [
        bill.eventName,
        bill.ownerName,
        bill.status,
      ]),
    ]))
  ), [normalizedCustomerSearch, organizationUsers]);
  const filteredOrganizationTeamCustomers = useMemo(() => (
    organizationTeamCustomers.filter((summary) => matchesCustomerSearch(normalizedCustomerSearch, [
      summary.name,
      summary.division,
      summary.sport,
      summary.manager?.fullName,
      summary.headCoach?.fullName,
      ...summary.assistantCoaches.map((coach) => coach.fullName),
      ...summary.members.flatMap((member) => [
        member.fullName,
        member.userName,
        member.status,
        member.rosterRole,
        member.position,
      ]),
      ...summary.registrations.flatMap((registration) => [
        registration.eventName,
        registration.eventTeamName,
        registration.status,
        registration.division,
        registration.sport,
      ]),
      ...summary.bills.flatMap((bill) => [
        bill.eventName,
        bill.ownerName,
        bill.status,
      ]),
      ...summary.documents.flatMap((documentSummary) => [
        documentSummary.title,
        documentSummary.status,
        documentSummary.eventName,
      ]),
    ]))
  ), [normalizedCustomerSearch, organizationTeamCustomers]);
  const organizationCustomerRows = useMemo<OrganizationCustomerRow[]>(() => {
    const rows: OrganizationCustomerRow[] = [];
    if (showUserCustomers) {
      rows.push(...filteredOrganizationUsers.map((summary) => ({
        key: `users:${summary.userId}`,
        type: 'users' as const,
        id: summary.userId,
        name: summary.fullName,
        subtitle: summary.userName ? `@${summary.userName}` : undefined,
        profileImageId: summary.profileImageId,
        events: summary.events,
        user: summary,
      })));
    }
    if (showTeamCustomers) {
      rows.push(...filteredOrganizationTeamCustomers.map((summary) => ({
        key: `teams:${summary.canonicalTeamId}`,
        type: 'teams' as const,
        id: summary.canonicalTeamId,
        name: summary.name,
        subtitle: [summary.division, summary.sport].filter(Boolean).join(' • ') || undefined,
        profileImageId: summary.profileImageId,
        events: summary.registrations,
        team: summary,
      })));
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [filteredOrganizationTeamCustomers, filteredOrganizationUsers, showTeamCustomers, showUserCustomers]);
  const visibleOrganizationCustomerRows = organizationCustomerRows.slice(0, visibleCustomerCount);
  const hasMoreVisibleCustomers = visibleOrganizationCustomerRows.length < organizationCustomerRows.length;
  const customerFilterIsDefault = (
    customerTypeFilters.length === 2
    && showUserCustomers
    && showTeamCustomers
    && customerSearch.trim().length === 0
  );
  const selectedOrganizationCustomer = organizationCustomerRows.find((row) => row.key === selectedCustomerKey) ?? null;

  useEffect(() => {
    setVisibleCustomerCount(CUSTOMER_PAGE_SIZE);
  }, [normalizedCustomerSearch, organizationUsers.length, organizationTeamCustomers.length, showUserCustomers, showTeamCustomers]);

  useEffect(() => {
    if (activeTab !== 'users' || !hasMoreVisibleCustomers) {
      return;
    }
    const el = customerSentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setVisibleCustomerCount((current) => Math.min(
            current + CUSTOMER_PAGE_SIZE,
            organizationCustomerRows.length,
          ));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, hasMoreVisibleCustomers, organizationCustomerRows.length]);

  useEffect(() => {
    if (activeTab !== 'users') {
      return;
    }
    if (!organizationCustomerRows.length) {
      if (!requestedCustomerKey) {
        setSelectedCustomerKey(null);
      }
      return;
    }
    setSelectedCustomerKey((current) => (
      current && organizationCustomerRows.some((row) => row.key === current)
        ? current
        : requestedCustomerKey && organizationCustomerRows.some((row) => row.key === requestedCustomerKey)
          ? requestedCustomerKey
        : null
    ));
  }, [activeTab, organizationCustomerRows, requestedCustomerKey]);

  useEffect(() => {
    if (activeTab !== 'users' || !selectedCustomerKey) {
      return;
    }
    const selectedIndex = organizationCustomerRows.findIndex((row) => row.key === selectedCustomerKey);
    if (selectedIndex >= visibleCustomerCount) {
      setVisibleCustomerCount(selectedIndex + 1);
    }
  }, [activeTab, organizationCustomerRows, selectedCustomerKey, visibleCustomerCount]);

  const refreshOrganizationCustomers = useCallback(async () => {
    if (!org?.$id) {
      return;
    }
    await loadOrganizationUsers(org.$id, { silent: true });
  }, [loadOrganizationUsers, org?.$id]);

  const openCustomerDocumentVoidModal = useCallback((document: OrganizationUserDocumentSummary) => {
    if (document.provenance !== 'IMPORTED' || document.status?.toUpperCase() === 'VOID') {
      return;
    }
    setCustomerDocumentToVoid(document);
    setCustomerDocumentVoidReason(null);
    setCustomerDocumentVoidPassword('');
    setIsRecentProviderAuthUsed(false);
    setCustomerDocumentVoidNote('');
  }, []);

  const closeCustomerDocumentVoidModal = useCallback((isForced = false) => {
    if (isVoidingCustomerDocument && !isForced) {
      return;
    }
    setCustomerDocumentToVoid(null);
    setCustomerDocumentVoidReason(null);
    setCustomerDocumentVoidPassword('');
    setIsRecentProviderAuthUsed(false);
    setCustomerDocumentVoidNote('');
  }, [isVoidingCustomerDocument]);

  const handleVoidCustomerDocument = useCallback(async () => {
    if (!org?.$id || !customerDocumentToVoid || !customerDocumentVoidReason) {
      notifications.show({ color: 'red', message: 'Choose a reason before voiding the imported document.' });
      return;
    }
    if (!customerDocumentVoidPassword.trim() && !isRecentProviderAuthUsed) {
      notifications.show({
        color: 'red',
        message: 'Enter your password or use a recent provider sign-in before voiding the imported document.',
      });
      return;
    }
    if (customerDocumentVoidReason === 'Other' && !customerDocumentVoidNote.trim()) {
      notifications.show({ color: 'red', message: 'Enter a note when the void reason is Other.' });
      return;
    }
    setIsVoidingCustomerDocument(true);
    try {
      const recentAuthToken = await signedDocumentService.createRecentAuthToken(
        customerDocumentVoidPassword.trim() || undefined,
      );
      await signedDocumentService.updateImportedDocumentStatus(
        org.$id,
        customerDocumentToVoid.signedDocumentRecordId,
        customerDocumentVoidReason,
        customerDocumentVoidNote,
        recentAuthToken,
      );
      notifications.show({ color: 'green', message: 'Imported document voided.' });
      closeCustomerDocumentVoidModal(true);
      await refreshOrganizationCustomers();
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to void imported document.',
      });
    } finally {
      setIsVoidingCustomerDocument(false);
    }
  }, [
    closeCustomerDocumentVoidModal,
    customerDocumentToVoid,
    customerDocumentVoidNote,
    customerDocumentVoidPassword,
    isRecentProviderAuthUsed,
    customerDocumentVoidReason,
    org?.$id,
    refreshOrganizationCustomers,
  ]);

  const openCustomerDocumentAuditModal = useCallback(async (document: OrganizationUserDocumentSummary) => {
    if (!org?.$id) {
      return;
    }
    setCustomerDocumentAuditTarget(document);
    setCustomerDocumentAuditTrail(null);
    setIsLoadingCustomerDocumentAudit(true);
    try {
      const auditTrail = await signedDocumentService.getDocumentAuditTrail(
        org.$id,
        document.signedDocumentRecordId,
      );
      setCustomerDocumentAuditTrail(auditTrail);
    } catch (error) {
      setCustomerDocumentAuditTarget(null);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to load document audit trail.',
      });
    } finally {
      setIsLoadingCustomerDocumentAudit(false);
    }
  }, [org?.$id]);

  const closeCustomerBillModal = useCallback(() => {
    if (creatingCustomerBill) {
      return;
    }
    setCustomerBillModalOpen(false);
    setEditingCustomerBill(null);
  }, [creatingCustomerBill]);

  const openCustomerBillModal = useCallback(() => {
    if (!selectedOrganizationCustomer) {
      return;
    }
    setEditingCustomerBill(null);
    setCustomerBillLabel(`${selectedOrganizationCustomer.name} bill`);
    setCustomerBillAmount('');
    setCustomerBillPaidAmount(0);
    setCustomerBillDueDate(new Date().toISOString().slice(0, 10));
    setCustomerBillModalOpen(true);
  }, [selectedOrganizationCustomer]);

  const openCustomerBillEditModal = useCallback((bill: OrganizationBillSummary) => {
    if (!selectedOrganizationCustomer) {
      return;
    }
    const dueDate = bill.payments
      .slice()
      .sort((a, b) => a.sequence - b.sequence)[0]?.dueDate;
    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    setEditingCustomerBill(bill);
    setCustomerBillLabel(bill.label ?? `${selectedOrganizationCustomer.name} bill`);
    setCustomerBillAmount(bill.totalAmountCents / 100);
    setCustomerBillPaidAmount(bill.paidAmountCents / 100);
    setCustomerBillDueDate(
      parsedDueDate && !Number.isNaN(parsedDueDate.getTime())
        ? parsedDueDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    );
    setCustomerBillModalOpen(true);
  }, [selectedOrganizationCustomer]);

  const handleCreateCustomerBill = useCallback(async () => {
    if (!org?.$id || !selectedOrganizationCustomer) {
      return;
    }

    const totalAmountCents = Math.round(Number(customerBillAmount) * 100);
    const paidAmountCents = Math.round(Number(customerBillPaidAmount) * 100);
    if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a bill amount greater than zero.' });
      return;
    }
    if (!Number.isFinite(paidAmountCents) || paidAmountCents < 0 || paidAmountCents > totalAmountCents) {
      notifications.show({ color: 'red', message: 'Paid amount must be between zero and the bill amount.' });
      return;
    }
    if (!customerBillDueDate) {
      notifications.show({ color: 'red', message: 'Choose a due date.' });
      return;
    }

    const isEditing = Boolean(editingCustomerBill);
    setCreatingCustomerBill(true);
    try {
      await apiRequest(
        editingCustomerBill
          ? `/api/organizations/${encodeURIComponent(org.$id)}/bills/${encodeURIComponent(editingCustomerBill.billId)}`
          : `/api/organizations/${encodeURIComponent(org.$id)}/bills`,
        {
          method: editingCustomerBill ? 'PATCH' : 'POST',
          body: editingCustomerBill
            ? {
              label: customerBillLabel.trim() || 'Manual bill',
              totalAmountCents,
              paidAmountCents,
              dueDate: customerBillDueDate,
            }
            : {
              ownerType: selectedOrganizationCustomer.type === 'teams' ? 'TEAM' : 'USER',
              ownerId: selectedOrganizationCustomer.id,
              label: customerBillLabel.trim() || 'Manual bill',
              totalAmountCents,
              paidAmountCents,
              dueDate: customerBillDueDate,
            },
        },
      );
      notifications.show({ color: 'green', message: isEditing ? 'Bill updated.' : 'Bill added.' });
      setCustomerBillModalOpen(false);
      setEditingCustomerBill(null);
      await refreshOrganizationCustomers();
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : (isEditing ? 'Failed to update bill.' : 'Failed to add bill.'),
      });
    } finally {
      setCreatingCustomerBill(false);
    }
  }, [
    customerBillAmount,
    customerBillDueDate,
    customerBillLabel,
    customerBillPaidAmount,
    editingCustomerBill,
    org?.$id,
    refreshOrganizationCustomers,
    selectedOrganizationCustomer,
  ]);
  const customerDocumentTemplateOptions = useMemo(
    () => templateDocuments
      .filter((template) => normalizeRequiredSignerType(template.requiredSignerType) === 'PARTICIPANT')
      .map((template) => ({
        value: template.$id,
        label: template.title?.trim() || 'Untitled document',
      }))
      .filter((template) => template.value.length > 0),
    [templateDocuments],
  );
  const selectedCustomerDocumentTemplate = templateDocuments.find(
    (template) => template.$id === selectedCustomerDocumentTemplateId,
  );
  const selectedCustomerDocumentRequiresEvent = selectedCustomerDocumentTemplate?.type === 'PDF';

  const customerImportTemplateOptions = useMemo(
    () => templateDocuments
      .filter((template) => {
        const displayName = template.requirementTitle?.trim() || template.title?.trim();
        return typeof template.documentRequirementId === 'string'
          && template.documentRequirementId.trim().length > 0
          && Number.isInteger(template.versionSequence)
          && (template.versionSequence ?? 0) > 0
          && Boolean(displayName);
      })
      .map((template) => ({
        value: template.$id,
        label: `${template.requirementTitle?.trim() || template.title?.trim()} • Version ${template.versionSequence}`,
      }))
      .filter((template) => template.value.length > 0),
    [templateDocuments],
  );
  const selectedCustomerImportTemplate = templateDocuments.find(
    (template) => template.$id === selectedCustomerImportTemplateId,
  );
  const customerImportScopeOptions = useMemo(() => {
    if (!org?.$id || !selectedCustomerImportTemplate || selectedCustomerImportTemplate.signOnce) {
      return [];
    }
    return (selectedOrganizationCustomer?.user?.events ?? [])
      .filter((event) => event.organizationId === org.$id)
      .map((event) => ({
        value: event.eventId,
        label: `${event.eventName} • ${formatSummaryDateTime(event.start)}`,
      }));
  }, [org?.$id, selectedCustomerImportTemplate, selectedOrganizationCustomer]);
  const customerImportPreviewUrl = useMemo(
    () => (customerImportFile ? URL.createObjectURL(customerImportFile) : null),
    [customerImportFile],
  );
  const closeCustomerImportModal = useCallback((isForced = false) => {
    if (isImportingCustomerDocument && !isForced) {
      return;
    }
    setIsCustomerImportModalOpen(false);
    setSelectedCustomerImportTemplateId(null);
    setSelectedCustomerImportScopeId(null);
    setCustomerImportFile(null);
    setIsCustomerImportPreviewReady(false);
    setCustomerImportHistoricalSigningDate('');
    setCustomerImportSourceNote('');
    setIsCustomerImportAttestationAccepted(false);
  }, [isImportingCustomerDocument]);
  const openCustomerImportModal = useCallback(() => {
    const customer = selectedOrganizationCustomer?.user;
    const firstTemplate = customerImportTemplateOptions[0];
    if (!customer || !org?.$id) {
      return;
    }
    if (!firstTemplate) {
      notifications.show({ color: 'red', message: 'Create a document requirement version before importing a document.' });
      return;
    }
    const firstTemplateRecord = templateDocuments.find((template) => template.$id === firstTemplate.value);
    const firstEventId = customer.events.find((event) => event.organizationId === org.$id)?.eventId ?? null;
    setSelectedCustomerImportTemplateId(firstTemplate.value);
    setSelectedCustomerImportScopeId(firstTemplateRecord?.signOnce ? org.$id : firstEventId);
    setCustomerImportFile(null);
    setIsCustomerImportPreviewReady(false);
    setCustomerImportHistoricalSigningDate('');
    setCustomerImportSourceNote('');
    setIsCustomerImportAttestationAccepted(false);
    setIsCustomerImportModalOpen(true);
  }, [customerImportTemplateOptions, org?.$id, selectedOrganizationCustomer, templateDocuments]);

  const handleCustomerImportTemplateChange = useCallback((value: string | null) => {
    setIsCustomerImportAttestationAccepted(false);
    if (!value) {
      setSelectedCustomerImportTemplateId(null);
      setSelectedCustomerImportScopeId(null);
      return;
    }
    const nextTemplate = templateDocuments.find((template) => template.$id === value);
    const firstEventId = selectedOrganizationCustomer?.user?.events
      .find((event) => event.organizationId === org?.$id)?.eventId ?? null;
    setSelectedCustomerImportTemplateId(value);
    setSelectedCustomerImportScopeId(nextTemplate?.signOnce ? org?.$id ?? null : firstEventId);
  }, [org?.$id, selectedOrganizationCustomer, templateDocuments]);


  const handleCustomerImportFileChange = useCallback((file: File | null) => {
    setCustomerImportFile(file);
    setIsCustomerImportPreviewReady(false);
    setIsCustomerImportAttestationAccepted(false);
  }, []);
  const handleImportCustomerDocument = useCallback(async () => {
    const customer = selectedOrganizationCustomer?.user;
    const template = selectedCustomerImportTemplate;
    const scopeId = template?.signOnce ? org?.$id ?? null : selectedCustomerImportScopeId;
    if (!org?.$id || !customer || !template || !customerImportFile) {
      return;
    }
    if (!scopeId) {
      notifications.show({
        color: 'red',
        message: 'Choose an event before saving.',
      });
      return;
    }
    if (!isCustomerImportAttestationAccepted) {
      notifications.show({ color: 'red', message: 'Accept the Document Import Attestation before saving.' });
      return;
    }
    setIsImportingCustomerDocument(true);
    try {
      const formData = new FormData();
      formData.append('subjectUserId', customer.userId);
      formData.append('templateId', template.$id);
      formData.append('historicalSigningDate', customerImportHistoricalSigningDate);
      formData.append('sourceNote', customerImportSourceNote.trim());
      formData.append('attestationAccepted', 'true');
      formData.append('scopeType', template.signOnce ? 'ORGANIZATION' : 'EVENT_PARTICIPATION');
      formData.append('scopeId', scopeId);
      formData.append('file', customerImportFile, customerImportFile.name);
      await signedDocumentService.createImportedSignedDocument(org.$id, formData);
      notifications.show({ color: 'green', message: 'Signed document imported.' });
      closeCustomerImportModal(true);
      await refreshOrganizationCustomers();
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to import signed document.',
      });
    } finally {
      setIsImportingCustomerDocument(false);
    }
  }, [
    closeCustomerImportModal,
    isCustomerImportAttestationAccepted,
    customerImportFile,
    customerImportHistoricalSigningDate,
    customerImportSourceNote,
    org?.$id,
    refreshOrganizationCustomers,
    selectedCustomerImportScopeId,
    selectedCustomerImportTemplate,
    selectedOrganizationCustomer,
  ]);

  useEffect(() => {
    setIsCustomerImportPreviewReady(false);
    if (!customerImportPreviewUrl) {
      return undefined;
    }

    let isCancelled = false;
    let timer: number | undefined;
    const markReadyWhenLoaded = () => {
      if (isCancelled) {
        return;
      }
      const frame = customerImportPreviewFrameRef.current;
      if (frame?.contentDocument?.readyState === 'complete') {
        setIsCustomerImportPreviewReady(true);
        return;
      }
      timer = window.setTimeout(markReadyWhenLoaded, 50);
    };
    markReadyWhenLoaded();

    return () => {
      isCancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      URL.revokeObjectURL(customerImportPreviewUrl);
    };
  }, [customerImportPreviewUrl]);


  const closeCustomerDocumentModal = useCallback(() => {
    if (sendingCustomerDocument) {
      return;
    }
    setCustomerDocumentModalOpen(false);
  }, [sendingCustomerDocument]);

  const openCustomerDocumentModal = useCallback(() => {
    const customer = selectedOrganizationCustomer?.user;
    if (!customer) {
      return;
    }
    if (customerDocumentTemplateOptions.length === 0) {
      notifications.show({ color: 'red', message: 'Create a participant document template before adding a document.' });
      return;
    }
    setSelectedCustomerDocumentTemplateId(customerDocumentTemplateOptions[0].value);
    setSelectedCustomerDocumentEventId(customer.events[0]?.eventId ?? null);
    setCustomerDocumentModalOpen(true);
  }, [customerDocumentTemplateOptions, selectedOrganizationCustomer]);

  const handleAddCustomerDocument = useCallback(async () => {
    const customer = selectedOrganizationCustomer?.user;
    if (!org?.$id || !customer || !selectedCustomerDocumentTemplateId) {
      return;
    }
    if (selectedCustomerDocumentRequiresEvent && !selectedCustomerDocumentEventId) {
      notifications.show({ color: 'red', message: 'Select an event for a PDF document.' });
      return;
    }

    setSendingCustomerDocument(true);
    try {
      await apiRequest(`/api/organizations/${encodeURIComponent(org.$id)}/documents`, {
        method: 'POST',
        body: {
          userId: customer.userId,
          eventId: selectedCustomerDocumentEventId,
          templateId: selectedCustomerDocumentTemplateId,
        },
      });
      notifications.show({ color: 'green', message: 'Document added.' });
      setCustomerDocumentModalOpen(false);
      await refreshOrganizationCustomers();
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to add document.',
      });
    } finally {
      setSendingCustomerDocument(false);
    }
  }, [
    org?.$id,
    refreshOrganizationCustomers,
    selectedCustomerDocumentEventId,
    selectedCustomerDocumentRequiresEvent,
    selectedCustomerDocumentTemplateId,
    selectedOrganizationCustomer,
  ]);

  const customerBillAmountCents = Math.round(Number(customerBillAmount) * 100);
  const customerBillPaidAmountCents = Math.round(Number(customerBillPaidAmount) * 100);
  const customerBillPaidAmountError = (
    Number.isFinite(customerBillAmountCents)
    && Number.isFinite(customerBillPaidAmountCents)
    && customerBillPaidAmountCents > customerBillAmountCents
      ? 'Paid amount cannot exceed the bill amount.'
      : undefined
  );

  const handleRefundCustomerBillPayment = useCallback(async (
    bill: OrganizationBillSummary,
    payment: OrganizationBillPaymentSummary,
  ) => {
    const draftDollars = customerRefundAmountDraftByPaymentId[payment.paymentId] ?? (payment.refundableAmountCents / 100);
    const amountCents = Math.round(Number(draftDollars) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a refund amount greater than zero.' });
      return;
    }
    if (amountCents > payment.refundableAmountCents) {
      notifications.show({ color: 'red', message: 'Refund amount exceeds the refundable balance.' });
      return;
    }
    const confirmed = window.confirm(`Refund ${formatPrice(amountCents)} for this bill payment?`);
    if (!confirmed) {
      return;
    }

    setRefundingCustomerPaymentId(payment.paymentId);
    try {
      await apiRequest(`/api/billing/bills/${encodeURIComponent(bill.billId)}/payments/${encodeURIComponent(payment.paymentId)}/refund`, {
        method: 'POST',
        body: { amountCents },
      });
      notifications.show({ color: 'green', message: 'Bill payment refunded.' });
      setCustomerRefundAmountDraftByPaymentId((current) => {
        const next = { ...current };
        delete next[payment.paymentId];
        return next;
      });
      await refreshOrganizationCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refund bill payment.';
      notifications.show({ color: 'red', message });
    } finally {
      setRefundingCustomerPaymentId(null);
    }
  }, [customerRefundAmountDraftByPaymentId, refreshOrganizationCustomers]);

  const handleCancelCustomerPendingBillPayment = useCallback(async (
    bill: OrganizationBillSummary,
    payment: OrganizationBillPaymentSummary,
  ) => {
    const confirmed = window.confirm('Cancel this pending Stripe payment? The customer can retry payment afterward when the bill remains open.');
    if (!confirmed) {
      return;
    }

    setCancellingCustomerPaymentId(payment.paymentId);
    try {
      await apiRequest(`/api/billing/bills/${encodeURIComponent(bill.billId)}/payments/${encodeURIComponent(payment.paymentId)}/cancel`, {
        method: 'POST',
      });
      notifications.show({ color: 'green', message: 'Pending bill payment cancelled.' });
      await refreshOrganizationCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel pending payment.';
      notifications.show({ color: 'red', message });
    } finally {
      setCancellingCustomerPaymentId(null);
    }
  }, [refreshOrganizationCustomers]);

  const handleCancelCustomerPaymentPlan = useCallback(async (bill: OrganizationBillSummary) => {
    const confirmed = window.confirm('Cancel this bill payment plan and void its unpaid installments? Paid installments will stay recorded.');
    if (!confirmed) {
      return;
    }

    setCancellingCustomerPlanBillId(bill.billId);
    try {
      await apiRequest(`/api/billing/bills/${encodeURIComponent(bill.billId)}/payment-plan/cancel`, {
        method: 'POST',
      });
      notifications.show({ color: 'green', message: 'Bill payment plan cancelled.' });
      await refreshOrganizationCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel payment plan.';
      notifications.show({ color: 'red', message });
    } finally {
      setCancellingCustomerPlanBillId(null);
    }
  }, [refreshOrganizationCustomers]);

  const buildCustomerTeamCardTeam = (
    team: OrganizationTeamMembershipSummary | OrganizationTeamCustomerSummary,
  ): Team => {
    const teamId = 'canonicalTeamId' in team ? team.canonicalTeamId : team.teamId;
    const teamName = 'name' in team ? team.name : team.teamName;
    const memberCount = 'memberCount' in team ? team.memberCount : 0;
    const teamSize = 'teamSize' in team && typeof team.teamSize === 'number' ? team.teamSize : 0;
    const captainId = 'captainId' in team && team.captainId ? team.captainId : '';
    return {
      $id: teamId,
      name: teamName,
      division: team.division ?? 'Division',
      sport: team.sport ?? '',
      playerIds: [],
      captainId,
      pending: [],
      teamSize,
      profileImageId: 'profileImageId' in team ? team.profileImageId ?? undefined : undefined,
      organizationId: id,
      currentSize: memberCount,
      isFull: teamSize > 0 && memberCount >= teamSize,
      avatarUrl: '',
    };
  };

  const renderCustomerDetailSection = (title: string, children: ReactNode) => (
    <Stack gap="xs" className="org-customer-detail-section">
      <Text fw={700}>{title}</Text>
      {children}
    </Stack>
  );

  const renderCustomerTeamCards = (
    teams: Array<OrganizationTeamMembershipSummary | OrganizationTeamCustomerSummary>,
    emptyText = 'No organization team registrations.',
  ) => (
    teams.length > 0 ? (
      <Stack gap={8}>
        {teams.map((team) => {
          const teamId = 'canonicalTeamId' in team ? team.canonicalTeamId : team.teamId;
          return (
            <TeamCard
              key={teamId}
              team={buildCustomerTeamCardTeam(team)}
              className="org-customer-detail-item org-customer-team-card"
            />
          );
        })}
      </Stack>
    ) : (
      <Text size="xs" c="dimmed">{emptyText}</Text>
    )
  );

  const renderCustomerEvents = (
    events: OrganizationUserEventSummary[],
    emptyText = 'No organization events.',
  ) => (
    events.length > 0 ? (
      <Stack gap={8}>
        {events.map((eventSummary) => (
          <Paper
            key={eventSummary.eventId}
            withBorder
            radius="md"
            p="xs"
            className="org-customer-detail-item org-customer-event-card"
            role="link"
            tabIndex={0}
            onClick={() => openOrganizationEvent(eventSummary.eventId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') openOrganizationEvent(eventSummary.eventId);
            }}
          >
            <Group gap="sm" wrap="nowrap" align="center">
              <Avatar
                src={getEventImageUrl({
                  imageId: eventSummary.imageId,
                  width: 96,
                  height: 96,
                  placeholderUrl: getEventImageFallbackUrl({
                    hostLabel: eventSummary.eventName,
                    width: 96,
                    height: 96,
                  }),
                })}
                alt={eventSummary.eventName}
                radius="md"
                size={48}
                className="org-customer-event-card__avatar"
              >
                {getCustomerInitials(eventSummary.eventName)}
              </Avatar>
              <Stack gap={2} className="min-w-0">
                <Text size="sm" fw={700} lineClamp={2}>{eventSummary.eventName}</Text>
                <Text size="xs" c="dimmed">
                  {formatSummaryDateTime(eventSummary.start)}
                  {eventSummary.status ? ` • ${formatCustomerMetaToken(eventSummary.status) ?? eventSummary.status}` : ''}
                </Text>
              </Stack>
            </Group>
          </Paper>
        ))}
      </Stack>
    ) : (
      <Text size="xs" c="dimmed">{emptyText}</Text>
    )
  );

  const renderCustomerBills = (bills: OrganizationBillSummary[], emptyText = 'No bills.') => (
    <OrganizationCustomerBills bills={bills} emptyText={emptyText} controls={{
      isOwner, canManageFinance,
      cancellingPlanId: cancellingCustomerPlanBillId,
      cancellingPaymentId: cancellingCustomerPaymentId,
      refundingPaymentId: refundingCustomerPaymentId,
      refundAmounts: customerRefundAmountDraftByPaymentId,
      setRefundAmounts: setCustomerRefundAmountDraftByPaymentId,
      onEdit: openCustomerBillEditModal,
      onCancelPlan: handleCancelCustomerPaymentPlan,
      onRefund: handleRefundCustomerBillPayment,
      onCancelPayment: handleCancelCustomerPendingBillPayment,
    }} />
  );

  const renderCustomerDocuments = (documents: OrganizationUserDocumentSummary[], emptyText = 'No documents.') => (
    <OrganizationCustomerDocuments documents={documents} emptyText={emptyText} controls={{
      canViewImportedDocuments, canVoidDocuments, canViewDocumentAudit,
      onView: openSignedDocumentPreview,
      onVoid: openCustomerDocumentVoidModal,
      onAudit: openCustomerDocumentAuditModal,
    }} />
  );

  const renderCustomerAvatar = (
    name: string,
    profileImageId?: string | null,
    type: OrganizationCustomerTypeFilter = 'users',
    size = 40,
  ) => (
    <Avatar
      src={getProfilePreviewUrl(profileImageId, size)}
      radius="xl"
      size={size}
      color={type === 'teams' ? 'blue' : 'gray'}
    >
      {getCustomerInitials(name)}
    </Avatar>
  );

  const renderPersonSummary = (
    person: Pick<OrganizationTeamMemberSummary, 'fullName' | 'userName' | 'profileImageId'>,
    type: OrganizationCustomerTypeFilter = 'users',
  ) => (
    <Group gap="sm" align="center" className="min-w-0">
      {renderCustomerAvatar(person.fullName, person.profileImageId, type, 34)}
      <Stack gap={0} className="min-w-0">
        <Text size="sm" fw={600} truncate>{person.fullName}</Text>
        {person.userName && <Text size="xs" c="dimmed" truncate>@{person.userName}</Text>}
      </Stack>
    </Group>
  );

  const renderSelectedCustomerDetail = (tab: CustomerDetailTab) => {
    if (!selectedOrganizationCustomer) {
      return (
        <Stack gap="xs">
          <Title order={5}>Customer details</Title>
          <Text size="sm" c="dimmed">Select a customer row to view roster, billing, document, and event details.</Text>
        </Stack>
      );
    }

    if (selectedOrganizationCustomer.user) {
      const summary = selectedOrganizationCustomer.user;
      return (
        <Stack gap="md">
          {tab === 'overview' && <div className="org-customer-overview-grid">
            <Paper withBorder p="md"><Text fw={600}>Registrations</Text><Text size="xl">{summary.events.length}</Text></Paper>
            <Paper withBorder p="md"><Text fw={600}>Teams</Text><Text size="xl">{summary.teams.length}</Text></Paper>
            <Paper withBorder p="md"><Text fw={600}>Bills</Text><Text size="xl">{summary.bills.length}</Text></Paper>
            <Paper withBorder p="md"><Text fw={600}>Documents</Text><Text size="xl">{summary.documents.length}</Text></Paper>
          </div>}
          {(tab === 'billing' || tab === 'documents') &&
            <Group gap="xs">
              {tab === 'billing' && canManageFinance && (
                <Button size="xs" onClick={openCustomerBillModal}>
                  Add bill
                </Button>
              )}
              {tab === 'documents' && canManageTemplates && (
                <Button size="xs" variant="light" onClick={openCustomerDocumentModal}>
                  Add document
                </Button>
              )}
              {tab === 'documents' && canImportDocuments && (
                <Button size="xs" variant="outline" onClick={openCustomerImportModal}>
                  Import signed document
                </Button>
              )}
            </Group>}
          {tab === 'roster' && renderCustomerDetailSection('Teams', renderCustomerTeamCards(summary.teams))}
          {(tab === 'events' || tab === 'overview') && renderCustomerDetailSection('Events', renderCustomerEvents(tab === 'overview' ? summary.events.slice(0, 3) : summary.events))}
          {tab === 'billing' && renderCustomerDetailSection('Bills', renderCustomerBills(summary.bills))}
          {tab === 'documents' && renderCustomerDetailSection('Documents', renderCustomerDocuments(summary.documents))}
        </Stack>
      );
    }

    const summary = selectedOrganizationCustomer.team;
    if (!summary) {
      return null;
    }
    const staffRows = [
      summary.manager ? { ...summary.manager, label: getStaffRoleLabel(summary.manager.role) } : null,
      summary.headCoach ? { ...summary.headCoach, label: getStaffRoleLabel(summary.headCoach.role) } : null,
      ...summary.assistantCoaches.map((coach) => ({ ...coach, label: getStaffRoleLabel(coach.role) })),
    ].filter((entry): entry is OrganizationTeamStaffSummary & { label: string } => Boolean(entry));
    return (
      <Stack gap="md">
        {tab === 'overview' && <div className="org-customer-overview-grid">
          <Paper withBorder p="md"><Text fw={600}>Registrations</Text><Text size="xl">{summary.registrations.length}</Text></Paper>
          <Paper withBorder p="md"><Text fw={600}>Members</Text><Text size="xl">{summary.memberCount}{summary.teamSize ? ` / ${summary.teamSize}` : ''}</Text></Paper>
          <Paper withBorder p="md"><Text fw={600}>Team bills</Text><Text size="xl">{summary.bills.length}</Text></Paper>
        </div>}
        {tab === 'billing' &&
          <Group gap="xs">
            {canManageFinance && (
              <Button size="xs" onClick={openCustomerBillModal}>
                Add bill
              </Button>
            )}
          </Group>}
          {(tab === 'roster' || tab === 'overview') && renderCustomerDetailSection('Team staff', (
            staffRows.length > 0 ? (
              <Stack gap={8}>
                {staffRows.map((staff) => (
                  <Paper key={`${staff.role}-${staff.userId}`} withBorder p="sm" radius="md" className="org-customer-detail-item">
                    <Group justify="space-between" gap="sm">
                      {renderPersonSummary(staff)}
                      <Badge size="xs" variant="light" color="gray">{staff.label}</Badge>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed">No manager or coach assignments.</Text>
            )
          ))}
          {(tab === 'events' || tab === 'overview') && renderCustomerDetailSection('Events', renderCustomerEvents(tab === 'overview' ? summary.registrations.slice(0, 3) : summary.registrations, 'No organization event registrations.'))}
        {(tab === 'roster' || tab === 'billing' || tab === 'documents') && renderCustomerDetailSection(tab === 'roster' ? 'Players' : `Player ${tab === 'billing' ? 'bills' : 'documents'}`, (
          summary.members.length > 0 ? (
            <Stack gap="sm">
              {summary.members.map((member) => {
                const meta = [
                  member.isCaptain ? 'Captain' : null,
                  formatCustomerMetaToken(member.status),
                  formatCustomerMetaToken(member.rosterRole),
                  member.position,
                  member.jerseyNumber ? `#${member.jerseyNumber}` : null,
                ].filter(Boolean);
                return (
                  <Paper key={member.userId} withBorder p="sm" radius="md" className="org-customer-detail-item">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" wrap="wrap">
                        {renderPersonSummary(member)}
                        {meta.length > 0 && (
                          <Group gap={6}>
                            {meta.map((item) => (
                              <Badge key={item} size="xs" variant="light" color={item === 'Captain' ? 'blue' : 'gray'}>
                                {item}
                              </Badge>
                            ))}
                          </Group>
                        )}
                      </Group>
                      {tab === 'billing' && <div className="org-customer-detail-subgroup">
                          {renderCustomerBills(member.bills, 'No player bills.')}
                        </div>}
                        {tab === 'documents' && <div className="org-customer-detail-subgroup">
                          {renderCustomerDocuments(member.documents, 'No player documents.')}
                        </div>}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">No players found for this team.</Text>
          )
        ))}
          {tab === 'billing' && renderCustomerDetailSection('Team bills', renderCustomerBills(summary.bills))}
      </Stack>
    );
  };

  if (authLoading) return <Loading fullScreen text="Loading organization..." />;

  const requestedTabIsUnavailable = Boolean(
    org
      && requestedTab
      && !availableTabs.some((tab) => tab.value === requestedTab),
  );
  const overviewEmpty = Boolean(
    org
      && !org.description?.trim()
      && overviewRecentEvents.length === 0
      && (org.teams?.length ?? 0) === 0
      && (org.divisions?.length ?? 0) === 0,
  );
  const isActiveTabLoading = organizationLoadingTab === activeTab;
  const shellStatus = loading
    ? 'loading'
    : requestedTabIsUnavailable
      ? 'permission-denied'
      : organizationLoadError && !org
        ? 'error'
        : org
          ? 'ready'
          : 'empty';
  const renderOverviewTab = (org: Organization) => (
    activeTab === 'overview' && (
    <OrganizationOverviewTabContent
      organization={org}
      events={overviewRecentEvents}
      teams={org.teams ?? []}
      staffCount={(org.staffMembers?.length ?? 0) + (org.hosts?.length ?? 0)}
      officialCount={currentOfficials.length}
      canViewEvents={availableTabs.some((tab) => tab.value === 'events')}
      canViewTeams={availableTabs.some((tab) => tab.value === 'teams')}
      onViewEvents={() => handleOrganizationTabChange('events')}
      onViewTeams={() => handleOrganizationTabChange('teams')}
      onViewReviews={() => handleOrganizationTabChange('reviews')}
      onEventClick={handleOrganizationEventClick}
      reviewContent={(
        <OrganizationReviewsTabContent
          organizationId={org.$id}
          mode="summary"
          onViewAll={() => handleOrganizationTabChange('reviews')}
        />
      )}
      paymentsContent={isOwner ? (
        <Paper withBorder className="org-overview-payments-card">
          <Title order={3}>Payments status</Title>
          <Text size="sm" c="dimmed" mt="sm" mb="sm">
            {organizationVerificationStatus === 'VERIFIED'
              ? 'Stripe onboarding is complete. This organization can accept payouts and display the verified badge.'
              : organizationVerificationStatus === 'LEGACY_CONNECTED'
                ? 'Stripe is connected through the legacy flow. Reconnect through the new verification flow to earn the verified badge.'
                : organizationVerificationStatus === 'ACTION_REQUIRED'
                  ? 'Stripe still needs more information before this organization can be verified.'
                  : organizationVerificationStatus === 'PENDING'
                    ? 'Stripe onboarding has started. Finish the remaining steps to complete verification.'
                    : 'Connect a Stripe account to verify this organization and accept payouts.'}
          </Text>
          <Group gap="xs" mb="sm">
            <Badge
              color={
                organizationVerificationStatus === 'VERIFIED'
                  ? 'teal'
                  : organizationVerificationStatus === 'ACTION_REQUIRED'
                    ? 'yellow'
                    : organizationVerificationStatus === 'LEGACY_CONNECTED'
                      ? 'blue'
                      : 'gray'
              }
              variant="light"
            >
              {organizationVerificationStatusLabel(organizationVerificationStatus)}
            </Badge>
            {syncingOrganizationVerification && <Text size="xs" c="dimmed">Refreshing verification…</Text>}
          </Group>
          <Stack gap="xs">
            {requiresStripeVerificationEmail && (
              <TextInput
                label="Stripe payout email"
                type="email"
                placeholder="billing@example.com"
                value={stripeEmail}
                error={stripeEmailError ?? undefined}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  setStripeEmail(next);
                  if (stripeEmailError && EMAIL_REGEX.test(next.trim())) {
                    setStripeEmailError(null);
                  }
                }}
                disabled={connectingStripe}
                required
              />
            )}
            <Button
              size="sm"
              loading={organizationVerificationStatus === 'VERIFIED' ? managingStripe : connectingStripe}
              disabled={requiresStripeVerificationEmail && !stripeEmailValid}
              onClick={organizationVerificationStatus === 'VERIFIED' ? handleManageStripeAccount : handleConnectStripeAccount}
            >
              {stripePrimaryActionLabel}
            </Button>
            {organizationVerificationStatus !== 'VERIFIED' && (
              <Text size="xs" c="dimmed">
                The verified badge appears only after Stripe finishes all required checks for this organization.
              </Text>
            )}
          </Stack>
        </Paper>
      ) : undefined}
    />
  )
  );

  const renderReviewsTab = (org: Organization) => (
    activeTab === 'reviews' && org && (
    <OrganizationReviewsTabContent organizationId={org.$id} />
  )
  );

  const renderEventsTab = (org: Organization) => (
    activeTab === 'events' && (
    <OrganizationEventsTabContent
      organizationName={org.name}
      location={location}
      searchTerm={eventSearchTerm}
      setSearchTerm={setEventSearchTerm}
      selectedEventTypes={selectedEventTypes}
      setSelectedEventTypes={setSelectedEventTypes}
      eventTypeOptions={ORG_EVENT_TYPE_OPTIONS}
      selectedSports={selectedSports}
      setSelectedSports={setSelectedSports}
      maxDistance={eventsTabMaxDistance}
      setMaxDistance={setEventsTabMaxDistance}
      selectedStartDate={eventsTabSelectedStartDate}
      setSelectedStartDate={setEventsTabSelectedStartDate}
      selectedEndDate={eventsTabSelectedEndDate}
      setSelectedEndDate={setEventsTabSelectedEndDate}
      sports={sportOptions}
      sportsLoading={sportsLoading}
      sportsError={sportsError?.message ?? null}
      defaultMaxDistance={ORG_EVENTS_DEFAULT_MAX_DISTANCE}
      kmBetween={kmBetween}
      {...organizationEvents.data}
      sentinelRef={organizationEvents.sentinelRef}
      onFilterChange={() => organizationEvents.reload({ background: true })}
      onRetry={() => { void organizationEvents.reload(); }}
      onEventClick={handleOrganizationEventClick}
      onCreateEvent={handleCreateEvent}
      showCreateEventButton={canManageEvents}
      createEventDisabled={!canCreateOrganizationEvents}
      createEventHelperText={createEventHelperText}
      hideWeeklyChildren={hideWeeklyChildEvents}
      setHideWeeklyChildren={setHideWeeklyChildEvents}
    />
  )
  );

  const renderEventTemplatesTab = (org: Organization) => (
    canManageTemplates && activeTab === 'eventTemplates' && (
    <OrganizationEventTemplatesTabContent
      eventTemplates={eventTemplates}
      isLoading={eventTemplatesLoading}
      error={eventTemplatesError}
      onRefresh={() => org ? loadEventTemplates(org.$id) : undefined}
      onCreateEvent={navigateToEventCreate}
    />
  )
  );

  const renderTeamsTab = (org: Organization) => (
    activeTab === 'teams' && (
    <OrganizationTeamsTabContent
      teams={org.teams}
      divisionDetails={org.divisions}
      isTeamManagementAllowed={canManageTeams}
      onCreateTeam={() => setShowCreateTeamModal(true)}
      onTeamClick={(team) => router.push(buildTeamManagementPath(team.$id))}
    />
  )
  );

  const renderUsersTab = (org: Organization) => (
    activeTab === 'users' && (
    <OrganizationCustomersTabContent
      organizationName={org?.name}
      customerSearch={customerSearch}
      setCustomerSearch={setCustomerSearch}
      customerTypeFilters={customerTypeFilters}
      setCustomerTypeFilters={setCustomerTypeFilters}
      resetCustomerFilters={resetCustomerFilters}
      isCustomerFilterDefault={customerFilterIsDefault}
      customers={organizationCustomerRows}
      visibleCustomers={visibleOrganizationCustomerRows}
      selectedCustomerKey={selectedCustomerKey}
      onCustomerClose={() => {
        setSelectedCustomerKey(null);
        pushOrganizationHistoryState(buildOrganizationTabPath(id, 'users'));
      }}
      onCustomerSelect={(customer) => {
        const nextCustomer = organizationCustomerRows.find((row) => row.key === customer.key);
        if (nextCustomer) openOrganizationCustomer(nextCustomer);
      }}
      renderCustomerAvatar={renderCustomerAvatar}
      renderCustomerDetail={(customer) => customer && <OrganizationCustomerProfile
        key={customer.key}
        rosterLabel={customer.type === 'teams' ? 'Roster' : 'Teams'}
        header={<Group gap="md" wrap="nowrap">
          {renderCustomerAvatar(customer.name, customer.profileImageId, customer.type, 48)}
          <Stack gap={4} className="min-w-0">
            <Group gap="sm"><Title order={3}>{customer.name}</Title><Badge variant="light">{customer.type === 'teams' ? 'Team' : 'User'}</Badge></Group>
            {customer.subtitle && <Text c="dimmed" size="sm">{customer.subtitle}</Text>}
          </Stack>
        </Group>}
        renderContent={renderSelectedCustomerDetail}
      />}
      formatEventStart={(start) => formatSummaryDateTime(start ?? undefined)}
      isCustomersLoading={organizationUsersLoading}
      customersError={organizationUsersError}
      onRefresh={() => org ? loadOrganizationUsers(org.$id) : undefined}
      hasMoreCustomers={hasMoreVisibleCustomers}
      customerSentinelRef={customerSentinelRef}
    />
  )
  );

  const renderTemplatesTab = (org: Organization) => (
    canManageTemplates && activeTab === 'templates' && (
    <OrganizationDocumentTemplatesTabContent
      templateDocuments={templateDocuments}
      pendingTemplateCreates={pendingTemplateCreates}
      selectedTemplateVersionByRequirement={selectedTemplateVersionByRequirement}
      isLoading={templatesLoading}
      error={templatesError}
      editingTemplateId={editingTemplateId}
      deletingTemplateId={deletingTemplateId}
      savingTemplateVersion={savingTemplateVersion}
      onRefresh={() => org ? loadTemplates(org.$id) : undefined}
      onCreateTemplate={() => setTemplateModalOpen(true)}
      onEditTextTemplate={handleEditTextTemplate}
      onPreviewTemplate={openTemplatePreview}
      onEditPdfTemplate={handleEditPdfTemplate}
      onDeleteTemplate={handleDeleteTemplate}
    />
  )
  );

  const renderStaffTab = (org: Organization) => (
    canManageStaffSurface && activeTab === 'staff' && (
    <OrganizationStaffTabContent
      rosterNameError={staffRosterNameError}
      rosterEntries={staffRosterEntries}
      searchValue={staffSearch}
      onSearchChange={(value) => { void handleSearchStaff(value); }}
      searchResults={staffResults}
      searchLoading={staffSearchLoading}
      searchError={staffError}
      onAddExisting={(candidate, roleId, types) => { void handleInviteExistingStaff(candidate, roleId, types); }}
      inviteRows={staffInvites}
      onInviteRowsChange={(rows) => setStaffInvites(rows)}
      inviteError={staffInviteError}
      inviting={invitingStaff}
      staffRoles={org.staffRoles ?? []}
      onSendInvites={() => { void handleInviteStaffEmails(); }}
      onRemoveFromRoster={(entryUserId) => { void handleRemoveStaffMember(entryUserId); }}
      onRoleChange={(entryUserId, roleId) => handleUpdateStaffRole(entryUserId, roleId)}
      onCreateRole={(name, permissions) => handleCreateStaffRole(name, permissions)}
      onUpdateRole={(roleId, data) => handleUpdateStaffRoleDefinition(roleId, data)}
      organizationId={org.$id}
      canManageCompensation={canManageStaffCompensation}
    />
  )
  );

  const renderDiscountsTab = (org: Organization) => (
    (isOwner || canManageDiscounts) && activeTab === 'discounts' && org && (
    <OrganizationDiscountsTabContent
      ownerType="ORGANIZATION"
      ownerId={org.$id}
      title={`${org.name} discounts`}
    />
  )
  );

  const renderFinanceTab = (org: Organization) => (
    (isOwner || canManageFinance) && activeTab === 'finance' && org && (
    <OrganizationFinanceTabContent
      organizationId={org.$id}
      isActive={activeTab === 'finance'}
      canManage={isOwner || canManageFinance}
    />
  )
  );

  const renderRefundsTab = (org: Organization) => (
    canManageRefunds && activeTab === 'refunds' && org && (
    <OrganizationRefundsTabContent organizationId={org.$id} />
  )
  );

  const renderPublicPageTab = (org: Organization) => (
    canManagePublicPage && activeTab === 'publicPage' && org && (
    <OrganizationPublicSettingsTabContent
      organization={org}
      onUpdated={async (updatedOrg) => {
        setOrg(updatedOrg);
        if (id) {
          await loadOrg(id);
        }
      }}
    />
  )
  );

  const renderStoreTab = (org: Organization) => (
    activeTab === 'store' && org && (
    <OrganizationStoreTabContent
      organizationHasStripeAccount={organizationHasStripeAccount}
      canManageProducts={canManageProducts}
      products={products}
      productName={productName}
      onProductNameChange={setProductName}
      productDescription={productDescription}
      onProductDescriptionChange={setProductDescription}
      productPeriod={productPeriod}
      onProductPeriodChange={handleProductPeriodChange}
      productType={productType}
      onProductTypeChange={(value) => setProductType((value as ProductType) ?? defaultProductTypeForPeriod(productPeriod))}
      productPriceCents={productPriceCents}
      onProductPriceChange={setProductPriceCents}
      creatingProduct={creatingProduct}
      canCreateProduct={canCreateProduct}
      onCreateProduct={handleCreateProduct}
      productDiscountCodes={productDiscountCodes}
      onProductDiscountCodeChange={(productId, value) => {
        setProductDiscountCodes((current) => ({ ...current, [productId]: value }));
      }}
      startingProductCheckoutId={startingProductCheckoutId}
      onProductPurchase={handlePurchaseProduct}
      onProductEdit={openProductModal}
    />
  )
  );

  const renderFieldsTab = (org: Organization) => (
    activeTab === 'fields' && org && (
    <OrganizationFacilitiesTabContent
      organization={org}
      organizationId={id ?? ''}
      currentUser={user ?? null}
      rentalOrderSlug={org.publicSlug}
      canManageFields={canManageFields}
      showBackButton={!isOrganizationRoleMember}
    />
  )
  );

  const renderDivisionsTab = (org: Organization) => (
    activeTab === 'divisions' && org && (
    <OrganizationDivisionsTabContent
      organization={org}
      canManage={canManageTeams || isOwner}
      onChanged={(divisions) => setOrg((current) => current ? { ...current, divisions } : current)}
    />
  )
  );

  const renderCreateTeamModal = () => (
    <CreateTeamModal
    isOpen={showCreateTeamModal}
    onClose={() => setShowCreateTeamModal(false)}
    currentUser={user}
    organizationId={org?.$id}
    onTeamCreated={async (team) => {
      setShowCreateTeamModal(false);
      if (!team) {
        if (id) await loadOrg(id);
        return;
      }

      setOrg((prev) => {
        if (!prev) return prev;
        return { ...prev, teams: [...(prev.teams ?? []), team] };
      });

      if (id) {
        await loadOrg(id);
      }
    }}
  />
  );

  const renderEditOrganizationModal = () => (
    <CreateOrganizationModal
    isOpen={showEditOrganizationModal}
    onClose={() => setShowEditOrganizationModal(false)}
    currentUser={user!}
    organization={org}
    onUpdated={async (updatedOrg) => {
      setOrg(updatedOrg);
      if (id) {
        await loadOrg(id);
      }
    }}
  />
  );

  const renderEventTemplatePicker = () => (
    <Modal
    opened={eventTemplateCreateModalOpen}
    onClose={() => setEventTemplateCreateModalOpen(false)}
    title="Create event"
    centered
  >
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Choose a template to prefill the new event or start with a blank event.
      </Text>
      <Select
        label="Event template"
        placeholder={eventTemplatesLoading ? 'Loading templates...' : 'Select a template'}
        data={eventTemplateOptions}
        value={selectedCreateEventTemplateId}
        onChange={setSelectedCreateEventTemplateId}
        searchable
        clearable
        disabled={eventTemplatesLoading || eventTemplateOptions.length === 0}
        nothingFoundMessage="No templates found"
      />
      {eventTemplatesError && (
        <Text size="sm" c="red">
          {eventTemplatesError}
        </Text>
      )}
      {!eventTemplatesLoading && eventTemplateOptions.length === 0 && (
        <Text size="sm" c="dimmed">
          No event templates yet. You can still create a blank event.
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={() => setEventTemplateCreateModalOpen(false)}>
          Cancel
        </Button>
        <Button variant="default" onClick={handleCreateEventWithoutTemplate}>
          Start blank
        </Button>
        <Button onClick={handleCreateEventWithTemplate} disabled={!selectedCreateEventTemplateId}>
          Use template
        </Button>
      </Group>
    </Stack>
  </Modal>
  );

  const renderTemplateBuilder = () => (
    <Modal
    opened={templateBuilderOpen && Boolean(templateEmbedUrl)}
    onClose={closeTemplateBuilder}
    centered
    size="75vw"
    title="BoldSign Template Builder"
    styles={{
      content: {
        width: '75vw',
        maxWidth: '75vw',
        height: '90vh',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      },
      body: {
        flex: 1,
        minHeight: 0,
        padding: 0,
      },
    }}
  >
    {templateEmbedUrl ? (
      <div style={{ height: '100%', minHeight: 0 }}>
        <iframe
          src={templateEmbedUrl}
          title="BoldSign Template Builder"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    ) : (
      <Text size="sm" c="dimmed" p="md">Preparing builder...</Text>
    )}
  </Modal>
  );

  const renderTemplatePreview = () => (
    <Modal
    opened={Boolean(previewTemplate)}
    onClose={() => setPreviewTemplate(null)}
    centered
    size="lg"
    title={previewTemplate ? `Preview: ${previewTemplate.title || 'Untitled Template'}` : 'Preview template'}
  >
    {previewTemplate ? (
      <Stack gap="sm">
        <Group justify="space-between" align="center" gap="sm">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text size="sm" c="dimmed">
              Preview only. This will not record a signature.
            </Text>
            <Text size="xs" c="dimmed">
              {previewTemplate.signOnce ? 'Sign once per participant' : 'Sign for every event'}
            </Text>
            <Text size="xs" c="dimmed">
              Required signer: {getRequiredSignerTypeLabel(previewTemplate.requiredSignerType)}
            </Text>
          </Stack>
          {previewTemplate.type === 'TEXT' && (
            <SegmentedControl
              value={previewMode}
              onChange={(value) => {
                setPreviewMode(value as 'read' | 'sign');
                setPreviewAccepted(false);
                setPreviewSignComplete(false);
              }}
              data={[
                { label: 'Signing', value: 'sign' },
                { label: 'Read', value: 'read' },
              ]}
            />
          )}
        </Group>

        {previewTemplate.type !== 'TEXT' || previewMode === 'read' ? (
          <Paper
            withBorder
            p="md"
            radius="md"
            style={{ maxHeight: '65vh', overflowY: 'auto' }}
          >
            <Text style={{ whiteSpace: 'pre-wrap' }}>
              {previewTemplate.content || 'No waiver text provided.'}
            </Text>
          </Paper>
        ) : previewSignComplete ? (
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Text fw={600}>Preview complete</Text>
              <Text size="sm" c="dimmed">
                In the real flow, we would now record the signature and continue to the next required document.
              </Text>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="default"
                  onClick={() => {
                    setPreviewAccepted(false);
                    setPreviewSignComplete(false);
                  }}
                >
                  Start over
                </Button>
                <Button onClick={() => setPreviewTemplate(null)}>
                  Close
                </Button>
              </Group>
            </Stack>
          </Paper>
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Document 1 of 1{previewTemplate.title ? ` • ${previewTemplate.title}` : ''}
            </Text>
            <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {previewTemplate.content || 'No waiver text provided.'}
              </Text>
            </Paper>
            <Checkbox
              label="I agree to the waiver above."
              checked={previewAccepted}
              onChange={(event) => setPreviewAccepted(event.currentTarget.checked)}
            />
            <Group justify="flex-end">
              <Button
                onClick={() => setPreviewSignComplete(true)}
                disabled={!previewAccepted}
              >
                Accept and continue
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    ) : null}
  </Modal>
  );

  const renderTextTemplateEditor = () => (
    <Modal
    opened={Boolean(editingTextTemplate)}
    onClose={() => setEditingTextTemplate(null)}
    centered
    size="lg"
    title={editingTextTemplate
      ? `Edit Version ${editingTextTemplate.versionSequence}`
      : 'Edit text template'}
  >
    {editingTextTemplate ? (
      <Stack gap="sm">
        {editingTextTemplate.frozenAt && (
          <Text size="sm" c="orange">
            This Version is frozen. Saving text changes creates the next Version and keeps existing assignments pinned.
          </Text>
        )}
        <TextInput label="Requirement title" value={textEditTitle} onChange={(event) => setTextEditTitle(event.currentTarget.value)} />
        <Textarea
          label="Requirement description"
          value={textEditDescription}
          onChange={(event) => setTextEditDescription(event.currentTarget.value)}
          minRows={2}
        />
        <Textarea
          label="Text content"
          value={textEditContent}
          onChange={(event) => setTextEditContent(event.currentTarget.value)}
          minRows={10}
          required
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setEditingTextTemplate(null)} disabled={savingTemplateVersion}>
            Cancel
          </Button>
          <Button onClick={() => void handleSaveTextTemplate()} loading={savingTemplateVersion}>
            Save Version
          </Button>
        </Group>
      </Stack>
    ) : null}
  </Modal>
  );

  const renderSignedTextPreview = () => (
    <Modal
    opened={Boolean(previewSignedTextDocument)}
    onClose={() => setPreviewSignedTextDocument(null)}
    centered
    size="lg"
    title={previewSignedTextDocument ? `Signed text: ${previewSignedTextDocument.title}` : 'Signed text'}
  >
    {previewSignedTextDocument ? (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {previewSignedTextDocument.signedAt
            ? `Signed at ${formatSummaryDateTime(previewSignedTextDocument.signedAt)}`
            : 'Signed time unavailable.'}
        </Text>
        {previewSignedTextDocument.eventName && (
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm" c="dimmed">Event: {previewSignedTextDocument.eventName}</Text>
            {previewSignedTextDocument.eventId && (
              <Button
                size="xs"
                variant="light"
                onClick={() => openOrganizationEvent(previewSignedTextDocument.eventId as string)}
              >
                View event
              </Button>
            )}
          </Group>
        )}
        <Paper withBorder p="md" radius="md" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <Text style={{ whiteSpace: 'pre-wrap' }}>
            {previewSignedTextDocument.content || 'No text content is available for this signed record.'}
          </Text>
        </Paper>
      </Stack>
    ) : null}
  </Modal>
  );

  const renderDocumentVoidModal = () => (
    <Modal
    opened={Boolean(customerDocumentToVoid)}
    onClose={closeCustomerDocumentVoidModal}
    centered
    title={customerDocumentToVoid ? `Void ${customerDocumentToVoid.title}` : 'Void imported document'}
  >
    {customerDocumentToVoid ? (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Voiding removes this evidence from requirement completion. It keeps the document and its audit trail.
        </Text>
        <PasswordInput
          label="Confirm your password"
          description="Enter a password or use a recent provider sign-in."
          value={customerDocumentVoidPassword}
          onChange={(event) => {
            setCustomerDocumentVoidPassword(event.currentTarget.value);
            setIsRecentProviderAuthUsed(false);
          }}
        />
        <Button
          variant="subtle"
          size="xs"
          onClick={() => {
            setCustomerDocumentVoidPassword('');
            setIsRecentProviderAuthUsed(true);
          }}
          disabled={isVoidingCustomerDocument}
        >
          Use recent provider sign-in
        </Button>
        {isRecentProviderAuthUsed ? (
          <Text size="xs" c="dimmed">
            This uses a provider login from the last ten minutes.
          </Text>
        ) : null}
        <Select
          label="Void reason"
          data={DOCUMENT_VOID_REASON_OPTIONS.map((reason) => ({ value: reason, label: reason }))}
          value={customerDocumentVoidReason}
          onChange={setCustomerDocumentVoidReason}
          allowDeselect={false}
          searchable
          required
        />
        <Textarea
          label="Note"
          description="A note is required for Other."
          value={customerDocumentVoidNote}
          onChange={(event) => setCustomerDocumentVoidNote(event.currentTarget.value)}
          minRows={3}
          maxLength={1000}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => closeCustomerDocumentVoidModal()}
            disabled={isVoidingCustomerDocument}
          >
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => void handleVoidCustomerDocument()}
            loading={isVoidingCustomerDocument}
            disabled={
              !customerDocumentVoidReason
              || (!customerDocumentVoidPassword.trim() && !isRecentProviderAuthUsed)
            }
          >
            Void document
          </Button>
        </Group>
      </Stack>
    ) : null}
  </Modal>
  );

  const renderDocumentAuditModal = () => (
    <Modal
    opened={Boolean(customerDocumentAuditTarget)}
    onClose={() => {
      if (!isLoadingCustomerDocumentAudit) {
        setCustomerDocumentAuditTarget(null);
        setCustomerDocumentAuditTrail(null);
      }
    }}
    centered
    size="lg"
    title={customerDocumentAuditTarget
      ? `Audit trail: ${customerDocumentAuditTarget.title}`
      : 'Document audit trail'}
  >
    {isLoadingCustomerDocumentAudit ? (
      <Group justify="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">Loading audit trail...</Text>
      </Group>
    ) : customerDocumentAuditTrail ? (
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {customerDocumentAuditTrail.description}
        </Text>
        <Paper withBorder p="sm" radius="md">
          <Stack gap={4}>
            <Text fw={600}>Imported evidence</Text>
            <Text size="sm">Document: {customerDocumentAuditTrail.evidence.documentName}</Text>
            <Text size="sm">Provenance: {customerDocumentAuditTrail.evidence.provenance}</Text>
            <Text size="sm">Lifecycle status: {customerDocumentAuditTrail.evidence.status || 'Unknown'}</Text>
            <Text size="sm">
              Historical signing date:{' '}
              {customerDocumentAuditTrail.evidence.historicalSigningDate
                ? formatSummaryDateTime(customerDocumentAuditTrail.evidence.historicalSigningDate)
                : 'Signing date unknown'}
            </Text>
            <Text size="sm">
              Imported: {formatSummaryDateTime(customerDocumentAuditTrail.evidence.importedAt ?? undefined)}
            </Text>
            <Text size="sm">
              Uploader:{' '}
              {customerDocumentAuditTrail.evidence.uploader?.displayName || 'Former user'}
            </Text>
            <Text size="sm">
              Attestation version: {customerDocumentAuditTrail.evidence.attestationVersion || 'Not recorded'}
            </Text>
            <Text size="sm">
              Content identity: {customerDocumentAuditTrail.evidence.contentHash || 'Not recorded'}
            </Text>
            {customerDocumentAuditTrail.evidence.attestationText ? (
              <Text
                size="sm"
                component="pre"
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                Attestation: {customerDocumentAuditTrail.evidence.attestationText}
              </Text>
            ) : null}
            {customerDocumentAuditTrail.evidence.sourceNote ? (
              <Text
                size="sm"
                component="pre"
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                Source note: {customerDocumentAuditTrail.evidence.sourceNote}
              </Text>
            ) : null}
          </Stack>
        </Paper>
        <Text fw={600}>Audit trail events</Text>
        {customerDocumentAuditTrail.events.length > 0 ? (
          <Stack gap="sm">
            {customerDocumentAuditTrail.events.map((event) => (
              <Paper key={event.id} withBorder p="sm" radius="md">
                <Stack gap={4}>
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Badge size="sm" variant="light">{event.eventType}</Badge>
                    <Text size="xs" c="dimmed">{formatSummaryDateTime(event.createdAt ?? undefined)}</Text>
                  </Group>
                  {event.actorUserId && (
                    <Text size="xs" c="dimmed">
                      Actor: {event.actorDisplayName || 'Former user'}
                    </Text>
                  )}
                  {event.reason && <Text size="sm">Reason: {event.reason}</Text>}
                  {event.note && <Text size="sm">Note: {event.note}</Text>}
                  {event.payload !== undefined && event.payload !== null && (
                    <Text
                      size="xs"
                      component="pre"
                      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    >
                      {JSON.stringify(event.payload, null, 2)}
                    </Text>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No audit events found.</Text>
        )}
      </Stack>
    ) : (
      <Text size="sm" c="dimmed">No audit trail found.</Text>
    )}
  </Modal>
  );

  const renderCustomerBillModal = () => (
    <Modal
    opened={customerBillModalOpen}
    onClose={closeCustomerBillModal}
    title={selectedOrganizationCustomer
      ? `${editingCustomerBill ? 'Edit' : 'Add'} bill for ${selectedOrganizationCustomer.name}`
      : `${editingCustomerBill ? 'Edit' : 'Add'} bill`}
    centered
  >
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Record the bill amount, paid amount, and due date for this customer.
      </Text>
      <TextInput
        label="Bill description"
        value={customerBillLabel}
        onChange={(event) => setCustomerBillLabel(event.currentTarget.value)}
        required
      />
      <Group grow align="flex-start">
        <NumberInput
          label="Bill amount"
          prefix="$"
          min={0}
          decimalScale={2}
          fixedDecimalScale
          value={customerBillAmount}
          onChange={setCustomerBillAmount}
          required
        />
        <NumberInput
          label="Paid amount"
          prefix="$"
          min={0}
          max={customerBillAmountCents > 0 ? customerBillAmountCents / 100 : undefined}
          decimalScale={2}
          fixedDecimalScale
          value={customerBillPaidAmount}
          onChange={setCustomerBillPaidAmount}
          error={customerBillPaidAmountError}
          required
        />
      </Group>
      <TextInput
        label="Due date"
        type="date"
        value={customerBillDueDate}
        onChange={(event) => setCustomerBillDueDate(event.currentTarget.value)}
        required
      />
      <Text size="xs" c="dimmed">
        Remaining balance: {formatPrice(Math.max(0, customerBillAmountCents - customerBillPaidAmountCents))}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={closeCustomerBillModal} disabled={creatingCustomerBill}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateCustomerBill}
          loading={creatingCustomerBill}
          disabled={
            !customerBillLabel.trim()
            || !customerBillDueDate
            || !Number.isFinite(customerBillAmountCents)
            || customerBillAmountCents <= 0
            || !Number.isFinite(customerBillPaidAmountCents)
            || customerBillPaidAmountCents < 0
            || customerBillPaidAmountCents > customerBillAmountCents
          }
        >
          {editingCustomerBill ? 'Save changes' : 'Add bill'}
        </Button>
      </Group>
    </Stack>
  </Modal>
  );

  const renderCustomerImportModal = () => (
    <Modal
    opened={isCustomerImportModalOpen}
    onClose={closeCustomerImportModal}
    title={selectedOrganizationCustomer
      ? `Import signed document for ${selectedOrganizationCustomer.name}`
      : 'Import signed document'}
    centered
    size="lg"
  >
    {selectedOrganizationCustomer?.user ? (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Upload a complete PDF that the customer signed outside BracketIQ. Review the full file before you attest to it.
        </Text>
        <Select
          label="Document Requirement and Template Version"
          data={customerImportTemplateOptions}
          value={selectedCustomerImportTemplateId}
          onChange={handleCustomerImportTemplateChange}
          searchable
          allowDeselect={false}
          nothingFoundMessage="No document requirement versions found"
          required
        />
        {selectedCustomerImportTemplate?.signOnce ? (
          <Text size="sm" c="dimmed">
            Applies to: This Organization
          </Text>
        ) : (
          <Select
            label="Event"
            data={customerImportScopeOptions}
            value={selectedCustomerImportScopeId}
            onChange={setSelectedCustomerImportScopeId}
            searchable
            allowDeselect={false}
            nothingFoundMessage="No eligible events found"
            required
          />
        )}
        <FileInput
          label="Signed PDF"
          placeholder="Choose a PDF"
          accept="application/pdf"
          value={customerImportFile}
          onChange={handleCustomerImportFileChange}
          clearable
          required
        />
        {customerImportPreviewUrl ? (
          <Paper withBorder p="xs" radius="md">
            <iframe
              ref={customerImportPreviewFrameRef}
              title="Imported signed document preview"
              src={customerImportPreviewUrl}
              onLoad={() => setIsCustomerImportPreviewReady(true)}
              style={{ width: '100%', height: '52vh', border: 0 }}
            />
          </Paper>
        ) : (
          <Text size="xs" c="dimmed">
            Choose a PDF to review the complete file here.
          </Text>
        )}
        <TextInput
          label="Historical signing date (optional)"
          type="date"
          value={customerImportHistoricalSigningDate}
          onChange={(event) => setCustomerImportHistoricalSigningDate(event.currentTarget.value)}
        />
        <Textarea
          label="Private source note (optional)"
          description="Only authorized staff can view this note."
          value={customerImportSourceNote}
          onChange={(event) => setCustomerImportSourceNote(event.currentTarget.value)}
          minRows={2}
          maxRows={5}
          autosize
        />
        <Checkbox
          checked={isCustomerImportAttestationAccepted}
          onChange={(event) => setIsCustomerImportAttestationAccepted(event.currentTarget.checked)}
          disabled={!isCustomerImportPreviewReady}
          label="Document Import Attestation"
          description="I confirm that this file is a complete signed document for the shown customer, Document Template Version, and scope. I confirm that it contains all required signatures. I understand that BracketIQ did not verify the signatures."
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => closeCustomerImportModal()} disabled={isImportingCustomerDocument}>
            Cancel
          </Button>
          <Button
            onClick={handleImportCustomerDocument}
            loading={isImportingCustomerDocument}
            disabled={
              !selectedCustomerImportTemplateId
              || !selectedCustomerImportScopeId
              || !customerImportFile
              || !isCustomerImportPreviewReady
              || !isCustomerImportAttestationAccepted
            }
          >
            Import signed document
          </Button>
        </Group>
      </Stack>
    ) : (
      <Text size="sm" c="dimmed">Select a User customer before importing a document.</Text>
    )}
  </Modal>
  );

  const renderCustomerDocumentModal = () => (
    <Modal
    opened={customerDocumentModalOpen}
    onClose={closeCustomerDocumentModal}
    title={selectedOrganizationCustomer ? `Add document for ${selectedOrganizationCustomer.name}` : 'Add document'}
    centered
  >
    {selectedOrganizationCustomer?.user ? (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Choose a participant document template. An event is optional for text documents.
        </Text>
        <Select
          label="Document template"
          data={customerDocumentTemplateOptions}
          value={selectedCustomerDocumentTemplateId}
          onChange={setSelectedCustomerDocumentTemplateId}
          searchable
          allowDeselect={false}
          nothingFoundMessage="No participant templates found"
        />
        <Select
          label={selectedCustomerDocumentRequiresEvent ? 'Event' : 'Event (optional for text documents)'}
          data={selectedOrganizationCustomer.user.events.map((event) => ({
            value: event.eventId,
            label: `${event.eventName} • ${formatSummaryDateTime(event.start)}`,
          }))}
          value={selectedCustomerDocumentEventId}
          onChange={setSelectedCustomerDocumentEventId}
          searchable
          clearable
          allowDeselect
          nothingFoundMessage="No organization events found"
        />
        {selectedCustomerDocumentRequiresEvent && !selectedCustomerDocumentEventId && (
          <Text size="xs" c="dimmed">PDF documents use BoldSign and require an event.</Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCustomerDocumentModal} disabled={sendingCustomerDocument}>
            Cancel
          </Button>
          <Button
            onClick={handleAddCustomerDocument}
            loading={sendingCustomerDocument}
            disabled={
              !selectedCustomerDocumentTemplateId
              || (selectedCustomerDocumentRequiresEvent && !selectedCustomerDocumentEventId)
            }
          >
            Add document
          </Button>
        </Group>
      </Stack>
    ) : (
      <Text size="sm" c="dimmed">Select a player before adding a document.</Text>
    )}
  </Modal>
  );

  const renderCreateTemplateModal = () => (
    <Modal
    opened={templateModalOpen}
    onClose={() => setTemplateModalOpen(false)}
    title="Create template"
    centered
  >
    <Stack gap="sm">
      <TextInput
        label="Template title"
        value={templateTitle}
        onChange={(e) => setTemplateTitle(e.currentTarget.value)}
        required
      />
      <SegmentedControl
        value={templateType}
        onChange={(value) => setTemplateType(value as 'PDF' | 'TEXT')}
        data={[
          { label: 'PDF (BoldSign)', value: 'PDF' },
          { label: 'Text waiver', value: 'TEXT' },
        ]}
      />
      <Textarea
        label="Description"
        value={templateDescription}
        onChange={(e) => setTemplateDescription(e.currentTarget.value)}
        minRows={3}
      />
      {templateType === 'PDF' && (
        <FileInput
          label="PDF file"
          placeholder="Upload a PDF template"
          accept="application/pdf,.pdf"
          value={templatePdfFile}
          onChange={setTemplatePdfFile}
          clearable
          required
        />
      )}
      {templateType === 'TEXT' && (
        <Textarea
          label="Waiver text"
          value={templateContent}
          onChange={(e) => setTemplateContent(e.currentTarget.value)}
          minRows={6}
          required
        />
      )}
      <Select
        label="Required signer"
        value={templateRequiredSignerType}
        onChange={(value) => {
          setTemplateRequiredSignerType(
            normalizeRequiredSignerType(value) as
              'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD',
          );
        }}
        data={[
          { label: 'Participant', value: 'PARTICIPANT' },
          { label: 'Parent/Guardian', value: 'PARENT_GUARDIAN' },
          { label: 'Child', value: 'CHILD' },
          { label: 'Parent/Guardian + Child', value: 'PARENT_GUARDIAN_CHILD' },
        ]}
        allowDeselect={false}
        required
      />
      <Switch
        label="Sign once per participant"
        checked={templateSignOnce}
        onChange={(e) => setTemplateSignOnce(e.currentTarget.checked)}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => setTemplateModalOpen(false)}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateTemplate}
          loading={creatingTemplate}
          disabled={!templateTitle.trim() || (templateType === 'PDF' && !templatePdfFile)}
        >
          Create
        </Button>
      </Group>
    </Stack>
  </Modal>
  );

  const renderProductEditor = () => (
    <OrganizationProductEditorModal
    opened={productModalOpen}
    selectedProduct={selectedProduct}
    organizationHasStripeAccount={organizationHasStripeAccount}
    editProductName={editProductName}
    onEditProductNameChange={setEditProductName}
    editProductDescription={editProductDescription}
    onEditProductDescriptionChange={setEditProductDescription}
    editProductPeriod={editProductPeriod}
    onEditProductPeriodChange={handleEditProductPeriodChange}
    editProductType={editProductType}
    onEditProductTypeChange={(value) => setEditProductType((value as ProductType) ?? defaultProductTypeForPeriod(editProductPeriod))}
    editProductPriceCents={editProductPriceCents}
    onEditProductPriceChange={setEditProductPriceCents}
    canUpdateProduct={canUpdateProduct}
    updatingProduct={updatingProduct}
    deletingProduct={deletingProduct}
    onClose={closeProductModal}
    onSave={handleUpdateProduct}
    onDelete={handleDeleteProduct}
  />
  );

  const renderProductBillingAddress = () => (
    <BillingAddressModal
    opened={showBillingAddressModal}
    onClose={() => {
      setShowBillingAddressModal(false);
      setPurchaseProduct(null);
    }}
    onSaved={async (billingAddress) => {
      if (!purchaseProduct) {
        setShowBillingAddressModal(false);
        return;
      }
      await startProductCheckout(purchaseProduct, billingAddress, purchaseDiscountCode);
    }}
    title="Billing address required"
    description="Enter your billing address so tax can be calculated before checkout."
  />
  );

  const renderProductPayment = () => (
    <PaymentModal
    isOpen={showPurchaseModal && Boolean(purchaseProduct && purchasePaymentData)}
    onClose={() => {
      setShowPurchaseModal(false);
      setPurchasePaymentData(null);
      setPurchaseProduct(null);
    }}
    event={{
      name: purchaseProduct?.name ?? 'Product',
      location: org?.name ?? '',
      eventType: 'EVENT',
      price: purchaseProduct?.priceCents ?? 0,
    } as any}
    paymentData={purchasePaymentData}
    onPaymentSuccess={handleProductPaymentSuccess}
  />
  );

  return (
    <>
      <Navigation />
      <OrganizationManagementShell
        organization={org}
        status={shellStatus}
        availableTabs={availableTabs}
        activeTab={activeTab}
        onTabChange={handleOrganizationTabChange}
        onRetry={() => { if (id) void loadOrg(id); }}
        errorMessage={organizationLoadError}
        onBackToOrganizations={() => router.push('/organizations')}
        headerBadges={org ? <OrganizationVerificationBadge organization={org} /> : null}
        headerActions={org ? <OrganizationClaimButton organization={org} /> : null}
        onShareOrganization={() => { void handleShareOrganization(); }}
        canEditOrganization={isOwner}
        onEditOrganization={() => setShowEditOrganizationModal(true)}
        canToggleHomePagePreference={canToggleHomePagePreference}
        isCurrentOrganizationHomePage={isCurrentOrganizationHomePage}
        isUpdatingHomePagePreference={updatingHomePagePreference}
        onSetHomePage={(checked) => { void handleSetHomePage(checked); }}
        canCreateEvent={canManageEvents}
        isCreateEventDisabled={!canCreateOrganizationEvents}
        createEventHelperText={createEventHelperText}
        onCreateEvent={handleCreateEvent}
        isOverviewEmpty={overviewEmpty}
        isTabLoading={isActiveTabLoading}
      >
        <div className="org-tab-content">
        {org ? (
          <>
            {renderOverviewTab(org)}

            {renderReviewsTab(org)}

            {renderEventsTab(org)}

            {renderEventTemplatesTab(org)}

            {renderTeamsTab(org)}

            {renderUsersTab(org)}

            {renderTemplatesTab(org)}
            {renderStaffTab(org)}

            {renderDiscountsTab(org)}

            {renderFinanceTab(org)}

            {renderRefundsTab(org)}

            {renderPublicPageTab(org)}

            {renderStoreTab(org)}

            {renderFieldsTab(org)}
            {renderDivisionsTab(org)}
          </>
        ) : null}
        </div>
      </OrganizationManagementShell>

      {/* Modals */}
      {renderCreateTeamModal()}
      {renderEditOrganizationModal()}
      {renderEventTemplatePicker()}
      {renderTemplateBuilder()}
      {renderTemplatePreview()}
      {renderTextTemplateEditor()}
      {renderSignedTextPreview()}
      {renderDocumentVoidModal()}
      {renderDocumentAuditModal()}
      {renderCustomerBillModal()}
      {renderCustomerImportModal()}
      {renderCustomerDocumentModal()}
      {renderCreateTemplateModal()}
      {renderProductEditor()}
      {renderProductBillingAddress()}
      {renderProductPayment()}
    </>
  );
}

