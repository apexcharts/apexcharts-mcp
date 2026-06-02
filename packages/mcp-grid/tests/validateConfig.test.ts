import { describe, expect, it } from 'vitest';
import { validateGridConfig } from '../src/validateConfig.js';

const okConfig = {
  columns: [
    { key: 'id', type: 'number' },
    { key: 'name', type: 'string' },
    { key: 'active', type: 'boolean' },
  ],
  data: [
    { id: 1, name: 'Ada', active: true },
    { id: 2, name: 'Alan', active: false },
  ],
};

describe('validateGridConfig — happy path', () => {
  it('accepts a minimal valid config', () => {
    const result = validateGridConfig(okConfig);
    expect(result.ok).toBe(true);
  });
});

describe('validateGridConfig — top-level', () => {
  it('flags non-object config', () => {
    expect(validateGridConfig(null).errors[0].rule).toBe('config-not-object');
  });

  it('flags missing columns', () => {
    const result = validateGridConfig({ data: [] });
    expect(result.errors.some((e) => e.rule === 'missing-columns')).toBe(true);
  });

  it('flags missing data', () => {
    const result = validateGridConfig({ columns: [] });
    expect(result.errors.some((e) => e.rule === 'missing-data')).toBe(true);
  });

  it('flags non-array columns/data', () => {
    const result = validateGridConfig({ columns: 'oops', data: 'oops' });
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain('columns-not-array');
    expect(rules).toContain('data-not-array');
  });
});

describe('validateGridConfig — columns', () => {
  it('flags column with missing key', () => {
    const result = validateGridConfig({ columns: [{ type: 'string' }], data: [{ name: 'x' }] });
    expect(result.errors.some((e) => e.rule === 'column-missing-key')).toBe(true);
  });

  it('flags column.key not present on data rows', () => {
    const result = validateGridConfig({
      columns: [{ key: 'ghost' }],
      data: [{ id: 1, name: 'x' }],
    });
    expect(result.errors.some((e) => e.rule === 'column-key-not-in-data')).toBe(true);
  });

  it('does not flag column-key-not-in-data when data is empty', () => {
    const result = validateGridConfig({
      columns: [{ key: 'ghost' }],
      data: [],
    });
    expect(result.errors.filter((e) => e.rule === 'column-key-not-in-data')).toEqual([]);
  });

  it('flags duplicate column keys', () => {
    const result = validateGridConfig({
      columns: [{ key: 'id' }, { key: 'id' }],
      data: [{ id: 1 }],
    });
    expect(result.errors.some((e) => e.rule === 'duplicate-column-key')).toBe(true);
  });

  it('flags column.type "date" with a helpful fix', () => {
    const result = validateGridConfig({
      columns: [{ key: 'when', type: 'date' }],
      data: [{ when: '2026-01-01' }],
    });
    const issue = result.errors.find((e) => e.rule === 'column-type-date');
    expect(issue).toBeDefined();
    expect(issue?.fix).toMatch(/number.*string/i);
  });

  it('flags other invalid column.type values', () => {
    const result = validateGridConfig({
      columns: [{ key: 'id', type: 'integer' }],
      data: [{ id: 1 }],
    });
    expect(result.errors.some((e) => e.rule === 'column-invalid-type')).toBe(true);
  });

  it('flags sort/filter that are neither boolean nor object', () => {
    const result = validateGridConfig({
      columns: [{ key: 'id', sort: 'asc', filter: 1 }],
      data: [{ id: 1 }],
    });
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain('column-sort-wrong-shape');
    expect(rules).toContain('column-filter-wrong-shape');
  });

  it('accepts sort/filter as a config object', () => {
    const result = validateGridConfig({
      columns: [{ key: 'id', sort: { caseSensitive: true }, filter: { caseSensitive: false } }],
      data: [{ id: 1 }],
    });
    expect(result.ok).toBe(true);
  });

  it('flags hidden/resizable that are not boolean', () => {
    const result = validateGridConfig({
      columns: [{ key: 'id', hidden: 'yes', resizable: 1 }],
      data: [{ id: 1 }],
    });
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain('column-hidden-not-boolean');
    expect(rules).toContain('column-resizable-not-boolean');
  });
});

describe('validateGridConfig — data rows', () => {
  it('flags non-object rows', () => {
    const result = validateGridConfig({
      columns: [{ key: 'id' }],
      data: [{ id: 1 }, 'not an object'],
    });
    expect(result.errors.some((e) => e.rule === 'row-not-object')).toBe(true);
  });
});
