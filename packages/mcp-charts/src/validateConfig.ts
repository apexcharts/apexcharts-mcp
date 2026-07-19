import { CHART_CATALOG, getChartInfo, SUPPORTED_CHART_TYPES } from './chartCatalog.js';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  /** Stable identifier for the rule that fired (e.g. 'wrong-series-format-non-axis'). */
  rule: string;
  /** Dot/bracket path into the config (e.g. 'series[0].data[2]'). */
  path: string;
  /** Human-readable explanation. */
  message: string;
  /** Optional one-line suggestion for how to fix. */
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
 * Validate an ApexCharts options object against the rules in SKILL.md
 * (sections 2 and 6). Never throws — every problem becomes an issue.
 */
export function validateChartConfig(config: unknown): ValidationResult {
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

  const chart = config.chart;
  if (!isObject(chart)) {
    issues.push({
      severity: 'error',
      rule: 'missing-chart',
      path: 'chart',
      message: 'Config.chart is required and must be an object.',
      fix: 'Add a `chart` block with at least a `type` field.',
    });
    return finalize(issues);
  }

  const type = chart.type;
  if (typeof type !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'missing-chart-type',
      path: 'chart.type',
      message: 'chart.type is required (e.g. "line", "bar", "pie").',
    });
    return finalize(issues);
  }

  const info = getChartInfo(type);
  if (!info) {
    issues.push({
      severity: 'error',
      rule: 'unknown-chart-type',
      path: 'chart.type',
      message: `Unknown chart.type "${type}".`,
      fix: `Use one of: ${SUPPORTED_CHART_TYPES.join(', ')}.`,
    });
    return finalize(issues);
  }

  checkSeries(config, info.type, info.seriesFormat, issues);
  checkStacked(chart, type, issues);
  checkTooltip(config, issues);
  checkYaxis(config, issues);
  checkColors(config, issues);
  checkResponsive(config, issues);

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

// --- Series ---------------------------------------------------------------

function checkSeries(
  config: AnyObj,
  type: string,
  format: 'axis' | 'non-axis',
  issues: ValidationIssue[],
): void {
  const series = config.series;

  if (series === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-series',
      path: 'series',
      message: 'series is required.',
    });
    return;
  }

  if (!Array.isArray(series)) {
    issues.push({
      severity: 'error',
      rule: 'series-not-array',
      path: 'series',
      message: 'series must be an array.',
    });
    return;
  }

  if (format === 'non-axis') {
    checkNonAxisSeries(config, type, series, issues);
  } else {
    checkAxisSeries(type, series, issues);
  }
}

function checkNonAxisSeries(
  config: AnyObj,
  type: string,
  series: unknown[],
  issues: ValidationIssue[],
): void {
  const allNumbers = series.every((s) => typeof s === 'number');
  if (!allNumbers) {
    issues.push({
      severity: 'error',
      rule: 'wrong-series-format-non-axis',
      path: 'series',
      message:
        `Chart type "${type}" expects a flat array of numbers for series ` +
        '(plus a top-level `labels` array). The axis-chart `[{ name, data }]` format will not render.',
      fix: 'Replace with: series: [44, 55, 13], labels: ["A", "B", "C"].',
    });
    return;
  }

  if (type === 'radialBar') {
    series.forEach((v, i) => {
      const n = v as number;
      if (n < 0 || n > 100) {
        issues.push({
          severity: 'error',
          rule: 'radialbar-out-of-range',
          path: `series[${i}]`,
          message: `radialBar values must be 0–100 (percentages). Got ${n}.`,
          fix: 'Convert raw values to percentages before passing to the chart.',
        });
      }
    });
  }

  const labels = config.labels;
  if (labels === undefined) {
    issues.push({
      severity: 'warning',
      rule: 'missing-labels-non-axis',
      path: 'labels',
      message:
        `Chart type "${type}" usually pairs series with a top-level \`labels\` array. ` +
        'Without it, segments will be unlabeled.',
      fix: 'Add `labels: ["A", "B", "C", ...]` matching the series length.',
    });
  } else if (Array.isArray(labels) && labels.length !== series.length) {
    issues.push({
      severity: 'error',
      rule: 'labels-length-mismatch',
      path: 'labels',
      message: `labels.length (${labels.length}) does not match series.length (${series.length}).`,
    });
  }
}

function checkAxisSeries(
  type: string,
  series: unknown[],
  issues: ValidationIssue[],
): void {
  // Detect classic mistake: non-axis chart format used on an axis chart
  // (i.e. flat number array). This is the inverse of wrong-series-format-non-axis.
  if (series.length > 0 && series.every((s) => typeof s === 'number')) {
    issues.push({
      severity: 'error',
      rule: 'wrong-series-format-axis',
      path: 'series',
      message:
        `Chart type "${type}" expects \`[{ name, data: [...] }]\`, not a flat number array. ` +
        'The flat-array format is only for pie/donut/polarArea/radialBar.',
      fix: 'Wrap your numbers: series: [{ name: "Series 1", data: [44, 55, 13] }].',
    });
    return;
  }

  series.forEach((s, i) => {
    if (!isObject(s)) {
      issues.push({
        severity: 'error',
        rule: 'series-entry-not-object',
        path: `series[${i}]`,
        message: 'Each series entry must be an object with a `data` array.',
      });
      return;
    }
    const data = s.data;
    if (!Array.isArray(data)) {
      issues.push({
        severity: 'error',
        rule: 'series-data-not-array',
        path: `series[${i}].data`,
        message: 'series.data must be an array.',
      });
      return;
    }
    checkSeriesDataPoints(type, i, data, issues);
  });
}

function checkSeriesDataPoints(
  type: string,
  seriesIdx: number,
  data: unknown[],
  issues: ValidationIssue[],
): void {
  data.forEach((point, j) => {
    const path = `series[${seriesIdx}].data[${j}]`;

    if (point === undefined) {
      issues.push({
        severity: 'error',
        rule: 'undefined-data-point',
        path,
        message: 'Data points must be `null` for missing values, not `undefined`.',
        fix: 'Replace `undefined` with `null` — undefined is silently dropped and breaks the chart.',
      });
      return;
    }

    // Per-type structural checks for object-form data points
    switch (type) {
      case 'bubble':
        if (isObject(point) && (point.z === undefined || point.z === null)) {
          issues.push({
            severity: 'error',
            rule: 'bubble-missing-z',
            path,
            message: 'Bubble data points require a `z` value (bubble size).',
            fix: 'Add `z` to each point: { x, y, z }.',
          });
        }
        break;
      case 'candlestick':
        if (isObject(point) && Array.isArray(point.y) && point.y.length !== 4) {
          issues.push({
            severity: 'error',
            rule: 'candlestick-wrong-y-length',
            path: `${path}.y`,
            message:
              `Candlestick y must be a 4-element array [open, high, low, close]. Got length ${point.y.length}.`,
          });
        }
        break;
      case 'boxPlot':
        if (isObject(point) && Array.isArray(point.y) && point.y.length !== 5) {
          issues.push({
            severity: 'error',
            rule: 'boxplot-wrong-y-length',
            path: `${path}.y`,
            message:
              `Box plot y must be a 5-element array [min, Q1, median, Q3, max]. Got length ${point.y.length}.`,
          });
        }
        break;
      case 'rangeArea':
      case 'rangeBar':
        if (isObject(point) && Array.isArray(point.y) && point.y.length !== 2) {
          issues.push({
            severity: 'error',
            rule: 'range-wrong-y-length',
            path: `${path}.y`,
            message:
              `${type} y must be a 2-element array [low, high] (or [start, end]). Got length ${point.y.length}.`,
          });
        }
        break;
      case 'violin':
        // Violin points carry a density profile: y: { density: [[value, weight], ...], points?: [...] }.
        if (isObject(point)) {
          const y = point.y;
          if (!isObject(y) || !Array.isArray((y as AnyObj).density)) {
            issues.push({
              severity: 'error',
              rule: 'violin-missing-density',
              path: `${path}.y`,
              message:
                'Violin data points require `y` to be an object with a `density` array of [value, weight] pairs.',
              fix: 'Use { x, y: { density: [[value, weight], ...], points: [rawValue, ...] } }.',
            });
          }
        }
        break;
    }
  });
}

// --- Other rules ----------------------------------------------------------

function checkStacked(chart: AnyObj, type: string, issues: ValidationIssue[]): void {
  if (chart.stacked === true && type !== 'bar' && type !== 'area') {
    issues.push({
      severity: 'error',
      rule: 'stacked-on-unsupported-type',
      path: 'chart.stacked',
      message: `chart.stacked: true only works with type "bar" or "area". Got "${type}".`,
      fix: 'Remove chart.stacked, or change chart.type to "bar"/"area".',
    });
  }
}

function checkTooltip(config: AnyObj, issues: ValidationIssue[]): void {
  const tooltip = config.tooltip;
  if (!isObject(tooltip)) return;
  if (tooltip.shared === true && tooltip.intersect === true) {
    issues.push({
      severity: 'error',
      rule: 'tooltip-shared-and-intersect',
      path: 'tooltip',
      message: 'tooltip.shared and tooltip.intersect are mutually exclusive.',
      fix: 'Pick one mode: { shared: true, intersect: false } OR { shared: false, intersect: true }.',
    });
  }
}

function checkYaxis(config: AnyObj, issues: ValidationIssue[]): void {
  const series = config.series;
  const yaxis = config.yaxis;
  if (!Array.isArray(series) || series.length < 2) return;
  if (yaxis === undefined) return;

  // Multiple series with a single yaxis object — usually a mistake when each
  // series has a different scale/unit. Warn rather than error since single
  // shared y-axis is legal and common.
  if (isObject(yaxis)) {
    const seriesAllObjects = series.every(isObject);
    const distinctNames =
      seriesAllObjects && new Set(series.map((s) => (s as AnyObj).name)).size === series.length;
    if (distinctNames) {
      issues.push({
        severity: 'warning',
        rule: 'yaxis-single-with-multiple-series',
        path: 'yaxis',
        message:
          'Multiple series share a single yaxis object. If they have different scales/units, use a yaxis array with `seriesName` mapping.',
        fix: 'yaxis: [{ seriesName: "...", title: {...} }, { seriesName: "...", opposite: true }]',
      });
    }
  }
}

const HEX_LIKE = /^[0-9a-fA-F]{3,8}$/;

function checkColors(config: AnyObj, issues: ValidationIssue[]): void {
  const colors = config.colors;
  if (!Array.isArray(colors)) return;
  colors.forEach((c, i) => {
    if (typeof c !== 'string') return;
    if (c.startsWith('#')) return;
    if (HEX_LIKE.test(c)) {
      issues.push({
        severity: 'error',
        rule: 'hex-missing-hash',
        path: `colors[${i}]`,
        message: `Color "${c}" looks like a hex value but is missing the "#" prefix.`,
        fix: `Use "#${c}" instead.`,
      });
    }
  });
}

function checkResponsive(config: AnyObj, issues: ValidationIssue[]): void {
  const responsive = config.responsive;
  if (!Array.isArray(responsive) || responsive.length < 2) return;
  const breakpoints = responsive
    .map((r) => (isObject(r) ? r.breakpoint : undefined))
    .filter((b): b is number => typeof b === 'number');
  if (breakpoints.length < 2) return;
  for (let i = 1; i < breakpoints.length; i++) {
    if (breakpoints[i] <= breakpoints[i - 1]) {
      issues.push({
        severity: 'error',
        rule: 'responsive-not-ascending',
        path: 'responsive',
        message: 'responsive breakpoints must be in ascending order.',
        fix: 'Sort the responsive array by breakpoint ascending (e.g. 480, 768, 1024).',
      });
      return;
    }
  }
}

// Re-export so tools that pre-fetch the catalog can use it
export { CHART_CATALOG };
