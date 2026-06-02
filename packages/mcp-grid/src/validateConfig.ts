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

const VALID_TYPES = new Set(['string', 'number', 'boolean']);

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate an apex-grid `{ columns, data }` config against the rules in
 * apexgrid-skill's SKILL.md. Encodes:
 *   - missing/non-array columns or data
 *   - column.key required and must be a real key of the data row type
 *   - duplicate column.key
 *   - column.type must be string/number/boolean (no 'date' — common mistake)
 *   - sort/filter must be boolean or object (per-column opt-in)
 *   - row shape must be an object
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
  checkColumns(columns, dataKeys, data.length, issues);

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
  dataLen: number,
  issues: ValidationIssue[],
): void {
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
        // Helpful guidance for the very common 'date' mistake.
        if (column.type === 'date') {
          issues.push({
            severity: 'error',
            rule: 'column-type-date',
            path: `columns[${i}].type`,
            message:
              'apex-grid has no "date" column type — only "string" | "number" | "boolean".',
            fix:
              'Use "number" (epoch timestamps) or "string" (ISO strings) with a custom `comparer` and `cellTemplate` for date formatting.',
          });
        } else {
          issues.push({
            severity: 'error',
            rule: 'column-invalid-type',
            path: `columns[${i}].type`,
            message: `column.type must be one of string/number/boolean. Got ${JSON.stringify(column.type)}.`,
          });
        }
      }
    }

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
