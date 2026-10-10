import {
  bundleConsequence,
  bundleRemedy,
  bundleSince,
  CHART_CATALOG,
  getChartInfo,
  SUPPORTED_CHART_TYPES,
  type BundleRequirement,
} from './chartCatalog.js';

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
 * (sections 2 and 6). Never throws: every problem becomes an issue.
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

  // Since apexcharts 7.9, Config.init reads any falsy chart.type ('', null,
  // undefined) as 'line' before anything else sees it, so the chart draws as
  // a line chart. Only a set value that is not a string throws
  // (Config.assertKnownChartType).
  const rawType = chart.type;
  let type: string;
  if (!rawType) {
    issues.push({
      severity: 'warning',
      rule: 'missing-chart-type',
      path: 'chart.type',
      message: 'chart.type is not set, so ApexCharts draws a line chart (apexcharts 7.9 and later).',
      fix: 'Set chart.type explicitly, e.g. "line", "bar" or "pie".',
    });
    type = 'line';
  } else if (typeof rawType !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'missing-chart-type',
      path: 'chart.type',
      message: `chart.type must be a string, got ${typeof rawType}. Creating the chart throws.`,
      fix: 'Set chart.type to a type name, e.g. "line", "bar" or "pie".',
    });
    return finalize(issues);
  } else {
    type = rawType;
  }

  const info = getChartInfo(type);
  if (!info) {
    // The library names the closest type in its own throw. Its candidates
    // (BUILTIN_TYPES plus the TYPE_ALIASES keys) are the catalog's types at
    // the pinned release, which tests/chartCatalog.test.ts checks.
    const nearest = nearestName(type, SUPPORTED_CHART_TYPES);
    issues.push({
      severity: 'error',
      rule: 'unknown-chart-type',
      path: 'chart.type',
      message: `Unknown chart.type "${type}". Creating the chart throws unless the type was registered first.`,
      fix:
        (nearest ? `Did you mean "${nearest}"? ` : '') +
        `Use one of: ${SUPPORTED_CHART_TYPES.join(', ')}. ` +
        'A custom type must be registered with ApexCharts.registerSeriesType(name, def) before the chart is created.',
    });
    return finalize(issues);
  }

  checkSeries(config, info.type, info.seriesFormat, issues);
  checkStacked(chart, type, issues);
  checkDumbbellSeriesCount(type, config.series, issues);
  checkTooltip(config, issues);
  checkColors(config, issues);
  checkPremiumType(type, issues);
  checkTier2Type(type, config.series, issues);
  checkFeatureImports(config, issues);
  checkOptionKeys(config, issues);
  checkAxisBounds(config, issues);

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
    checkAxisSeries(config, type, series, issues);
  }
}

function checkNonAxisSeries(
  config: AnyObj,
  type: string,
  series: unknown[],
  issues: ValidationIssue[],
): void {
  if (series.every((s) => typeof s === 'number')) {
    checkNonAxisValues(config, type, series as number[], issues);
    return;
  }

  // A trellis splits its rows into `{ name, data }` panels and unwraps them
  // into bare values for the radial family itself.
  if (isObject(config.trellis) && config.trellis.by != null) return;

  // The object form: `[{ data: [{ x, y }, ...] }]`, or raw records mapped by
  // `parsing`. Unit and waffle read one record per dot. Labels come from `x`.
  const wrongFormat: ValidationIssue = {
    severity: 'error',
    rule: 'wrong-series-format-non-axis',
    path: 'series',
    message:
      `Chart type "${type}" takes either a flat array of numbers (plus a top-level \`labels\` array) ` +
      'or series objects whose `data` holds `{ x, y }` points. Plain numbers inside a series object are dropped.',
    fix: 'Use series: [44, 55, 13] with labels: ["A", "B", "C"], or series: [{ data: [{ x: "A", y: 44 }, { x: "B", y: 55 }] }].',
  };
  if (!series.every((s) => isObject(s) && Array.isArray(s.data))) {
    issues.push(wrongFormat);
    return;
  }
  if (type === 'unit' || type === 'waffle' || config.parsing !== undefined) return;
  const numericInside = (series as AnyObj[]).findIndex(
    (s) => s.parsing === undefined && (s.data as unknown[]).some((d) => !isObject(d)),
  );
  if (numericInside !== -1) {
    issues.push({ ...wrongFormat, path: `series[${numericInside}].data` });
  }
}

function checkNonAxisValues(
  config: AnyObj,
  type: string,
  series: number[],
  issues: ValidationIssue[],
): void {
  if (type === 'radialBar') {
    // Values map onto plotOptions.radialBar.min..max (default 0..100); anything
    // outside is clamped to an end of the arc.
    const plotOptions = isObject(config.plotOptions) ? config.plotOptions : {};
    const rb = isObject(plotOptions.radialBar) ? plotOptions.radialBar : {};
    const min = typeof rb.min === 'number' ? rb.min : 0;
    const max = typeof rb.max === 'number' ? rb.max : 100;
    series.forEach((n, i) => {
      if (n < min || n > max) {
        issues.push({
          severity: 'error',
          rule: 'radialbar-out-of-range',
          path: `series[${i}]`,
          message:
            `radialBar value ${n} is outside the domain ${min} to ${max}, so it is clamped to the end of the arc. ` +
            'The domain is plotOptions.radialBar.min and max (default 0 to 100).',
          fix: 'Set plotOptions.radialBar.min and max to the range your values use, or convert the values to percentages.',
        });
      }
    });
  }

  const labels = config.labels;
  const chart = config.chart as AnyObj;
  const isSparkline = isObject(chart.sparkline) && chart.sparkline.enabled === true;
  if (labels === undefined) {
    if (isSparkline) return;
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
  config: AnyObj,
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
    // `parsing` maps raw records onto x/y/z before anything reads the points,
    // so per-point shape checks would be reading the wrong field names.
    if (s.parsing !== undefined || config.parsing !== undefined) return;
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
        fix: 'Replace `undefined` with `null`: undefined is silently dropped and breaks the chart.',
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
        // Histogram series carry raw observations; the chart does the binning.
        // A number, a `{ y }` or `{ x }` object, or a one-element array is one
        // observation. An `{ x, y }` pair or `[x, y]` array is pre-aggregated
        // data: the chart would read y as a single observation and bin it again.
        if (
          (isObject(point) && point.x !== undefined && point.y !== undefined) ||
          (Array.isArray(point) && point.length !== 1) ||
          typeof point === 'boolean'
        ) {
          issues.push({
            severity: 'error',
            rule: 'histogram-data-not-raw',
            path,
            message:
              'Histogram data points are raw observations: plain numbers, `{ y }` objects or one-element arrays. ' +
              'An `{ x, y }` pair reads as a single observation of y, so pre-aggregated counts get binned again.',
            fix: 'Pass the observations, e.g. data: [102, 87, 143, ...]. For pre-aggregated counts use a bar chart instead.',
          });
        }
        break;
      case 'violin':
        // A violin point takes a precomputed density profile
        // (y: { density: [[value, weight], ...] }) or the raw sample, from
        // which the stats feature (in the default bundle) estimates the density:
        // `points`, `y.points`, or a flat number array as `y`.
        if (isObject(point) && !hasDensity(point) && !hasRawSample(point)) {
          issues.push({
            severity: 'error',
            rule: 'violin-missing-density',
            path: `${path}.y`,
            message:
              'Violin data points need either a density profile in `y.density` ([value, weight] pairs) or the raw sample (`points`, or a flat number array as `y`).',
            fix: 'Use { x, y: [rawValue, ...] }, { x, points: [rawValue, ...] }, or { x, y: { density: [[value, weight], ...] } }.',
          });
        }
        break;
      case 'raincloud':
        // Raincloud derives whatever a point does not supply: the density and
        // the box come from the raw sample unless `y.density` / `y.summary` are
        // given, and hand-supplied statistics are drawn as given.
        if (isObject(point) && !hasDensity(point) && !hasRawSample(point)) {
          issues.push({
            severity: 'error',
            rule: 'raincloud-missing-points',
            path: `${path}.points`,
            message:
              'Raincloud data points need the raw sample for the category (`points`, or a flat number array as `y`) or a precomputed `y.density`.',
            fix: 'Use { x: "Control", points: [3.1, 4.7, 2.9, ...] }. A precomputed y.density and y.summary are drawn as given.',
          });
        }
        break;
      case 'waterfall':
        // The series carries signed deltas; the chart accumulates. A row that
        // shows the running total is flagged instead of carrying a `y`. A null
        // `y` is a deliberate hole: the level carries over to the next row.
        if (isObject(point)) {
          const isRunningTotal = point.isSubtotal === true || point.isTotal === true;
          const hasY = point.y !== undefined && point.y !== null;
          if (!isRunningTotal && point.y === undefined) {
            issues.push({
              severity: 'warning',
              rule: 'waterfall-missing-value',
              path,
              message:
                'This waterfall row has no `y` and no `isSubtotal`/`isTotal` flag, so it renders as a gap and the level carries over.',
              fix: 'Use { x, y: -2786000 } for a step, { x, isSubtotal: true } / { x, isTotal: true } for a running total, or y: null for an intended gap.',
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
      case 'sunburst':
      case 'icicle':
        // Both are partition charts over the same tree: each point is a
        // hierarchy node with a label and an optional `children` array of the
        // same node shape (recursively). A branch may omit `y` and be the sum
        // of its children, so `y` is not required here. Top-level nodes must
        // use `x`: the series parser drops one without it before the
        // hierarchy (which also reads a `name` alias) ever sees it.
        if (isObject(point)) {
          if (point.x === undefined) {
            issues.push({
              severity: 'error',
              rule: `${type}-node-missing-x`,
              path: `${path}.x`,
              message: `Each top-level ${type} node needs an \`x\` label; without it the node is dropped.`,
            });
          }
          checkHierarchyChildren(point, path, type as 'sunburst' | 'icicle', issues);
        }
        break;
    }
  });
}

/** A precomputed density profile: `y: { density: [...] }`. */
function hasDensity(point: AnyObj): boolean {
  return isObject(point.y) && Array.isArray(point.y.density);
}

/** The raw sample the stats feature reads: `points`, `y.points` or a flat number `y`. */
function hasRawSample(point: AnyObj): boolean {
  const y = point.y;
  return (
    Array.isArray(point.points) ||
    (isObject(y) && Array.isArray(y.points)) ||
    (Array.isArray(y) && typeof y[0] === 'number')
  );
}

/**
 * Recursively validate a hierarchy node's `children`: it must be an array, and
 * every child must be an object carrying an `x` label, or its `name` alias
 * (with its own children validated the same way). Leaf nodes (no `children`)
 * are fine.
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
    if (child.x === undefined && child.name === undefined) {
      issues.push({
        severity: 'error',
        rule: `${type}-node-missing-x`,
        path: `${p}.x`,
        message: `Each ${type} node needs an \`x\` label (\`name\` is accepted as an alias below the top level).`,
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
  // Waterfall and dumbbell are already cumulative or paired, so the library
  // switches chart.stacked off for them.
  if (type === 'waterfall' || type === 'dumbbell') {
    issues.push({
      severity: 'warning',
      rule: 'stacked-ignored',
      path: 'chart.stacked',
      message: `chart.type "${type}" turns chart.stacked off, so it does nothing here.`,
      fix: 'Remove chart.stacked.',
    });
    return;
  }
  // Line, area and bar stack, including mixed charts whose series carry their
  // own `type` (see chart.stackOnlyBar). `column` is rewritten to 'bar' before
  // the stacked defaults are picked (Config.normalizeAliasedChartType), so it
  // stacks exactly as bar does.
  if (type !== 'bar' && type !== 'column' && type !== 'area' && type !== 'line') {
    issues.push({
      severity: 'error',
      rule: 'stacked-on-unsupported-type',
      path: 'chart.stacked',
      message: `chart.stacked: true only works with type "bar", "column", "area" or "line". Got "${type}".`,
      fix: 'Remove chart.stacked, or change chart.type to "bar", "column", "area" or "line".',
    });
  }
}

function checkDumbbellSeriesCount(
  type: string,
  series: unknown,
  issues: ValidationIssue[],
): void {
  // chart.type 'dumbbell' compares measures ACROSS series: one series per
  // measure. A single series has nothing to join a connector to, unless it
  // carries `y: [lo, hi]` pairs, the form plotOptions.bar.isDumbbell takes,
  // which the dumbbell passes straight through.
  if (type !== 'dumbbell' || !Array.isArray(series) || series.length >= 2) return;
  const only = series[0];
  if (isObject(only) && Array.isArray(only.data)) {
    const paired = only.data.some((d) => isObject(d) && Array.isArray(d.y));
    if (paired) return;
  }
  issues.push({
    severity: 'warning',
    rule: 'dumbbell-single-series',
    path: 'series',
    message:
      'chart.type "dumbbell" compares two or more measures per category, one series per measure. With a single series there is nothing to connect.',
    fix: 'Add a series per measure, each with the same x categories.',
  });
}

function checkTier2Type(type: string, series: unknown, issues: ValidationIssue[]): void {
  // Since apexcharts 8.0 the default bundle (`import ApexCharts from
  // 'apexcharts'`) registers the standard types only; the catalog's `bundle`
  // field names each Tier 2 type and what it needs. The validator cannot see
  // the page's imports, so this is a warning, never an error.
  const info = getChartInfo(type);
  if (info?.bundle) {
    issues.push(tier2Issue(`Chart type "${type}"`, info.bundle, 'chart.type'));
  }
  // violin is an XY type, so one series of a combo can be a violin while the
  // chart's own type is in the default bundle. Its renderer is looked up all
  // the same (Core._instantiateSeriesRenderers). A violin or raincloud chart's
  // own import already brings it.
  if (type === 'violin' || type === 'raincloud' || !Array.isArray(series)) return;
  const violin = getChartInfo('violin')?.bundle;
  const i = series.findIndex((s) => isObject(s) && s.type === 'violin');
  if (violin && i !== -1) {
    issues.push(tier2Issue('Series type "violin"', violin, `series[${i}].type`));
  }
}

function tier2Issue(subject: string, b: BundleRequirement, path: string): ValidationIssue {
  const what =
    b.failure === 'throws'
      ? `${subject} is not in the default ApexCharts bundle`
      : `${subject} needs a feature that is not in the default ApexCharts bundle`;
  return {
    severity: 'warning',
    rule: 'tier2-chart-type',
    path,
    message: `${what} (Tier 2 since ${bundleSince(b)}). Without its import, ${bundleConsequence(b)}.`,
    fix: bundleRemedy(b) + (b.note ? ` ${b.note}` : ''),
  };
}

/**
 * Features a config switches on that the default bundle lacks. Each test is
 * the library's own "asked for but not loaded" check at v8.0.0, applied to the
 * config alone (global window.Apex options are out of sight). One rule id for
 * both; `path` names the feature's option.
 */
function checkFeatureImports(config: AnyObj, issues: ValidationIssue[]): void {
  // drilldown left the default bundle in 8.0. src/apexcharts.js warns when
  // `w.config.drilldown?.enabled` is set and the feature is absent.
  const drilldown = config.drilldown;
  if (isObject(drilldown) && drilldown.enabled) {
    issues.push({
      severity: 'warning',
      rule: 'feature-needs-import',
      path: 'drilldown.enabled',
      message:
        'drilldown is not in the default ApexCharts bundle since v8.0. Without its feature the root level draws, a click on a drillable point does nothing, and one console warning names the import.',
      fix: bundleRemedy({
        import: 'apexcharts/features/drilldown',
        scripts: ['dist/features/drilldown.js'],
      }),
    });
  }

  // highlight-filter (v7.9) has never been in the default bundle.
  // Data.parseData warns when it is absent and the config carries parts.
  const partsAt = highlightPartsPath(config);
  if (partsAt) {
    issues.push({
      severity: 'warning',
      rule: 'feature-needs-import',
      path: partsAt,
      message:
        'Highlight parts (`highlightData`, a point\'s `highlight`, `highlightFilter.data`) need the highlight-filter feature (v7.9), which is not in the default ApexCharts bundle. ' +
        'Without it the chart draws without them and one console warning names the import. It is a premium feature: drawn without a license key on a plan that includes it, the chart carries an "APEXCHARTS" watermark.',
      fix: bundleRemedy({
        import: 'apexcharts/features/highlight-filter',
        scripts: ['dist/features/highlight-filter.js'],
      }),
    });
  }
}

/**
 * Where the config first carries highlight parts, or null. The same test as
 * v8.0.0 Data.parseData: `highlightFilter.data`, a series' `highlightData`, or
 * a `highlight` key on a series' first point (checked per series, never per
 * point).
 */
function highlightPartsPath(config: AnyObj): string | null {
  if (isObject(config.highlightFilter) && config.highlightFilter.data) return 'highlightFilter.data';
  if (!Array.isArray(config.series)) return null;
  for (let i = 0; i < config.series.length; i++) {
    const s = config.series[i] as { highlightData?: unknown; data?: unknown } | null | undefined;
    if (!s) continue;
    if (s.highlightData) return `series[${i}].highlightData`;
    const first = (s.data as unknown[] | null | undefined)?.[0];
    if (first && typeof first === 'object' && 'highlight' in first) {
      return `series[${i}].data[0].highlight`;
    }
  }
  return null;
}

/**
 * The top-level option names apexcharts reads: `Object.keys(new
 * Options().init())` at v8.0.0 (src/modules/settings/Options.js), the list
 * Config.warnUnknownOptionKeys checks against. Re-extract it at each re-pin.
 */
const KNOWN_OPTION_KEYS = [
  'annotations',
  'plugins',
  'trellis',
  'chart',
  'parsing',
  'plotOptions',
  'colors',
  'dataLabels',
  'fill',
  'forecastDataPoints',
  'highlightFilter',
  'grid',
  'labels',
  'drilldown',
  'legend',
  'markers',
  'noData',
  'responsive',
  'series',
  'states',
  'title',
  'subtitle',
  'stroke',
  'tooltip',
  'xaxis',
  'yaxis',
  'theme',
];

function checkOptionKeys(config: AnyObj, issues: ValidationIssue[]): void {
  // Config.warnUnknownOptionKeys (v7.9): a key the library never reads is
  // merged into the config and ignored, with one console warning.
  for (const key of Object.keys(config)) {
    if (KNOWN_OPTION_KEYS.includes(key)) continue;
    const nearest = nearestName(key, KNOWN_OPTION_KEYS);
    issues.push({
      severity: 'warning',
      rule: 'unknown-option-key',
      path: key,
      message: `ApexCharts reads no top-level option "${key}", so it is kept in the config and ignored.`,
      fix: nearest
        ? `Did you mean "${nearest}"?`
        : 'Remove it, or move it under the option group that reads it.',
    });
  }
}

function checkAxisBounds(config: AnyObj, issues: ValidationIssue[]): void {
  // Config.normalizeAxisBounds (v7.9): a bound that does not convert to a
  // number is ignored with a console warning, and the axis scales to the data.
  const push = (path: string, value: unknown, onX: boolean): void => {
    // String() for numbers: JSON.stringify prints NaN and Infinity as null,
    // which is the one value this check accepts as unset.
    const shown =
      typeof value === 'string'
        ? `"${value}"`
        : typeof value === 'number'
          ? String(value)
          : (JSON.stringify(value) ?? String(value));
    issues.push({
      severity: 'warning',
      rule: 'unparseable-axis-bound',
      path,
      message: `${path} is ${shown}, which cannot be read as a number, so ApexCharts ignores the bound and the axis scales to the data.`,
      fix:
        'Use a number, or a numeric string such as "10".' +
        (onX ? ' For a date, set xaxis.type: "datetime".' : ''),
    });
  };

  const xaxis = config.xaxis;
  if (isObject(xaxis)) {
    // The axis type comes from the config alone: no type default sets
    // 'datetime', and the default is 'category'.
    const isDatetime = xaxis.type === 'datetime';
    for (const bound of ['min', 'max']) {
      if (xaxis[bound] === undefined) continue;
      if (!axisBoundReads(xaxis[bound], isDatetime)) push(`xaxis.${bound}`, xaxis[bound], true);
    }
  }

  const yaxis = config.yaxis;
  const yaxes: unknown[] = Array.isArray(yaxis) ? yaxis : yaxis ? [yaxis] : [];
  yaxes.forEach((y, i) => {
    if (!isObject(y)) return;
    for (const bound of ['min', 'max']) {
      // A y bound may be a function, which the range code calls with the extent.
      if (y[bound] === undefined || typeof y[bound] === 'function') continue;
      if (!axisBoundReads(y[bound], false)) {
        push(Array.isArray(yaxis) ? `yaxis[${i}].${bound}` : `yaxis.${bound}`, y[bound], false);
      }
    }
  });
}

/** Whether v8.0.0 Config._coerceAxisBound turns a bound into a number. */
function axisBoundReads(value: unknown, isDatetime: boolean): boolean {
  if (value === null) return true; // leaves the bound unset, no warning
  if (typeof value === 'number') return Number.isFinite(value);
  // A datetime axis parses through Date.parse, whose answer for anything but
  // ISO 8601 differs between engines, so it is not judged here.
  if (isDatetime) return true;
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value));
  return false;
}

/**
 * Utils.editDistance at apexcharts v8.0.0: single-character insertions,
 * deletions and substitutions, capped at `max` (returns max + 1 beyond it).
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Utils.nearestName at apexcharts v8.0.0: the closest candidate ignoring case
 * and surrounding whitespace, within 1 edit for a name of up to 4 characters
 * and 2 above, or '' when nothing is that close. Ties go to the earlier
 * candidate.
 */
function nearestName(name: string, candidates: string[]): string {
  const needle = String(name).trim().toLowerCase();
  const max = needle.length > 4 ? 2 : 1;
  let best = '';
  let bestDist = max + 1;
  for (const candidate of candidates) {
    const d = editDistance(needle, candidate.toLowerCase(), max);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return bestDist <= max ? best : '';
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
        `Chart type "${type}" is a premium ApexCharts feature. Without a license ` +
        'key on a plan that includes it, it renders with an "APEXCHARTS" watermark.',
      fix: 'Set a Premium or OEM license key via ApexCharts.setLicense(key) or chart.license (a Pro key keeps the watermark), or choose a type outside the premium set.',
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

// Re-export so tools that pre-fetch the catalog can use it
export { CHART_CATALOG };
