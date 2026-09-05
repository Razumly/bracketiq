'use client';

import { useState } from 'react';
import { useApp } from '@/app/providers';
import { Alert, Button, Checkbox, Modal, Radio, Stack, Text } from '@mantine/core';
import type { Invite } from '@/types';
import { userService } from '@/lib/userService';

export default function DeclineTeamInvitationButton({ invite, onSaved, disabled = false }: {
  invite: Invite; onSaved: () => Promise<void>; disabled?: boolean;
}) {
  const { refreshUser } = useApp();
  const [opened, setOpened] = useState(false);
  const [scope, setScope] = useState<'sender' | 'team'>('team');
  const [leaveChats, setLeaveChats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await userService.declineInvite(invite.$id, { blockScope: scope, leaveSharedChats: scope === 'sender' && leaveChats });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The invitation and block were not saved. Try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setOpened(false);
    try { if (scope === 'sender') await refreshUser(); await onSaved(); } catch { setError('The decline and block were saved. Reload to see the current state.'); }
  };
  return <>
    <Button size="xs" variant="subtle" color="red" disabled={disabled} onClick={(event) => {
      event.stopPropagation(); setScope('team'); setLeaveChats(false); setError(null); setOpened(true);
    }}>Decline and block</Button>
    {error && !opened ? <Alert color="red">{error}</Alert> : null}
    <Modal opened={opened} onClose={() => { if (!saving) setOpened(false); }} title="Decline and block" onClick={(event) => event.stopPropagation()}>
      <Stack>
        <Radio.Group value={scope} onChange={(value) => setScope(value === 'sender' ? 'sender' : 'team')} label="Block invitations from">
          <Stack gap="xs" mt="xs">
            <Radio value="team" label="This Team, from every manager" />
            <Radio value="sender" label="This sender, on every Team" disabled={invite.canBlockSender !== true} />
          </Stack>
        </Radio.Group>
        {invite.canBlockSender !== true ? <Text size="sm">This sender has no active Account to block.</Text> : null}
        <Text size="sm">{scope === 'team'
          ? `This Team cannot add or invite ${invite.childFullName || 'this Player'} until the block is removed.`
          : 'The block belongs to your Account. It also stops this sender from inviting your children.'}</Text>
        {scope === 'sender' ? <Checkbox checked={leaveChats} onChange={(event) => setLeaveChats(event.currentTarget.checked)} label="Also leave chats shared with this sender" /> : null}
        {error ? <Alert color="red">{error}</Alert> : null}
        <Button color="red" loading={saving} onClick={() => { void save(); }}>Save decline and block</Button>
      </Stack>
    </Modal>
  </>;
}
