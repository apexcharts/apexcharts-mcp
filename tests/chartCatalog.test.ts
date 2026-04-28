import { describe, expect, it } from 'vitest';
import { CHART_CATALOG, getChartInfo, SUPPORTED_CHART_TYPES } from '../src/chartCatalog.js';

describe('chart catalog', () => {
  it('exports a catalog matching SUPPORTED_CHART_TYPES', () => {
    expect(CHART_CATALOG.map((c) => c.type)).toEqual(SUPPORTED_CHART_TYPES);
  });

  it('has unique chart type ids', () => {
    const ids = CHART_CATALOG.map((c) => c.type);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a family that maps to a real reference file', () => {
    for (const c of CHART_CATALOG) {
      expect(c.referenceFile).toMatch(/\.md$/);
      expect(['cartesian', 'bar', 'financial', 'circular', 'grid', 'radar']).toContain(c.family);
    }
  });

  it('circular charts use non-axis format; everything else uses axis', () => {
    for (const c of CHART_CATALOG) {
      const expected = c.family === 'circular' ? 'non-axis' : 'axis';
      expect(c.seriesFormat).toBe(expected);
    }
  });

  it('getChartInfo round-trips for every type', () => {
    for (const t of SUPPORTED_CHART_TYPES) {
      expect(getChartInfo(t)?.type).toBe(t);
    }
  });

  it('getChartInfo returns undefined for unknown types', () => {
    expect(getChartInfo('sankey')).toBeUndefined();
  });
});
