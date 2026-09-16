import type { ReflowMatch } from './types';
import { ReflowInputError } from './validateInput';

export function orderReflowMatches(matches: readonly ReflowMatch[]): ReflowMatch[] {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const pending = new Map<string, number>();
  const dependants = new Map<string, ReflowMatch[]>();
  for (const match of matches) {
    const dependencies = [...new Set(match.dependencyIds)].filter((id) => byId.has(id));
    pending.set(match.id, dependencies.length);
    for (const id of dependencies) {
      const children = dependants.get(id) ?? [];
      children.push(match);
      dependants.set(id, children);
    }
  }
  const compare = (a: ReflowMatch, b: ReflowMatch) => a.batch - b.batch || a.order - b.order || a.id.localeCompare(b.id);
  const ready = matches.filter((match) => pending.get(match.id) === 0).sort(compare);
  const result: ReflowMatch[] = [];
  while (ready.length) {
    const match = ready.shift()!;
    result.push(match);
    for (const child of dependants.get(match.id) ?? []) {
      const count = pending.get(child.id)! - 1;
      pending.set(child.id, count);
      if (count !== 0) continue;
      const index = ready.findIndex((entry) => compare(child, entry) < 0);
      ready.splice(index === -1 ? ready.length : index, 0, child);
    }
  }
  if (result.length !== matches.length) throw new ReflowInputError('The Match Graph contains a dependency cycle.');
  return result;
}
