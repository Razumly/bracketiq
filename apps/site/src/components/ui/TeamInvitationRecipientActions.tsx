'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';
import { isApiRequestError } from '@/lib/apiClient';
import { userService } from '@/lib/userService';
import type { Invite } from '@/types';
import DeclineTeamInvitationButton from './DeclineTeamInvitationButton';

// Load the authorized recipient view before showing recipient actions.
export default function TeamInvitationRecipientActions({ inviteId, refreshKey = 0, onSaved }: {
  inviteId: string; refreshKey?: number; onSaved: () => void;
}) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setLoadError(null);
    setInvite(null);
    let active = true;
    void userService.getInviteById(inviteId)
      .then((value) => { if (active) setInvite(value); })
      .catch((failure: unknown) => {
        if (!active) return;
        if (isApiRequestError(failure) && [403, 404].includes(failure.status)) return;
        setLoadError('Invitation actions could not load. Try again.');
      });
    return () => { active = false; };
  }, [inviteId, refreshKey, retry]);
  if (loadError) return <Alert color="red">{loadError}<Button variant="subtle" onClick={() => setRetry((value) => value + 1)}>Retry</Button></Alert>;
  if (!invite) return null;
  if (invite.status !== 'PENDING') return <Text>{invite.invitationLabel || `Invitation ${invite.status?.toLowerCase()}`}</Text>;
  const saved = async () => { setInvite(null); onSaved(); };
  const decline = async () => {
    setSaving(true); setError(null);
    try { await userService.declineInvite(inviteId); await saved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The decline could not be confirmed. Retry the same action.'); }
    finally { setSaving(false); }
  };
  return <Stack gap="xs">
    {error ? <Alert color="red">{error}</Alert> : null}
    <Button variant="default" loading={saving} onClick={() => { void decline(); }}>Decline</Button>
    <DeclineTeamInvitationButton invite={invite} disabled={saving} onSaved={saved} />
  </Stack>;
}
