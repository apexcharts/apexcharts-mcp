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
      series: [{ data: [{ value: 1 }] }], // no coordinates, no joinBy, nothing to join on
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
      series: [{ data: [{ code: 'A', value: undefined }, { code: 'B', value: 'n/a' }, { code: 'C', value: '7' }] }],
    });
    expect(result.ok).toBe(true);
    // A numeric string reads as a number, so only 'n/a' is flagged.
    expect(result.warnings.map((i) => i.rule)).toEqual(['undefined-in-data', 'value-not-numeric']);
  });

  it('value-not-numeric reads the series valueField', () => {
    const result = validateMapsConfig({
      ...GEO,
      series: [{ valueField: 'gdp', data: [{ code: 'A', value: 'France', gdp: 3.1 }, { code: 'B', gdp: 'x' }] }],
    });
    expect(result.warnings.map((i) => i.path)).toEqual(['series[0].data[1].gdp']);
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

  it('curvature-conflicts-geodesic unless geodesic is switched off (it defaults to true)', () => {
    expect(rules({ ...GEO, series: [{ type: 'arc', curvature: 0.5, geodesic: true, data: [] }] })).toEqual([
      'curvature-conflicts-geodesic',
    ]);
    expect(rules({ ...GEO, series: [{ type: 'arc', curvature: 0.5, data: [] }] })).toEqual([
      'curvature-conflicts-geodesic',
    ]);
    expect(rules({ ...GEO, series: [{ type: 'arc', curvature: 0.5, geodesic: false, data: [] }] })).toEqual([]);
  });

  it('accepts the forms the 1.0 runtime reads (audited against apexmaps 1.0.0)', () => {
    // Auto-detected join key, no joinBy.
    expect(rules({ ...GEO, series: [{ type: 'bubble', data: [{ id: 'USA', value: 330 }] }] })).toEqual([]);
    // A feature array as geo.map.
    expect(rules({ geo: { map: [{ type: 'Feature', properties: {}, geometry: null }] } })).toEqual([]);
    // 3D positions in a line path and in hexbin coordinates.
    expect(
      rules({ ...GEO, series: [{ type: 'line', data: [{ path: [[-0.12, 51.5, 11], [2.35, 48.86, 35]] }] }] }),
    ).toEqual([]);
    expect(rules({ ...GEO, series: [{ type: 'hexbin', data: [{ coordinates: [10, 20, 100] }] }] })).toEqual([]);
    // { lon, lat } arc endpoints.
    expect(
      rules({ ...GEO, series: [{ type: 'arc', data: [{ from: { lon: -0.12, lat: 51.5 }, to: [-74, 40.7] }] }] }),
    ).toEqual([]);
    // A dotted valueField under a value aggregate.
    expect(
      rules({
        ...GEO,
        series: [{ type: 'hexbin', aggregate: 'sum', valueField: 'm.depth', data: [{ lon: 1, lat: 2, m: { depth: 4 } }] }],
      }),
    ).toEqual([]);
  });

  it('flags what the 1.0 runtime breaks on', () => {
    expect(rules({ geo: { map: 'usa' } })).toEqual(['unknown-map']);
    expect(rules({ geo: { map: 'https://example.com/x.json' } })).toEqual([]);
    expect(rules({ geo: { map: 'world/countries', layout: 'hex' } })).toEqual(['hex-layout-unavailable']);
    expect(rules({ geo: { map: 'us', layout: 'hex' } })).toEqual([]);
    expect(rules({ geo: { map: 'world', view: { fit: [100, -50, 200, 10] } } })).toEqual(['view-fit-unframeable']);
    expect(rules({ geo: { map: 'world', view: { fit: [100, -50, 180, 10] } } })).toEqual([]);
    expect(rules({ ...GEO, series: [{ type: 'line', data: [{ path: [[0, 0]] }] }] })).toEqual(['line-path-invalid']);
    expect(rules({ ...GEO, series: [{ type: 'arc', joinBy: 'name', data: [{ from: 'France', to: 'Brazil' }] }] })).toEqual([
      'arc-joinby-ignored',
    ]);
    expect(rules({ ...GEO, series: [{ scale: { type: 'threshold', breaks: [] } }] })).toEqual(['threshold-missing-breaks']);
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

  describe('hexbin', () => {
    const POINTS = [
      { lon: 2.35, lat: 48.86 },
      { lon: 2.4, lat: 48.9 },
    ];

    it('accepts a minimal valid hexbin, as a series type and as chart.type', () => {
      // The regression this whole rule set came from: hexbin shipped in
      // apexmaps 0.4.0 and the validator still enumerated five series types, so
      // a valid hexbin config came back as an error.
      expect(validateMapsConfig({ ...GEO, series: [{ type: 'hexbin', data: POINTS }] }).ok).toBe(true);
      expect(rules({ ...GEO, chart: { type: 'hexbin' }, series: [{ data: POINTS }] })).toEqual([]);
    });

    it('hexbin-joinby', () => {
      const result = validateMapsConfig({
        ...GEO,
        series: [{ type: 'hexbin', joinBy: ['iso_a3', 'code'], data: POINTS }],
      });
      expect(result.errors.map((i) => i.rule)).toContain('hexbin-joinby');
    });

    it('hexbin-position-missing, and coordinates count as a position', () => {
      expect(rules({ ...GEO, series: [{ type: 'hexbin', data: [{ value: 3 }] }] })).toContain(
        'hexbin-position-missing',
      );
      expect(
        rules({ ...GEO, series: [{ type: 'hexbin', data: [{ coordinates: [2.35, 48.86] }] }] }),
      ).toEqual([]);
      // A joinBy cannot stand in for a position here, the way it can for bubble.
      expect(
        rules({ ...GEO, series: [{ type: 'hexbin', joinBy: 'iso_a3', data: [{ value: 3 }] }] }),
      ).toContain('hexbin-position-missing');
    });

    it('lonlat-out-of-range applies to both position shapes', () => {
      expect(rules({ ...GEO, series: [{ type: 'hexbin', data: [{ lon: 48.86, lat: 200 }] }] })).toContain(
        'lonlat-out-of-range',
      );
      expect(
        rules({ ...GEO, series: [{ type: 'hexbin', data: [{ coordinates: [48.86, 200] }] }] }),
      ).toContain('lonlat-out-of-range');
    });

    it('unknown-hexbin-aggregate / unknown-hexbin-orientation', () => {
      expect(
        rules({ ...GEO, series: [{ type: 'hexbin', aggregate: 'median', data: POINTS }] }),
      ).toContain('unknown-hexbin-aggregate');
      expect(
        rules({ ...GEO, series: [{ type: 'hexbin', orientation: 'sideways', data: POINTS }] }),
      ).toContain('unknown-hexbin-orientation');
      for (const aggregate of ['count', 'sum', 'mean', 'min', 'max']) {
        expect(
          rules({ ...GEO, series: [{ type: 'hexbin', aggregate, minCount: 5, data: [{ ...POINTS[0], value: 1 }] }] }),
        ).not.toContain('unknown-hexbin-aggregate');
      }
    });

    it('hexbin-aggregate-needs-value, honouring valueField', () => {
      expect(rules({ ...GEO, series: [{ type: 'hexbin', aggregate: 'sum', data: POINTS }] })).toContain(
        'hexbin-aggregate-needs-value',
      );
      // count needs no value field at all, which is why it is the default.
      expect(rules({ ...GEO, series: [{ type: 'hexbin', aggregate: 'count', data: POINTS }] })).toEqual([]);
      expect(
        rules({
          ...GEO,
          series: [{ type: 'hexbin', aggregate: 'sum', data: [{ ...POINTS[0], value: 12 }] }],
        }),
      ).toEqual([]);
      expect(
        rules({
          ...GEO,
          series: [
            { type: 'hexbin', aggregate: 'sum', valueField: 'depth', data: [{ ...POINTS[0], depth: 12 }] },
          ],
        }),
      ).toEqual([]);
    });

    it('hexbin-mean-mincount', () => {
      const withValues = [{ ...POINTS[0], value: 1 }];
      expect(rules({ ...GEO, series: [{ type: 'hexbin', aggregate: 'mean', data: withValues }] })).toContain(
        'hexbin-mean-mincount',
      );
      expect(
        rules({ ...GEO, series: [{ type: 'hexbin', aggregate: 'mean', minCount: 5, data: withValues }] }),
      ).toEqual([]);
    });
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
