import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { kotlinDeclaration, kotlinProperties, kotlinBodyProperties, webProperties } from '@/test/eventEditor/sourceInventory';
import inventory from '../../../../../test-fixtures/event-editor/source-field-inventory.json';

const root = resolve('../..');

const kotlinFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? kotlinFiles(path) : entry.name.endsWith('.kt') ? [path] : [];
});

describe('Event Editor state and persisted field classifications', () => {
  it('classifies nested network and model declarations referenced by the proposal graph', () => {
    const declarations = new Map<string, string>();
    ['network', 'model'].flatMap((module) => kotlinFiles(resolve(root, `apps/mobile/core/${module}/src/commonMain`))).forEach((file) => {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/data class (\w+)/g)) declarations.set(match[1], source);
    });
    const classified = new Set(inventory.sources.map(({ symbol }) => symbol));
    const queue = ['EventApiDto', 'MatchApiDto'];
    const visited = new Set<string>();
    while (queue.length) {
      const symbol = queue.shift()!;
      if (visited.has(symbol)) continue;
      visited.add(symbol);
      expect(classified.has(symbol)).toBe(true);
      const source = declarations.get(symbol)!;
      kotlinProperties(kotlinDeclaration(source, symbol)).forEach((field) => {
        const type = field.slice(field.indexOf(':') + 1).split('=')[0];
        queue.push(...(type.match(/\b[A-Z]\w*/g) ?? []).filter((name) => declarations.has(name)));
      });
    }
  });
  it.each(inventory.sources)('requires a classification for every $symbol field', ({ file, symbol, language, fields, mobileOwner }) => {
    const source = readFileSync(resolve(root, file), 'utf8');
    const actual = language === 'kotlin'
      ? [...kotlinProperties(kotlinDeclaration(source, symbol)), ...kotlinBodyProperties(source, symbol)].sort()
      : webProperties(source, symbol);
    expect(fields.map((field) => field.declaration).sort()).toEqual(actual);
    expect(existsSync(resolve(root, mobileOwner))).toBe(true);
    fields.forEach((field) => {
      expect(['covered', 'derived', 'immutable', 'server-owned', 'conditional', 'intentionally-excluded']).toContain(field.classification);
      expect(field.reason.trim().length).toBeGreaterThan(15);
    });
  });

  it('includes derived and ignored Room properties without treating local variables as fields', () => {
    const source = 'data class Event(\n    val priceCents: Int,\n) {\n    @Ignore\n    var price: Double = 0.0\n    fun f() {\n        val local: Int = 7\n    }\n}';
    expect(kotlinBodyProperties(source, 'Event')).toEqual(['@Ignore var price: Double = 0.0']);
  });

  it('detects a changed default and a new field in a mobile state declaration', () => {
    const source = 'data class Draft(\n val timeZone: String = "Pacific/Auckland",\n val count: Int = 7,\n)';
    expect(kotlinProperties(kotlinDeclaration(source, 'Draft'))).toEqual(['val count: Int = 7', 'val timeZone: String = "Pacific/Auckland"']);
  });
});
