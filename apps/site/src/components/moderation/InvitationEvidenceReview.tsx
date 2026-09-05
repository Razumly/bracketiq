'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';

type Evidence = {
  inviteId: string; status: string; attemptCreatedAt: string | null; finalizedAt: string | null;
  senderName: string | null; playerName: string | null; teamName: string | null;
  actingGuardianName: string | null;
  deliveries: Array<{ id: string; kind: string; status: string; createdAt: string }>;
};

export function InvitationEvidenceReview({ reportId, reportStatus }: { reportId: string; reportStatus: string }) {
  const [evidence, setEvidence] = useState<Evidence | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1; setEvidence(undefined); setError(null); setLoading(false);
    return () => { requestVersion.current += 1; };
  }, [reportId, reportStatus]);
  const load = async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/admin/moderation/${encodeURIComponent(reportId)}/evidence`, { credentials: 'include' });
      if (!response.ok) throw new Error('Invitation evidence could not be loaded.');
      const payload = await response.json();
      if (requestVersion.current === version) setEvidence(payload.evidence);
    } catch (failure) {
      if (requestVersion.current === version) setError(failure instanceof Error ? failure.message : 'Invitation evidence could not be loaded.');
    } finally { if (requestVersion.current === version) setLoading(false); }
  };
  return <Stack gap="xs">
    <Button variant="light" size="xs" loading={loading} onClick={() => { void load(); }}>View invitation evidence</Button>
    {error ? <Alert color="red">{error}</Alert> : null}
    {evidence === null ? <Text size="sm">Invitation evidence was removed under the retention policy.</Text> : null}
    {evidence ? <Stack gap={4}>
      <Text size="sm">Team: {evidence.teamName ?? 'Team name unavailable'}</Text>
      <Text size="sm">Player: {evidence.playerName ?? 'Player name unavailable'} · Sender: {evidence.senderName ?? 'Sender name unavailable'}</Text>
      <Text size="sm">Outcome: {evidence.status} · {evidence.finalizedAt ? new Date(evidence.finalizedAt).toLocaleString() : 'No final outcome'}</Text>
      {evidence.actingGuardianName ? <Text size="sm">Acting guardian: {evidence.actingGuardianName}</Text> : null}
      {evidence.deliveries.map((delivery) => <Text size="xs" key={delivery.id}>{delivery.kind}: {delivery.status} · {new Date(delivery.createdAt).toLocaleString()}</Text>)}
    </Stack> : null}
  </Stack>;
}
