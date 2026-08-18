import type { ComponentProps } from 'react';
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    NumberInput,
    Paper,
    Select as MantineSelect,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

import type { EventOfficialPosition } from '@/types';
import type { StaffingPriority } from '@/server/officials/config';

import { STAFFING_PRIORITY_OPTIONS } from '../officials';

type StaffOfficialPositionEditorProps = {
    staffingPriority: StaffingPriority;
    officialPositions: EventOfficialPosition[];
    sportDefaultPositionCount: number;
    coverageError?: string | null;
    maxShortTextLength: number;
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    onStaffingPriorityChange: (value: string | null) => void;
    onLoadSportDefaults: () => void;
    onAddPosition: () => void;
    onUpdatePosition: (positionId: string, updates: Partial<EventOfficialPosition>) => void;
    onRemovePosition: (positionId: string) => void;
    showPositions?: boolean;
};


export const StaffOfficialPositionEditor = ({
    staffingPriority,
    officialPositions,
    sportDefaultPositionCount,
    coverageError,
    maxShortTextLength,
    comboboxProps,
    onStaffingPriorityChange,
    onLoadSportDefaults,
    onAddPosition,
    onUpdatePosition,
    onRemovePosition,
    showPositions = true,
}: StaffOfficialPositionEditorProps) => (
    <Paper withBorder radius="md" p="md" bg="white">
        <Stack gap="sm">
            <MantineSelect
                label="Staffing Priority"
                description="Choose how staffing shortages affect match placement."
                data={STAFFING_PRIORITY_OPTIONS}
                value={staffingPriority}
                onChange={onStaffingPriorityChange}
                comboboxProps={comboboxProps}
                error={coverageError ?? undefined}
            />
            {coverageError ? (
                <Alert color="yellow" variant="light">
                    {coverageError}
                </Alert>
            ) : null}
            {showPositions ? <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
                <div>
                    <Title order={6}>Official Positions</Title>
                    <Text size="sm" c="dimmed">
                        Edit the event-specific official positions and slot counts. Sport defaults only seed this list.
                    </Text>
                </div>
                <Group gap="xs">
                    <Button
                        type="button"
                        size="xs"
                        variant="default"
                        disabled={sportDefaultPositionCount === 0}
                        onClick={onLoadSportDefaults}
                    >
                        Load sport defaults
                    </Button>
                    <Button type="button" size="xs" onClick={onAddPosition}>
                        Add position
                    </Button>
                </Group>
            </Group> : null}
            {showPositions ? <Stack gap="xs">
                {officialPositions.map((position) => (
                    <Group key={position.id} align="flex-end" gap="sm" wrap="nowrap">
                        <TextInput
                            label="Position"
                            placeholder="Referee"
                            value={position.name}
                            onChange={(event) => onUpdatePosition(position.id, { name: event.currentTarget.value })}
                            maxLength={maxShortTextLength}
                            className="flex-1"
                        />
                        <NumberInput
                            label="Count"
                            value={position.count}
                            min={1}
                            allowDecimal={false}
                            clampBehavior="strict"
                            onChange={(value) => onUpdatePosition(position.id, { count: Number(value) || 1 })}
                            maw={120}
                        />
                        <ActionIcon
                            type="button"
                            variant="subtle"
                            color="red"
                            aria-label={`Remove ${position.name || 'official position'}`}
                            onClick={() => onRemovePosition(position.id)}
                        >
                            <span aria-hidden="true">×</span>
                        </ActionIcon>
                    </Group>
                ))}
                {officialPositions.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No official positions configured yet. Add them here or load the sport defaults.
                    </Text>
                ) : null}
            </Stack> : null}
        </Stack>
    </Paper>
);
