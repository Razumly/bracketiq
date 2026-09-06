'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Select,
  Text,
  TextInput,
} from '@mantine/core';

import { matchRosterService, type MatchRosterEntry, type MatchRosterResponse } from '@/lib/matchRosterService';
import type { Match, Team } from '@/types';

type MatchRosterModalProps = {
  opened: boolean;
  eventId: string | null;
  match: Match | null;
  team: Team | null;
  onClose: () => void;
};

const entryName = (entry: MatchRosterEntry): string => (
  [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim()
  || entry.userName
  || entry.email
  || entry.userId
  || 'Temporary player'
);

const isCompletedMatch = (match: Match | null): boolean => {
  const status = String(match?.status ?? '').toUpperCase();
  const resultType = String(match?.resultType ?? '').toUpperCase();
  return status === 'COMPLETE' || status === 'CANCELLED' || resultType === 'FORFEIT' || Boolean(match?.actualEnd);
};

export default function MatchRosterModal({
  opened,
  eventId,
  match,
  team,
  onClose,
}: MatchRosterModalProps) {
  const [rosters, setRosters] = useState<NonNullable<MatchRosterResponse['rosters']>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const roster = rosters.find((row) => row.eventTeamId === selectedTeamId) ?? rosters[0];
  const entries = roster?.entries ?? [];
  const [allowEdits, setCanEdit] = useState(false);
  const [allowAdds, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [linkEmailByEntryId, setLinkEmailByEntryId] = useState<Record<string, string>>({});
  const eventTeamId = roster?.eventTeamId ?? team?.$id ?? null;
  const canEdit = roster?.canEdit === true && allowEdits;
  const canAdd = roster?.canEdit === true && allowAdds;
  const completed = isCompletedMatch(match);

  const endpoint = useMemo(() => {
    if (!eventId || !match?.$id) return null;
    return `/api/events/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(match.$id)}/roster`;
  }, [eventId, match?.$id]);

  const requestVersion = useRef(0);
  const viewVersion = useRef(0);
  const loadRoster = async () => {
    if (!endpoint) return;
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await matchRosterService.getRosters(endpoint);
      if (request !== requestVersion.current) return;
      setRosters(response.rosters ?? []);
      setCanEdit(response.allowMatchRosterEdits === true);
      setCanAdd(response.allowTemporaryMatchPlayers === true);
    } catch (err) {
      if (request !== requestVersion.current) return;
      setRosters([]);
      setCanEdit(false);
      setCanAdd(false);
      console.error('Failed to load match roster', err);
      setError('Failed to load match roster.');
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    viewVersion.current += 1;
    setSaving(false);
    setRosters([]);
    setSelectedTeamId(team?.$id ?? null);
    setCanEdit(false);
    setCanAdd(false);
    setError(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setLinkEmailByEntryId({});
    if (opened) void loadRoster();
    return () => { requestVersion.current += 1; viewVersion.current += 1; };
  }, [opened, endpoint]);

  const submitOperation = async (body: Record<string, unknown>) => {
    if (!endpoint || !eventTeamId) return;
    const view = viewVersion.current;
    setSaving(true);
    setError(null);
    try {
      await matchRosterService.updateRoster(endpoint, { eventTeamId, ...body });
      if (view === viewVersion.current) await loadRoster();
    } catch (err) {
      if (view !== viewVersion.current) return;
      console.error('Failed to update match roster', err);
      setError(err instanceof Error ? err.message : 'Failed to update match roster.');
    } finally {
      if (view === viewVersion.current) setSaving(false);
    }
  };

  const addTemporaryPlayer = async () => {
    const view = viewVersion.current;
    await submitOperation({
      addPlayer: {
        firstName,
        lastName,
        email: email.trim() || undefined,
      },
    });
    if (view !== viewVersion.current) return;
    setFirstName('');
    setLastName('');
    setEmail('');
  };

  const linkTemporaryEntry = async (entry: MatchRosterEntry) => {
    if (!entry.id) return;
    const linkEmail = linkEmailByEntryId[entry.id]?.trim() || entry.email?.trim() || undefined;
    await submitOperation({
      addPlayer: {
        entryId: entry.id,
        email: linkEmail,
      },
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Match roster"
      centered
      size="lg"
    >
      <Stack gap="md">
        {rosters.length > 1 && <Select label="Team" value={roster?.eventTeamId ?? null}
          data={rosters.map((row) => ({ value: row.eventTeamId, label: row.teamName ?? 'Team name unavailable' }))}
          onChange={(id) => { setSelectedTeamId(id); }} />}
        {error && <Text c="red" size="sm">{error}</Text>}
        <Stack gap="xs">
          {loading ? (
            <Text size="sm" c="dimmed">Loading roster...</Text>
          ) : entries.length ? entries.map((entry) => {
            const removed = String(entry.status).toUpperCase() === 'REMOVED';
            const temporary = entry.source === 'TEMPORARY';
            const linkKey = entry.id ?? '';
            return (
              <Paper key={`${entry.source}:${entry.userId ?? entry.id ?? entry.email}`} withBorder p="sm" radius="sm" opacity={removed ? 0.55 : 1}>
                <Stack gap="xs">
                  <Group justify="space-between" gap="sm" wrap="nowrap">
                    <Group gap="xs" style={{ minWidth: 0 }}>
                      <Text fw={600} style={{ minWidth: 0 }}>{entryName(entry)}</Text>
                      {temporary && <Badge variant="light">Temporary</Badge>}

                      {removed && <Badge color="red" variant="light">Removed</Badge>}
                    </Group>
                    {canEdit && !completed && !temporary && entry.userId && (
                      <Button
                        size="xs"
                        variant={removed ? 'light' : 'subtle'}
                        color={removed ? 'green' : 'red'}
                        loading={saving}
                        onClick={() => submitOperation(removed
                          ? { restorePlayer: { userId: entry.userId } }
                          : { removePlayer: { userId: entry.userId } })}
                      >
                        {removed ? 'Add' : 'Remove'}
                      </Button>
                    )}
                  </Group>
                  {entry.documentReadiness ? (
                    <Stack gap={2}>
                      <Text size="sm">Signatures: {entry.documentReadiness.documents.signedCount}/{entry.documentReadiness.documents.requiredCount}</Text>
                      {entry.documentReadiness.requiredDocuments.filter((document) => document.status !== 'SIGNED').map((document) => (
                        <Text key={document.key} size="sm" c="orange">Missing: {document.title} ({document.signerLabel})</Text>
                      ))}
                    </Stack>
                  ) : <Text size="sm" c="dimmed">Document readiness unavailable</Text>}
                  {canAdd && !completed && temporary && !entry.userId && entry.id && (
                    <Group align="flex-end" gap="xs">
                      <TextInput
                        label="Link email"
                        placeholder="player@example.com"
                        value={linkEmailByEntryId[linkKey] ?? entry.email ?? ''}
                        onChange={(event) => setLinkEmailByEntryId((current) => ({
                          ...current,
                          [linkKey]: event.currentTarget.value,
                        }))}
                        style={{ flex: 1 }}
                      />
                      <Button size="xs" loading={saving} onClick={() => linkTemporaryEntry(entry)}>
                        Link
                      </Button>
                    </Group>
                  )}
                </Stack>
              </Paper>
            );
          }) : (
            <Text size="sm" c="dimmed">No roster entries found.</Text>
          )}
        </Stack>
        {canAdd && !completed && (
          <Paper withBorder p="sm" radius="sm">
            <Stack gap="xs">
              <Text fw={700} size="sm">Add temporary player</Text>
              <Group grow align="flex-end">
                <TextInput label="First name" value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} />
                <TextInput label="Last name" value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} />
              </Group>
              <Group align="flex-end">
                <TextInput
                  label="Email"
                  placeholder="Optional"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button loading={saving} disabled={!firstName.trim() || !lastName.trim()} onClick={addTemporaryPlayer}>
                  Add Player
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
}
