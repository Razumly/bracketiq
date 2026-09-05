'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { userService } from '@/lib/userService';
import type { Invite } from '@/types';

export default function TeamInvitationManager({ teamId, onChanged, onInvitesLoaded }: {
  teamId: string; onChanged: () => Promise<void>; onInvitesLoaded: (invites: Invite[]) => void;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    const [pending, history] = await Promise.all([
      userService.listInvites({ teamId, type: 'TEAM' }),
      userService.listInvites({ teamId, type: 'TEAM', history: true }),
    ]);
    const all = [...pending, ...history];
    setInvites(all); onInvitesLoaded(all);
  }, [teamId, onInvitesLoaded]);
  useEffect(() => { void load().catch(() => setError('Invitation history could not be loaded.')); }, [load]);
  const act = async (invite: Invite, action: 'remind' | 'cancel' | 'reinvite') => {
    setActing(invite.$id); setError(null); setMessage(null);
    const requestId = `${action}:${invite.$id}`;
    const idempotencyKey = keys.current.get(requestId) ?? crypto.randomUUID();
    keys.current.set(requestId, idempotencyKey);
    try {
      if (action === 'cancel') {
        await userService.deleteInviteById(invite.$id);
        setMessage('Invitation cancelled.');
      } else {
        const result = action === 'remind'
          ? await userService.remindTeamInvitation(invite.$id, idempotencyKey)
          : await userService.reinviteTeamInvitation(invite.$id, idempotencyKey);
        setMessage(result.delivery?.failed ? 'The invitation is saved. Delivery failed. Use Remind to try delivery again.'
          : result.delivery?.status === 'DISPATCHING' ? 'The delivery request is saved. Its result is not yet confirmed.'
            : result.delivery?.status === 'SKIPPED' ? 'The invitation is saved. No message was sent.' : action === 'remind' ? 'Reminder sent.' : 'New invitation saved.');
      }
      keys.current.delete(requestId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The action could not be confirmed. Retry the same action.');
      setActing(null); return;
    }
    try { await load(); await onChanged(); } catch { setError('The action was saved. Reload to see the current state.'); }
    setActing(null);
  };
  const current = invites.filter((invite) => invite.isCurrentAttempt !== false);
  return <Stack gap="sm">
    <Text fw={600}>Invitation history</Text>
    {error ? <Alert color="red">{error}</Alert> : null}
    {message ? <Alert>{message}</Alert> : null}
    {current.map((invite) => {
      const history = invites.filter((item) => invite.userId && item.userId === invite.userId && item.$id !== invite.$id);
      return <Paper key={invite.$id} withBorder p="sm"><Stack gap="xs">
        <Group justify="space-between"><Text>{[invite.firstName, invite.lastName].filter(Boolean).join(' ') || invite.email || 'Player'}</Text><Badge>{invite.invitationLabel || `Invitation ${invite.status?.toLowerCase()}`}</Badge></Group>
        <Text size="xs" c="dimmed">Created {invite.$createdAt ? new Date(invite.$createdAt).toLocaleString() : '—'}{invite.finalizedAt ? ` · Final outcome ${new Date(invite.finalizedAt).toLocaleString()}` : ''}</Text>
        <Group gap="xs">
          {invite.status === 'PENDING' ? <>
            <Button size="xs" variant="light" disabled={acting !== null} onClick={() => { void act(invite, 'remind'); }}>Remind</Button>
            <Button size="xs" variant="default" disabled={acting !== null} onClick={() => { void act(invite, 'cancel'); }}>Cancel invitation</Button>
          </> : ['DECLINED', 'CANCELLED', 'EXPIRED'].includes(invite.status ?? '') ? <Button size="xs" disabled={acting !== null} onClick={() => { void act(invite, 'reinvite'); }}>Reinvite</Button> : null}
        </Group>
        <details><summary>Attempts and deliveries</summary><Stack gap={4} mt="xs">
          {[invite, ...history].map((attempt) => <div key={attempt.$id}>
            <Text size="sm">{attempt.invitationLabel || attempt.status} · {attempt.finalizedAt || attempt.$createdAt} · Sender {attempt.senderName || 'Name unavailable'}{attempt.actingGuardianId ? ` · Guardian ${attempt.actingGuardianName || 'Name unavailable'}` : ''}</Text>
            {(attempt.deliveries ?? []).map((delivery) => <Text key={delivery.id} size="xs" c="dimmed">{delivery.kind === 'REMINDER' ? 'Reminder' : 'Delivery'}: {delivery.status.toLowerCase()} · {new Date(delivery.createdAt).toLocaleString()}</Text>)}
          </div>)}
        </Stack></details>
      </Stack></Paper>;
    })}
    {!current.length ? <Text size="sm" c="dimmed">No invitation attempts.</Text> : null}
  </Stack>;
}
