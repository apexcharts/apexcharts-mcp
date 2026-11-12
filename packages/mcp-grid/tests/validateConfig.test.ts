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

  // apex-grid 3.x has a real 'date' type and ten presentation types. An older
  // rule called 'date' a mistake and rejected configs the grid renders.
  it('accepts every apex-grid column type, date included', () => {
    const types = ['string', 'number', 'boolean', 'select', 'rating', 'date', 'image', 'currency', 'avatar', 'badge', 'progress', 'sparkline', 'chart', 'status'];
    const result = validateGridConfig({
      columns: types.map((type) => ({ key: 'v', type })),
      data: [{ v: 1 }],
    });
    expect(result.errors.filter((e) => e.rule === 'column-invalid-type')).toEqual([]);
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

describe('validateGridConfig design-system switches', () => {
  const switchIssues = (config: Record<string, unknown>) =>
    validateGridConfig(config).issues.filter((i) => i.rule === 'design-switch-not-boolean');

  it('accepts boolean switches', () => {
    expect(switchIssues({ ...okConfig, designSystem: false, tokens: true })).toEqual([]);
  });

  it('warns when a switch is not a boolean, since a string leaves it on', () => {
    const issues = switchIssues({ ...okConfig, designSystem: 'false', tokens: 'off' });
    expect(issues.map((i) => i.path).sort()).toEqual(['designSystem', 'tokens']);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });
});

describe("validateGridConfig: type 'chart' (apex-grid 4.1.0)", () => {
  const rows = [{ name: 'A', trend: [1, 3, 2], share: [3, 5, 2] }];
  const rules = (config: unknown) => validateGridConfig(config).issues.map((i) => i.rule);

  it('accepts a chart column with a number[] and with { data } series', () => {
    const r = validateGridConfig({
      columns: [
        { key: 'name' },
        { key: 'trend', type: 'chart', chart: { type: 'area', height: 28, width: '100%', options: { stroke: { width: 2 } } } },
      ],
      data: [...rows, { name: 'B', trend: [{ name: 'X', data: [1, 2] }], share: [1] }],
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('accepts null gaps and a donut from a number[]', () => {
    const r = validateGridConfig({
      columns: [
        { key: 'trend', type: 'chart' },
        { key: 'share', type: 'chart', chart: { type: 'donut' } },
      ],
      data: [{ trend: [1, null, 3], share: [3, 5, 2] }],
    });
    expect(r.issues).toEqual([]);
  });

  it('flags a chart option of the wrong shape', () => {
    expect(rules({ columns: [{ key: 'trend', type: 'chart', chart: 'area' }], data: rows })).toContain('chart-option-wrong-shape');
    const r = rules({
      columns: [{ key: 'trend', type: 'chart', chart: { type: 3, height: '28px', width: true, options: [] } }],
      data: rows,
    });
    expect(r).toEqual(expect.arrayContaining(['chart-type-not-string', 'chart-height-not-number', 'chart-width-wrong-type', 'chart-options-wrong-shape']));
  });

  it('warns that chart is ignored on another column type', () => {
    expect(rules({ columns: [{ key: 'trend', type: 'sparkline', chart: { type: 'bar' } }], data: rows })).toContain('chart-option-ignored');
  });

  it('warns about values a chart cell cannot draw', () => {
    expect(rules({ columns: [{ key: 'trend', type: 'chart' }], data: [{ trend: '1,2,3' }] })).toContain('chart-value-not-array');
    expect(rules({ columns: [{ key: 'trend', type: 'chart' }], data: [{ trend: [1, 'x'] }] })).toContain('chart-value-mixed');
    expect(
      rules({ columns: [{ key: 'trend', type: 'chart', chart: { type: 'pie' } }], data: [{ trend: [{ data: [1, 2] }] }] }),
    ).toContain('chart-value-not-numbers');
  });

  it('reads a chart type set in options, which wins over the column type', () => {
    expect(
      rules({
        columns: [{ key: 'trend', type: 'chart', chart: { type: 'bar', options: { chart: { type: 'radialBar' } } } }],
        data: [{ trend: [{ data: [1] }] }],
      }),
    ).toContain('chart-value-not-numbers');
  });

  it('flags a chart label that is not a function', () => {
    expect(rules({ columns: [{ key: 'trend', type: 'chart', chart: { label: 'Trend' } }], data: rows })).toContain(
      'chart-label-not-function',
    );
    expect(
      rules({ columns: [{ key: 'trend', type: 'chart', chart: { label: () => 'Trend' } }], data: rows }),
    ).not.toContain('chart-label-not-function');
  });

  it('does not guess the series shape when options is a function', () => {
    const options = (_v: unknown, row: { kind: string }) => ({ chart: { type: row.kind } });
    const r = validateGridConfig({
      columns: [{ key: 'trend', type: 'chart', chart: { type: 'bar', options } }],
      data: [
        { trend: [3, 5, 2], kind: 'pie' },
        { trend: [{ data: [1, 2] }], kind: 'line' },
        { trend: 'nope', kind: 'line' },
      ],
    });
    expect(r.issues.map((i) => i.rule)).toEqual(['chart-value-not-array']);
  });
});
