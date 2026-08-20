import { Match } from './types';
import type { League, Tournament } from './types';

type SchedulerEvent = League | Tournament;

export type SchedulerStateCaptureOptions = {
  matchIds?: ReadonlySet<string>;
};

export type SchedulerStateSnapshot = Array<{
  target: object;
  values: Map<PropertyKey, unknown>;
}>;

export const captureSchedulerState = (
  event: SchedulerEvent,
  options: SchedulerStateCaptureOptions = {},
): SchedulerStateSnapshot => {
  const snapshots: SchedulerStateSnapshot = [];
  const pending: object[] = [event];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const target = pending.pop();
    if (!target || visited.has(target) || target instanceof Date) {
      continue;
    }
    visited.add(target);
    if (
      options.matchIds
      && target instanceof Match
      && !options.matchIds.has(target.id)
    ) {
      continue;
    }
    const values = new Map<PropertyKey, unknown>();
    for (const key of Reflect.ownKeys(target)) {
      const value = Reflect.get(target, key);
      values.set(key, value);
      if (typeof value === 'object' && value !== null) {
        pending.push(value);
      }
    }
    snapshots.push({ target, values });
  }
  return snapshots;
};

export const restoreSchedulerState = (snapshots: SchedulerStateSnapshot): void => {
  for (const { target, values } of snapshots) {
    for (const key of Reflect.ownKeys(target)) {
      if (!values.has(key)) {
        Reflect.deleteProperty(target, key);
      }
    }
    for (const [key, value] of values) {
      Reflect.set(target, key, value);
    }
  }
};
