import { apiRequest, ApiRequestError } from '@/lib/apiClient';
import type { Match } from '@/types';
import { terminalMatchResultSchema, type TerminalMatchResult } from '@/contracts/terminalMatch';
import { updateSchema } from '@/contracts/matchUpdate';

const pending = new Map<string, Record<string, unknown>>();
const storageKey = (key: string) => `bracketiq:terminal:v1:${key}`;
const intent = (payload: Record<string, unknown>) => JSON.stringify(Object.fromEntries(
  Object.entries(payload).filter(([key]) => !['time', 'clientOperationId', 'terminalContractVersion'].includes(key)).sort(),
));

function readPending(key: string): Record<string, unknown> | undefined {
  if (pending.has(key)) return pending.get(key);
  if (typeof window === 'undefined') return undefined;
  const saved = window.sessionStorage.getItem(storageKey(key));
  if (!saved) return undefined;
  const parsed = updateSchema.parse(JSON.parse(saved));
  pending.set(key, parsed);
  return parsed;
}

function clearPending(key: string) {
  pending.delete(key);
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(storageKey(key));
}

/** Send terminal actions through the canonical Match API. */
export async function sendTerminalMatch(eventId: string, matchId: string, payload: Record<string, unknown>) {
  const key = `${eventId}:${matchId}`;
  const requested = updateSchema.parse({
    ...payload,
    terminalContractVersion: 1,
    clientOperationId: payload.clientOperationId ?? crypto.randomUUID(),
    time: payload.time ?? new Date().toISOString(),
  });
  const existing = readPending(key);
  if (existing && intent(existing) !== intent(requested)) {
    throw new Error('Retry the pending terminal action before sending a different action.');
  }
  const command = existing ?? requested;
  // Store before delivery. A lost response must not create a second operation.
  if (typeof window !== 'undefined') window.sessionStorage.setItem(storageKey(key), JSON.stringify(command));
  pending.set(key, command);
  try {
    const response = await apiRequest<{ match: Match; terminalResult: TerminalMatchResult }>(
      `/api/events/${eventId}/matches/terminal`, { method: 'PATCH',
        body: { matchId, update: command }, timeoutMs: 60_000 });
    const result = terminalMatchResultSchema.parse(response.terminalResult);
    if (result.operationId !== command.clientOperationId || result.eventId !== eventId || result.matchId !== matchId) {
      throw new Error('The terminal response does not match the pending action. Retry the action.');
    }
    clearPending(key);
    return response;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500
      && ![408, 429].includes(error.status)) clearPending(key);
    throw error;
  }
}
