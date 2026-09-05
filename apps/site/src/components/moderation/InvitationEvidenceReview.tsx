'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';
import { invitationEvidenceService, type InvitationEvidence } from '@/lib/invitationEvidenceService';

export function InvitationEvidenceReview({ reportId, reportStatus }: { reportId: string; reportStatus: string }) {
  const [evidence, setEvidence] = useState<InvitationEvidence | null | undefined>();
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
      const result = await invitationEvidenceService.getEvidence(reportId);
      if (requestVersion.current === version) setEvidence(result);
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
