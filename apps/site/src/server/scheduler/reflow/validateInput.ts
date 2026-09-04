import { STAFFING_PRIORITIES } from '../../officials/config';
import type { ReflowInput, ReflowPlacement } from './types';

export class ReflowInputError extends Error {
  constructor(reason: string) { super(`Reflow input: ${reason}`); this.name = 'ReflowInputError'; }
}

export function validateReflowInput(input: ReflowInput): void {
  const fail = (message: string): never => { throw new ReflowInputError(message); };
  const ids = new Set(input.matches.map((match) => match.id));
  if (ids.size !== input.matches.length || ids.has('')) fail('Match IDs must be unique and nonempty.');
  if (!Number.isFinite(input.now)) fail('The current time must be valid.');
  if (input.maxStates !== undefined && (!Number.isSafeInteger(input.maxStates) || input.maxStates < 0)) fail('The search budget must be nonnegative.');
  if (!['KEEP_ASSIGNED_FIELDS', 'ALLOW_ELIGIBLE_FIELD_CHANGES'].includes(input.fieldPolicy)) fail('Unknown Resource policy.');
  if (input.changedMatchIds.some((id) => !ids.has(id))) fail('A changed Match does not exist.');
  if (new Set(input.changedMatchIds).size !== input.changedMatchIds.length) fail('Changed Match IDs must be unique.');
  const validWindow = (placement: ReflowPlacement) => placement.fieldId.length > 0
    && Number.isFinite(placement.start) && Number.isFinite(placement.end) && placement.end > placement.start;
  for (const match of input.matches) {
    if (match.dependencyIds.some((id) => !ids.has(id) || id === match.id)) fail('A dependency is invalid.');
    if (!Number.isFinite(match.restMs) || match.restMs < 0 || !Number.isFinite(match.order)
      || !Number.isFinite(match.batch)) fail('Match ordering and rest must be valid.');
    if ((match.placement && !validWindow(match.placement)) || match.windows.some((window) => !validWindow(window))) fail('A placement window is invalid.');
    if (match.actualEnd !== null && (!Number.isFinite(match.actualEnd)
      || (match.placement && match.actualEnd < match.placement.start))) fail('An actual end time is invalid.');
    if (match.occupiedUntil !== undefined && (!match.protected || !Number.isFinite(match.occupiedUntil)
      || (match.placement && match.occupiedUntil < match.placement.end))) fail('A running Match occupancy is invalid.');
    if (match.staffing && !STAFFING_PRIORITIES.includes(match.staffing.priority)) fail('Unknown Staffing Priority.');
  }
}
