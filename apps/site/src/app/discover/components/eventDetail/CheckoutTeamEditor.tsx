import { useState } from 'react';
import { Alert, Button, Group, NumberInput, Stack, TextInput } from '@mantine/core';
import type { Team } from '@/types';
import { teamService } from '@/lib/teamService';
import { EventCheckoutModal } from './EventCheckoutLayout';

export function CheckoutTeamEditor({ team, onClose, onSaved }: {
    team: Team; onClose: () => void; onSaved: (team: Team) => void;
}) {
    const [name, setName] = useState(team.name);
    const [capacity, setCapacity] = useState<number | string>(team.teamSize);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const save = async () => {
        if (!name.trim() || typeof capacity !== 'number' || capacity < 1 || !Number.isInteger(capacity) || saving) return;
        setSaving(true);
        setError(null);
        try {
            const updated = await teamService.updateTeamDetails(team.$id, { name: name.trim(), teamSize: capacity });
            if (!updated) throw new Error('Could not save the Team. Try again.');
            onSaved(updated);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Could not save the Team.');
        } finally { setSaving(false); }
    };
    return <EventCheckoutModal opened onClose={() => { if (!saving) onClose(); }} title="Edit Team" step="Entry" centered zIndex={1900}>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <Stack>
                <TextInput label="Team name" required value={name} onChange={(event) => setName(event.currentTarget.value)} />
                <NumberInput label="Roster capacity" required min={1} allowDecimal={false} value={capacity} onChange={setCapacity} />
                {error ? <Alert color="red">{error}</Alert> : null}
                <Group justify="flex-end"><Button variant="default" disabled={saving} onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={saving}>Save Team</Button></Group>
            </Stack>
        </form>
    </EventCheckoutModal>;
}
