'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Checkbox, Center, Container, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useApp } from '@/app/providers';
import { apiRequest } from '@/lib/apiClient';

type Preview = {
  available: boolean;
  invite: { id: string; profileId: string; hasAttachedEmail: boolean; isMinor?: boolean; teamId?: string | null };
  profile: { displayName: string; isManaged: boolean };
  team?: { id: string; name: string } | null;
};

type ClaimResponse = {
  status?: string;
  primaryProfileId?: string;
  sourceProfileId?: string;
};

export default function ManagedPlayerClaimPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useApp();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [needsBirthdate, setNeedsBirthdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedQuery = useMemo(() => {
    const query = new URLSearchParams();
    ['v', 'e', 's'].forEach((key) => {
      const value = searchParams.get(key);
      if (value) query.set(key, value);
    });
    return query.toString();
  }, [searchParams]);
  const returnPath = `/claim/player/${encodeURIComponent(params.id)}${signedQuery ? `?${signedQuery}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    void apiRequest<Preview>(`/api/public/profile-claims/${encodeURIComponent(params.id)}?${signedQuery}`)
      .then((value) => { if (!cancelled) setPreview(value); })
      .catch(() => { if (!cancelled) setError('This claim link is expired or unavailable.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.id, signedQuery]);

  const claim = async () => {
    if (!preview || !confirmed) return;
    setClaiming(true);
    setError(null);
    try {
      const result = await apiRequest<ClaimResponse>(`/api/user-profiles/${encodeURIComponent(preview.invite.profileId)}/claim?${signedQuery}`, {
        method: 'POST',
        body: {
          inviteId: preview.invite.id,
          confirmation: true,
          ...(dateOfBirth ? { dateOfBirth } : {}),
        },
      });
      if (result.status === 'BIRTHDATE_REQUIRED') {
        setNeedsBirthdate(true);
        setClaiming(false);
        return;
      }
      if (result.status === 'GUARDIAN_REQUIRED') {
        setError('This Player is under 18. A guardian must complete the next invitation step.');
        setClaiming(false);
        return;
      }
      if (preview.team?.id) {
        // Profile claiming and Team acceptance are separate actions. Continue
        // directly to the signed Team invitation after the profile is claimed.
        router.replace(`/i/${encodeURIComponent(preview.invite.id)}${signedQuery ? `?${signedQuery}` : ''}`);
      } else router.replace('/profile');
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'The profile could not be claimed.');
      setClaiming(false);
    }
  };

  if (loading || authLoading) return <Center mih="70vh"><Loader /></Center>;
  return (
    <Container size="xs" py={64}>
      <Paper withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="md">
          <Title order={1} size="h2">Claim this Player profile</Title>
          {preview ? <Text>{preview.profile.displayName} is a Managed Player profile. Claim it to keep this roster history with your account.</Text> : null}
          {preview?.invite.hasAttachedEmail ? <Text size="sm" c="dimmed">Your verified account email must match the {preview.invite.isMinor ? 'guardian' : 'Player'} email.</Text> : <Text size="sm" c="dimmed">This signed link proves the profile invitation. You must still sign in and confirm.</Text>}
          {error ? <Alert color="red">{error}</Alert> : null}
          {preview && !error ? (
            isAuthenticated ? (
              <>
                {needsBirthdate ? (
                  <TextInput
                    type="date"
                    label="Date of birth"
                    description="We need this before we choose the Player or guardian acceptance path."
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.currentTarget.value)}
                    required
                  />
                ) : null}
                <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} label={preview.invite.isMinor ? 'I confirm that I am authorized to act for this Player.' : 'I confirm that this profile belongs to me.'} />
                <Button onClick={() => { void claim(); }} loading={claiming} disabled={!confirmed || (needsBirthdate && !dateOfBirth)}>Claim profile</Button>
              </>
            ) : (
              <Stack gap="xs">
                <Button onClick={() => router.push(`/login?next=${encodeURIComponent(returnPath)}`)}>Sign in to claim</Button>
                <Button variant="light" onClick={() => router.push(`/login?mode=signup&next=${encodeURIComponent(returnPath)}`)}>Create an account</Button>
              </Stack>
            )
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
}
