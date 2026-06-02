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
 * Validate an ApexGantt options object against the rules in apexgantt-skill's
 * SKILL.md (critical rules 3–11) and references/dependencies.md. Never throws.
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
      message: 'series is required — it holds the task array.',
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

  const inputDateFormat =
    typeof config.inputDateFormat === 'string' ? config.inputDateFormat : 'MM-DD-YYYY';

  const ids = collectIds(series, issues);
  series.forEach((task, i) => checkTask(task, i, ids, inputDateFormat, issues));
  checkDependencyCycles(series, issues);

  return finalize(issues);
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
        fix: 'Selection, dependency arrows and the diff-update path all key off id — pick a unique value.',
      });
      dupes.add(id);
    }
    seen.add(id);
  });
  return seen;
}

function checkTask(
  task: unknown,
  i: number,
  ids: Set<string>,
  inputDateFormat: string,
  issues: ValidationIssue[],
): void {
  const path = `series[${i}]`;

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

  if (typeof task.name !== 'string' || task.name.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'task-missing-name',
      path: `${path}.name`,
      message: 'Task `name` is required and must be a non-empty string.',
    });
  }

  if (typeof task.startTime !== 'string' || task.startTime.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'task-missing-startTime',
      path: `${path}.startTime`,
      message: 'Task `startTime` is required and must be a date string parseable by inputDateFormat.',
    });
  } else {
    checkDateFormat(task.startTime, `${path}.startTime`, inputDateFormat, issues);
  }

  const type = task.type;
  const isMilestone = type === 'milestone' || (typeof type === 'string' && type.toLowerCase() === 'milestone');

  if (isMilestone) {
    if (task.endTime !== undefined) {
      issues.push({
        severity: 'error',
        rule: 'milestone-has-endTime',
        path: `${path}.endTime`,
        message: 'Milestone tasks must omit `endTime` — they render as a diamond at `startTime`.',
        fix: 'Remove `endTime`, or change `type` away from "milestone".',
      });
    }
  } else if (typeof task.endTime === 'string') {
    checkDateFormat(task.endTime, `${path}.endTime`, inputDateFormat, issues);
  }

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
        message: `progress must be in 0–100 (percent). Got ${p}.`,
        fix: p > 0 && p <= 1 ? 'Multiply by 100: progress is 0–100, not 0–1.' : undefined,
      });
    } else if (p > 0 && p <= 1) {
      issues.push({
        severity: 'warning',
        rule: 'progress-looks-like-fraction',
        path: `${path}.progress`,
        message:
          `progress=${p} is technically valid but very low — common mistake is passing 0–1 fractions. ApexGantt expects 0–100.`,
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
        message: `parentId "${task.parentId}" does not match any task id. Orphan parents are silently flattened to top-level.`,
      });
    }
  }

  if (task.dependency !== undefined) {
    checkDependency(task.dependency, task.id, ids, `${path}.dependency`, issues);
  }

  if (task.baseline !== undefined) {
    checkBaseline(task.baseline, `${path}.baseline`, inputDateFormat, issues);
  }
}

function checkDateFormat(
  value: string,
  path: string,
  inputDateFormat: string,
  issues: ValidationIssue[],
): void {
  // The default format is 'MM-DD-YYYY' but a very common mistake is passing
  // ISO dates ('2026-01-15') without overriding inputDateFormat. We can't
  // truly run dayjs here, but we can catch the most common shape mismatch.
  if (inputDateFormat === 'MM-DD-YYYY' && ISO_DATE_RE.test(value)) {
    issues.push({
      severity: 'warning',
      rule: 'iso-date-with-default-format',
      path,
      message:
        `Date "${value}" looks like ISO (YYYY-MM-DD) but inputDateFormat is the default "MM-DD-YYYY". ` +
        'The bar will fail to render with no console error.',
      fix: 'Set `inputDateFormat: "YYYY-MM-DD"` at the top level, or rewrite dates as "MM-DD-YYYY".',
    });
  }
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
          'Dependency object uses `id` instead of `taskId`. ApexGantt only reads `taskId` — the dependency is silently dropped.',
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
        message: `Task "${targetId}" depends on itself. Self-dependencies create a cycle and are ignored at render time.`,
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

function checkBaseline(
  baseline: unknown,
  path: string,
  inputDateFormat: string,
  issues: ValidationIssue[],
): void {
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
    checkDateFormat(start, `${path}.start`, inputDateFormat, issues);
  }
  if (typeof end !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'baseline-missing-end',
      path: `${path}.end`,
      message: 'baseline.end is required and must be a date string.',
    });
  } else {
    checkDateFormat(end, `${path}.end`, inputDateFormat, issues);
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
    if (typeof dep === 'string') {
      preds.push(dep);
    } else if (isObject(dep) && typeof dep.taskId === 'string') {
      preds.push(dep.taskId);
    }
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
                message: `Dependency cycle detected: ${cycle}.`,
                fix: 'Break the cycle — ApexGantt suppresses arrow draw on the cycle edge but the data is still wrong.',
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
