import { describe, expect, it } from 'vitest';
import { generateGridConfig } from '../src/generateConfig.js';

interface Column {
  key: string;
  type?: 'string' | 'number' | 'boolean';
  headerText?: string;
  sort?: boolean;
  filter?: boolean;
  resizable?: boolean;
}

describe('generateGridConfig', () => {
  it('returns columns + data with sensible placeholders by default', () => {
    const config = generateGridConfig({});
    expect(config.columns.length).toBeGreaterThan(0);
    expect(config.data.length).toBeGreaterThan(0);
  });

  it('inferred columns cover every key on the first row', () => {
    const data = [{ id: 1, name: 'X', score: 90, active: true }];
    const config = generateGridConfig({ data });
    const keys = (config.columns as Column[]).map((c) => c.key).sort();
    expect(keys).toEqual(['active', 'id', 'name', 'score']);
  });

  it('infers numeric and boolean types correctly', () => {
    const data = [{ id: 1, name: 'X', score: 90, active: true }];
    const config = generateGridConfig({ data });
    const cols = config.columns as Column[];
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey.id.type).toBe('number');
    expect(byKey.score.type).toBe('number');
    expect(byKey.active.type).toBe('boolean');
    // string is the default — usually omitted to keep the config small
    expect(byKey.name.type).toBeUndefined();
  });

  it('humanizes keys for headerText (snake/kebab/camel → Title Case)', () => {
    const data = [{ first_name: 'a', last_name: 'b', avgScore: 1, 'kebab-case': 1 }];
    const config = generateGridConfig({ data });
    const byKey = Object.fromEntries((config.columns as Column[]).map((c) => [c.key, c]));
    expect(byKey.first_name.headerText).toBe('First Name');
    expect(byKey.last_name.headerText).toBe('Last Name');
    expect(byKey.avgScore.headerText).toBe('Avg Score');
    expect(byKey['kebab-case'].headerText).toBe('Kebab Case');
  });

  it('opts every inferred column into sort+filter when requested', () => {
    const config = generateGridConfig({ enableSortAndFilter: true });
    for (const col of config.columns as Column[]) {
      expect(col.sort).toBe(true);
      expect(col.filter).toBe(true);
    }
  });

  it('adds resizable when requested', () => {
    const config = generateGridConfig({ resizable: true });
    for (const col of config.columns as Column[]) {
      expect(col.resizable).toBe(true);
    }
  });

  it('passes through supplied columns unchanged', () => {
    const columns = [{ key: 'id', type: 'number', headerText: 'ID' }];
    const config = generateGridConfig({ columns, data: [{ id: 1 }] });
    expect(config.columns).toBe(columns);
  });
});
