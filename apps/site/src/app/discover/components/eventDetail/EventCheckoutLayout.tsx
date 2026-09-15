import { createContext, useContext, type ReactNode, type ComponentProps } from 'react';
import { Avatar, Divider, Group, Modal, Paper, Stack, Text } from '@/components/organization/organization-operation-ui';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/types';

type CheckoutSummary = {
    eventName: string;
    isTeamRegistration?: boolean;
    imageUrl?: string;
    divisionName?: string;
    registrantName?: string;
    priceCents: number;
};

export const EventCheckoutContext = createContext<CheckoutSummary | null>(null);
type CheckoutStep = 'Entry' | 'Team setup' | 'Players' | 'Requirements' | 'Review and pay';

export function EventCheckoutLayout({ children, step = 'Entry' }: {
    children: ReactNode; step?: CheckoutStep;
}) {
    const summary = useContext(EventCheckoutContext);
    if (!summary) return <>{children}</>;
    const steps: CheckoutStep[] = summary.isTeamRegistration
        ? ['Entry', 'Team setup', 'Players', 'Review and pay']
        : ['Entry', 'Requirements', 'Review and pay'];
    const activeStep = summary.isTeamRegistration && step === 'Requirements' ? 'Review and pay' : step;
    return <Stack gap="xl">
        <ol className="flex flex-wrap gap-3" aria-label="Registration steps">
            {steps.map((label, index) => (
                <li key={label} aria-current={label === activeStep ? 'step' : undefined}
                    className={cn('flex items-center gap-2 text-sm', label === activeStep ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    <span className={cn('flex size-8 items-center justify-center rounded-full border', label === activeStep ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{index + 1}</span>
                    {summary.isTeamRegistration && label === 'Entry' ? 'Choose team' : label}
                </li>
            ))}
        </ol>
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">{children}</div>
            <Paper component="aside" aria-label="Registration summary" withBorder radius="lg" p="lg" className="md:sticky md:top-4">
                <Stack gap="md">
                    <Text component="h3" fw={700}>Registration summary</Text>
                    <Group wrap="nowrap" align="flex-start">
                        <Avatar src={summary.imageUrl} alt="" size={64} radius="md" />
                        <div><Text fw={700}>{summary.eventName}</Text>
                            {summary.divisionName ? <Text size="sm" c="dimmed">{summary.divisionName}</Text> : null}
                        </div>
                    </Group>
                    {summary.registrantName ? <Group justify="space-between"><Text c="dimmed">{summary.isTeamRegistration ? 'Team' : 'Registering'}</Text><Text fw={600}>{summary.registrantName}</Text></Group> : null}
                    <Divider />
                    <Group justify="space-between"><Text>Registration price</Text><Text fw={700}>{formatPrice(summary.priceCents)}</Text></Group>
                    <Text size="sm" c="dimmed">Any discounts, payment schedule, and applicable fees are shown before payment.</Text>
                    <Text size="sm" c="dimmed">Stripe securely collects payment details. This saved progress does not confirm registration or payment.</Text>
                </Stack>
            </Paper>
        </div>
    </Stack>;
}

export function EventCheckoutModal({ children, step = 'Requirements', zIndex, ...props }: ComponentProps<typeof Modal> & {
    step?: CheckoutStep;
    zIndex?: number;
}) {
    const summary = useContext(EventCheckoutContext);
    return <Modal {...props} size={summary ? 'xl' : props.size}
        styles={{ content: { maxWidth: summary ? 1040 : undefined, zIndex }, ...props.styles }}>
        <EventCheckoutLayout step={step}>{children}</EventCheckoutLayout>
    </Modal>;
}
