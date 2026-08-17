'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

type ActiveRegistrationHoldTimerProps = {
  expiresAtMs: number;
  onExpire?: () => void;
};

function ActiveRegistrationHoldTimer({
  expiresAtMs,
  onExpire,
}: ActiveRegistrationHoldTimerProps) {
  const [initialNowMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(initialNowMs);
  const wasActiveAtMount = initialNowMs < expiresAtMs;
  const notifiedExpiryRef = useRef(false);

  useEffect(() => {
    if (!wasActiveAtMount) {
      return;
    }

    const interval = window.setInterval(() => {
      const nextNowMs = Date.now();
      setNowMs(nextNowMs);
      if (nextNowMs >= expiresAtMs) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiresAtMs, wasActiveAtMount]);

  useEffect(() => {
    if (
      !wasActiveAtMount ||
      nowMs < expiresAtMs ||
      notifiedExpiryRef.current
    ) {
      return;
    }

    notifiedExpiryRef.current = true;
    onExpire?.();
  }, [expiresAtMs, nowMs, onExpire, wasActiveAtMount]);

  const remainingMs = expiresAtMs - nowMs;
  if (!wasActiveAtMount || remainingMs <= 0) {
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

export default function RegistrationHoldTimer({
  expiresAt,
  onExpire,
}: RegistrationHoldTimerProps) {
  const expiresAtMs = useMemo(() => {
    if (!expiresAt) {
      return null;
    }
    const parsed = Date.parse(expiresAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [expiresAt]);

  if (expiresAtMs === null) {
    return null;
  }

  return (
    <ActiveRegistrationHoldTimer
      key={expiresAtMs}
      expiresAtMs={expiresAtMs}
      onExpire={onExpire}
    />
  );
}
