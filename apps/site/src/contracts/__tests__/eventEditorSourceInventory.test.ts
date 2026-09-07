import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { kotlinDeclaration, kotlinProperties, kotlinBodyProperties, webProperties } from '@/test/eventEditor/sourceInventory';
import inventory from '../../../../../test-fixtures/event-editor/source-field-inventory.json';

const root = resolve('../..');

describe('Event Editor state and persisted field classifications', () => {
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
