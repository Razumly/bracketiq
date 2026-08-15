'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Paper, Text } from '@mantine/core';

type RegistrationHoldTimerProps = {
  expiresAt?: string | null;
  onExpire?: () => void;
};

const formatRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function RegistrationHoldTimer({
  expiresAt,
  onExpire,
}: RegistrationHoldTimerProps) {
  const expiresAtMs = useMemo(() => {
    if (!expiresAt) {
      return null;
    }
    const parsed = new Date(expiresAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [expiresAt]);
  const [clockSeed] = useState(() => Date.now());
  const clockNowRef = useRef(clockSeed);
  const subscribeToClock = useCallback((onStoreChange: () => void) => {
    if (!expiresAtMs) {
      return () => undefined;
    }
    const tick = () => {
      clockNowRef.current = Date.now();
      onStoreChange();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAtMs]);
  const getClockSnapshot = useCallback(() => clockNowRef.current, []);
  const getServerClockSnapshot = useCallback(() => clockSeed, [clockSeed]);
  const nowMs = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
  const remainingMs = expiresAtMs ? expiresAtMs - nowMs : 0;


  const notifiedExpiryRef = useRef<number | null>(null);

  useEffect(() => {
    if (!expiresAtMs) {
      notifiedExpiryRef.current = null;
      return;
    }
    if (remainingMs <= 0 && notifiedExpiryRef.current !== expiresAtMs) {
      notifiedExpiryRef.current = expiresAtMs;
      onExpire?.();
    }
  }, [expiresAtMs, onExpire, remainingMs]);

  if (!expiresAtMs || remainingMs <= 0) {
    return null;
  }

  return (
    <Paper
      withBorder
      shadow="md"
      radius="md"
      px="md"
      py="sm"
      className="fixed bottom-4 left-4 z-[2600] bg-white/95"
    >
      <Text size="sm" fw={600}>
        Your registration is held for {formatRemaining(remainingMs)}
      </Text>
    </Paper>
  );
}
