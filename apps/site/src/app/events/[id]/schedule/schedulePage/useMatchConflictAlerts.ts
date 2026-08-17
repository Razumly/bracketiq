import { useCallback, useMemo, useState } from 'react';

import type { Match } from '@/types';

import { detectMatchConflictsById } from '../lib/matchConflicts';
import {
  buildMatchConflictAlertMessage,
  listMatchConflictPairs,
} from './helpers';

type UseMatchConflictAlertsParams = {
  matches: Match[];
};

export default function useMatchConflictAlerts({ matches }: UseMatchConflictAlertsParams) {
  const [alertState, setAlertState] = useState<{
    signature: string;
    dismissed: boolean;
    overrideMessage: string | null;
  } | null>(null);

  const matchConflictsById = useMemo<Record<string, string[]>>(
    () => detectMatchConflictsById(matches),
    [matches],
  );
  const matchConflictPairs = useMemo(
    () => listMatchConflictPairs(matchConflictsById),
    [matchConflictsById],
  );
  const matchConflictSignature = useMemo(
    () => matchConflictPairs.map((pair) => `${pair.firstId}|${pair.secondId}`).join(','),
    [matchConflictPairs],
  );
  const hasMatchConflicts = matchConflictPairs.length > 0;
  const baseMatchConflictMessage = useMemo(
    () => (
      hasMatchConflicts
        ? buildMatchConflictAlertMessage({
            matches,
            pairs: matchConflictPairs,
          })
        : null
    ),
    [hasMatchConflicts, matchConflictPairs, matches],
  );
  const currentAlertState = alertState?.signature === matchConflictSignature ? alertState : null;
  const visibleMatchConflictMessage = useMemo(() => {
    if (!hasMatchConflicts) {
      return null;
    }
    if (currentAlertState?.overrideMessage) {
      return currentAlertState.overrideMessage;
    }
    if (currentAlertState?.dismissed) {
      return null;
    }
    return baseMatchConflictMessage;
  }, [baseMatchConflictMessage, currentAlertState, hasMatchConflicts]);


  const clearMatchConflictDraftAlerts = useCallback(() => {
    setAlertState(null);
  }, []);

  const dismissMatchConflictMessage = useCallback(() => {
    setAlertState({
      signature: matchConflictSignature,
      dismissed: true,
      overrideMessage: null,
    });
  }, [matchConflictSignature]);

  const showCurrentMatchConflictOverride = useCallback(() => {
    if (!hasMatchConflicts) {
      return;
    }
    setAlertState({
      signature: matchConflictSignature,
      dismissed: false,
      overrideMessage: buildMatchConflictAlertMessage({
        matches,
        pairs: matchConflictPairs,
      }),
    });
  }, [hasMatchConflicts, matchConflictPairs, matchConflictSignature, matches]);

  return {
    clearMatchConflictDraftAlerts,
    dismissMatchConflictMessage,
    hasMatchConflicts,
    matchConflictPairs,
    matchConflictSignature,
    matchConflictsById,
    showCurrentMatchConflictOverride,
    visibleMatchConflictMessage,
  };
}
