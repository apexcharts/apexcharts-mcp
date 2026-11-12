import { checkDesignSwitches } from '@apexcharts-mcp/core';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  rule: string;
  path: string;
  message: string;
  fix?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

type AnyObj = Record<string, unknown>;

// apex-grid's DataType union. The first three drive sorting, filtering and the
// editor; the rest are presentation types over one of those values. The
// chart-type gate (scripts/_surface.mjs) checks this list against the pinned
// library, so a type apex-grid adds fails CI here instead of being rejected.
const VALID_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'select',
  'rating',
  'date',
  'image',
  'currency',
  'avatar',
  'badge',
  'progress',
  'sparkline',
  'chart',
  'status',
]);

// Chart types a `type: 'chart'` column draws from a plain `number[]`, one value
// per slice or ring, rather than from `{ data }` series (apex-grid 4.1.0
// column-types.ts NON_AXIS_CHART_TYPES).
const NON_AXIS_CHART_TYPES = new Set(['pie', 'donut', 'radialBar', 'polarArea']);

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate an apex-grid `{ columns, data }` config against the rules in
 * apexgrid-skill's SKILL.md. Encodes:
 *   - missing/non-array columns or data
 *   - column.key required and must be a real key of the data row type
 *   - duplicate column.key
 *   - column.type must be one of apex-grid's column types
 *   - a `chart` column option has the right shape, and a `type: 'chart'`
 *     column's values are ones it can draw (apex-grid 4.1.0)
 *   - sort/filter must be boolean or object (per-column opt-in)
 *   - row shape must be an object
 *   - designSystem / tokens grid properties, when present, must be booleans
 */
export function validateGridConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(config)) {
    issues.push({
      severity: 'error',
      rule: 'config-not-object',
      path: '',
      message: 'Config must be an object: `{ columns, data }`.',
    });
    return finalize(issues);
  }

  // The grid's designSystem / tokens properties (the design-system="off" /
  // tokens="off" attributes in markup). As JS properties only a falsy value
  // turns them off, so a string such as "false" leaves the switch on.
  issues.push(...checkDesignSwitches(config, ''));

  const columns = config.columns;
  const data = config.data;

  if (columns === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-columns',
      path: 'columns',
      message: 'columns is required.',
      fix: 'Add `columns: [{ key: "...", type: "..." }, ...]`.',
    });
  } else if (!Array.isArray(columns)) {
    issues.push({
      severity: 'error',
      rule: 'columns-not-array',
      path: 'columns',
      message: 'columns must be an array of ColumnConfiguration objects.',
    });
  }

  if (data === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-data',
      path: 'data',
      message: 'data is required.',
      fix: 'Add `data: [{ ... }, ...]`.',
    });
  } else if (!Array.isArray(data)) {
    issues.push({
      severity: 'error',
      rule: 'data-not-array',
      path: 'data',
      message: 'data must be an array of row objects.',
    });
  }

  if (!Array.isArray(columns) || !Array.isArray(data)) {
    return finalize(issues);
  }

  const dataKeys = collectDataKeys(data, issues);
  checkColumns(columns, dataKeys, data, issues);

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

function collectDataKeys(data: unknown[], issues: ValidationIssue[]): Set<string> {
  const keys = new Set<string>();
  data.forEach((row, i) => {
    if (!isObject(row)) {
      issues.push({
        severity: 'error',
        rule: 'row-not-object',
        path: `data[${i}]`,
        message: 'Each row must be an object.',
      });
      return;
    }
    for (const k of Object.keys(row)) keys.add(k);
  });
  return keys;
}

function checkColumns(
  columns: unknown[],
  dataKeys: Set<string>,
  data: unknown[],
  issues: ValidationIssue[],
): void {
  const dataLen = data.length;
  const seenKeys = new Set<string>();

  columns.forEach((column, i) => {
    if (!isObject(column)) {
      issues.push({
        severity: 'error',
        rule: 'column-not-object',
        path: `columns[${i}]`,
        message: 'Each column must be an object.',
      });
      return;
    }

    const key = column.key;
    if (typeof key !== 'string' || key.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'column-missing-key',
        path: `columns[${i}].key`,
        message:
          'column.key is required and must be a non-empty string matching a key on each data row.',
        fix: 'There is no `field` / `dataIndex` / `accessor` alias — the property is exactly `key`.',
      });
    } else {
      if (seenKeys.has(key)) {
        issues.push({
          severity: 'error',
          rule: 'duplicate-column-key',
          path: `columns[${i}].key`,
          message: `Duplicate column key "${key}". Each column.key must be unique.`,
        });
      }
      seenKeys.add(key);

      if (dataLen > 0 && !dataKeys.has(key)) {
        issues.push({
          severity: 'error',
          rule: 'column-key-not-in-data',
          path: `columns[${i}].key`,
          message: `column.key "${key}" does not exist on any data row. The column will render blank cells.`,
          fix: `Rename to one of: ${[...dataKeys].slice(0, 8).join(', ')}${dataKeys.size > 8 ? ', ...' : ''}.`,
        });
      }
    }

    if (column.type !== undefined) {
      if (typeof column.type !== 'string' || !VALID_TYPES.has(column.type)) {
        issues.push({
          severity: 'error',
          rule: 'column-invalid-type',
          path: `columns[${i}].type`,
          message: `column.type must be one of ${[...VALID_TYPES].join(', ')}. Got ${JSON.stringify(column.type)}.`,
        });
      }
    }

    checkChartColumn(column, i, data, issues);

    if (column.sort !== undefined && typeof column.sort !== 'boolean' && !isObject(column.sort)) {
      issues.push({
        severity: 'error',
        rule: 'column-sort-wrong-shape',
        path: `columns[${i}].sort`,
        message: 'column.sort must be a boolean or a config object `{ caseSensitive?, comparer? }`.',
      });
    }

    if (column.filter !== undefined && typeof column.filter !== 'boolean' && !isObject(column.filter)) {
      issues.push({
        severity: 'error',
        rule: 'column-filter-wrong-shape',
        path: `columns[${i}].filter`,
        message: 'column.filter must be a boolean or a config object `{ caseSensitive? }`.',
      });
    }

    if (column.hidden !== undefined && typeof column.hidden !== 'boolean') {
      issues.push({
        severity: 'error',
        rule: 'column-hidden-not-boolean',
        path: `columns[${i}].hidden`,
        message: 'column.hidden must be a boolean.',
      });
    }

    if (column.resizable !== undefined && typeof column.resizable !== 'boolean') {
      issues.push({
        severity: 'error',
        rule: 'column-resizable-not-boolean',
        path: `columns[${i}].resizable`,
        message: 'column.resizable must be a boolean.',
      });
    }
  });
}

/**
 * The `chart` option of a `type: 'chart'` column (apex-grid 4.1.0), and
 * whether the column's values are ones it can draw. A value it cannot draw
 * renders an empty cell, with no error from the grid.
 */
function checkChartColumn(
  column: AnyObj,
  i: number,
  data: unknown[],
  issues: ValidationIssue[],
): void {
  const chart = column.chart;
  const path = `columns[${i}].chart`;
  if (chart !== undefined && column.type !== 'chart') {
    issues.push({
      severity: 'warning',
      rule: 'chart-option-ignored',
      path,
      message: "column.chart is read only by a `type: 'chart'` column; on this column it is ignored.",
      fix: "Set `type: 'chart'`, or remove `chart`.",
    });
  }
  if (chart !== undefined && !isObject(chart)) {
    issues.push({
      severity: 'error',
      rule: 'chart-option-wrong-shape',
      path,
      message: 'column.chart must be an object `{ type?, height?, width?, options?, label? }`.',
    });
    return;
  }
  const config = (chart ?? {}) as AnyObj;
  if (config.type !== undefined && typeof config.type !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'chart-type-not-string',
      path: `${path}.type`,
      message: "column.chart.type must be an ApexCharts chart type string, such as 'line', 'bar' or 'donut'.",
    });
  }
  if (config.height !== undefined && typeof config.height !== 'number') {
    issues.push({
      severity: 'error',
      rule: 'chart-height-not-number',
      path: `${path}.height`,
      message: 'column.chart.height is a number of pixels (default 28).',
    });
  }
  if (
    config.width !== undefined &&
    typeof config.width !== 'number' &&
    typeof config.width !== 'string'
  ) {
    issues.push({
      severity: 'error',
      rule: 'chart-width-wrong-type',
      path: `${path}.width`,
      message: "column.chart.width is a number of pixels or a CSS length (default '100%').",
    });
  }
  if (
    config.options !== undefined &&
    !isObject(config.options) &&
    typeof config.options !== 'function'
  ) {
    issues.push({
      severity: 'error',
      rule: 'chart-options-wrong-shape',
      path: `${path}.options`,
      message:
        'column.chart.options must be an ApexCharts options object, or a function `(value, row) => options`.',
    });
  }
  if (config.label !== undefined && typeof config.label !== 'function') {
    issues.push({
      severity: 'error',
      rule: 'chart-label-not-function',
      path: `${path}.label`,
      message:
        'column.chart.label is a function `(value, row) => string` that names each cell; any other value throws when the cell renders.',
      fix: "Use `label: (value, row) => row.name + ' trend'`, or leave it out for the default name.",
    });
  }

  if (column.type !== 'chart' || typeof column.key !== 'string') return;
  const key = column.key;
  // The type in options wins the merge, as it does in the grid.
  const optionsType =
    isObject(config.options) && isObject(config.options.chart) ? config.options.chart.type : undefined;
  const chartType = typeof optionsType === 'string' ? optionsType : config.type;
  const nonAxis = typeof chartType === 'string' && NON_AXIS_CHART_TYPES.has(chartType);
  // An options function can return another chart type per row, so only the
  // checks that hold for every type apply.
  const perRowType = typeof config.options === 'function';
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!isObject(row)) continue;
    const value = row[key];
    if (value == null) continue;
    if (!Array.isArray(value)) {
      issues.push({
        severity: 'warning',
        rule: 'chart-value-not-array',
        path: `data[${r}].${key}`,
        message: `A \`type: 'chart'\` cell draws a number[] or an array of { data } series; this value is neither, so the cell renders empty.`,
      });
      return;
    }
    const numbers = value.every((v) => v == null || typeof v === 'number');
    if (perRowType) continue;
    if (nonAxis && !numbers) {
      issues.push({
        severity: 'warning',
        rule: 'chart-value-not-numbers',
        path: `data[${r}].${key}`,
        message: `A ${chartType} chart takes a number[], one value per slice or ring; this value holds something else, so the cell renders empty.`,
        fix: 'Pass the numbers themselves, such as [3, 5, 2].',
      });
      return;
    }
    const series = value.every((v) => isObject(v) && Array.isArray(v.data));
    if (!nonAxis && !numbers && !series) {
      issues.push({
        severity: 'warning',
        rule: 'chart-value-mixed',
        path: `data[${r}].${key}`,
        message:
          'A chart value is either a number[] (null for a gap) or an array of { data } series, not a mix, so this cell renders empty.',
      });
      return;
    }
  }
}
