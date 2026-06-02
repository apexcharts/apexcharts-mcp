/**
 * Input shape for apexgrid_generate_config.
 */
export interface GenerateGridConfigInput {
  /**
   * Array of column configurations. Each column needs `{ key, type? }` (key must
   * be a real key of the data row type). If omitted, columns are generated from
   * the keys of the first data row, with types inferred.
   */
  columns?: unknown;
  /** Array of data row objects. If omitted, a small placeholder dataset is generated. */
  data?: unknown;
  /**
   * Convenience: if true, every generated column gets `sort: true` and `filter: true`.
   * Default false (matches `apex-grid`'s own opt-in default).
   */
  enableSortAndFilter?: boolean;
  /**
   * Convenience: if true, every column also gets `resizable: true`.
   * Default false.
   */
  resizable?: boolean;
}

/**
 * Build a minimal valid `<apex-grid>` config: `{ columns, data }`.
 *
 * When both are omitted, a small users-table placeholder is generated. When
 * only `columns` is omitted, they're inferred from the first data row.
 */
export function generateGridConfig(
  input: GenerateGridConfigInput,
): { columns: unknown[]; data: unknown[] } {
  const data =
    input.data !== undefined && Array.isArray(input.data) ? input.data : defaultData();

  let columns: unknown[];
  if (input.columns !== undefined && Array.isArray(input.columns)) {
    columns = input.columns;
  } else {
    columns = inferColumns(data, input);
  }

  return { columns, data };
}

function defaultData(): Array<Record<string, unknown>> {
  return [
    { id: 1, name: 'Ada Lovelace', age: 36, subscribed: true },
    { id: 2, name: 'Alan Turing', age: 41, subscribed: false },
    { id: 3, name: 'Grace Hopper', age: 85, subscribed: true },
    { id: 4, name: 'Linus Torvalds', age: 54, subscribed: true },
  ];
}

function inferColumns(data: unknown[], input: GenerateGridConfigInput): unknown[] {
  const first = data[0];
  if (typeof first !== 'object' || first === null) return [];
  const obj = first as Record<string, unknown>;
  return Object.keys(obj).map((key) => {
    const column: Record<string, unknown> = { key };
    const type = inferType(data, key);
    if (type !== 'string') column.type = type;
    column.headerText = toHeaderText(key);
    if (input.enableSortAndFilter) {
      column.sort = true;
      column.filter = true;
    }
    if (input.resizable) {
      column.resizable = true;
    }
    return column;
  });
}

function inferType(data: unknown[], key: string): 'string' | 'number' | 'boolean' {
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const v = (row as Record<string, unknown>)[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    return 'string';
  }
  return 'string';
}

function toHeaderText(key: string): string {
  // Convert "firstName" / "first_name" / "first-name" → "First Name"
  return key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
