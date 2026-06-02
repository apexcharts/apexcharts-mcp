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

  it('flags milestone with endTime', () => {
    const result = validateGanttConfig({
      series: [{ id: 'm', name: 'M', startTime: '06-01-2026', endTime: '06-02-2026', type: 'milestone' }],
    });
    expect(result.errors.some((e) => e.rule === 'milestone-has-endTime')).toBe(true);
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
    expect(result.errors.some((e) => e.rule === 'orphan-parentId')).toBe(true);
  });

  it('flags self-parent', () => {
    const result = validateGanttConfig({
      series: [{ ...ok, parentId: ok.id }],
    });
    expect(result.errors.some((e) => e.rule === 'parentId-self')).toBe(true);
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
    expect(result.errors.some((e) => e.rule === 'self-dependency')).toBe(true);
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
    expect(result.warnings.some((w) => w.rule === 'iso-date-with-default-format')).toBe(true);
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
