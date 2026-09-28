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
  checkDumbbellSeriesCount(type, config.series, issues);
  checkTooltip(config, issues);
  checkYaxis(config, issues);
  checkColors(config, issues);
  checkResponsive(config, issues);
  checkPremiumType(type, issues);
  checkTier2Type(type, issues);

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
      case 'histogram':
        // Histogram series carry raw observations (plain numbers); the chart
        // does the binning. Object-form points mean pre-aggregated data, which
        // the histogram would mis-bin.
        if (point !== null && typeof point !== 'number') {
          issues.push({
            severity: 'error',
            rule: 'histogram-data-not-raw',
            path,
            message:
              'Histogram data points must be raw numeric observations (one number per event). The chart bins and counts them itself.',
            fix: 'Pass plain numbers, e.g. data: [102, 87, 143, ...]. For pre-aggregated counts use a bar chart instead.',
          });
        }
        break;
      case 'violin':
        // A violin point takes EITHER a precomputed density profile
        // (y: { density: [[value, weight], ...] }) or, since v6.9, only the raw
        // sample (points: [number], no y) with the KDE derived for you.
        if (isObject(point)) {
          const y = point.y;
          const hasDensity = isObject(y) && Array.isArray((y as AnyObj).density);
          const hasRawSample = Array.isArray(point.points);
          if (!hasDensity && !hasRawSample) {
            issues.push({
              severity: 'error',
              rule: 'violin-missing-density',
              path: `${path}.y`,
              message:
                'Violin data points require either `y` as an object with a `density` array of [value, weight] pairs, or (v6.9+) a raw sample in `points`.',
              fix: 'Use { x, y: { density: [[value, weight], ...] } }, or { x, points: [rawValue, ...] } with the stats feature loaded.',
            });
          }
        }
        break;
      case 'raincloud':
        // Raincloud takes the raw sample per category; the density, the box and
        // the rain are all derived from it.
        if (isObject(point) && !Array.isArray(point.points)) {
          issues.push({
            severity: 'error',
            rule: 'raincloud-missing-points',
            path: `${path}.points`,
            message:
              'Raincloud data points require a `points` array of raw observations for the category.',
            fix: 'Use { x: "Control", points: [3.1, 4.7, 2.9, ...] }. A precomputed y.summary is honored for the box, but the density and rain need the sample.',
          });
        }
        break;
      case 'waterfall':
        // The series carries signed deltas; the chart accumulates. A row that
        // shows the running total is flagged instead of carrying a `y`.
        if (isObject(point)) {
          const isRunningTotal = point.isSubtotal === true || point.isTotal === true;
          const hasY = point.y !== undefined && point.y !== null;
          if (!isRunningTotal && !hasY) {
            issues.push({
              severity: 'error',
              rule: 'waterfall-missing-value',
              path,
              message:
                'A waterfall row needs either a `y` (the signed delta) or an `isSubtotal`/`isTotal` flag.',
              fix: 'Use { x, y: -2786000 } for a step, or { x, isSubtotal: true } / { x, isTotal: true } for a running total.',
            });
          } else if (isRunningTotal && hasY) {
            issues.push({
              severity: 'warning',
              rule: 'waterfall-total-with-value',
              path,
              message:
                'An `isSubtotal`/`isTotal` row is measured for you, so its `y` is ignored.',
              fix: 'Drop the `y` from the running-total row.',
            });
          }
        }
        break;
      case 'dumbbell':
        // chart.type 'dumbbell' takes one series per measure with plain { x, y }
        // points. A [lo, hi] pair is the older plotOptions.bar.isDumbbell
        // range-bar form, which is a different chart.
        if (isObject(point) && Array.isArray(point.y)) {
          issues.push({
            severity: 'error',
            rule: 'dumbbell-paired-y',
            path: `${path}.y`,
            message:
              'chart.type "dumbbell" takes one series per measure with a plain numeric `y`, not a [low, high] pair.',
            fix: 'Split the pair into one series per measure: [{ name: "2020", data: [{ x, y }] }, { name: "2025", data: [{ x, y }] }]. To keep paired data, use chart.type "rangeBar" with plotOptions.bar.isDumbbell instead.',
          });
        }
        break;
      case 'sunburst':
      case 'icicle':
        // Both are partition charts over the same tree: each point is a
        // hierarchy node needing an `x` label and an optional `children` array
        // of the same node shape (recursively). A branch may omit `y` and be
        // the sum of its children, so `y` is not required here.
        if (isObject(point)) {
          if (point.x === undefined) {
            issues.push({
              severity: 'error',
              rule: `${type}-node-missing-x`,
              path: `${path}.x`,
              message: `Each ${type} node needs an \`x\` label.`,
            });
          }
          checkHierarchyChildren(point, path, type as 'sunburst' | 'icicle', issues);
        }
        break;
    }
  });
}

/**
 * Recursively validate a hierarchy node's `children`: it must be an array, and
 * every child must be an object carrying an `x` label (with its own children
 * validated the same way). Leaf nodes (no `children`) are fine.
 *
 * Shared by sunburst and icicle, which resolve the same tree in two layouts.
 * The rule ids stay per type (`sunburst-node-missing-x`, `icicle-node-missing-x`)
 * rather than becoming one `hierarchy-*` family: the existing ids are a stable
 * contract callers pattern-match on, and renaming them to share an
 * implementation would break that for a refactor's convenience.
 */
function checkHierarchyChildren(
  node: AnyObj,
  path: string,
  type: 'sunburst' | 'icicle',
  issues: ValidationIssue[],
): void {
  const Label = type === 'icicle' ? 'Icicle' : 'Sunburst';
  const children = node.children;
  if (children === undefined) return;
  if (!Array.isArray(children)) {
    issues.push({
      severity: 'error',
      rule: `${type}-children-not-array`,
      path: `${path}.children`,
      message: `${Label} \`children\` must be an array of child nodes.`,
      fix: 'Use { x, y, children: [{ x, y }] }, or omit `children` for a leaf node.',
    });
    return;
  }
  children.forEach((child, k) => {
    const p = `${path}.children[${k}]`;
    if (!isObject(child)) {
      issues.push({
        severity: 'error',
        rule: `${type}-node-not-object`,
        path: p,
        message: `Each ${type} node must be an object with an \`x\` label.`,
      });
      return;
    }
    if (child.x === undefined) {
      issues.push({
        severity: 'error',
        rule: `${type}-node-missing-x`,
        path: `${p}.x`,
        message: `Each ${type} node needs an \`x\` label.`,
      });
    }
    checkHierarchyChildren(child, p, type, issues);
  });
}

// --- Other rules ----------------------------------------------------------

function checkStacked(chart: AnyObj, type: string, issues: ValidationIssue[]): void {
  if (chart.stacked !== true) return;
  // A streamgraph stacks by construction and owns its own baseline and band
  // order, so chart.stacked is not just unsupported, it is a category error.
  if (type === 'streamgraph') {
    issues.push({
      severity: 'warning',
      rule: 'stacked-on-streamgraph',
      path: 'chart.stacked',
      message:
        'A streamgraph stacks by construction. chart.stacked does nothing; the baseline and band order come from plotOptions.streamgraph.offset and .order.',
      fix: "Remove chart.stacked. For an ordinary stacked area on the zero line, use plotOptions.streamgraph.offset: 'zero'.",
    });
    return;
  }
  if (type !== 'bar' && type !== 'area') {
    issues.push({
      severity: 'error',
      rule: 'stacked-on-unsupported-type',
      path: 'chart.stacked',
      message: `chart.stacked: true only works with type "bar" or "area". Got "${type}".`,
      fix: 'Remove chart.stacked, or change chart.type to "bar"/"area".',
    });
  }
}

function checkDumbbellSeriesCount(
  type: string,
  series: unknown,
  issues: ValidationIssue[],
): void {
  // chart.type 'dumbbell' compares measures ACROSS series: one series per
  // measure. A single series has nothing to join a connector to.
  if (type !== 'dumbbell' || !Array.isArray(series) || series.length >= 2) return;
  issues.push({
    severity: 'warning',
    rule: 'dumbbell-single-series',
    path: 'series',
    message:
      'chart.type "dumbbell" compares two or more measures per category, one series per measure. With a single series there is nothing to connect.',
    fix: 'Add a series per measure, each with the same x categories.',
  });
}

function checkTier2Type(type: string, issues: ValidationIssue[]): void {
  // Every chart type ships in the default v7 bundle except raincloud, which is
  // Tier 2: present in the package, absent from every bundle.
  if (type !== 'raincloud') return;
  issues.push({
    severity: 'warning',
    rule: 'tier2-chart-type',
    path: 'chart.type',
    message:
      'Chart type "raincloud" is not in the default ApexCharts bundle (Tier 2, v7.1). Without its module the chart warns in the console and does not render.',
    fix: "Add `import 'apexcharts/raincloud'` (or `apexcharts/features/raincloud`) on top of the default bundle, or `dist/features/raincloud.js` after apexcharts.js from a script tag.",
  });
}

function checkPremiumType(type: string, issues: ValidationIssue[]): void {
  // unit/waffle are premium chart types (v6.6+). They render, but with an
  // "APEXCHARTS" watermark until a license is set. Warn rather than error.
  if (type === 'unit' || type === 'waffle' || type === 'raincloud') {
    issues.push({
      severity: 'warning',
      rule: 'premium-chart-type',
      path: 'chart.type',
      message:
        `Chart type "${type}" is a premium ApexCharts feature. Without a valid ` +
        'license it renders with an "APEXCHARTS" watermark.',
      fix: 'Set a license via ApexCharts.setLicense(key) or chart.license, or pick a free type.',
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
