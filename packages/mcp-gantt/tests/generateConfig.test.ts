import { describe, expect, it } from 'vitest';
import { generateGanttConfig } from '../src/generateConfig.js';

describe('generateGanttConfig', () => {
  it('builds a minimal config with placeholder tasks when none are given', () => {
    const config = generateGanttConfig({});
    expect(config.chart).toMatchObject({ height: 600 });
    expect(config.inputDateFormat).toBe('MM-DD-YYYY');
    const series = config.series as Array<{ id: string; name: string; startTime: string }>;
    expect(series.length).toBeGreaterThan(0);
    for (const task of series) {
      expect(typeof task.id).toBe('string');
      expect(typeof task.name).toBe('string');
      expect(typeof task.startTime).toBe('string');
    }
  });

  it('emits placeholder dates in the chosen inputDateFormat', () => {
    const iso = generateGanttConfig({ inputDateFormat: 'YYYY-MM-DD' });
    const isoTask = (iso.series as Array<{ startTime: string }>)[0];
    expect(isoTask.startTime).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const eu = generateGanttConfig({ inputDateFormat: 'DD/MM/YYYY' });
    const euTask = (eu.series as Array<{ startTime: string }>)[0];
    expect(euTask.startTime).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('placeholder includes a hierarchy, a dependency, and a milestone', () => {
    const config = generateGanttConfig({});
    const series = config.series as Array<Record<string, unknown>>;

    expect(series.some((t) => typeof t.parentId === 'string')).toBe(true);
    expect(series.some((t) => t.dependency !== undefined)).toBe(true);
    expect(series.some((t) => t.type === 'milestone')).toBe(true);
  });

  it('passes through tasks unchanged when supplied', () => {
    const tasks = [{ id: 'a', name: 'A', startTime: '01-01-2026', endTime: '01-15-2026' }];
    const config = generateGanttConfig({ tasks });
    expect(config.series).toBe(tasks);
  });

  it('attaches title only when provided', () => {
    expect(generateGanttConfig({}).title).toBeUndefined();
    expect(generateGanttConfig({ title: 'Q1 plan' }).title).toEqual({ text: 'Q1 plan' });
  });

  it('honors enableCriticalPath, enableSelection, and baseline flags', () => {
    const config = generateGanttConfig({
      enableCriticalPath: true,
      enableSelection: true,
      baseline: true,
    });
    expect(config.enableCriticalPath).toBe(true);
    expect(config.enableSelection).toBe(true);
    expect(config.baseline).toEqual({ enabled: true });
  });

  it('merges baseline options when an object is passed', () => {
    const config = generateGanttConfig({ baseline: { color: '#aaa' } });
    expect(config.baseline).toEqual({ enabled: true, color: '#aaa' });
  });
});
