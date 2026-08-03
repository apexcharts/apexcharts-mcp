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
      expect(['cartesian', 'bar', 'financial', 'circular', 'grid', 'radar', 'unit']).toContain(
        c.family,
      );
    }
  });

  it('uses non-axis (flat number array) format only for the pie-like and unit types', () => {
    // Non-axis = flat number array + top-level `labels`. Everything else (incl.
    // the axis-shaped hierarchy of sunburst) carries data in `[{ data }]` form.
    const nonAxis = new Set(['pie', 'donut', 'polarArea', 'radialBar', 'gauge', 'unit', 'waffle']);
    for (const c of CHART_CATALOG) {
      expect(c.seriesFormat, `${c.type} seriesFormat`).toBe(nonAxis.has(c.type) ? 'non-axis' : 'axis');
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
