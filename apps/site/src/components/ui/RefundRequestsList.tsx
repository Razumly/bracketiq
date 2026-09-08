"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/organization/organization-operation-ui";
import { refundRequestService } from "@/lib/refundRequestService";
import type { RefundRequest } from "@/types";
import RefundRequestListView from "./RefundRequestListView";
import {
  filterRefundRequests,
  loadRefundReferences,
  type RefundReferences,
} from "./refundRequestReferences";
import OrganizationRefundsView from "@/components/organization/OrganizationRefundsView";

type RefundRequestsListProps = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
  showHeader?: boolean;
  withContainer?: boolean;
};

export default function RefundRequestsList({
  organizationId,
  userId,
  hostId,
  showHeader = true,
  withContainer = true,
}: RefundRequestsListProps) {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [references, setReferences] = useState<RefundReferences>({
    events: {},
    users: {},
    organizations: {},
    teams: {},
  });

  const hasFilter = useMemo(
    () => Boolean(organizationId || userId || hostId),
    [organizationId, userId, hostId],
  );
  const isRequesterView = useMemo(
    () => Boolean(userId && !hostId && !organizationId),
    [userId, hostId, organizationId],
  );

  useEffect(() => {
    let isMounted = true;

    const loadRefunds = async () => {
      if (!hasFilter) {
        setError("No filter provided to load refund requests.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setRefunds([]);
      try {
        const results = await refundRequestService.listRefundRequests({
          organizationId,
          userId,
          hostId,
        });
        if (!isMounted) return;
        const scopedRefunds = filterRefundRequests(results, {
          organizationId,
          userId,
          hostId,
        });
        const names = await loadRefundReferences(scopedRefunds);
        if (!isMounted) return;
        setReferences(names);
        setRefunds(scopedRefunds);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load refund requests";
        if (isMounted) {
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRefunds();

    return () => {
      isMounted = false;
    };
  }, [organizationId, userId, hostId, hasFilter]);

  const title = useMemo(() => {
    if (organizationId) return "Organization Refund Requests";
    if (hostId) return "Hosted Event Refund Requests";
    return "Your Refund Requests";
  }, [organizationId, hostId]);

  const description = useMemo(() => {
    if (organizationId) {
      return "Review refund requests across events in this organization.";
    }
    if (hostId) {
      return "Review refund requests submitted by participants for events you host.";
    }
    return "Track the refund requests you submitted and their current status.";
  }, [organizationId, hostId]);

  const visibleRefunds = useMemo(
    () => filterRefundRequests(refunds, { organizationId, userId, hostId }),
    [refunds, organizationId, userId, hostId],
  );

  const handleStatusChange = async (
    refund: RefundRequest,
    status: "APPROVED" | "REJECTED",
  ) => {
    const refundId = refund.$id;
    setActionError(null);
    if (status === "APPROVED" && !refund.approvalPreview?.isValid) {
      setActionError(
        "This refund request does not have a current immutable approval preview. Reload it or ask the customer to submit a new request.",
      );
      return;
    }

    setProcessingId(refundId);
    try {
      const updated = await refundRequestService.updateRefundStatus(
        refundId,
        status,
        status === "APPROVED" ? refund.approvalPreview : undefined,
      );
      setRefunds((prev) =>
        prev.map((refund) =>
          refund.$id === refundId
            ? { ...refund, status: updated.status }
            : refund,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update refund request";
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  if (organizationId) {
    return (
      <>
        {error && (
          <Alert color="red" data-testid="refund-error">
            {error}
          </Alert>
        )}
        {actionError && (
          <Alert color="red" data-testid="refund-action-error">
            {actionError}
          </Alert>
        )}
        <OrganizationRefundsView
          loading={loading}
          error={error}
          refunds={visibleRefunds}
          events={references.events}
          users={references.users}
          teams={references.teams}
          processingId={processingId}
          onDecision={handleStatusChange}
        />
      </>
    );
  }

  return (
    <RefundRequestListView
      title={title}
      description={description}
      loading={loading}
      error={error}
      actionError={actionError}
      visibleRefunds={visibleRefunds}
      references={references}
      isRequesterView={isRequesterView}
      processingId={processingId}
      hostId={hostId}
      handleStatusChange={handleStatusChange}
      showHeader={showHeader}
      withContainer={withContainer}
    />
  );
}
