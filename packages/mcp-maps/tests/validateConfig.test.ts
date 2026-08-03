import { describe, expect, it } from 'vitest';

import { validateMapsConfig } from '../src/validateConfig.js';

function rules(config: unknown): string[] {
  return validateMapsConfig(config).issues.map((i) => i.rule);
}

const GEO = { geo: { map: 'world/countries' } };

describe('validateMapsConfig', () => {
  it('accepts a minimal valid choropleth', () => {
    const result = validateMapsConfig({
      ...GEO,
      series: [{ joinBy: ['iso_a3', 'code'], data: [{ code: 'FRA', value: 7.3 }] }],
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts a basemap with geo and no series', () => {
    expect(validateMapsConfig(GEO).ok).toBe(true);
  });

  it('config-not-object', () => {
    expect(rules([])).toContain('config-not-object');
    expect(rules('nope')).toContain('config-not-object');
  });

  it('geo-map-missing', () => {
    expect(rules({})).toContain('geo-map-missing');
    expect(rules({ geo: {} })).toContain('geo-map-missing');
    expect(rules({ geo: { map: null } })).toContain('geo-map-missing');
  });

  it('geo-not-object / geo-map-invalid', () => {
    expect(rules({ geo: 'us' })).toContain('geo-not-object');
    expect(rules({ geo: { map: 42 } })).toContain('geo-map-invalid');
  });

  it('accepts inline geometry objects as geo.map', () => {
    const result = validateMapsConfig({ geo: { map: { type: 'FeatureCollection', features: [] } } });
    expect(result.ok).toBe(true);
  });

  it('series-not-array / series-not-object', () => {
    expect(rules({ ...GEO, series: {} })).toContain('series-not-array');
    expect(rules({ ...GEO, series: ['x'] })).toContain('series-not-object');
  });

  it('unknown-series-type on series and chart.type', () => {
    expect(rules({ ...GEO, series: [{ type: 'heatmap' }] })).toContain('unknown-series-type');
    expect(rules({ ...GEO, chart: { type: 'pie' } })).toContain('unknown-series-type');
  });

  it('chart.type seeds the default series type', () => {
    const result = validateMapsConfig({
      ...GEO,
      chart: { type: 'bubble' },
      series: [{ data: [{ name: 'x' }] }], // no coordinates, no joinBy
    });
    expect(result.errors.map((i) => i.rule)).toContain('point-position-missing');
  });

  it('series-data-not-array / datum-not-object', () => {
    expect(rules({ ...GEO, series: [{ data: 'rows' }] })).toContain('series-data-not-array');
    expect(rules({ ...GEO, series: [{ data: [1] }] })).toContain('datum-not-object');
  });

  it('joinby-invalid', () => {
    expect(rules({ ...GEO, series: [{ joinBy: 42 }] })).toContain('joinby-invalid');
    expect(rules({ ...GEO, series: [{ joinBy: ['a', 'b', 'c'] }] })).toContain('joinby-invalid');
    for (const ok of ['name', ['iso_a3', 'code'], { geo: 'iso_a3', data: 'code' }]) {
      expect(rules({ ...GEO, series: [{ joinBy: ok }] })).toEqual([]);
    }
  });

  it('undefined-in-data and value-not-numeric are warnings', () => {
    const result = validateMapsConfig({
      ...GEO,
      series: [{ data: [{ code: 'A', value: undefined }, { code: 'B', value: '7' }] }],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((i) => i.rule)).toEqual(['undefined-in-data', 'value-not-numeric']);
  });

  it('point-position-missing on bubble/marker without coordinates or joinBy', () => {
    expect(rules({ ...GEO, series: [{ type: 'bubble', data: [{ value: 1 }] }] })).toContain(
      'point-position-missing',
    );
    // joinBy on the series resolves centroids, so no error
    expect(
      rules({ ...GEO, series: [{ type: 'marker', joinBy: 'name', data: [{ name: 'France' }] }] }),
    ).toEqual([]);
    // lng is accepted as a lon synonym
    expect(
      rules({ ...GEO, series: [{ type: 'marker', data: [{ lng: 13.4, lat: 52.52 }] }] }),
    ).toEqual([]);
  });

  it('lonlat-out-of-range flags swapped coordinates', () => {
    const result = validateMapsConfig({
      ...GEO,
      series: [{ type: 'bubble', data: [{ lon: 35.69, lat: 139.69, value: 1 }] }],
    });
    expect(result.warnings.map((i) => i.rule)).toContain('lonlat-out-of-range');
  });

  it('arc-endpoints-missing / arc-endpoint-invalid', () => {
    expect(rules({ ...GEO, series: [{ type: 'arc', data: [{ to: [0, 0] }] }] })).toContain(
      'arc-endpoints-missing',
    );
    expect(
      rules({ ...GEO, series: [{ type: 'arc', data: [{ from: [0], to: [0, 0] }] }] }),
    ).toContain('arc-endpoint-invalid');
    // string endpoints are geometry keys and valid
    expect(rules({ ...GEO, series: [{ type: 'arc', data: [{ from: 'FRA', to: 'DEU' }] }] })).toEqual(
      [],
    );
  });

  it('line-path-missing / line-path-invalid, coordinates synonym accepted', () => {
    expect(rules({ ...GEO, series: [{ type: 'line', data: [{}] }] })).toContain('line-path-missing');
    expect(
      rules({ ...GEO, series: [{ type: 'line', data: [{ path: [[0, 0], 'x'] }] }] }),
    ).toContain('line-path-invalid');
    expect(
      rules({ ...GEO, series: [{ type: 'line', data: [{ coordinates: [[0, 0], [1, 1]] }] }] }),
    ).toEqual([]);
  });

  it('unknown-scale-type and threshold-missing-breaks on scale and colorScale', () => {
    expect(rules({ ...GEO, series: [{ scale: { type: 'fancy' } }] })).toContain('unknown-scale-type');
    expect(rules({ ...GEO, series: [{ scale: { type: 'threshold' } }] })).toContain(
      'threshold-missing-breaks',
    );
    expect(
      rules({ ...GEO, series: [{ type: 'bubble', colorScale: { type: 'threshold', breaks: [1, 2] } }] }),
    ).toEqual([]);
  });

  it('unknown-projection and unknown-palette are warnings (custom registration exists)', () => {
    const projection = validateMapsConfig({ geo: { map: 'world', projection: 'robinson' } });
    expect(projection.ok).toBe(true);
    expect(projection.warnings.map((i) => i.rule)).toContain('unknown-projection');

    // spec objects are checked by name
    expect(rules({ geo: { map: 'world', projection: { name: 'winkel3' } } })).toContain(
      'unknown-projection',
    );
    expect(rules({ geo: { map: 'world', projection: { name: 'equalEarth' } } })).toEqual([]);

    const palette = validateMapsConfig({
      ...GEO,
      theme: { palette: 'corporate' },
      series: [{ scale: { palette: 'corporate' } }],
    });
    expect(palette.ok).toBe(true);
    expect(palette.warnings.map((i) => i.rule)).toEqual(['unknown-palette', 'unknown-palette']);
  });

  it('normalizeby-not-string', () => {
    expect(rules({ ...GEO, series: [{ normalizeBy: 42 }] })).toContain('normalizeby-not-string');
  });

  it('cluster-on-non-marker is a warning', () => {
    const result = validateMapsConfig({ ...GEO, series: [{ type: 'bubble', cluster: {} }] });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((i) => i.rule)).toContain('cluster-on-non-marker');
    expect(rules({ ...GEO, series: [{ type: 'marker', cluster: {} }] })).toEqual([]);
  });

  it('curvature-conflicts-geodesic only when both are explicit', () => {
    const conflict = validateMapsConfig({
      ...GEO,
      series: [{ type: 'arc', curvature: 0.5, geodesic: true, data: [] }],
    });
    expect(conflict.warnings.map((i) => i.rule)).toContain('curvature-conflicts-geodesic');
    expect(rules({ ...GEO, series: [{ type: 'arc', curvature: 0.5, data: [] }] })).toEqual([]);
  });

  it('selection-modifier-conflicts-pan', () => {
    const conflict = validateMapsConfig({
      ...GEO,
      interaction: { selection: { modifier: 'none' } },
    });
    expect(conflict.warnings.map((i) => i.rule)).toContain('selection-modifier-conflicts-pan');
    expect(
      rules({ ...GEO, interaction: { selection: { modifier: 'none' }, pan: { enabled: false } } }),
    ).toEqual([]);
  });

  it('responsive-not-array', () => {
    expect(rules({ ...GEO, responsive: {} })).toContain('responsive-not-array');
  });

  it('issues carry severity, path, and message', () => {
    const result = validateMapsConfig({ series: [{ type: 'arc', data: [{}] }] });
    for (const issue of result.issues) {
      expect(issue.severity === 'error' || issue.severity === 'warning').toBe(true);
      expect(typeof issue.path).toBe('string');
      expect(issue.message.length).toBeGreaterThan(0);
    }
    expect(result.errors.map((i) => i.path)).toContain('series[0].data[0].from');
  });
});
