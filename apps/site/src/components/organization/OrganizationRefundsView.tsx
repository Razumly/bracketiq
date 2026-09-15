'use client';

import { useId, useState } from 'react';
import { CheckCircle2, Clock3, ListFilter, RefreshCw, XCircle } from 'lucide-react';
import type { RefundRequest } from '@/types';
import { formatDisplayDateTime } from '@/lib/dateUtils';
import { formatRefundMoney, refundApprovalUnavailableReason, refundRequestedAmount } from '@/components/ui/refundRequestPresentation';
import { Alert, Avatar, Badge, Button, Select, TextInput } from './organization-operation-ui';
import { OrganizationStatStrip, OrganizationTabHeading } from './OrganizationTabLayout';
import { OrganizationDataRegion, OrganizationLoadingRows, OrganizationLoadingValue, useOrganizationDataLoading } from './OrganizationDataLoading';
import styles from './OrganizationRefundsView.module.css';

type Props = {
  loading?: boolean;
  error?: string | null;
  actionError?: string | null;
  canManage?: boolean;
  refunds: RefundRequest[];
  events: Record<string, string>;
  users: Record<string, string>;
  teams: Record<string, string>;
  processingId: string | null;
  onDecision: (refund: RefundRequest, status: 'APPROVED' | 'REJECTED') => Promise<void>;
  onReload?: () => void;
};

const statuses = [
  { value: 'ALL', label: 'All' }, { value: 'WAITING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Denied' },
];

function RefundStatus({ refund }: { refund: RefundRequest }) {
  const status = refund.status || 'WAITING';
  const color = { WAITING: 'yellow', APPROVED: 'green', REJECTED: 'red' }[status];
  return <Badge color={color} variant="light">{statuses.find((item) => item.value === status)?.label || status}</Badge>;
}

function RefundScope({ preview }: { preview: RefundRequest['approvalPreview'] }) {
  if (!preview?.isValid) return null;
  return <div className="org-refund-scope">
    <h4>Payment scope</h4>
    <p>{preview.paymentCount} {preview.paymentCount === 1 ? 'payment' : 'payments'} · {formatRefundMoney(preview.refundableAmountCents, preview.currency)}</p>
    {preview.paymentScope.map((payment) => <p key={payment.paymentId}>{payment.paymentId} · {payment.billId} · {formatRefundMoney(payment.refundableAmountCents, payment.currency)}</p>)}
    <p>{preview.occurrence.occurrenceDate ? `Occurrence ${preview.occurrence.occurrenceDate}` : 'All payments in this request'}</p>
    {preview.policyDecision && <p>{preview.policyDecision}</p>}
  </div>;
}

function RefundFacts({ refund, events, teams }: Pick<Props, 'events' | 'teams'> & { refund: RefundRequest }) {
  return <dl>
    <div><dt>Event</dt><dd>{events[refund.eventId] || 'Event unavailable'}</dd></div>
    {refund.teamId && <div><dt>Team</dt><dd>{teams[refund.teamId] || 'Team unavailable'}</dd></div>}
    <div><dt>Requested amount</dt><dd className="font-semibold tabular-nums">{refundRequestedAmount(refund)}</dd></div>
    <div><dt>Submitted</dt><dd>{refund.$createdAt ? formatDisplayDateTime(refund.$createdAt) : 'Unavailable'}</dd></div>
  </dl>;
}

function RefundDetails({ refund, events, users, teams, canManage = true, processingId, onDecision, actionError }: Omit<Props, 'refunds'> & { refund: RefundRequest }) {
  const preview = refund.approvalPreview;
  const isPending = (refund.status || 'WAITING') === 'WAITING';
  const isProcessing = processingId === refund.$id;
  const approvalError = refundApprovalUnavailableReason(preview);
  const approvalErrorId = useId();
  const customerName = users[refund.userId];
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={customerName} />
        <strong>{customerName || 'Customer unavailable'}</strong>
      </div>
      <RefundStatus refund={refund} />
      <RefundFacts refund={refund} events={events} teams={teams} />
      <div><h4>Customer note</h4><p className="whitespace-pre-wrap break-words">{refund.reason || 'No reason provided'}</p></div>
      <RefundScope preview={preview} />
      {actionError && <Alert color="red" data-testid="refund-action-error">{actionError}</Alert>}
      {!canManage ? <p role="status">You can review this request, but you do not have permission to approve or deny it.</p> : <>
        {isPending && approvalError && <p id={approvalErrorId} role="status">{approvalError}</p>}
        {!isPending && <p role="status">This request is {refund.status === 'APPROVED' ? 'approved' : 'denied'}. No further decision is available.</p>}
        <div className="org-section-actions">
          <Button variant="outline" disabled={!isPending || Boolean(processingId)} onClick={() => void onDecision(refund, 'REJECTED')}>Deny</Button>
          <Button
            disabled={!isPending || Boolean(processingId) || Boolean(approvalError)}
            aria-describedby={isPending && approvalError ? approvalErrorId : undefined}
            loading={isProcessing}
            onClick={() => void onDecision(refund, 'APPROVED')}
          >
            Approve{!approvalError && preview ? ` ${formatRefundMoney(preview.refundableAmountCents, preview.currency)}` : ''}
          </Button>
        </div>
      </>}
    </>
  );
}

export default function OrganizationRefundsView(props: Props) {
  const { refunds, events, users, error, actionError, processingId, onReload } = props;
  const isLoading = useOrganizationDataLoading(props.loading);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [eventId, setEventId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const matches = error ? [] : refunds.filter((refund) => {
    const text = `${users[refund.userId] || ''} ${events[refund.eventId] || ''} ${refund.reason || ''}`.toLowerCase();
    return text.includes(normalizedQuery) && (status === 'ALL' || (refund.status || 'WAITING') === status) && (!eventId || eventId === refund.eventId);
  });
  const selected = matches.find((refund) => refund.$id === selectedId) || matches[0];
  const count = (value: string) => error ? 'Unavailable' : refunds.filter((refund) => (refund.status || 'WAITING') === value).length;
  return (
    <section className="org-section org-refunds">
      <OrganizationTabHeading title="Refunds" description="Review requests and track refund decisions.">
        {onReload && <Button variant="outline" leftSection={<RefreshCw size={16} aria-hidden="true" />} loading={isLoading} disabled={Boolean(processingId)} onClick={onReload}>Reload requests</Button>}
      </OrganizationTabHeading>
      {error && <Alert color="red" title="Refund requests unavailable" data-testid="refund-error">{error}</Alert>}
      {actionError && !selected && <Alert color="red" data-testid="refund-action-error">{actionError}</Alert>}
      <div className="org-refund-workspace">
        <div className="org-detail-stack">
          <OrganizationStatStrip loading={isLoading} items={[
            { label: 'pending', value: count('WAITING'), icon: <Clock3 /> },
            { label: 'approved', value: count('APPROVED'), icon: <CheckCircle2 /> },
            { label: 'denied', value: count('REJECTED'), icon: <XCircle /> },
            { label: 'requests', value: error ? 'Unavailable' : refunds.length, icon: <ListFilter /> },
          ]} />
          <div className="org-filter-toolbar">
            <TextInput aria-label="Search refund requests" placeholder="Search refund requests" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            <Select aria-label="Filter refund event" placeholder="Event" value={eventId} onChange={setEventId} clearable data={Array.from(new Set(refunds.map((refund) => refund.eventId))).map((id) => ({ value: id, label: events[id] || 'Event unavailable' }))} />
            <Button variant="subtle" onClick={() => { setQuery(''); setStatus('ALL'); setEventId(null); }}>Clear all</Button>
          </div>
          <div className="org-customer-type-tabs" role="group" aria-label="Refund status">
            {statuses.map((item) => <Button key={item.value} variant="subtle" aria-pressed={status === item.value} onClick={() => setStatus(item.value)}>{item.label}<span><OrganizationLoadingValue loading={isLoading}>{item.value === 'ALL' ? (error ? 'Unavailable' : refunds.length) : count(item.value)}</OrganizationLoadingValue></span></Button>)}
          </div>
          <div className="org-reference-table">
            <div className="overflow-x-auto"><table className={`w-full text-sm ${styles.requests}`}>
              <caption className="sr-only">Refund requests. Select a customer to review the request.</caption>
              <thead><tr><th scope="col">Customer</th><th scope="col">Event</th><th scope="col">Amount</th><th scope="col">Reason</th><th scope="col">Submitted</th><th scope="col">Status</th></tr></thead>
              <tbody aria-busy={isLoading}>{isLoading ? <OrganizationLoadingRows columns={6} label="refunds" /> : matches.map((refund) => <tr key={refund.$id} data-selected={selected?.$id === refund.$id}>
                <td><button type="button" className="org-table-link rounded-sm focus-visible:outline-2 focus-visible:outline-ring" aria-pressed={selected?.$id === refund.$id} aria-controls={detailId} onClick={() => setSelectedId(refund.$id)}>{users[refund.userId] || 'Customer unavailable'}</button></td>
                <td>{events[refund.eventId] || 'Event unavailable'}</td>
                <td className="font-semibold tabular-nums">{refundRequestedAmount(refund)}</td>
                <td>{refund.reason || 'No reason provided'}</td>
                <td>{refund.$createdAt ? formatDisplayDateTime(refund.$createdAt) : 'Unavailable'}</td>
                <td><RefundStatus refund={refund} /></td>
              </tr>)}</tbody>
            </table></div>
            {!isLoading && !error && !matches.length && <p className="org-empty-copy">No refund requests match these filters.</p>}
            <footer className="org-table-footer"><OrganizationLoadingValue loading={isLoading}>{error ? 'Request count unavailable' : `${matches.length} of ${refunds.length} loaded requests`}</OrganizationLoadingValue></footer>
          </div>
        </div>
        <aside id={detailId} className="org-reference-card org-refund-details" aria-label="Refund request details">
          <h3>Refund request</h3>
          <OrganizationDataRegion loading={isLoading} label="refund request details" layout="detail">
            {selected ? <div className="org-refund-details"><RefundDetails {...props} refund={selected} /></div> : <p>{error ? 'Reload requests to review the payment scope and take action.' : 'Select a request to review its payment scope and reason.'}</p>}
          </OrganizationDataRegion>
        </aside>
      </div>
    </section>
  );
}
