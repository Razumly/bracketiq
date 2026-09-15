"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { refundRequestService } from "@/lib/refundRequestService";
import { isApiRequestError } from "@/lib/apiClient";
import type { RefundRequest } from "@/types";
import RefundRequestListView from "./RefundRequestListView";
import {
  filterRefundRequests,
  loadRefundReferences,
  type RefundReferences,
} from "./refundRequestReferences";
import OrganizationRefundsView from "@/components/organization/OrganizationRefundsView";
import { refundApprovalUnavailableReason } from "./refundRequestPresentation";

type RefundRequestsListProps = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
  showHeader?: boolean;
  withContainer?: boolean;
  canManage?: boolean;
};

export default function RefundRequestsList({
  organizationId,
  userId,
  hostId,
  showHeader = true,
  withContainer = true,
  canManage = true,
}: RefundRequestsListProps) {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestVersion = useRef(0);
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
    requestVersion.current += 1;
    setActionError(null);
    setProcessingId(null);

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
        const message = isApiRequestError(err) && err.status === 403
          ? "You do not have permission to view these refund requests. Ask the organization owner or event host to check your access, then reload."
          : err instanceof Error ? err.message : "Failed to load refund requests";
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
      requestVersion.current += 1;
    };
  }, [organizationId, userId, hostId, hasFilter, reloadVersion]);

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
    if (!canManage || isRequesterView || loading || error || processingId) return;
    if ((refund.status || "WAITING") !== "WAITING") return;
    if (!visibleRefunds.some((item) => item.$id === refund.$id)) return;
    if (!organizationId && refund.hostId !== hostId) return;
    const refundId = refund.$id;
    setActionError(null);
    const approvalError = refundApprovalUnavailableReason(refund.approvalPreview);
    if (status === "APPROVED" && approvalError) {
      setActionError(approvalError);
      return;
    }

    setProcessingId(refundId);
    const version = requestVersion.current;
    try {
      const updated = await refundRequestService.updateRefundStatus(
        refundId,
        status,
        status === "APPROVED" ? refund.approvalPreview : undefined,
      );
      if (version !== requestVersion.current) return;
      setRefunds((prev) =>
        prev.map((refund) =>
          refund.$id === refundId
            ? { ...refund, status: updated.status }
            : refund,
        ),
      );
    } catch (err) {
      if (version !== requestVersion.current) return;
      const message =
        err instanceof Error ? err.message : "Failed to update refund request";
      setActionError(message);
    } finally {
      if (version === requestVersion.current) setProcessingId(null);
    }
  };

  if (organizationId) {
    return (
      <OrganizationRefundsView
        loading={loading}
        error={error}
        actionError={actionError}
        canManage={canManage}
        refunds={visibleRefunds}
        events={references.events}
        users={references.users}
        teams={references.teams}
        processingId={processingId}
        onDecision={handleStatusChange}
        onReload={() => setReloadVersion((version) => version + 1)}
      />
    );
  }

  return (
    <RefundRequestListView
      canManage={canManage}
      onReload={() => setReloadVersion((version) => version + 1)}
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
