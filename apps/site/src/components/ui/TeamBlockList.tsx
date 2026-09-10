'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { userService, type TeamBlock } from '@/lib/userService';

export default function TeamBlockList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [blocks, setBlocks] = useState<TeamBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setBlocks(await userService.listTeamBlocks()); setError(null); }
    catch { setError('Team Blocks could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const remove = async (block: TeamBlock) => {
    setSaving(block.id);
    try {
      await userService.removeTeamBlock(block.teamId, block.playerId);
      setBlocks((current) => current.filter((item) => item.id !== block.id));
      setError(null);
    } catch { setError('The Team Block was not removed. Try again.'); }
    finally { setSaving(null); }
  };
  return <Stack gap="xs">
    {error ? <Alert color="red">{error} <Button variant="subtle" onClick={() => { void load(); }}>Retry</Button></Alert> : null}
    {blocks.length ? <Text fw={600}>Team Blocks</Text> : null}
    {blocks.map((block) => <Paper key={block.id} withBorder p="sm"><Group justify="space-between">
      <Stack gap={2}><Text>{block.teamName || 'Team'}</Text><Text size="sm" c="dimmed">For {block.playerName || 'Player'}</Text></Stack>
      <Button size="xs" variant="default" loading={saving === block.id} disabled={saving !== null && saving !== block.id} onClick={() => { void remove(block); }}>Remove Team Block</Button>
    </Group></Paper>)}
    {blocks.length ? <Text size="sm" c="dimmed">Removing a block permits a new invitation. It does not restore membership or send an invitation.</Text> : null}
  </Stack>;
}
