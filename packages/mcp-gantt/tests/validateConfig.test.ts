import { describe, expect, it } from 'vitest';
import { validateGanttConfig } from '../src/validateConfig.js';

const ok = { id: 't1', name: 'T1', startTime: '01-01-2026', endTime: '01-15-2026' };

describe('validateGanttConfig — happy path', () => {
  it('accepts a minimal valid config', () => {
    const result = validateGanttConfig({ series: [ok] });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a config with hierarchy, dependency, and milestone', () => {
    const result = validateGanttConfig({
      series: [
        { id: 'p1', name: 'Phase', startTime: '01-01-2026', endTime: '02-01-2026' },
        { id: 't1', name: 'A', parentId: 'p1', startTime: '01-01-2026', endTime: '01-15-2026' },
        {
          id: 't2',
          name: 'B',
          parentId: 'p1',
          startTime: '01-16-2026',
          endTime: '02-01-2026',
          dependency: 't1',
        },
        { id: 'm1', name: 'Launch', startTime: '02-01-2026', type: 'milestone' },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateGanttConfig — top-level shape', () => {
  it('flags non-object config', () => {
    const result = validateGanttConfig(null);
    expect(result.errors[0].rule).toBe('config-not-object');
  });

  it('flags missing series', () => {
    const result = validateGanttConfig({});
    expect(result.errors[0].rule).toBe('missing-series');
  });

  it('flags non-array series', () => {
    const result = validateGanttConfig({ series: 'oops' });
    expect(result.errors[0].rule).toBe('series-not-array');
  });
});

describe('validateGanttConfig — per-task rules', () => {
  it('flags task without id, name, or startTime', () => {
    const result = validateGanttConfig({ series: [{}] });
    const rules = result.errors.map((e) => e.rule).sort();
    expect(rules).toEqual(['task-missing-id', 'task-missing-name', 'task-missing-startTime']);
  });

  it('flags duplicate task ids', () => {
    const result = validateGanttConfig({
      series: [ok, { ...ok, name: 'T1-dup' }],
    });
    expect(result.errors.some((e) => e.rule === 'duplicate-task-id')).toBe(true);
  });

  it('warns (not errors) on a milestone whose endTime differs from its startTime', () => {
    const later = validateGanttConfig({
      series: [{ id: 'm', name: 'M', startTime: '06-01-2026', endTime: '06-02-2026', type: 'milestone' }],
    });
    expect(later.ok).toBe(true);
    expect(later.warnings.map((w) => w.rule)).toEqual(['milestone-has-endTime']);

    const same = validateGanttConfig({
      series: [{ id: 'm', name: 'M', startTime: '06-01-2026', endTime: '06-01-2026', type: 'milestone' }],
    });
    expect(same.issues).toEqual([]);
  });

  it('warns on a startTime with no endTime and no type (3.20.0 infers a milestone, 3.19 throws)', () => {
    const result = validateGanttConfig({ series: [{ id: 'a', name: 'A', startTime: '01-05-2026' }] });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.rule)).toEqual(['milestone-inferred']);
    expect(result.warnings[0].message).toMatch(/3\.20\.0/);
    expect(result.warnings[0].message).toMatch(/3\.19/);
  });

  it('errors on an explicit type "task" with a startTime but no endTime (throws on every version)', () => {
    const result = validateGanttConfig({ series: [{ id: 'a', name: 'A', startTime: '01-05-2026', type: 'task' }] });
    expect(result.errors.map((e) => e.rule)).toEqual(['task-missing-endTime']);
  });

  it('warns on a task type that does not exist, such as "summary"', () => {
    const result = validateGanttConfig({ series: [{ ...ok, type: 'summary' }] });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.rule)).toEqual(['task-type-unknown']);
  });

  it('errors on a childless row with no dates even when showSummaryBar is set (the library throws)', () => {
    const result = validateGanttConfig({ series: [{ id: 'p', name: 'P', showSummaryBar: true }] });
    expect(result.errors.map((e) => e.rule)).toEqual(['task-missing-startTime']);
  });

  it('accepts a milestone with only a startTime', () => {
    const result = validateGanttConfig({
      series: [{ id: 'm', name: 'M', startTime: '01-05-2026', type: 'milestone' }],
    });
    expect(result.issues).toEqual([]);
  });

  it('warns that a capitalised "Milestone" type is treated as an ordinary task', () => {
    const result = validateGanttConfig({
      series: [{ id: 'm', name: 'M', startTime: '01-05-2026', type: 'Milestone' }],
    });
    expect(result.issues.map((i) => i.rule)).toEqual(['task-type-case', 'task-missing-endTime']);
  });

  it('accepts a parent row without dates when other tasks name it as parentId', () => {
    const result = validateGanttConfig({
      series: [{ id: 'p', name: 'P' }, { ...ok, id: 'c', parentId: 'p' }],
    });
    expect(result.issues).toEqual([]);
  });

  it('errors on a leaf task with no dates at all', () => {
    const result = validateGanttConfig({ series: [{ id: 'a', name: 'A' }] });
    expect(result.errors.map((e) => e.rule)).toEqual(['task-missing-startTime']);
    expect(result.errors[0].message).toMatch(/has no startTime and no children/);
  });

  it('warns on a parent with only an endTime (3.20.0 draws a summary bar, 3.19 throws)', () => {
    const result = validateGanttConfig({
      series: [{ id: 'p', name: 'P', endTime: '01-31-2026' }, { ...ok, id: 'c', parentId: 'p' }],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.rule)).toEqual(['parent-single-date']);
    expect(result.warnings[0].path).toBe('series[0].startTime');
    expect(result.warnings[0].message).toMatch(/3\.20\.0/);
    expect(result.warnings[0].message).toMatch(/3\.19/);
  });

  it('warns on a parent with only a startTime and no type as a summary bar, not a milestone', () => {
    const result = validateGanttConfig({
      series: [{ id: 'p', name: 'P', startTime: '01-01-2026' }, { ...ok, id: 'c', parentId: 'p' }],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.rule)).toEqual(['parent-single-date']);
    expect(result.warnings[0].message).toMatch(/summary bar/);
  });

  it('still errors on a parent with only a startTime and type "task" (throws on every version)', () => {
    const result = validateGanttConfig({
      series: [{ id: 'p', name: 'P', startTime: '01-01-2026', type: 'task' }, { ...ok, id: 'c', parentId: 'p' }],
    });
    expect(result.errors.map((e) => e.rule)).toEqual(['task-missing-endTime']);
  });

  it('errors on a leaf with only an endTime (throws on every version)', () => {
    const result = validateGanttConfig({ series: [{ id: 'a', name: 'A', endTime: '01-31-2026' }] });
    expect(result.errors.map((e) => e.rule)).toEqual(['task-missing-startTime']);
  });

  it('accepts a numeric id with a warning, and matches it from a string parentId and taskId', () => {
    const result = validateGanttConfig({
      series: [
        { id: 1, name: 'P' },
        { ...ok, id: 'c', parentId: '1' },
        { ...ok, id: 'd', dependency: { taskId: 1 } },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.rule)).toEqual(['id-not-string']);
  });

  it('accepts a split task whose dates come from its segments', () => {
    const result = validateGanttConfig({
      series: [
        {
          id: 's',
          name: 'S',
          segments: [{ start: '01-12-2026', end: '01-14-2026' }, { start: '01-19-2026', end: '01-21-2026' }],
        },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it('accepts an empty task name', () => {
    expect(validateGanttConfig({ series: [{ ...ok, name: '' }] }).issues).toEqual([]);
  });
});

describe('validateGanttConfig — parsing', () => {
  it('skips the TaskInput checks for raw rows mapped by parsing', () => {
    const result = validateGanttConfig({
      series: [{ task_id: 'T1', task_name: 'X', start_date: '01-01-2024', end_date: '01-15-2024' }],
      parsing: { id: 'task_id', name: 'task_name', startTime: 'start_date', endTime: 'end_date' },
    });
    expect(result.issues).toEqual([]);
  });

  it('errors when parsing does not map id, name and startTime', () => {
    const result = validateGanttConfig({
      series: [{ task_id: 'T1' }],
      parsing: { id: 'task_id', name: 'task_name' },
    });
    expect(result.errors.map((e) => e.rule)).toEqual(['parsing-incomplete']);
  });
});

describe('validateGanttConfig — progress', () => {
  it('flags progress out of 0–100', () => {
    const result = validateGanttConfig({ series: [{ ...ok, progress: 150 }] });
    expect(result.errors.some((e) => e.rule === 'progress-out-of-range')).toBe(true);
  });

  it('flags progress as non-number', () => {
    const result = validateGanttConfig({ series: [{ ...ok, progress: '50' }] });
    expect(result.errors.some((e) => e.rule === 'progress-not-number')).toBe(true);
  });

  it('warns when progress looks like a 0–1 fraction', () => {
    const result = validateGanttConfig({ series: [{ ...ok, progress: 0.75 }] });
    expect(result.warnings.some((w) => w.rule === 'progress-looks-like-fraction')).toBe(true);
  });

  it('does not read an integer progress of 1 as a fraction', () => {
    const result = validateGanttConfig({ series: [{ ...ok, progress: 1 }] });
    expect(result.issues).toEqual([]);
  });

  it('does not flag progress=0', () => {
    const result = validateGanttConfig({ series: [{ ...ok, progress: 0 }] });
    expect(result.ok).toBe(true);
  });
});

describe('validateGanttConfig — parentId', () => {
  it('flags orphan parentId', () => {
    const result = validateGanttConfig({
      series: [{ ...ok, parentId: 'does-not-exist' }],
    });
    const orphan = result.errors.find((e) => e.rule === 'orphan-parentId');
    expect(orphan).toBeDefined();
    // 3.19 drops the row; 3.20.0 attaches it to the root. The message names both.
    expect(orphan?.message).toMatch(/3\.20\.0/);
  });

  it('flags self-parent', () => {
    const result = validateGanttConfig({
      series: [{ ...ok, parentId: ok.id }],
    });
    expect(result.errors.some((e) => e.rule === 'parentId-self')).toBe(true);
  });

  it('flags a cycle of parents (a under b under a) once', () => {
    const result = validateGanttConfig({
      series: [
        { ...ok, id: 'a', parentId: 'b' },
        { ...ok, id: 'b', parentId: 'a' },
        { ...ok, id: 'c', parentId: 'a' },
      ],
    });
    const cycles = result.errors.filter((e) => e.rule === 'parentId-cycle');
    expect(cycles).toHaveLength(1);
    expect(cycles[0].message).toMatch(/a under b under a/);
    expect(cycles[0].message).toMatch(/3\.20\.0/);
  });

  it('does not flag a deep chain that reaches the root', () => {
    const result = validateGanttConfig({
      series: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parentId: 'a' },
        { ...ok, id: 'c', parentId: 'b' },
      ],
    });
    expect(result.issues).toEqual([]);
  });
});

describe('validateGanttConfig: calendar', () => {
  it('warns when workingWeekdays names no weekday from 0 to 6', () => {
    for (const workingWeekdays of [[], [7]]) {
      const result = validateGanttConfig({ series: [ok], calendar: { workingWeekdays } });
      expect(result.ok).toBe(true);
      expect(result.warnings.map((w) => w.rule)).toEqual(['calendar-no-working-weekdays']);
    }
  });

  it('accepts numeric strings and a usual week', () => {
    expect(validateGanttConfig({ series: [ok], calendar: { workingWeekdays: ['1', '2'] } }).issues).toEqual([]);
    expect(validateGanttConfig({ series: [ok], calendar: { workingWeekdays: [1, 2, 3, 4, 5] } }).issues).toEqual([]);
    expect(validateGanttConfig({ series: [ok], calendar: {} }).issues).toEqual([]);
  });
});

describe('validateGanttConfig — dependencies', () => {
  it('flags dependency using id instead of taskId', () => {
    const result = validateGanttConfig({
      series: [
        ok,
        { id: 't2', name: 'B', startTime: '01-16-2026', endTime: '02-01-2026', dependency: { id: 't1' } },
      ],
    });
    expect(result.errors.some((e) => e.rule === 'dependency-wrong-key')).toBe(true);
  });

  it('flags dependency target that does not exist', () => {
    const result = validateGanttConfig({
      series: [{ ...ok, dependency: 'ghost' }],
    });
    expect(result.errors.some((e) => e.rule === 'dependency-target-missing')).toBe(true);
  });

  it('flags self-dependency', () => {
    const result = validateGanttConfig({
      series: [{ ...ok, dependency: ok.id }],
    });
    expect(result.errors.map((e) => e.rule)).toEqual(['self-dependency']);
  });

  it('flags invalid dependency type', () => {
    const result = validateGanttConfig({
      series: [
        ok,
        {
          id: 't2',
          name: 'B',
          startTime: '01-16-2026',
          endTime: '02-01-2026',
          dependency: { taskId: 't1', type: 'XX' },
        },
      ],
    });
    expect(result.errors.some((e) => e.rule === 'dependency-type-invalid')).toBe(true);
  });

  it('accepts all four valid dependency types', () => {
    const series = [ok];
    (['FS', 'SS', 'FF', 'SF'] as const).forEach((type, i) => {
      series.push({
        id: `t${i + 2}`,
        name: `T${i + 2}`,
        startTime: '01-16-2026',
        endTime: '02-01-2026',
        // @ts-expect-error — TaskDependency object
        dependency: { taskId: 't1', type },
      });
    });
    const result = validateGanttConfig({ series });
    expect(result.ok).toBe(true);
  });

  it('warns that dependency.lagUnit has no effect', () => {
    const result = validateGanttConfig({
      series: [
        ok,
        {
          id: 't2',
          name: 'B',
          startTime: '01-16-2026',
          endTime: '02-01-2026',
          dependency: { taskId: 't1', type: 'FS', lag: 2, lagUnit: 'calendar' },
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.rule)).toEqual(['dependency-lagUnit-no-effect']);
  });

  it('detects a simple dependency cycle (A → B → A)', () => {
    const result = validateGanttConfig({
      series: [
        { id: 'A', name: 'A', startTime: '01-01-2026', endTime: '01-10-2026', dependency: 'B' },
        { id: 'B', name: 'B', startTime: '01-11-2026', endTime: '01-20-2026', dependency: 'A' },
      ],
    });
    expect(result.errors.some((e) => e.rule === 'dependency-cycle')).toBe(true);
  });
});

describe('validateGanttConfig — date format', () => {
  it('warns when ISO date is used with default MM-DD-YYYY format', () => {
    const result = validateGanttConfig({
      series: [{ id: 't', name: 'T', startTime: '2026-01-15', endTime: '2026-01-30' }],
    });
    // One warning for the whole config, not one per date field.
    expect(result.warnings.filter((w) => w.rule === 'iso-date-with-default-format')).toHaveLength(1);
    expect(result.ok).toBe(true);
  });

  it('does not warn when inputDateFormat is set to ISO', () => {
    const result = validateGanttConfig({
      inputDateFormat: 'YYYY-MM-DD',
      series: [{ id: 't', name: 'T', startTime: '2026-01-15', endTime: '2026-01-30' }],
    });
    expect(result.warnings.filter((w) => w.rule === 'iso-date-with-default-format')).toEqual([]);
  });
});

describe('validateGanttConfig — baseline', () => {
  it('flags baseline missing start or end', () => {
    const result = validateGanttConfig({
      series: [{ ...ok, baseline: { start: '01-01-2026' } as unknown as Record<string, string> }],
    });
    expect(result.errors.some((e) => e.rule === 'baseline-missing-end')).toBe(true);
  });
});

describe('validateGanttConfig design-system switches', () => {
  const switchIssues = (config: Record<string, unknown>) =>
    validateGanttConfig(config).issues.filter((i) => i.rule === 'design-switch-not-boolean');

  it('accepts boolean switches', () => {
    expect(switchIssues({ series: [ok], designSystem: false, tokens: true })).toEqual([]);
  });

  it('warns when a switch is not a boolean, since only false turns it off', () => {
    const issues = switchIssues({ series: [ok], designSystem: 'false', tokens: 'off' });
    expect(issues.map((i) => i.path).sort()).toEqual(['designSystem', 'tokens']);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });
});
