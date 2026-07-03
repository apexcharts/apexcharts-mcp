import { ALL_INDICATOR_KEYS, isKnownIndicator, isOscillator } from './indicators.js';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  /** Stable id for the rule (e.g. 'ohlc-flat-keys'). */
  rule: string;
  /** Dot/bracket path into the config (e.g. 'series[0].data[3].y'). */
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

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate an ApexStock options object against the rules in apexstock-skill's
 * SKILL.md (OHLC data format, overlays-vs-oscillators, theme) and
 * references/data-format.md. Never throws.
 */
export function validateStockConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(config)) {
    issues.push({
      severity: 'error',
      rule: 'config-not-object',
      path: '',
      message: 'Config must be an object.',
    });
    return finalize(issues);
  }

  checkSeries(config.series, issues);
  checkTheme(config.theme, issues);
  checkIndicators(config.plotOptions, issues);

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

// --- Series / OHLC data ---------------------------------------------------

function checkSeries(series: unknown, issues: ValidationIssue[]): void {
  if (series === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-series',
      path: 'series',
      message: 'series is required — series[0].data holds the OHLC candles.',
      fix: 'Add `series: [{ name: "Price", data: [{ x, y: [o,h,l,c], v? }, ...] }]`.',
    });
    return;
  }
  if (!Array.isArray(series)) {
    issues.push({
      severity: 'error',
      rule: 'series-not-array',
      path: 'series',
      message: 'series must be an array whose first entry carries the OHLC data.',
    });
    return;
  }
  if (series.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'series-empty',
      path: 'series',
      message: 'series is empty — series[0] must hold the OHLC data.',
    });
    return;
  }

  const first = series[0];
  if (!isObject(first)) {
    issues.push({
      severity: 'error',
      rule: 'series-entry-not-object',
      path: 'series[0]',
      message: 'series[0] must be an object `{ name?, data }`.',
    });
    return;
  }

  const data = first.data;
  if (data === undefined) {
    issues.push({
      severity: 'error',
      rule: 'series-missing-data',
      path: 'series[0].data',
      message: 'series[0].data is required — it holds the OHLC candle array.',
    });
    return;
  }
  if (!Array.isArray(data)) {
    issues.push({
      severity: 'error',
      rule: 'series-data-not-array',
      path: 'series[0].data',
      message: 'series[0].data must be an array of OHLC points.',
    });
    return;
  }
  if (data.length === 0) {
    issues.push({
      severity: 'warning',
      rule: 'data-empty',
      path: 'series[0].data',
      message: 'series[0].data is empty — nothing will render.',
    });
    return;
  }

  data.forEach((point, i) => checkPoint(point, i, issues));
  checkOrdering(data, issues);
}

function checkPoint(point: unknown, i: number, issues: ValidationIssue[]): void {
  const path = `series[0].data[${i}]`;

  if (!isObject(point)) {
    issues.push({
      severity: 'error',
      rule: 'point-not-object',
      path,
      message: 'Each candle must be an object `{ x, y: [o,h,l,c], v? }`.',
    });
    return;
  }

  // y / flat-key checks
  const y = point.y;
  const hasFlatKeys = ['o', 'h', 'l', 'c'].some((k) => k in point);
  if (y === undefined) {
    if (hasFlatKeys) {
      issues.push({
        severity: 'error',
        rule: 'ohlc-flat-keys',
        path,
        message:
          'Candle uses flat o/h/l/c keys. ApexStock expects the four prices in a single `y` array; this point is dropped.',
        fix: 'Use `{ x, y: [open, high, low, close], v? }`.',
      });
    } else {
      issues.push({
        severity: 'error',
        rule: 'point-missing-y',
        path: `${path}.y`,
        message: 'Candle is missing `y: [open, high, low, close]`.',
      });
    }
  } else if (!Array.isArray(y) || y.length !== 4) {
    issues.push({
      severity: 'error',
      rule: 'y-not-4-tuple',
      path: `${path}.y`,
      message: 'y must be a 4-number array [open, high, low, close].',
    });
  } else if (y.some((n) => typeof n !== 'number' || Number.isNaN(n))) {
    issues.push({
      severity: 'error',
      rule: 'y-not-numbers',
      path: `${path}.y`,
      message: 'y must contain four numbers [open, high, low, close].',
    });
  } else {
    const [o, h, l, c] = y as number[];
    if (h < Math.max(o, c) || l > Math.min(o, c)) {
      issues.push({
        severity: 'warning',
        rule: 'ohlc-inconsistent',
        path: `${path}.y`,
        message: `Inconsistent OHLC: high (${h}) should be >= max(open,close) and low (${l}) <= min(open,close). Order is [open, high, low, close].`,
        fix: 'Check the tuple order — a common mistake is [open, close, low, high] or [o,l,h,c].',
      });
    }
  }

  // x checks
  const x = point.x;
  if (x === undefined) {
    issues.push({
      severity: 'error',
      rule: 'point-missing-x',
      path: `${path}.x`,
      message: 'Candle is missing `x` (timestamp: epoch-ms number, ISO date string, or Date).',
    });
  } else if (typeof x !== 'number' && typeof x !== 'string' && !(x instanceof Date)) {
    issues.push({
      severity: 'error',
      rule: 'x-invalid-type',
      path: `${path}.x`,
      message: 'x must be an epoch-ms number, an ISO date string, or a Date.',
    });
  }

  // volume
  if (point.v !== undefined && (typeof point.v !== 'number' || Number.isNaN(point.v))) {
    issues.push({
      severity: 'warning',
      rule: 'volume-not-number',
      path: `${path}.v`,
      message: 'v (volume) should be a number when present.',
    });
  }
}

function checkOrdering(data: unknown[], issues: ValidationIssue[]): void {
  // Only check when every x is comparable and of one kind (all numbers or all
  // strings). ISO date strings sort chronologically lexically, so string
  // comparison is valid for them.
  const xs = data.map((p) => (isObject(p) ? p.x : undefined));
  const allNumbers = xs.every((x) => typeof x === 'number');
  const allStrings = xs.every((x) => typeof x === 'string');
  if (!allNumbers && !allStrings) return;

  for (let i = 1; i < xs.length; i++) {
    if ((xs[i] as number | string) < (xs[i - 1] as number | string)) {
      issues.push({
        severity: 'warning',
        rule: 'data-not-sorted',
        path: 'series[0].data',
        message: `Candles should be sorted ascending by x; series[0].data[${i}] goes backward. Streaming and zoom assume the newest bar is last.`,
        fix: 'Sort the data ascending by x before passing it in.',
      });
      return;
    }
  }
}

// --- Theme ----------------------------------------------------------------

function checkTheme(theme: unknown, issues: ValidationIssue[]): void {
  if (theme === undefined) return;
  if (!isObject(theme)) {
    issues.push({
      severity: 'error',
      rule: 'theme-not-object',
      path: 'theme',
      message: 'theme must be an object `{ mode: "light" | "dark" }`.',
    });
    return;
  }
  const mode = theme.mode;
  if (mode !== undefined && mode !== 'light' && mode !== 'dark') {
    issues.push({
      severity: 'error',
      rule: 'theme-mode-invalid',
      path: 'theme.mode',
      message: `theme.mode must be "light" or "dark". Got ${JSON.stringify(mode)}.`,
    });
  }
}

// --- Indicators -----------------------------------------------------------

function checkIndicators(plotOptions: unknown, issues: ValidationIssue[]): void {
  if (!isObject(plotOptions)) return;
  const stockChart = plotOptions.stockChart;
  if (!isObject(stockChart)) return;
  const indicators = stockChart.indicators;
  if (indicators === undefined) return;

  const path = 'plotOptions.stockChart.indicators';

  // Collect the (key, enabled) pairs for both accepted shapes.
  let entries: Array<{ key: unknown; enabled: boolean }>;
  if (Array.isArray(indicators)) {
    entries = indicators.map((key) => ({ key, enabled: true }));
  } else if (isObject(indicators)) {
    entries = Object.entries(indicators).map(([key, cfg]) => ({
      key,
      // object-map form: enabled unless explicitly `enabled: false`.
      enabled: !(isObject(cfg) && cfg.enabled === false),
    }));
  } else {
    issues.push({
      severity: 'error',
      rule: 'indicators-wrong-shape',
      path,
      message: 'indicators must be an array of keys or a keyed config map.',
    });
    return;
  }

  let enabledOscillators = 0;
  entries.forEach(({ key, enabled }) => {
    if (typeof key !== 'string') {
      issues.push({
        severity: 'error',
        rule: 'indicator-key-not-string',
        path,
        message: 'Each indicator key must be a string.',
      });
      return;
    }
    if (!isKnownIndicator(key)) {
      issues.push({
        severity: 'warning',
        rule: 'unknown-indicator',
        path: `${path}["${key}"]`,
        message: `Unknown indicator "${key}". Use the full lowercase phrase.`,
        fix: `Valid keys: ${ALL_INDICATOR_KEYS.join(', ')}.`,
      });
      return;
    }
    if (enabled && isOscillator(key)) enabledOscillators += 1;
  });

  if (enabledOscillators > 1) {
    issues.push({
      severity: 'warning',
      rule: 'multiple-oscillators',
      path,
      message: `${enabledOscillators} oscillators enabled, but only one oscillator pane is active at a time — the last one wins.`,
      fix: 'Enable a single oscillator; overlays (e.g. moving average, bollinger bands) can stack.',
    });
  }
}
