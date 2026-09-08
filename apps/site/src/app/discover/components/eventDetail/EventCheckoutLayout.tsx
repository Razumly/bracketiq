import { createContext, useContext, type ReactNode } from 'react';
import { Avatar, Badge, Divider, Group, Modal, Paper, Stack, Text, type ModalProps } from '@mantine/core';
import { formatPrice } from '@/types';

type CheckoutSummary = {
    eventName: string;
    imageUrl?: string;
    divisionName?: string;
    registrantName?: string;
    priceCents: number;
};

export const EventCheckoutContext = createContext<CheckoutSummary | null>(null);

export function EventCheckoutLayout({ children, step = 'Entry' }: {
    children: ReactNode; step?: 'Entry' | 'Requirements' | 'Review and pay';
}) {
    const summary = useContext(EventCheckoutContext);
    if (!summary) return <>{children}</>;
    return <Stack gap="xl">
        <Group gap="sm" aria-label="Registration steps">
            {(['Entry', 'Requirements', 'Review and pay'] as const).map((label, index) => (
                <Badge key={label} variant={label === step ? 'filled' : 'light'} size="lg">
                    {index + 1}. {label}
                </Badge>
            ))}
        </Group>
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">{children}</div>
            <Paper component="aside" aria-label="Registration summary" withBorder radius="lg" p="lg" className="md:sticky md:top-4">
                <Stack gap="md">
                    <Group wrap="nowrap" align="flex-start">
                        <Avatar src={summary.imageUrl} alt="" size={64} radius="md" />
                        <div><Text fw={700}>{summary.eventName}</Text>
                            {summary.divisionName ? <Text size="sm" c="dimmed">{summary.divisionName}</Text> : null}
                        </div>
                    </Group>
                    {summary.registrantName ? <div><Text size="xs" c="dimmed">Registering</Text><Text fw={600}>{summary.registrantName}</Text></div> : null}
                    <Divider />
                    <Group justify="space-between"><Text>Registration price</Text><Text fw={700}>{formatPrice(summary.priceCents)}</Text></Group>
                    <Text size="xs" c="dimmed">Any discounts, payment schedule, and applicable fees are shown before payment.</Text>
                </Stack>
            </Paper>
        </div>
    </Stack>;
}

export function EventCheckoutModal({ children, step = 'Requirements', ...props }: ModalProps & {
    step?: 'Entry' | 'Requirements' | 'Review and pay';
}) {
    const summary = useContext(EventCheckoutContext);
    return <Modal {...props} size={summary ? 1040 : props.size}>
        <EventCheckoutLayout step={step}>{children}</EventCheckoutLayout>
    </Modal>;
}
