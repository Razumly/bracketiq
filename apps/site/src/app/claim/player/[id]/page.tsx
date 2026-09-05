'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Checkbox, Center, Container, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useApp } from '@/app/providers';
import { apiRequest } from '@/lib/apiClient';
import TeamInvitationRecipientActions from '@/components/ui/TeamInvitationRecipientActions';

type Preview = {
  available: boolean;
  invite: { id: string; profileId: string; hasAttachedEmail: boolean; isMinor?: boolean; teamId?: string | null;
    guardianSetupRequired?: boolean; guardianContactRequired?: boolean; guardianDeclaration?: string; birthdateRequired?: boolean };
  profile: { displayName: string; isManaged: boolean; dateOfBirth?: string | null };
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
  const [recipientRefreshKey, setRecipientRefreshKey] = useState(0);
  const [declined, setDeclined] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [guardianDeclared, setGuardianDeclared] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [needsBirthdate, setNeedsBirthdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [accepted, setAccepted] = useState(false);
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
      .then((value) => { if (!cancelled) { setPreview(value); setNeedsBirthdate(Boolean(value.invite.birthdateRequired)); } })
      .catch(() => { if (!cancelled) setError('This claim link is expired or unavailable.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.id, signedQuery, isAuthenticated]);

  const claim = async (review = false) => {
    if (!preview || (!review && !confirmed)) return;
    setClaiming(true);
    setError(null);
    try {
      const result = await apiRequest<ClaimResponse>(`/api/user-profiles/${encodeURIComponent(preview.invite.profileId)}/claim?${signedQuery}`, {
        method: 'POST',
        body: {
          inviteId: preview.invite.id,
          confirmation: true,
          ...(preview.invite.isMinor ? { guardianDeclaration: guardianDeclared, acceptTeamInvitation: !review, reviewGuardianInvitation: review } : {}),
          ...(dateOfBirth ? { dateOfBirth } : {}),
        },
      });
      if (result.status === 'BIRTHDATE_REQUIRED') {
        setNeedsBirthdate(true);
        setClaiming(false);
        return;
      }
      if (result.status === 'GUARDIAN_REQUIRED') {
        setConfirmed(false);
        setGuardianDeclared(false);
        setPreview(null);
        const updated = await apiRequest<Preview>(`/api/public/profile-claims/${encodeURIComponent(params.id)}?${signedQuery}`);
        setPreview(updated);
        setNeedsBirthdate(Boolean(updated.invite.birthdateRequired));
        setClaiming(false);
        return;
      }
      if (result.status === 'GUARDIAN_READY') {
        setRecipientRefreshKey((key) => key + 1); setClaiming(false);
      } else if (result.status === 'GUARDIAN_ACCEPTED') {
        setAccepted(true);
        setClaiming(false);
      } else if (preview.team?.id) {
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
  if (declined) return <Container size="xs" py={64}><Text>Invitation declined.</Text><Button onClick={() => router.replace('/profile')}>Open profile</Button></Container>;
  if (accepted) return <Container size="xs" py={64}><Stack>
    <Title order={1}>Invitation accepted</Title>
    <Text>{preview?.profile.displayName} has joined {preview?.team?.name ?? 'the team'}. Their Player profile remains separate from yours.</Text>
    <Button onClick={() => router.replace('/profile')}>Open profile</Button>
  </Stack></Container>;
  return (
    <Container size="xs" py={64}>
      <Paper withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="md">
          <Title order={1} size="h2">{preview?.invite.isMinor ? 'Accept for your child' : 'Claim this Player profile'}</Title>
          {preview ? <Text>{preview.invite.isMinor
            ? `Review ${preview.profile.displayName}’s invitation to ${preview.team?.name ?? 'the team'}. This child keeps a separate Player profile.`
            : `${preview.profile.displayName} is a Managed Player profile. Claim it to keep this roster history with your account.`}</Text> : null}
          {preview?.profile.dateOfBirth ? <Text>Date of birth: {preview.profile.dateOfBirth}</Text> : null}
          {preview?.invite.guardianContactRequired
            ? <Alert color="yellow">Ask the team manager to add a guardian contact and issue a new invitation.</Alert>
            : preview?.invite.isMinor && !preview.invite.guardianSetupRequired
            ? <Text size="sm" c="dimmed">Your active guardian relationship is ready. Review and accept the invitation below.</Text>
            : preview?.invite.hasAttachedEmail ? <Text size="sm" c="dimmed">Your verified account email must match the {preview.invite.isMinor ? 'guardian' : 'Player'} email.</Text> : <Text size="sm" c="dimmed">This signed link proves the profile invitation. You must still sign in and confirm.</Text>}
          {error ? <Alert color="red">{error}</Alert> : null}
          {preview ? (
            isAuthenticated ? (preview.invite.guardianContactRequired ? null : (
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
                {preview.invite.guardianSetupRequired ? <>
                  <Checkbox checked={guardianDeclared} onChange={(event) => setGuardianDeclared(event.currentTarget.checked)} label={preview.invite.guardianDeclaration} />
                  <Text size="sm" c="dimmed">We record your declaration. Email verification and this declaration do not independently verify guardianship.</Text>
                </> : null}
                <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} label={preview.invite.isMinor ? `I accept this team invitation for ${preview.profile.displayName}.` : 'I confirm that this profile belongs to me.'} />
                <Button onClick={() => { void claim(); }} loading={claiming} disabled={!confirmed || (preview.invite.guardianSetupRequired && !guardianDeclared) || (needsBirthdate && !dateOfBirth)}>{preview.invite.isMinor ? 'Accept team invitation' : 'Claim profile'}</Button>
                {preview.invite.isMinor ? <>
                  {preview.invite.guardianSetupRequired ? <Button variant="subtle" disabled={!guardianDeclared || claiming} onClick={() => { void claim(true); }}>Confirm guardian relationship to review decline options</Button> : null}
                  <TeamInvitationRecipientActions inviteId={params.id} refreshKey={recipientRefreshKey} onSaved={() => setDeclined(true)} />
                </> : null}
              </>
            )) : (
              <Stack gap="xs">
                <Button onClick={() => router.push(`/login?next=${encodeURIComponent(returnPath)}`)}>{preview.invite.isMinor ? 'Sign in as guardian' : 'Sign in to claim'}</Button>
                <Button variant="light" onClick={() => router.push(`/login?mode=signup&next=${encodeURIComponent(returnPath)}`)}>Create an account</Button>
              </Stack>
            )
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
}
