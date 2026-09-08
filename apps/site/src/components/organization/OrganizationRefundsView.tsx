'use client';

import { useState } from 'react';
import { CheckCircle2, Clock3, ListFilter, XCircle } from 'lucide-react';
import type { RefundRequest } from '@/types';
import { formatDisplayDateTime } from '@/lib/dateUtils';
import { Badge, Button, Select, TextInput } from './organization-operation-ui';
import { OrganizationStatStrip, OrganizationTabHeading } from './OrganizationTabLayout';
import { OrganizationLoadingRows, OrganizationLoadingValue, useOrganizationDataLoading } from './OrganizationDataLoading';

type Props = {
  loading?: boolean;
  error?: string | null;
  refunds: RefundRequest[];
  events: Record<string, string>;
  users: Record<string, string>;
  teams: Record<string, string>;
  processingId: string | null;
  onDecision: (refund: RefundRequest, status: 'APPROVED' | 'REJECTED') => Promise<void>;
};

const statuses = [
  { value: 'ALL', label: 'All' }, { value: 'WAITING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Denied' },
];
function refundStatus(refund: RefundRequest) { return refund.status || 'WAITING'; }
function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.trim().toUpperCase() || 'USD' }).format(cents / 100);
  } catch {
    return 'Amount unavailable';
  }
}
function RefundStatus({ refund }: { refund: RefundRequest }) {
  const status = refundStatus(refund);
  const color = { WAITING: 'yellow', APPROVED: 'green', REJECTED: 'red' }[status];
  return <Badge color={color} variant="light">{statuses.find((item) => item.value === status)?.label || status}</Badge>;
}

function RefundScope({ preview }: { preview: RefundRequest['approvalPreview'] }) {
  if (!preview?.isValid) return <p role="status">Approval preview unavailable. Reload this request before approval.</p>;
  return <div className="org-refund-scope">
    <h4>Payment scope</h4>
    <p>{preview.paymentCount} {preview.paymentCount === 1 ? 'payment' : 'payments'}</p>
    {preview.paymentScope.map((payment) => <p key={payment.paymentId}>{payment.paymentId} · {payment.billId} · {money(payment.refundableAmountCents, payment.currency)}</p>)}
    <p>{preview.occurrence.occurrenceDate ? `Occurrence ${preview.occurrence.occurrenceDate}` : 'All payments in this request'}</p>
    {preview.policyDecision && <p>{preview.policyDecision}</p>}
  </div>;
}

function RefundFacts({ refund, events, teams }: Pick<Props, 'events' | 'teams'> & { refund: RefundRequest }) {
  const preview = refund.approvalPreview;
  return <dl>
    <div><dt>Event</dt><dd>{events[refund.eventId] || 'Event unavailable'}</dd></div>
    {refund.teamId && <div><dt>Team</dt><dd>{teams[refund.teamId] || 'Team unavailable'}</dd></div>}
    <div><dt>Requested amount</dt><dd>{preview?.isValid ? money(preview.refundableAmountCents, preview.currency) : 'Unavailable'}</dd></div>
    <div><dt>Submitted</dt><dd>{refund.$createdAt ? formatDisplayDateTime(refund.$createdAt) : 'Unavailable'}</dd></div>
  </dl>;
}

function RefundDetails({ refund, events, users, teams, processingId, onDecision }: Omit<Props, 'refunds'> & { refund?: RefundRequest }) {
  if (!refund) return <aside className="org-reference-card"><h3>Refund request</h3><p>Select a request to review its payment scope and reason.</p></aside>;
  const preview = refund.approvalPreview;
  const isPending = refundStatus(refund) === 'WAITING';
  const isProcessing = processingId === refund.$id;
  return (
    <aside className="org-reference-card org-refund-details">
      <h3>Refund request</h3>
      <strong>{users[refund.userId] || 'Customer'}</strong>
      <RefundStatus refund={refund} />
      <RefundFacts refund={refund} events={events} teams={teams} />
      <h4>Customer note</h4><p>{refund.reason || 'No reason provided'}</p>
      <RefundScope preview={preview} />
      <div className="org-section-actions">
        <Button variant="outline" disabled={!isPending || isProcessing} onClick={() => void onDecision(refund, 'REJECTED')}>Deny</Button>
        <Button disabled={!isPending || isProcessing || !preview?.isValid} loading={isProcessing} onClick={() => void onDecision(refund, 'APPROVED')}>Approve</Button>
      </div>
    </aside>
  );
}

export default function OrganizationRefundsView(props: Props) {
  const { refunds, events, users } = props;
  const isLoading = useOrganizationDataLoading(props.loading);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [eventId, setEventId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const matches = refunds.filter((refund) => {
    const text = `${users[refund.userId] || ''} ${events[refund.eventId] || ''} ${refund.reason || ''}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (status === 'ALL' || refundStatus(refund) === status) && (!eventId || eventId === refund.eventId);
  });
  const selected = matches.find((refund) => refund.$id === selectedId) || matches[0];
  const count = (value: string) => refunds.filter((refund) => refundStatus(refund) === value).length;
  return (
    <section className="org-section org-refunds">
      <OrganizationTabHeading title="Refunds" description="Review requests and track refund decisions." />
      <div className="org-refund-workspace">
        <div className="org-detail-stack">
          <OrganizationStatStrip loading={isLoading} items={[
            { label: 'pending', value: count('WAITING'), icon: <Clock3 /> },
            { label: 'approved', value: count('APPROVED'), icon: <CheckCircle2 /> },
            { label: 'denied', value: count('REJECTED'), icon: <XCircle /> },
            { label: 'requests', value: refunds.length, icon: <ListFilter /> },
          ]} />
          <div className="org-filter-toolbar">
            <TextInput aria-label="Search refund requests" placeholder="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            <Select aria-label="Filter refund event" placeholder="Event" value={eventId} onChange={setEventId} clearable data={Array.from(new Set(refunds.map((refund) => refund.eventId))).map((id) => ({ value: id, label: events[id] || 'Event unavailable' }))} />
            <Button variant="subtle" onClick={() => { setQuery(''); setStatus('ALL'); setEventId(null); }}>Clear all</Button>
          </div>
          <div className="org-customer-type-tabs" aria-label="Refund status">
            {statuses.map((item) => <Button key={item.value} variant="subtle" aria-pressed={status === item.value} onClick={() => setStatus(item.value)}>{item.label}<span><OrganizationLoadingValue loading={isLoading}>{item.value === 'ALL' ? refunds.length : count(item.value)}</OrganizationLoadingValue></span></Button>)}
          </div>
          <div className="org-reference-table">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr><th>Customer</th><th>Event</th><th>Amount</th><th>Reason</th><th>Submitted</th><th>Status</th></tr></thead>
              <tbody aria-busy={isLoading}>{isLoading ? <OrganizationLoadingRows columns={6} label="refunds" /> : matches.map((refund) => <tr key={refund.$id} data-selected={selected?.$id === refund.$id}>
                <td><button className="org-table-link" onClick={() => setSelectedId(refund.$id)}>{users[refund.userId] || 'Customer'}</button></td>
                <td>{events[refund.eventId] || 'Event unavailable'}</td>
                <td>{refund.approvalPreview?.isValid ? money(refund.approvalPreview.refundableAmountCents, refund.approvalPreview.currency) : 'Unavailable'}</td>
                <td>{refund.reason || 'No reason provided'}</td>
                <td>{refund.$createdAt ? formatDisplayDateTime(refund.$createdAt) : 'Unavailable'}</td>
                <td><RefundStatus refund={refund} /></td>
              </tr>)}</tbody>
            </table></div>
            {!isLoading && !props.error && !matches.length && <p className="org-empty-copy">No refund requests match these filters.</p>}
            <footer className="org-table-footer"><OrganizationLoadingValue loading={isLoading}>{matches.length} of {refunds.length}</OrganizationLoadingValue> requests</footer>
          </div>
        </div>
        <RefundDetails {...props} refund={selected} />
      </div>
    </section>
  );
}
