import { createContext, useContext, useEffect, useId, useRef, type ReactNode, type ComponentProps } from 'react';
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck } from 'lucide-react';
import { Avatar, Button, Divider, Group, Modal, Paper, Stack, Text } from '@/components/organization/organization-operation-ui';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/types';
import styles from './EventCheckoutLayout.module.css';

export type EventCheckoutPresentation = 'modal' | 'page';
export type EventCheckoutPageRenderer = (content: ReactNode, summaryAction?: ReactNode) => ReactNode;

type CheckoutSummary = {
    eventName: string;
    isTeamRegistration?: boolean;
    imageUrl?: string;
    divisionName?: string;
    registrantName?: string;
    sportLabel?: string;
    scheduleLabel?: string;
    locationLabel?: string;
    rosterLabel?: string;
    priceCents: number;
};

export const EventCheckoutContext = createContext<CheckoutSummary | null>(null);
type CheckoutStep = 'Entry' | 'Team setup' | 'Players' | 'Requirements' | 'Review and pay';

export function EventCheckoutLayout({ children, step = 'Entry', presentation = 'modal', summaryAction }: {
    children: ReactNode; step?: CheckoutStep; presentation?: EventCheckoutPresentation; summaryAction?: ReactNode;
}) {
    const summary = useContext(EventCheckoutContext);
    const isPage = presentation === 'page';
    if (!summary) return <>{children}</>;
    const steps: CheckoutStep[] = summary.isTeamRegistration
        ? ['Entry', 'Team setup', 'Players', 'Review and pay']
        : ['Entry', 'Requirements', 'Review and pay'];
    const activeStep = summary.isTeamRegistration && step === 'Requirements' ? 'Review and pay' : step;
    return <Stack gap="xl">
        <ol className={isPage ? styles.steps : 'flex flex-wrap gap-3'} aria-label="Registration steps">
            {steps.map((label, index) => (
                <li key={label} aria-current={label === activeStep ? 'step' : undefined}
                    className={isPage ? styles.step : cn('flex items-center gap-2 text-sm', label === activeStep ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    <span className={isPage ? styles.stepNumber : cn('flex size-8 items-center justify-center rounded-full border', label === activeStep ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{index + 1}</span>
                    <span>{summary.isTeamRegistration && label === 'Entry' ? 'Choose team' : label}</span>
                </li>
            ))}
        </ol>
        <div className={isPage ? styles.columns : 'grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px]'}>
            {isPage ? <Paper withBorder p="lg" radius="lg" className={styles.content}>{children}</Paper> : <div className="min-w-0">{children}</div>}
            <Paper component="aside" aria-label="Registration summary" withBorder radius="lg" p="lg" className={isPage ? styles.summary : 'md:sticky md:top-4'}>
                <Stack gap="md">
                    <Text component={isPage ? 'h2' : 'h3'} fw={700} className={isPage ? styles.summaryTitle : undefined}>Registration summary</Text>
                    <Group wrap="nowrap" align="flex-start">
                        <Avatar src={summary.imageUrl} alt="" size={64} radius="md" className={isPage ? styles.eventImage : undefined} />
                        <div className="min-w-0 break-words"><Text fw={700}>{summary.eventName}</Text>
                            {isPage && summary.sportLabel ? <Text size="sm" c="dimmed">{summary.sportLabel}</Text> : null}
                            {isPage && summary.scheduleLabel ? <Text size="sm" c="dimmed">{summary.scheduleLabel}</Text> : null}
                            {summary.divisionName ? <Text size="sm" c="dimmed">{summary.divisionName}</Text> : null}
                        </div>
                    </Group>
                    <dl className={isPage ? styles.summaryDetails : 'space-y-4'}>
                        {isPage ? <div><dt>Registration type</dt><dd>{summary.isTeamRegistration ? 'Team registration' : 'Individual registration'}</dd></div> : null}
                        {summary.registrantName ? <div className={isPage ? undefined : 'flex flex-wrap justify-between gap-2'}><dt className="text-muted-foreground">{summary.isTeamRegistration ? 'Team' : 'Registering'}</dt><dd className="font-semibold">{summary.registrantName}</dd></div> : null}
                        {isPage && summary.rosterLabel ? <div><dt>Roster</dt><dd>{summary.rosterLabel}</dd></div> : null}
                    </dl>
                    <Divider />
                    <Group justify="space-between"><Text>Registration price</Text><Text fw={700} className={isPage ? styles.price : undefined}>{formatPrice(summary.priceCents)}</Text></Group>
                    <Text size="sm" c="dimmed">Any discounts, payment schedule, and applicable fees are shown before payment.</Text>
                    <div className={isPage ? styles.paymentNote : undefined}>
                        {isPage ? <ShieldCheck size={18} aria-hidden="true" /> : null}
                        <Text size="sm" c={isPage ? undefined : 'dimmed'}>Stripe securely collects payment details. This saved progress does not confirm registration or payment.</Text>
                    </div>
                    {isPage ? summaryAction : null}
                </Stack>
            </Paper>
        </div>
    </Stack>;
}

export function EventCheckoutPage({ children, onBack, summaryAction }: {
    children: ReactNode; onBack: () => void; summaryAction?: ReactNode;
}) {
    const summary = useContext(EventCheckoutContext);
    const headingId = useId();
    const headingRef = useRef<HTMLHeadingElement>(null);
    const pageRef = useRef<HTMLElement>(null);
    const actionRef = useRef<HTMLDivElement>(null);
    const hasSummaryAction = Boolean(summary && summaryAction);
    useEffect(() => { headingRef.current?.focus(); }, []);
    useEffect(() => {
        const page = pageRef.current;
        const action = actionRef.current;
        if (!page || !action) return;
        const observer = new ResizeObserver(([entry]) => {
            page.style.setProperty('--checkout-action-height', `${entry.borderBoxSize[0].blockSize}px`);
        });
        observer.observe(action);
        return () => observer.disconnect();
    }, [hasSummaryAction]);
    return (
        <section ref={pageRef} className={cn(styles.page, hasSummaryAction && styles.pageWithAction)} aria-labelledby={headingId}>
            <Button variant="subtle" onClick={onBack} className={styles.back} leftSection={<ArrowLeft size={18} aria-hidden="true" />}>
                Back to {summary?.eventName}
            </Button>
            <header className={styles.header}>
                <div>
                    <h1 id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
                        {summary?.isTeamRegistration ? 'Choose a team' : 'Choose registration'}
                    </h1>
                    <p className={styles.subtitle}>
                        {summary?.isTeamRegistration ? 'Select a team to continue registration for this event.' : 'Choose how you would like to register for this event.'}
                    </p>
                </div>
                {summary ? <div className={styles.eventContext}>
                    <span className={styles.eventIcon}><CalendarDays size={22} aria-hidden="true" /></span>
                    <div>
                        <Text fw={700}>{summary.eventName}</Text>
                        <Text size="sm" c="dimmed">{summary.sportLabel}{summary.sportLabel ? ' · ' : ''}{summary.isTeamRegistration ? 'Team registration' : 'Individual registration'}</Text>
                        {summary.locationLabel ? <p className={styles.location}><MapPin size={14} aria-hidden="true" />{summary.locationLabel}</p> : null}
                    </div>
                </div> : null}
            </header>
            <EventCheckoutLayout presentation="page" summaryAction={summary && summaryAction ? (
                <div ref={actionRef} className={styles.summaryAction}>
                    <div className={styles.mobileTotal}>
                        <Text size="sm" c="dimmed">Registration price</Text>
                        <Text fw={700} className={styles.price}>{formatPrice(summary.priceCents)}</Text>
                    </div>
                    {summaryAction}
                </div>
            ) : null}>{children}</EventCheckoutLayout>
        </section>
    );
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
