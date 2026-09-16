'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput } from '@/components/organization/organization-operation-ui';
import { userService } from '@/lib/userService';
import type { Invite } from '@/types';

function pendingInvitationFallback(status: string | null | undefined, isCurrentAttempt = true) {
  return isCurrentAttempt && (status == null || status === 'PENDING' || status === 'SENT' || status === 'FAILED')
    ? 'Pending acceptance'
    : undefined;
}

async function loadInitialInvites(load: () => Promise<void>, onError: () => void) {
  try {
    await load();
  } catch {
    onError();
  }
}

export default function TeamInvitationManager({ teamId, onChanged, onInvitesLoaded }: {
  teamId: string; onChanged: () => Promise<void>; onInvitesLoaded: (invites: Invite[]) => void;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const [loading, setLoading] = useState(true);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, history] = await Promise.all([
        userService.listInvites({ teamId, type: 'TEAM' }),
        userService.listInvites({ teamId, type: 'TEAM', history: true }),
      ]);
      const all = [...new Map([...history, ...pending].map((invite) => [invite.$id, invite])).values()];
      setInvites(all); onInvitesLoaded(all);
    } finally {
      setLoading(false);
    }
  }, [teamId, onInvitesLoaded]);
  useEffect(() => {
    void loadInitialInvites(load, () => setError('Invitation history could not be loaded.'));
  }, [load]);
  const act = async (invite: Invite, action: 'remind' | 'cancel' | 'reinvite') => {
    if (acting) return;
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
  const copyLink = async (invite: Invite) => {
    if (!invite.shareUrl) return;
    try {
      await navigator.clipboard.writeText(invite.shareUrl);
      setCopiedInviteId(invite.$id);
    } catch {
      setError('The link could not be copied. Select and copy the private invite link.');
    }
  };
  const current = invites.filter((invite) => invite.isCurrentAttempt !== false);
  return <Stack gap="sm">
    <Text component="h3" fw={600}>Invitation history</Text>
    {loading ? <Text role="status" size="sm" c="dimmed">Loading invitation history...</Text> : null}
    {error ? <Alert color="red">{error}
      <Button variant="subtle" loading={loading} onClick={() => { void loadInitialInvites(load, () => setError('Invitation history could not be loaded.')); }}>Reload invitations</Button>
    </Alert> : null}
    {message ? <Alert>{message}</Alert> : null}
    {current.map((invite) => {
      const history = invites.filter((item) => invite.userId && item.userId === invite.userId && item.$id !== invite.$id);
      const delivery = invite.delivery ?? invite.deliveries?.[invite.deliveries.length - 1];
      const pending = invite.status == null || ['PENDING', 'SENT', 'FAILED'].includes(invite.status);
      return <Paper key={invite.$id} withBorder p="sm"><Stack gap="xs">
        <Group justify="space-between"><Text>{[invite.firstName, invite.lastName].filter(Boolean).join(' ') || invite.email || 'Player'}</Text><Badge>{invite.invitationLabel || pendingInvitationFallback(invite.status, invite.isCurrentAttempt) || `Invitation ${invite.status?.toLowerCase()}`}</Badge></Group>
        <Text size="xs" c="dimmed">Created {invite.$createdAt ? new Date(invite.$createdAt).toLocaleString() : '—'}{invite.finalizedAt ? ` · Final outcome ${new Date(invite.finalizedAt).toLocaleString()}` : ''}</Text>
        {delivery?.status === 'FAILED' ? <Alert color="yellow">The invitation is saved. Delivery failed. Share the private link or use Remind to try delivery again.</Alert>
          : delivery?.status === 'DISPATCHING' ? <Text size="sm" c="dimmed">Delivery is not yet confirmed.</Text> : null}
        <Group gap="xs">
          {pending ? <>
            <Button size="xs" variant="light" disabled={acting !== null} onClick={() => { void act(invite, 'remind'); }}>Remind</Button>
            <Button size="xs" variant="default" disabled={acting !== null} onClick={() => { void act(invite, 'cancel'); }}>Cancel invitation</Button>
          </> : ['DECLINED', 'CANCELLED', 'EXPIRED'].includes(invite.status ?? '') ? <Button size="xs" disabled={acting !== null} onClick={() => { void act(invite, 'reinvite'); }}>Reinvite</Button> : null}
          {pending && invite.shareUrl ? <Button variant="default" disabled={acting !== null} onClick={() => { void copyLink(invite); }}>
            {copiedInviteId === invite.$id ? 'Link copied' : 'Copy invite link'}
          </Button> : null}
        </Group>
        {pending && invite.shareUrl ? <TextInput label="Private invite link" readOnly value={invite.shareUrl} onFocus={(event) => event.currentTarget.select()} /> : null}
        <details><summary className="flex min-h-11 cursor-pointer items-center">Attempts and deliveries</summary><Stack gap={4} mt="xs">
          {[invite, ...history].map((attempt) => <div key={attempt.$id}>
            <Text size="sm">{attempt.invitationLabel || pendingInvitationFallback(attempt.status, attempt.isCurrentAttempt) || attempt.status} · {attempt.finalizedAt || attempt.$createdAt} · Sender {attempt.senderName || 'Name unavailable'}{attempt.actingGuardianId ? ` · Guardian ${attempt.actingGuardianName || 'Name unavailable'}` : ''}</Text>
            {(attempt.deliveries ?? []).map((delivery) => <Text key={delivery.id} size="xs" c="dimmed">{delivery.kind === 'REMINDER' ? 'Reminder' : 'Delivery'}: {delivery.status.toLowerCase()} · {new Date(delivery.createdAt).toLocaleString()}</Text>)}
          </div>)}
        </Stack></details>
      </Stack></Paper>;
    })}
    {!loading && !error && !current.length ? <Text size="sm" c="dimmed">No invitation attempts.</Text> : null}
  </Stack>;
}
