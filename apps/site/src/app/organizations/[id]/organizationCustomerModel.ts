import type { BillDiscountSummary } from "@/types";

export type OrganizationUserEventSummary = {
  eventId: string;
  eventName: string;
  imageId?: string | null;
  start?: string;
  end?: string;
  status?: string;
  organizationId?: string | null;
};

export type OrganizationUserDocumentSummary = {
  signedDocumentRecordId: string;
  documentId: string;
  templateId: string;
  documentRequirementTitle?: string;
  versionSequence?: number;
  eventId?: string;
  eventName?: string;
  teamId?: string;
  title: string;
  type: "PDF" | "TEXT";
  provenance?: string;
  status?: string;
  signedAt?: string;
  historicalSigningDate?: string;
  scopeType?: string;
  scopeId?: string;
  viewUrl?: string;
  content?: string;
};

export type OrganizationTeamMembershipSummary = {
  teamId: string;
  teamName: string;
  division?: string;
  sport?: string;
  status?: string;
  rosterRole?: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain: boolean;
};

export type OrganizationUserSummary = {
  userId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  events: OrganizationUserEventSummary[];
  documents: OrganizationUserDocumentSummary[];
  bills: OrganizationBillSummary[];
  teams: OrganizationTeamMembershipSummary[];
};

export type OrganizationCustomerTypeFilter = "users" | "teams";

export type OrganizationTeamRegistrationSummary =
  OrganizationUserEventSummary & {
    eventTeamId: string;
    eventTeamName: string;
    division?: string;
    sport?: string;
    memberCount: number;
    billIds: string[];
    totalAmountCents: number;
    paidAmountCents: number;
    originalAmountCents: number;
    discountAmountCents: number;
    discountedAmountCents: number;
  };

export type OrganizationBillPaymentSummary = {
  paymentId: string;
  billId: string;
  sequence: number;
  dueDate?: string;
  amountCents: number;
  paidAmountCents: number;
  status?: string;
  paidAt?: string;
  paymentIntentId?: string | null;
  payerUserId?: string | null;
  refundedAmountCents: number;
  refundableAmountCents: number;
  isRefundable: boolean;
};

export type OrganizationBillSummary = {
  billId: string;
  ownerType: "USER" | "TEAM";
  ownerId: string;
  ownerName: string;
  eventId?: string | null;
  sourceType?: string | null;
  label?: string;
  eventName?: string;
  parentBillId?: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents: number;
  discountAmountCents: number;
  discountedAmountCents: number;
  discounts: BillDiscountSummary[];
  refundedAmountCents: number;
  refundableAmountCents: number;
  status?: string;
  allowSplit?: boolean | null;
  paymentPlanEnabled?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
  payments: OrganizationBillPaymentSummary[];
};

export type OrganizationTeamMemberSummary = {
  userId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  status?: string;
  rosterRole?: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain: boolean;
  bills: OrganizationBillSummary[];
  documents: OrganizationUserDocumentSummary[];
};

export type OrganizationTeamStaffSummary = {
  userId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  role: "MANAGER" | "HEAD_COACH" | "ASSISTANT_COACH";
  status?: string;
};

export type OrganizationTeamCustomerSummary = {
  canonicalTeamId: string;
  name: string;
  division?: string;
  sport?: string;
  profileImageId?: string | null;
  memberCount: number;
  teamSize?: number;
  captainId?: string;
  manager?: OrganizationTeamStaffSummary | null;
  headCoach?: OrganizationTeamStaffSummary | null;
  assistantCoaches: OrganizationTeamStaffSummary[];
  members: OrganizationTeamMemberSummary[];
  registrations: OrganizationTeamRegistrationSummary[];
  documents: OrganizationUserDocumentSummary[];
  bills: OrganizationBillSummary[];
  totals: {
    totalAmountCents: number;
    paidAmountCents: number;
    refundedAmountCents: number;
    refundableAmountCents: number;
  };
};

export type OrganizationCustomerRow = {
  key: string;
  type: OrganizationCustomerTypeFilter;
  id: string;
  name: string;
  subtitle?: string;
  profileImageId?: string | null;
  events: OrganizationUserEventSummary[];
  user?: OrganizationUserSummary;
  team?: OrganizationTeamCustomerSummary;
};

type CustomerApiRow = Record<string, unknown>;

const record = (value: unknown): CustomerApiRow => {
  if (value !== null && typeof value === "object")
    return value as CustomerApiRow;
  return {};
};
const rows = (value: unknown): CustomerApiRow[] =>
  Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const nullableText = (value: unknown): string | null => text(value) ?? null;
const trimmedText = (value: unknown): string | undefined =>
  text(value)?.trim() || undefined;
const id = (value: unknown): string => String(value ?? "");
const number = (value: unknown, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const count = (value: unknown, fallback = 0): number =>
  Number.isFinite(Number(value))
    ? Math.max(0, Math.round(Number(value)))
    : fallback;
const optionalCount = (value: unknown): number | undefined =>
  Number.isFinite(Number(value)) ? count(value) : undefined;
const optionalBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function mapDocument(value: unknown): OrganizationUserDocumentSummary {
  const row = record(value);
  return {
    signedDocumentRecordId: id(row.signedDocumentRecordId),
    documentRequirementTitle: trimmedText(row.documentRequirementTitle),
    documentId: id(row.documentId),
    templateId: id(row.templateId),
    versionSequence:
      typeof row.versionSequence === "number" ? row.versionSequence : undefined,
    eventId: text(row.eventId),
    eventName: text(row.eventName),
    teamId: text(row.teamId),
    title: trimmedText(row.title) ?? "Signed Document",
    type: row.type === "TEXT" ? "TEXT" : "PDF",
    provenance: text(row.provenance),
    status: text(row.status),
    signedAt: text(row.signedAt),
    historicalSigningDate: text(row.historicalSigningDate),
    scopeType: text(row.scopeType),
    scopeId: text(row.scopeId),
    viewUrl: text(row.viewUrl),
    content: text(row.content),
  };
}

function mapDocuments(value: unknown): OrganizationUserDocumentSummary[] {
  return rows(value)
    .map(mapDocument)
    .filter((document) => Boolean(document.signedDocumentRecordId));
}

function mapEventDetails(row: CustomerApiRow): OrganizationUserEventSummary {
  return {
    eventId: id(row.eventId),
    eventName:
      String(row.eventName ?? "Untitled Event").trim() || "Untitled Event",
    imageId: trimmedText(row.imageId) ?? null,
    start: text(row.start),
    end: text(row.end),
    status: text(row.status),
  };
}

function mapEvent(row: CustomerApiRow): OrganizationUserEventSummary {
  return {
    ...mapEventDetails(row),
    organizationId: nullableText(row.organizationId),
  };
}

function mapMembership(row: CustomerApiRow): OrganizationTeamMembershipSummary {
  return {
    teamId: id(row.teamId),
    teamName: trimmedText(row.teamName) ?? "Unnamed Team",
    division: text(row.division),
    sport: text(row.sport),
    status: text(row.status),
    rosterRole: text(row.rosterRole),
    jerseyNumber: nullableText(row.jerseyNumber),
    position: nullableText(row.position),
    isCaptain: Boolean(row.isCaptain),
  };
}

function mapPerson(row: CustomerApiRow, unavailableName: string) {
  return {
    userId: id(row.userId),
    firstName: text(row.firstName),
    lastName: text(row.lastName),
    fullName: trimmedText(row.fullName) ?? unavailableName,
    userName: text(row.userName),
    profileImageId: nullableText(row.profileImageId),
  };
}

export function mapOrganizationUserRow(
  value: unknown,
): OrganizationUserSummary {
  const row = record(value);
  return {
    ...mapPerson(row, "Unknown User"),
    events: rows(row.events)
      .map(mapEvent)
      .filter((event) => Boolean(event.eventId)),
    documents: mapDocuments(row.documents),
    bills: mapBills(row.bills),
    teams: rows(row.teams)
      .map(mapMembership)
      .filter((team) => Boolean(team.teamId)),
  };
}

function mapStaff(value: unknown): OrganizationTeamStaffSummary {
  const row = record(value);
  return {
    ...mapPerson(row, "Staff name unavailable"),
    role:
      row.role === "HEAD_COACH"
        ? "HEAD_COACH"
        : row.role === "ASSISTANT_COACH"
          ? "ASSISTANT_COACH"
          : "MANAGER",
    status: text(row.status),
  };
}

function optionalStaff(value: unknown): OrganizationTeamStaffSummary | null {
  return value !== null && typeof value === "object" ? mapStaff(value) : null;
}

function mapMember(row: CustomerApiRow): OrganizationTeamMemberSummary {
  return {
    ...mapPerson(row, "Staff name unavailable"),
    status: text(row.status),
    rosterRole: text(row.rosterRole),
    jerseyNumber: nullableText(row.jerseyNumber),
    position: nullableText(row.position),
    isCaptain: Boolean(row.isCaptain),
    bills: mapBills(row.bills),
    documents: mapDocuments(row.documents),
  };
}

function mapPayment(
  row: CustomerApiRow,
  billId: unknown,
): OrganizationBillPaymentSummary {
  return {
    paymentId: id(row.paymentId ?? row.id),
    billId: id(row.billId ?? billId),
    sequence: number(row.sequence),
    dueDate: text(row.dueDate),
    amountCents: count(row.amountCents),
    paidAmountCents: count(
      row.paidAmountCents,
      row.status === "PAID" ? count(row.amountCents) : 0,
    ),
    status: text(row.status),
    paidAt: text(row.paidAt),
    paymentIntentId: nullableText(row.paymentIntentId),
    payerUserId: nullableText(row.payerUserId),
    refundedAmountCents: count(row.refundedAmountCents),
    refundableAmountCents: count(row.refundableAmountCents),
    isRefundable: Boolean(row.isRefundable),
  };
}

function mapDiscount(row: CustomerApiRow): BillDiscountSummary {
  return {
    id: id(row.id),
    discountId: id(row.discountId),
    discountCodeId: id(row.discountCodeId),
    code: id(row.code),
    name: nullableText(row.name),
    originalAmountCents: count(row.originalAmountCents),
    discountedAmountCents: count(row.discountedAmountCents),
    discountAmountCents: count(row.discountAmountCents),
    paymentIntentId: nullableText(row.paymentIntentId),
    registrationId: nullableText(row.registrationId),
  };
}

function mapBillAmounts(row: CustomerApiRow) {
  const totalAmountCents = count(row.totalAmountCents);
  const originalAmountCents = count(row.originalAmountCents, totalAmountCents);
  const discountAmountCents = count(row.discountAmountCents);
  return {
    totalAmountCents,
    originalAmountCents,
    discountAmountCents,
    paidAmountCents: count(row.paidAmountCents),
    discountedAmountCents: count(
      row.discountedAmountCents,
      Math.max(0, originalAmountCents - discountAmountCents),
    ),
    refundedAmountCents: count(row.refundedAmountCents),
    refundableAmountCents: count(row.refundableAmountCents),
  };
}

function mapBill(row: CustomerApiRow): OrganizationBillSummary {
  return {
    billId: id(row.billId ?? row.id),
    ownerType: row.ownerType === "USER" ? "USER" : "TEAM",
    ownerId: id(row.ownerId),
    ownerName: trimmedText(row.ownerName) ?? "Customer name unavailable",
    eventId: nullableText(row.eventId),
    sourceType: nullableText(row.sourceType),
    eventName: text(row.eventName),
    label: trimmedText(row.label),
    parentBillId: nullableText(row.parentBillId),
    ...mapBillAmounts(row),
    discounts: rows(row.discounts)
      .map(mapDiscount)
      .filter((discount) => Boolean(discount.id)),
    status: text(row.status),
    allowSplit: optionalBoolean(row.allowSplit),
    paymentPlanEnabled: optionalBoolean(row.paymentPlanEnabled),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    payments: rows(row.payments)
      .map((payment) => mapPayment(payment, row.billId))
      .filter((payment) => Boolean(payment.paymentId)),
  };
}

function mapBills(value: unknown): OrganizationBillSummary[] {
  return rows(value)
    .map(mapBill)
    .filter((bill) => Boolean(bill.billId));
}

function mapRegistration(
  row: CustomerApiRow,
): OrganizationTeamRegistrationSummary {
  return {
    ...mapEventDetails(row),
    eventTeamId: id(row.eventTeamId),
    eventTeamName: trimmedText(row.eventTeamName) ?? "Team name unavailable",
    division: text(row.division),
    sport: text(row.sport),
    memberCount: count(row.memberCount),
    billIds: strings(row.billIds),
    totalAmountCents: count(row.totalAmountCents),
    paidAmountCents: count(row.paidAmountCents),
    originalAmountCents: count(row.originalAmountCents),
    discountAmountCents: count(row.discountAmountCents),
    discountedAmountCents: count(row.discountedAmountCents),
  };
}

function mapTotals(value: unknown): OrganizationTeamCustomerSummary["totals"] {
  const row = record(value);
  return {
    totalAmountCents: count(row.totalAmountCents),
    paidAmountCents: count(row.paidAmountCents),
    refundedAmountCents: count(row.refundedAmountCents),
    refundableAmountCents: count(row.refundableAmountCents),
  };
}

export function mapOrganizationTeamCustomerRow(
  value: unknown,
): OrganizationTeamCustomerSummary {
  const row = record(value);
  return {
    canonicalTeamId: id(row.canonicalTeamId),
    name: trimmedText(row.name) ?? "Unnamed Team",
    division: text(row.division),
    sport: text(row.sport),
    profileImageId: nullableText(row.profileImageId),
    memberCount: count(row.memberCount),
    teamSize: optionalCount(row.teamSize),
    captainId: text(row.captainId),
    manager: optionalStaff(row.manager),
    headCoach: optionalStaff(row.headCoach),
    assistantCoaches: rows(row.assistantCoaches)
      .map(mapStaff)
      .filter((staff) => Boolean(staff.userId)),
    members: rows(row.members)
      .map(mapMember)
      .filter((member) => Boolean(member.userId)),
    registrations: rows(row.registrations)
      .map(mapRegistration)
      .filter((registration) => Boolean(registration.eventTeamId)),
    documents: mapDocuments(row.documents),
    bills: mapBills(row.bills),
    totals: mapTotals(row.totals),
  };
}
