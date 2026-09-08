"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from "@/components/organization/organization-operation-ui";
import {
  formatDocumentScopeLabel,
  formatDocumentStatusLabel,
} from "@/lib/profileDocumentService";
import { formatDisplayDate } from "@/lib/dateUtils";
import type { OrganizationUserDocumentSummary as Document } from "./organizationCustomerModel";
import { formatSummaryDate } from "./organizationCustomerPresentation";

type DocumentControls = {
  canViewImportedDocuments: boolean;
  canVoidDocuments: boolean;
  canViewDocumentAudit: boolean;
  onView: (document: Document) => void;
  onVoid: (document: Document) => void;
  onAudit: (document: Document) => void | Promise<void>;
};

function documentAccess(document: Document, controls: DocumentControls) {
  const isImported = document.provenance === "IMPORTED";
  const canView = !isImported || controls.canViewImportedDocuments;
  return {
    canView,
    canViewPdf: canView && document.type === "PDF" && Boolean(document.viewUrl),
    canVoid: isImported && controls.canVoidDocuments,
    canAudit: isImported && controls.canViewDocumentAudit,
  };
}

function documentCardProps(
  document: Document,
  controls: DocumentControls,
  canView: boolean,
) {
  if (!canView) return {};
  return {
    onClick: () => controls.onView(document),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        controls.onView(document);
      }
    },
    role: "button",
    tabIndex: 0,
  };
}

function DocumentBadges({ document }: { document: Document }) {
  const isImported = document.provenance === "IMPORTED";
  const hasVersion = typeof document.versionSequence === "number";
  return (
    <Group gap={6} wrap="wrap">
      <Text size="sm" fw={700}>
        {document.title}
      </Text>
      {isImported && (
        <Badge size="xs" variant="light" color="teal">
          Imported
        </Badge>
      )}
      {(isImported || hasVersion) && (
        <Badge size="xs" variant="light">
          Version {hasVersion ? document.versionSequence : "Unknown"}
        </Badge>
      )}
      {document.status && (
        <Badge
          size="xs"
          variant="light"
          color={document.status.toUpperCase() === "VOID" ? "red" : "blue"}
        >
          {formatDocumentStatusLabel(document.status)}
        </Badge>
      )}
    </Group>
  );
}

function documentSigningDate(document: Document) {
  if (document.provenance !== "IMPORTED")
    return `Signed ${formatSummaryDate(document.signedAt)}`;
  const date = document.historicalSigningDate;
  const label = date
    ? formatDisplayDate(date, { timeZone: "UTC" }) || "unknown"
    : "unknown";
  return `Signing date ${label}`;
}

function DocumentMetadata({ document }: { document: Document }) {
  const requirement =
    document.provenance === "IMPORTED"
      ? document.documentRequirementTitle || "Unavailable"
      : document.documentRequirementTitle || document.title;
  return (
    <Stack gap={2} className="min-w-0">
      <DocumentBadges document={document} />
      <Text size="xs" c="dimmed">
        Requirement: {requirement}
      </Text>
      <Text size="xs" c="dimmed">
        Applies to: {formatDocumentScopeLabel(document.scopeType)}
      </Text>
      <Text size="xs" c="dimmed">
        Status: {formatDocumentStatusLabel(document.status)}
      </Text>
      <Text size="xs" c="dimmed">
        {documentSigningDate(document)}
      </Text>
    </Stack>
  );
}

function DocumentActions({
  document,
  controls,
  access,
}: {
  document: Document;
  controls: DocumentControls;
  access: ReturnType<typeof documentAccess>;
}) {
  if (!access.canViewPdf && !access.canVoid && !access.canAudit) return null;
  const onAction =
    (action: DocumentControls["onAudit"]) =>
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      void action(document);
    };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) =>
    event.stopPropagation();
  return (
    <Group gap={6} mt={4}>
      {access.canViewPdf && (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={onAction(controls.onView)}
          onKeyDown={onKeyDown}
        >
          View PDF
        </Button>
      )}
      {access.canVoid && (
        <Button
          size="compact-xs"
          variant="light"
          color="red"
          disabled={document.status?.toUpperCase() === "VOID"}
          onClick={onAction(controls.onVoid)}
          onKeyDown={onKeyDown}
        >
          Void
        </Button>
      )}
      {access.canAudit && (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={onAction(controls.onAudit)}
          onKeyDown={onKeyDown}
        >
          Audit trail
        </Button>
      )}
    </Group>
  );
}

function CustomerDocumentCard({
  document,
  controls,
}: {
  document: Document;
  controls: DocumentControls;
}) {
  const access = documentAccess(document, controls);
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className="org-customer-detail-item org-customer-document-card"
      {...documentCardProps(document, controls, access.canView)}
    >
      <DocumentMetadata document={document} />
      <DocumentActions
        document={document}
        controls={controls}
        access={access}
      />
    </Paper>
  );
}

export default function OrganizationCustomerDocuments({
  documents,
  controls,
  emptyText = "No documents.",
}: {
  documents: Document[];
  controls: DocumentControls;
  emptyText?: string;
}) {
  if (documents.length === 0)
    return (
      <Text size="xs" c="dimmed">
        {emptyText}
      </Text>
    );
  return (
    <Stack gap={8}>
      {documents.map((document) => (
        <CustomerDocumentCard
          key={document.signedDocumentRecordId}
          document={document}
          controls={controls}
        />
      ))}
    </Stack>
  );
}
