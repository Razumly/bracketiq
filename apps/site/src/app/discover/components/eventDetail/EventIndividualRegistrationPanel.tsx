import { useState, type ReactNode } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';

import { formatPrice } from '@/types';

type EventIndividualRegistrationPanelProps = {
    selfRegistrationBlockedReason: string | null;
    isMinor: boolean;
    showSelfWaitlistActions: boolean;
    isUserWaitlisted: boolean;
    selfWaitlistLeaveDisabled: boolean;
    selfWaitlistJoinDisabled: boolean;
    selfJoinDisabled: boolean;
    eventHasStarted: boolean;
    joining: boolean;
    confirmingPurchase: boolean;
    priceCents: number;
    currentUserPaymentFailed: boolean;
    canShowScheduleButton: boolean;
    hostManageQrActions: ReactNode;
    childRegistrationPanel: ReactNode;
    canChooseChild?: boolean;
    onChooseSelf?: () => void;
    onLeaveWaitlist: () => void;
    onJoinWaitlist: () => void;
    onJoinEvent: () => void;
};

export function EventIndividualRegistrationPanel({
    selfRegistrationBlockedReason,
    isMinor,
    showSelfWaitlistActions,
    isUserWaitlisted,
    selfWaitlistLeaveDisabled,
    selfWaitlistJoinDisabled,
    selfJoinDisabled,
    eventHasStarted,
    joining,
    confirmingPurchase,
    priceCents,
    currentUserPaymentFailed,
    canShowScheduleButton,
    hostManageQrActions,
    childRegistrationPanel,
    canChooseChild = false,
    onChooseSelf,
    onLeaveWaitlist,
    onJoinWaitlist,
    onJoinEvent,
}: EventIndividualRegistrationPanelProps) {
    const [childEntry, setChildEntry] = useState(false);
    const showingChild = canChooseChild && childEntry;
    return (
        <div className="space-y-3">
            {canChooseChild ? <Group grow>
                <Button variant={showingChild ? 'default' : 'filled'} onClick={() => { setChildEntry(false); onChooseSelf?.(); }}>Register myself</Button>
                <Button variant={showingChild ? 'filled' : 'default'} onClick={() => setChildEntry(true)}>Register my child</Button>
            </Group> : null}
            {showingChild ? childRegistrationPanel : <>
            {selfRegistrationBlockedReason ? (
                <Alert color="yellow" variant="light">
                    {selfRegistrationBlockedReason}
                </Alert>
            ) : null}
            {!selfRegistrationBlockedReason && isMinor ? (
                <Alert color="blue" variant="light">
                    Your join request will be sent to a linked parent/guardian for approval.
                </Alert>
            ) : null}

            {showSelfWaitlistActions ? (
                isUserWaitlisted ? (
                    <div className="space-y-2">
                        <Text size="sm" c="blue" fw={500} ta="center">
                            {"✓ You're on the waitlist"}
                        </Text>
                        <Button
                            fullWidth
                            color="red"
                            variant="light"
                            onClick={onLeaveWaitlist}
                            disabled={selfWaitlistLeaveDisabled}
                        >
                            {eventHasStarted
                                ? 'Unavailable'
                                : (joining ? 'Updating…' : 'Leave Waitlist')}
                        </Button>
                    </div>
                ) : (
                    <Button
                        fullWidth
                        color="orange"
                        onClick={onJoinWaitlist}
                        disabled={selfWaitlistJoinDisabled}
                    >
                        {eventHasStarted
                            ? 'Unavailable'
                            : joining
                                ? (isMinor ? 'Sending…' : 'Adding…')
                                : (isMinor ? 'Send' : 'Join Waitlist')}
                    </Button>
                )
            ) : (
                <Button
                    fullWidth
                    color="blue"
                    onClick={onJoinEvent}
                    disabled={selfJoinDisabled}
                >
                    {eventHasStarted
                        ? 'Unavailable'
                        : confirmingPurchase
                            ? 'Confirming purchase…'
                            : joining
                                ? 'Submitting…'
                                : isMinor
                                    ? 'Send'
                                    : priceCents > 0
                                        ? (currentUserPaymentFailed
                                            ? 'Complete payment'
                                            : `Join Event - ${formatPrice(priceCents)}`)
                                        : 'Join Event'}
                </Button>
            )}

            {canShowScheduleButton ? (
                <div className="mt-2">{hostManageQrActions}</div>
            ) : null}

            </>}
        </div>
    );
}
