"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@/components/organization/organization-operation-ui";
import type { RefundRequest } from "@/types";
import { formatDisplayDateTime } from "@/lib/dateUtils";
import type { RefundReferences } from "./refundRequestReferences";

type DecisionHandler = (
  refund: RefundRequest,
  status: "APPROVED" | "REJECTED",
) => Promise<void>;
type TableProps = {
  visibleRefunds: RefundRequest[];
  references: RefundReferences;
  isRequesterView: boolean;
  processingId: string | null;
  hostId?: string;
  handleStatusChange: DecisionHandler;
};
type ViewProps = TableProps & {
  title: string;
  description: string;
  showHeader: boolean;
  withContainer: boolean;
  loading: boolean;
  error: string | null;
  actionError: string | null;
};

const formatRefundMoney = (amountCents: number, currency: string) => {
  const normalizedCurrency = currency.trim().toUpperCase() || "USD";
  const amount = Math.max(0, amountCents) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const statusColor = (status?: string) => {
  switch (status) {
    case "APPROVED":
      return "green";
    case "REJECTED":
      return "red";
    default:
      return "yellow";
  }
};

function ReferenceBadge({
  name,
  color,
}: {
  name: string | null;
  color: string;
}) {
  return name ? (
    <Badge variant="light" color={color}>
      {name}
    </Badge>
  ) : (
    <Text size="sm" c="dimmed">
      —
    </Text>
  );
}

function RefundScope({
  approvalPreview,
}: {
  approvalPreview: RefundRequest["approvalPreview"];
}) {
  return (
    <>
      {approvalPreview?.isValid ? (
        <Stack gap={2} miw={220}>
          <Text size="sm" fw={500}>
            {formatRefundMoney(
              approvalPreview.refundableAmountCents,
              approvalPreview.currency,
            )}{" "}
            · {approvalPreview.paymentCount}{" "}
            {approvalPreview.paymentCount === 1 ? "payment" : "payments"}
          </Text>
          {approvalPreview.paymentScope.map((payment) => (
            <Text key={payment.paymentId} size="xs" c="dimmed">
              {payment.paymentId} · {payment.billId} ·{" "}
              {formatRefundMoney(
                payment.refundableAmountCents,
                payment.currency,
              )}
            </Text>
          ))}
          <Text size="xs" c="dimmed">
            {approvalPreview.occurrence.occurrenceDate
              ? `Occurrence ${approvalPreview.occurrence.occurrenceDate}${
                  approvalPreview.occurrence.slotId
                    ? ` · slot ${approvalPreview.occurrence.slotId}`
                    : ""
                }`
              : "All payments in the immutable request scope"}
          </Text>
          {approvalPreview.policyDecision ? (
            <Text size="xs" c="dimmed">
              {approvalPreview.policyDecision}
            </Text>
          ) : null}
        </Stack>
      ) : (
        <Text size="sm" c="red">
          Approval preview unavailable
        </Text>
      )}
    </>
  );
}

function RefundDecisionActions({
  refund,
  processingId,
  canTakeAction,
  handleStatusChange,
}: {
  refund: RefundRequest;
  processingId: string | null;
  canTakeAction: boolean;
  handleStatusChange: DecisionHandler;
}) {
  return (
    <>
      {canTakeAction ? (
        <Group gap="xs">
          <Button
            size="xs"
            color="green"
            variant="light"
            disabled={
              (refund.status && refund.status !== "WAITING") ||
              processingId === refund.$id ||
              !refund.approvalPreview?.isValid
            }
            loading={processingId === refund.$id}
            onClick={() => handleStatusChange(refund, "APPROVED")}
          >
            Approve
          </Button>
          <Button
            size="xs"
            color="red"
            variant="light"
            disabled={
              (refund.status && refund.status !== "WAITING") ||
              processingId === refund.$id
            }
            loading={processingId === refund.$id}
            onClick={() => handleStatusChange(refund, "REJECTED")}
          >
            Deny
          </Button>
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          —
        </Text>
      )}
    </>
  );
}

function RefundRow({
  refund,
  references,
  isRequesterView,
  processingId,
  hostId,
  handleStatusChange,
}: Omit<TableProps, "visibleRefunds"> & { refund: RefundRequest }) {
  const eventName = references.events[refund.eventId];
  const requesterName = references.users[refund.userId];
  const hostName = refund.hostId ? references.users[refund.hostId] : null;
  const teamName = refund.teamId ? references.teams[refund.teamId] : null;
  const organizationName = refund.organizationId
    ? references.organizations[refund.organizationId]
    : null;
  return (
    <Table.Tr key={refund.$id}>
      <Table.Td>
        <Stack gap={2}>
          <Text fw={500}>{eventName}</Text>
        </Stack>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{refund.reason || "No reason provided"}</Text>
      </Table.Td>
      <Table.Td>
        <ReferenceBadge name={teamName} color="cyan" />
      </Table.Td>
      <Table.Td>
        <Badge variant="light" color="blue">
          {requesterName}
        </Badge>
      </Table.Td>
      <Table.Td>
        <ReferenceBadge name={hostName} color="violet" />
      </Table.Td>
      <Table.Td>
        <ReferenceBadge name={organizationName} color="green" />
      </Table.Td>
      <Table.Td>
        <RefundScope approvalPreview={refund.approvalPreview} />
      </Table.Td>
      <Table.Td>
        <Text size="sm">
          {refund.$createdAt
            ? formatDisplayDateTime(refund.$createdAt)
            : "Unknown"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge variant="light" color={statusColor(refund.status)}>
          {refund.status ?? "WAITING"}
        </Badge>
      </Table.Td>
      {!isRequesterView && (
        <Table.Td>
          <RefundDecisionActions
            refund={refund}
            processingId={processingId}
            canTakeAction={Boolean(hostId && refund.hostId === hostId)}
            handleStatusChange={handleStatusChange}
          />
        </Table.Td>
      )}
    </Table.Tr>
  );
}

function RefundTable({
  visibleRefunds,
  references,
  isRequesterView,
  processingId,
  hostId,
  handleStatusChange,
}: TableProps) {
  return (
    <div className="org-tab-table-surface">
      <Table.ScrollContainer minWidth={isRequesterView ? 1060 : 1240}>
        <Table highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Event</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Team</Table.Th>
              <Table.Th>Requested By</Table.Th>
              <Table.Th>Host</Table.Th>
              <Table.Th>Organization</Table.Th>
              <Table.Th>Refund scope</Table.Th>
              <Table.Th>Requested At</Table.Th>
              <Table.Th>Status</Table.Th>
              {!isRequesterView && <Table.Th>Actions</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRefunds.map((refund) => (
              <RefundRow
                key={refund.$id}
                refund={refund}
                references={references}
                isRequesterView={isRequesterView}
                processingId={processingId}
                hostId={hostId}
                handleStatusChange={handleStatusChange}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </div>
  );
}

function RefundResults(
  props: TableProps & Pick<ViewProps, "loading" | "error">,
) {
  if (props.loading || props.error) return null;
  if (!props.visibleRefunds.length)
    return (
      <Text size="sm" c="dimmed">
        No refund requests found.
      </Text>
    );
  return <RefundTable {...props} />;
}

function RefundHeading({
  title,
  description,
  showHeader,
  loading,
}: Pick<ViewProps, "title" | "description" | "showHeader" | "loading">) {
  return (
    <>
      {showHeader ? (
        <Group justify="space-between">
          <div>
            <Title order={4}>{title}</Title>
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          </div>
          {loading && <Loader size="sm" />}
        </Group>
      ) : loading ? (
        <Group justify="flex-end">
          <Loader size="sm" />
        </Group>
      ) : null}
    </>
  );
}

export default function RefundRequestListView(props: ViewProps) {
  const content = (
    <Stack gap="md">
      <RefundHeading {...props} />
      {props.error && (
        <Alert color="red" data-testid="refund-error">
          {props.error}
        </Alert>
      )}
      {props.actionError && (
        <Alert color="red" data-testid="refund-action-error">
          {props.actionError}
        </Alert>
      )}
      <RefundResults {...props} />
    </Stack>
  );
  if (!props.withContainer) return content;
  return (
    <Paper withBorder radius="md" p="md" className="org-tab-surface">
      {content}
    </Paper>
  );
}
