export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  /** Stable id for the rule (e.g. 'orphan-parentId'). */
  rule: string;
  /** Dot/bracket path into the config (e.g. 'series[2].dependency'). */
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

const DEPENDENCY_TYPES = new Set(['FS', 'SS', 'FF', 'SF']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** State shared across one validation run. */
interface Context {
  inputDateFormat: string;
  ids: Set<string>;
  /** Ids some task names as its parentId: summary rows that may omit dates. */
  parentIds: Set<string>;
  /** The ISO-date warning is about the whole config, so it is reported once. */
  isoReported: boolean;
}

/**
 * Validate an ApexGantt options object against the rules in apexgantt-skill's
 * SKILL.md and references/dependencies.md, as checked against the apexgantt
 * 3.18.1 runtime. Never throws.
 */
export function validateGanttConfig(config: unknown): ValidationResult {
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

  const series = config.series;
  if (series === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-series',
      path: 'series',
      message: 'series is required: it holds the task array.',
      fix: 'Add `series: [{ id, name, startTime, endTime }, ...]`.',
    });
    return finalize(issues);
  }
  if (!Array.isArray(series)) {
    issues.push({
      severity: 'error',
      rule: 'series-not-array',
      path: 'series',
      message: 'series must be an array of TaskInput objects.',
    });
    return finalize(issues);
  }

  // With `parsing`, the rows are raw records the library maps onto TaskInput
  // first, so the TaskInput checks below would read the wrong field names.
  if (config.parsing !== undefined) {
    checkParsing(config.parsing, issues);
    return finalize(issues);
  }

  const ctx: Context = {
    inputDateFormat: typeof config.inputDateFormat === 'string' ? config.inputDateFormat : 'MM-DD-YYYY',
    ids: collectIds(series, issues),
    parentIds: new Set(
      series
        .map((t) => (isObject(t) && typeof t.parentId === 'string' ? t.parentId : undefined))
        .filter((p): p is string => p !== undefined),
    ),
    isoReported: false,
  };
  series.forEach((task, i) => checkTask(task, i, ctx, issues));
  checkDependencyCycles(series, issues);

  return finalize(issues);
}

function checkParsing(parsing: unknown, issues: ValidationIssue[]): void {
  const missing = ['id', 'name', 'startTime'].filter((k) => !isObject(parsing) || !parsing[k]);
  if (missing.length === 0) return;
  issues.push({
    severity: 'error',
    rule: 'parsing-incomplete',
    path: 'parsing',
    message: `parsing must map id, name and startTime; missing ${missing.join(', ')}. Without them ApexGantt renders no tasks.`,
    fix: "Map each to the field in your records, e.g. parsing: { id: 'task_id', name: 'task_name', startTime: 'start_date', endTime: 'end_date' }.",
  });
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

// --- Per-task checks ------------------------------------------------------

function collectIds(series: unknown[], issues: ValidationIssue[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  series.forEach((task, i) => {
    if (!isObject(task)) return;
    const id = task.id;
    if (typeof id !== 'string') return;
    if (seen.has(id) && !dupes.has(id)) {
      issues.push({
        severity: 'error',
        rule: 'duplicate-task-id',
        path: `series[${i}].id`,
        message: `Duplicate task id "${id}". Ids must be unique across the series.`,
        fix: 'Selection, dependency arrows and the diff-update path all key off id, so pick a unique value.',
      });
      dupes.add(id);
    }
    seen.add(id);
  });
  return seen;
}

function checkTask(task: unknown, i: number, ctx: Context, issues: ValidationIssue[]): void {
  const path = `series[${i}]`;
  const ids = ctx.ids;

  if (!isObject(task)) {
    issues.push({
      severity: 'error',
      rule: 'task-not-object',
      path,
      message: 'Each task must be an object.',
    });
    return;
  }

  if (typeof task.id !== 'string' || task.id.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'task-missing-id',
      path: `${path}.id`,
      message: 'Task `id` is required and must be a non-empty string.',
    });
  }

  if (typeof task.name !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'task-missing-name',
      path: `${path}.name`,
      message: 'Task `name` is required and must be a string.',
    });
  }

  checkTaskDates(task, path, ctx, issues);

  if (task.progress !== undefined) {
    const p = task.progress;
    if (typeof p !== 'number' || Number.isNaN(p)) {
      issues.push({
        severity: 'error',
        rule: 'progress-not-number',
        path: `${path}.progress`,
        message: 'Task `progress` must be a number.',
      });
    } else if (p < 0 || p > 100) {
      issues.push({
        severity: 'error',
        rule: 'progress-out-of-range',
        path: `${path}.progress`,
        message: `progress must be in 0 to 100 (percent). Got ${p}.`,
        fix: p > 0 && p <= 1 ? 'Multiply by 100: progress is 0 to 100, not 0 to 1.' : undefined,
      });
    } else if (p > 0 && p < 1) {
      // Only a non-integer below 1 reads as a fraction: an integer 1 is 1%.
      issues.push({
        severity: 'warning',
        rule: 'progress-looks-like-fraction',
        path: `${path}.progress`,
        message: `progress=${p} looks like a 0 to 1 fraction, but ApexGantt reads progress as a percentage (0 to 100).`,
        fix: 'If this is a fraction (e.g. 0.75 = 75%), multiply by 100.',
      });
    }
  }

  if (task.parentId !== undefined) {
    if (typeof task.parentId !== 'string') {
      issues.push({
        severity: 'error',
        rule: 'parentId-not-string',
        path: `${path}.parentId`,
        message: 'parentId must be a string matching another task id.',
      });
    } else if (task.parentId === task.id) {
      issues.push({
        severity: 'error',
        rule: 'parentId-self',
        path: `${path}.parentId`,
        message: 'A task cannot be its own parent.',
      });
    } else if (!ids.has(task.parentId)) {
      issues.push({
        severity: 'error',
        rule: 'orphan-parentId',
        path: `${path}.parentId`,
        message: `parentId "${task.parentId}" does not match any task id. The task is dropped from both the task list and the timeline.`,
      });
    }
  }

  if (task.dependency !== undefined) {
    checkDependency(task.dependency, task.id, ids, `${path}.dependency`, issues);
  }

  if (task.baseline !== undefined) {
    checkBaseline(task.baseline, `${path}.baseline`, ctx, issues);
  }
}

/**
 * Which dates a task needs, as the library's task validation decides:
 * - segments supply both dates (the first segment's start, the last one's end);
 * - a row with no dates at all is a summary row, fine if it has children
 *   (or showSummaryBar), and a thrown error otherwise;
 * - a milestone needs startTime and draws at it, whatever endTime says;
 * - any other task with one date needs the other, or ApexGantt throws
 *   "Task must have an id, start, and end date".
 * The milestone test is the exact lowercase string: the library compares
 * `"milestone" === type`, so "Milestone" is drawn as an ordinary task.
 */
function checkTaskDates(task: AnyObj, path: string, ctx: Context, issues: ValidationIssue[]): void {
  const { startTime, endTime, type } = task;
  const hasStart = typeof startTime === 'string' && startTime.length > 0;
  const hasEnd = typeof endTime === 'string' && endTime.length > 0;
  const isMilestone = type === 'milestone';

  if (typeof type === 'string' && !isMilestone && type.toLowerCase() === 'milestone') {
    issues.push({
      severity: 'warning',
      rule: 'task-type-case',
      path: `${path}.type`,
      message: `type "${type}" is not recognised: ApexGantt matches the lowercase "milestone", so this row is treated as an ordinary task.`,
      fix: 'Use type: "milestone".',
    });
  }

  for (const [field, value] of [['startTime', startTime], ['endTime', endTime]] as const) {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({
        severity: 'error',
        rule: `task-missing-${field}`,
        path: `${path}.${field}`,
        message: `Task \`${field}\` must be a date string parseable by inputDateFormat.`,
      });
      return;
    }
  }

  const hasSegments =
    Array.isArray(task.segments) &&
    task.segments.some((s) => isObject(s) && typeof s.start === 'string' && typeof s.end === 'string');
  const isSummary = task.showSummaryBar === true || (typeof task.id === 'string' && ctx.parentIds.has(task.id));

  if (!hasSegments) {
    if (!hasStart && !hasEnd) {
      if (!isSummary) {
        issues.push({
          severity: 'error',
          rule: 'task-missing-startTime',
          path: `${path}.startTime`,
          message: 'This task has no startTime or endTime and no child tasks, so ApexGantt throws.',
          fix: 'Add startTime and endTime, or segments. Only a parent row (one other tasks name as parentId) may omit both.',
        });
      }
    } else if (!hasStart) {
      issues.push({
        severity: 'error',
        rule: 'task-missing-startTime',
        path: `${path}.startTime`,
        message: 'This task has an endTime but no startTime, so ApexGantt throws.',
        fix: 'Add startTime.',
      });
    } else if (!hasEnd && !isMilestone && task.showSummaryBar !== true) {
      issues.push({
        severity: 'error',
        rule: 'task-missing-endTime',
        path: `${path}.endTime`,
        message: 'This task has a startTime but no endTime, so ApexGantt throws "Task must have an id, start, and end date".',
        fix: 'Add endTime, or set type: "milestone" for a single-date marker.',
      });
    }
  }

  if (isMilestone && hasStart && hasEnd && endTime !== startTime) {
    issues.push({
      severity: 'warning',
      rule: 'milestone-has-endTime',
      path: `${path}.endTime`,
      message:
        'A milestone draws as a diamond at startTime and ignores endTime for drawing, but a later endTime still widens the timeline and is read out as a range by screen readers.',
      fix: 'Remove endTime from the milestone.',
    });
  }

  if (hasStart) checkDateFormat(startTime as string, `${path}.startTime`, ctx, issues);
  if (hasEnd) checkDateFormat(endTime as string, `${path}.endTime`, ctx, issues);
}

function checkDateFormat(value: string, path: string, ctx: Context, issues: ValidationIssue[]): void {
  // Rendering falls back to a lenient parse, so ISO dates still draw under the
  // default 'MM-DD-YYYY'. Two things do not: the edit dialog parses strictly
  // (its date fields come up empty) and edited or dragged dates are written
  // back in inputDateFormat, mixing formats in the data.
  if (ctx.isoReported || ctx.inputDateFormat !== 'MM-DD-YYYY' || !ISO_DATE_RE.test(value)) return;
  ctx.isoReported = true;
  issues.push({
    severity: 'warning',
    rule: 'iso-date-with-default-format',
    path,
    message:
      `Dates such as "${value}" are ISO (YYYY-MM-DD) but inputDateFormat is the default "MM-DD-YYYY". ` +
      'The bars still draw, but the edit dialog shows empty date fields and edited or dragged dates are written back as MM-DD-YYYY, mixing formats in your data.',
    fix: 'Set `inputDateFormat: "YYYY-MM-DD"` at the top level.',
  });
}

function checkDependency(
  dep: unknown,
  selfId: unknown,
  ids: Set<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  let targetId: string | undefined;
  let type: unknown;

  if (typeof dep === 'string') {
    targetId = dep;
  } else if (isObject(dep)) {
    if ('id' in dep && !('taskId' in dep)) {
      issues.push({
        severity: 'error',
        rule: 'dependency-wrong-key',
        path,
        message:
          'Dependency object uses `id` instead of `taskId`. ApexGantt only reads `taskId`, so the dependency is silently dropped.',
        fix: 'Rename `id` to `taskId`: `dependency: { taskId: "...", type: "FS", lag: 0 }`.',
      });
    }
    if (typeof dep.taskId === 'string') {
      targetId = dep.taskId;
    } else if (dep.taskId !== undefined) {
      issues.push({
        severity: 'error',
        rule: 'dependency-taskId-not-string',
        path: `${path}.taskId`,
        message: 'dependency.taskId must be a string id.',
      });
    } else if (!('id' in dep)) {
      issues.push({
        severity: 'error',
        rule: 'dependency-missing-taskId',
        path,
        message: 'Dependency object is missing required `taskId`.',
      });
    }
    type = dep.type;
    if (type !== undefined && (typeof type !== 'string' || !DEPENDENCY_TYPES.has(type))) {
      issues.push({
        severity: 'error',
        rule: 'dependency-type-invalid',
        path: `${path}.type`,
        message: `dependency.type must be one of FS, SS, FF, SF. Got ${JSON.stringify(type)}.`,
      });
    }
    if (dep.lag !== undefined && typeof dep.lag !== 'number') {
      issues.push({
        severity: 'error',
        rule: 'dependency-lag-not-number',
        path: `${path}.lag`,
        message: 'dependency.lag must be a number (days, may be negative for lead).',
      });
    }
  } else {
    issues.push({
      severity: 'error',
      rule: 'dependency-wrong-shape',
      path,
      message: 'dependency must be a task id string or an object `{ taskId, type?, lag? }`.',
    });
    return;
  }

  if (targetId !== undefined) {
    if (targetId === selfId) {
      issues.push({
        severity: 'error',
        rule: 'self-dependency',
        path,
        message: `Task "${targetId}" depends on itself. ApexGantt still draws the arrow, looping back to the same bar.`,
      });
    } else if (!ids.has(targetId)) {
      issues.push({
        severity: 'error',
        rule: 'dependency-target-missing',
        path,
        message: `dependency references unknown task id "${targetId}".`,
      });
    }
  }
}

function checkBaseline(baseline: unknown, path: string, ctx: Context, issues: ValidationIssue[]): void {
  if (!isObject(baseline)) {
    issues.push({
      severity: 'error',
      rule: 'baseline-not-object',
      path,
      message: 'Per-task baseline must be an object `{ start, end }`.',
    });
    return;
  }
  const { start, end } = baseline;
  if (typeof start !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'baseline-missing-start',
      path: `${path}.start`,
      message: 'baseline.start is required and must be a date string.',
    });
  } else {
    checkDateFormat(start, `${path}.start`, ctx, issues);
  }
  if (typeof end !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'baseline-missing-end',
      path: `${path}.end`,
      message: 'baseline.end is required and must be a date string.',
    });
  } else {
    checkDateFormat(end, `${path}.end`, ctx, issues);
  }
}

// --- Cycle detection ------------------------------------------------------

function checkDependencyCycles(series: unknown[], issues: ValidationIssue[]): void {
  // Build adjacency from each task to its predecessor (the task it depends on).
  const graph = new Map<string, string[]>();
  series.forEach((task) => {
    if (!isObject(task) || typeof task.id !== 'string') return;
    const preds: string[] = [];
    const dep = task.dependency;
    const target = typeof dep === 'string' ? dep : isObject(dep) && typeof dep.taskId === 'string' ? dep.taskId : undefined;
    // A self-dependency is reported once, by its own rule.
    if (target !== undefined && target !== task.id) preds.push(target);
    graph.set(task.id, preds);
  });

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);

  const reported = new Set<string>();
  for (const start of graph.keys()) {
    if (color.get(start) !== WHITE) continue;
    const stack: string[] = [start];
    const path: string[] = [];
    while (stack.length) {
      const node = stack[stack.length - 1];
      const c = color.get(node);
      if (c === WHITE) {
        color.set(node, GRAY);
        path.push(node);
        const next = graph.get(node) ?? [];
        for (const n of next) {
          if (color.get(n) === GRAY) {
            // Cycle: from n back through path to node.
            const cycleStart = path.indexOf(n);
            const cycle = path.slice(cycleStart).concat(n).join(' → ');
            if (!reported.has(cycle)) {
              issues.push({
                severity: 'error',
                rule: 'dependency-cycle',
                path: 'series',
                message: `Dependency cycle detected: ${cycle}. ApexGantt draws every arrow in it, so the schedule shows tasks waiting on each other.`,
                fix: 'Break the cycle: remove or redirect one of the dependencies.',
              });
              reported.add(cycle);
            }
          } else if (color.get(n) === WHITE) {
            stack.push(n);
          }
        }
      } else {
        if (c === GRAY) {
          color.set(node, BLACK);
          path.pop();
        }
        stack.pop();
      }
    }
  }
}
