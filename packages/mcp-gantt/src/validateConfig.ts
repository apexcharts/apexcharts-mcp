import { checkDesignSwitches, createIssueList, finalizeIssues } from '@apexcharts-mcp/core';

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

/**
 * The key ApexGantt matches an id by. The library compares `id`, `parentId`
 * and `dependency.taskId` by their string value, so the number 1 and the
 * string '1' meet. Anything that is neither a string nor a finite number has
 * no key.
 */
function idKey(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
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
 * 3.19.0 and 3.20.0 runtimes. Where 3.20.0 changes the outcome (a missing
 * endTime, a parent with one date, an orphan or cyclic parentId, an empty
 * workingWeekdays), the message says what each version does. Never throws.
 */
export function validateGanttConfig(config: unknown): ValidationResult {
  // Keeps the first issues of each rule and counts the rest (see core).
  const issues = createIssueList<ValidationIssue>();

  if (!isObject(config)) {
    issues.push({
      severity: 'error',
      rule: 'config-not-object',
      path: '',
      message: 'Config must be an object.',
    });
    return finalize(issues);
  }

  // Top-level tokens / designSystem (the latter read only while
  // `apexgantt/ignite-ui` is loaded).
  issues.push(...checkDesignSwitches(config, ''));

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
    checkCalendar(config.calendar, issues);
    return finalize(issues);
  }

  const ctx: Context = {
    inputDateFormat: typeof config.inputDateFormat === 'string' ? config.inputDateFormat : 'MM-DD-YYYY',
    ids: collectIds(series, issues),
    parentIds: new Set(
      series
        .map((t) => (isObject(t) ? idKey(t.parentId) : undefined))
        .filter((p): p is string => p !== undefined),
    ),
    isoReported: false,
  };
  series.forEach((task, i) => checkTask(task, i, ctx, issues));
  checkParentCycles(series, ctx, issues);
  checkDependencyCycles(series, issues);
  checkCalendar(config.calendar, issues);

  return finalize(issues);
}

/**
 * calendar.workingWeekdays: apexgantt 3.20.0 reads numeric strings as numbers
 * and, for a list that names no weekday from 0 to 6, logs a warning and uses
 * Monday to Friday. 3.19 and earlier make every day non-working for such a
 * list (and ignore numeric strings).
 */
function checkCalendar(calendar: unknown, issues: ValidationIssue[]): void {
  if (!isObject(calendar) || calendar.workingWeekdays === undefined) return;
  const raw = calendar.workingWeekdays;
  const days = (Array.isArray(raw) ? raw : [])
    .map((d) => (typeof d === 'string' && d.trim() !== '' ? Number(d) : d))
    .filter((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6);
  if (days.length > 0) return;
  issues.push({
    severity: 'warning',
    rule: 'calendar-no-working-weekdays',
    path: 'calendar.workingWeekdays',
    message:
      `calendar.workingWeekdays ${JSON.stringify(raw)} names no weekday from 0 (Sunday) to 6 (Saturday). ` +
      'apexgantt 3.20.0+ logs a warning and uses Monday to Friday; 3.19 and earlier make every day non-working.',
    fix: 'List the working days as numbers, e.g. workingWeekdays: [1, 2, 3, 4, 5], or leave the field out for Monday to Friday.',
  });
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
  return finalizeIssues(issues);
}

// --- Per-task checks ------------------------------------------------------

function collectIds(series: unknown[], issues: ValidationIssue[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  series.forEach((task, i) => {
    if (!isObject(task)) return;
    const id = idKey(task.id);
    if (id === undefined) return;
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

  if (typeof task.id === 'number' && Number.isFinite(task.id) && task.id !== 0) {
    // The library matches ids by value, so a numeric id works; the type says string.
    issues.push({
      severity: 'warning',
      rule: 'id-not-string',
      path: `${path}.id`,
      message:
        `Task id ${task.id} is a number. ApexGantt compares ids, parentId and dependency ids by their string value, ` +
        `so it still works and matches "${task.id}", but TaskInput.id is typed string.`,
      fix: `Use id: "${task.id}".`,
    });
  } else if (typeof task.id !== 'string' || task.id.length === 0) {
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
    const parentKey = idKey(task.parentId);
    if (parentKey === undefined) {
      issues.push({
        severity: 'error',
        rule: 'parentId-not-string',
        path: `${path}.parentId`,
        message: 'parentId must be a string matching another task id.',
      });
    } else if (parentKey === idKey(task.id)) {
      issues.push({
        severity: 'error',
        rule: 'parentId-self',
        path: `${path}.parentId`,
        message:
          'A task cannot be its own parent. Through apexgantt 3.19 this overflows the stack; ' +
          'from 3.20.0 it logs a "makes a cycle of parents" warning and the task is shown at the root.',
        fix: 'Point parentId at a different task, or remove it.',
      });
    } else if (!ids.has(parentKey)) {
      issues.push({
        severity: 'error',
        rule: 'orphan-parentId',
        path: `${path}.parentId`,
        message:
          `parentId "${task.parentId}" does not match any task id. Through apexgantt 3.19 the task is dropped from both the task list and the timeline; ` +
          'from 3.20.0 it is attached to the root with a console warning. Either way the intended nesting is lost.',
      });
    }
  }

  if (task.dependency !== undefined) {
    checkDependency(task.dependency, idKey(task.id), ids, `${path}.dependency`, issues);
  }

  if (task.baseline !== undefined) {
    checkBaseline(task.baseline, `${path}.baseline`, ctx, issues);
  }
}

/**
 * Which dates a task needs, as the library's task validation decides:
 * - segments supply both dates (the first segment's start, the last one's end);
 * - a row with no dates at all is a summary row, fine if other tasks name it as
 *   parentId, and a thrown error otherwise (showSummaryBar does not save a
 *   childless row: 3.20.0 throws 'Task "<id>" has no startTime and no
 *   children', 3.19 "has no startTime/endTime and no children");
 * - a parent with only one date throws through 3.19 and is drawn as a summary
 *   bar over its children from 3.20.0, so it is a warning naming both;
 * - a leaf with an endTime and no startTime throws on every version;
 * - a milestone needs startTime and draws at it, whatever endTime says;
 * - a leaf with a startTime, no endTime and no type throws "Task must have an
 *   id, start, and end date" through 3.19, and is drawn as a milestone from
 *   3.20.0, so it is a warning that names both outcomes;
 * - any other task with one date needs the other, or ApexGantt throws.
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
  } else if (type !== undefined && type !== 'task' && !isMilestone) {
    issues.push({
      severity: 'warning',
      rule: 'task-type-unknown',
      path: `${path}.type`,
      message:
        `type ${JSON.stringify(type)} is not a task type: ApexGantt knows only "task" and "milestone". ` +
        'There is no "summary" type; any task that other tasks name as parentId gets a summary bar automatically.',
      fix: 'Remove type (or use "task" / "milestone").',
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
  const selfKey = idKey(task.id);
  const hasChildren = selfKey !== undefined && ctx.parentIds.has(selfKey);
  const parentWithOneDate = (field: 'startTime' | 'endTime'): ValidationIssue => ({
    severity: 'warning',
    rule: 'parent-single-date',
    path: `${path}.${field}`,
    message:
      `This parent row has ${field === 'startTime' ? 'an endTime but no startTime' : 'a startTime but no endTime'}. ` +
      'apexgantt 3.20.0+ draws it as a summary bar spanning its children; ' +
      '3.19 and earlier throw "Task must have an id, start, and end date" and nothing renders.',
    fix: 'Leave both dates out (the summary bar spans the children on every version), or give both.',
  });

  if (!hasSegments) {
    if (!hasStart && !hasEnd) {
      if (!hasChildren) {
        issues.push({
          severity: 'error',
          rule: 'task-missing-startTime',
          path: `${path}.startTime`,
          message:
            'This task has no startTime or endTime and no child tasks, so ApexGantt throws (showSummaryBar does not change that). ' +
            `apexgantt 3.20.0 reports 'Task "<id>" has no startTime and no children. Provide dates or add child tasks.'`,
          fix: 'Add startTime and endTime, or segments. Only a parent row (one other tasks name as parentId) may omit both.',
        });
      }
    } else if (!hasStart) {
      if (hasChildren) {
        issues.push(parentWithOneDate('startTime'));
      } else {
        issues.push({
          severity: 'error',
          rule: 'task-missing-startTime',
          path: `${path}.startTime`,
          message:
            'This task has an endTime but no startTime and no child tasks, so ApexGantt throws on every version ' +
            `(3.20.0: 'Task "<id>" has no startTime and no children. Provide dates or add child tasks.').`,
          fix: 'Add startTime.',
        });
      }
    } else if (!hasEnd && !isMilestone && task.showSummaryBar !== true && type === undefined && hasChildren) {
      issues.push(parentWithOneDate('endTime'));
    } else if (!hasEnd && !isMilestone && task.showSummaryBar !== true) {
      if (type === undefined) {
        issues.push({
          severity: 'warning',
          rule: 'milestone-inferred',
          path: `${path}.endTime`,
          message:
            'This task has a startTime, no endTime and no type. apexgantt 3.20.0+ draws it as a milestone; ' +
            '3.19 and earlier throw "Task must have an id, start, and end date" and nothing renders.',
          fix: 'Say what you mean: set type: "milestone" for a single-date marker (works on every version), or add endTime.',
        });
      } else {
        issues.push({
          severity: 'error',
          rule: 'task-missing-endTime',
          path: `${path}.endTime`,
          message: `This task has a startTime, no endTime and type ${JSON.stringify(type)}, so ApexGantt throws "Task must have an id, start, and end date" (on every version).`,
          fix: 'Add endTime, or set type: "milestone" for a single-date marker.',
        });
      }
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
  // default 'MM-DD-YYYY'. Edited or dragged dates are still written back in
  // inputDateFormat, mixing formats in the data. Through 3.19 the edit dialog
  // also parses strictly (its date fields come up empty); 3.20.0 reads ISO there.
  if (ctx.isoReported || ctx.inputDateFormat !== 'MM-DD-YYYY' || !ISO_DATE_RE.test(value)) return;
  ctx.isoReported = true;
  issues.push({
    severity: 'warning',
    rule: 'iso-date-with-default-format',
    path,
    message:
      `Dates such as "${value}" are ISO (YYYY-MM-DD) but inputDateFormat is the default "MM-DD-YYYY". ` +
      'The bars still draw, but edited or dragged dates are written back as MM-DD-YYYY, mixing formats in your data, ' +
      'and through apexgantt 3.19 the edit dialog shows empty date fields.',
    fix: 'Set `inputDateFormat: "YYYY-MM-DD"` at the top level.',
  });
}

function checkDependency(
  dep: unknown,
  selfId: string | undefined,
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
    if (idKey(dep.taskId) !== undefined) {
      // Matched by value, so a numeric taskId finds the task whose id is that number.
      targetId = idKey(dep.taskId);
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
    if (dep.lagUnit !== undefined) {
      issues.push({
        severity: 'warning',
        rule: 'dependency-lagUnit-no-effect',
        path: `${path}.lagUnit`,
        message:
          'dependency.lagUnit has no effect: the library never reads it (deprecated in apexgantt 3.20.0). ' +
          'Lag counts working days while a calendar is active and calendar days otherwise, and only feeds the critical path and the tooltip. Links never move tasks.',
        fix: 'Remove lagUnit.',
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

/**
 * A chain of parentIds that comes back to where it started (a under b under
 * a). A task naming itself is reported by `parentId-self`. Through 3.19 such a
 * chain overflows the stack; 3.20.0 breaks it at the first of its tasks in
 * input order, logs a "makes a cycle of parents" warning and shows that task
 * at the root.
 */
function checkParentCycles(series: unknown[], ctx: Context, issues: ValidationIssue[]): void {
  const parentOf = new Map<string, string>();
  series.forEach((task) => {
    if (!isObject(task)) return;
    const id = idKey(task.id);
    const parent = idKey(task.parentId);
    if (id !== undefined && parent !== undefined && parent !== id && ctx.ids.has(parent)) parentOf.set(id, parent);
  });

  const reported = new Set<string>();
  for (const start of parentOf.keys()) {
    const chain = [start];
    let cursor = parentOf.get(start);
    while (cursor !== undefined && !chain.includes(cursor)) {
      chain.push(cursor);
      cursor = parentOf.get(cursor);
    }
    if (cursor !== start) continue;
    const key = [...chain].sort().join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    issues.push({
      severity: 'error',
      rule: 'parentId-cycle',
      path: 'series',
      message:
        `parentId cycle: ${chain.concat(start).join(' under ')}. Through apexgantt 3.19 this overflows the stack and nothing renders; ` +
        'from 3.20.0 the cycle is broken at its first task in the array, which logs a "makes a cycle of parents" warning and is shown at the root.',
      fix: 'Remove or redirect one of the parentIds so the chain reaches a root task.',
    });
  }
}

function checkDependencyCycles(series: unknown[], issues: ValidationIssue[]): void {
  // Build adjacency from each task to its predecessor (the task it depends on).
  const graph = new Map<string, string[]>();
  series.forEach((task) => {
    if (!isObject(task)) return;
    const id = idKey(task.id);
    if (id === undefined) return;
    const preds: string[] = [];
    const dep = task.dependency;
    const target = typeof dep === 'string' ? dep : isObject(dep) ? idKey(dep.taskId) : undefined;
    // A self-dependency is reported once, by its own rule.
    if (target !== undefined && target !== id) preds.push(target);
    graph.set(id, preds);
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
