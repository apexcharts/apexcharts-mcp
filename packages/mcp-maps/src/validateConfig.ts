export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  rule: string;
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

const SERIES_TYPES = ['choropleth', 'bubble', 'marker', 'arc', 'line'] as const;

const SCALE_TYPES = [
  'quantile',
  'quantize',
  'equalInterval',
  'jenks',
  'naturalBreaks',
  'threshold',
  'linear',
  'log',
  'sqrt',
  'ordinal',
] as const;

/** Built-in projection names and aliases (apexmaps src/types.ts ProjectionName). */
const PROJECTION_NAMES = [
  'equalEarth',
  'mercator',
  'webMercator',
  'epsg:3857',
  'equirectangular',
  'plateCarree',
  'epsg:4326',
  'naturalEarth',
  'orthographic',
  'albers',
  'albersUsa',
  'conicConformal',
  'conicEqualArea',
  'conicEquidistant',
  'azimuthalEqualArea',
  'azimuthalEquidistant',
  'gnomonic',
  'stereographic',
  'transverseMercator',
  'identity',
] as const;

/** Built-in palette names (apexmaps src/types.ts PaletteName). */
const PALETTE_NAMES = [
  'blues',
  'greens',
  'oranges',
  'reds',
  'purples',
  'greys',
  'viridis',
  'magma',
  'teal',
  'rdbu',
  'brbg',
  'piyg',
  'spectral',
  'rdylgn',
  'apex',
  'tableau',
  'okabeIto',
] as const;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isLonLat(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');
}

function lonLatOutOfRange(v: [number, number]): boolean {
  return Math.abs(v[0]) > 180 || Math.abs(v[1]) > 90;
}

/**
 * Validate an ApexMaps options object (`new ApexMaps(el, options)`).
 *
 * Encodes the structural rules from apexmaps-skill: geo.map is required,
 * series is a discriminated union (arc needs from/to, line needs path,
 * bubble/marker need coordinates or a joinBy), coordinates are [lon, lat],
 * missing values are null (never undefined), scale/projection/palette names
 * must exist.
 */
export function validateMapsConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(config)) {
    issues.push({
      severity: 'error',
      rule: 'config-not-object',
      path: '',
      message: 'Config must be an ApexMaps options object.',
    });
    return finalize(issues);
  }

  checkGeo(config, issues);
  checkTheme(config, issues);
  checkInteraction(config, issues);

  if (config.responsive !== undefined && !Array.isArray(config.responsive)) {
    issues.push({
      severity: 'error',
      rule: 'responsive-not-array',
      path: 'responsive',
      message: 'responsive must be an array of { breakpoint, options } rules.',
    });
  }

  const chart = config.chart;
  if (isObject(chart) && chart.type !== undefined) {
    if (!SERIES_TYPES.includes(chart.type as (typeof SERIES_TYPES)[number])) {
      issues.push({
        severity: 'error',
        rule: 'unknown-series-type',
        path: 'chart.type',
        message: `Unknown series type "${String(chart.type)}". Supported: ${SERIES_TYPES.join(', ')}.`,
      });
    }
  }

  const series = config.series;
  if (series !== undefined) {
    if (!Array.isArray(series)) {
      issues.push({
        severity: 'error',
        rule: 'series-not-array',
        path: 'series',
        message: 'series must be an array of series objects.',
        fix: 'Wrap the series object in an array: `series: [{ ... }]`.',
      });
    } else {
      const defaultType = isObject(chart) && typeof chart.type === 'string' ? chart.type : 'choropleth';
      series.forEach((s, i) => checkSeries(s, i, defaultType, issues));
    }
  }
  // No series at all is valid: ApexMaps draws an automatic basemap.

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

function checkGeo(config: AnyObj, issues: ValidationIssue[]): void {
  const geo = config.geo;
  if (geo !== undefined && !isObject(geo)) {
    issues.push({
      severity: 'error',
      rule: 'geo-not-object',
      path: 'geo',
      message: 'geo must be an object.',
    });
    return;
  }

  const map = isObject(geo) ? geo.map : undefined;
  if (map === undefined || map === null) {
    issues.push({
      severity: 'error',
      rule: 'geo-map-missing',
      path: 'geo.map',
      message: 'No geometry configured: nothing can render without geo.map.',
      fix: "Set geo.map to a registry pack id (e.g. 'world/countries', 'us', 'eu/nuts2'), a URL, or inline GeoJSON/TopoJSON.",
    });
  } else if (typeof map !== 'string' && !isObject(map)) {
    issues.push({
      severity: 'error',
      rule: 'geo-map-invalid',
      path: 'geo.map',
      message: 'geo.map must be a registry id / URL string, or a GeoJSON/TopoJSON object.',
    });
  }

  if (isObject(geo) && geo.projection !== undefined) {
    const name = typeof geo.projection === 'string'
      ? geo.projection
      : isObject(geo.projection) && typeof geo.projection.name === 'string'
        ? geo.projection.name
        : undefined;
    if (name !== undefined && !PROJECTION_NAMES.includes(name as (typeof PROJECTION_NAMES)[number])) {
      issues.push({
        severity: 'warning',
        rule: 'unknown-projection',
        path: typeof geo.projection === 'string' ? 'geo.projection' : 'geo.projection.name',
        message:
          `"${name}" is not a built-in projection. Built-ins: ${PROJECTION_NAMES.join(', ')}. ` +
          'Custom names only work after ApexMaps.registerProjection().',
      });
    }
  }
}

function checkTheme(config: AnyObj, issues: ValidationIssue[]): void {
  const theme = config.theme;
  if (!isObject(theme)) return;
  if (typeof theme.palette === 'string') {
    checkPaletteName(theme.palette, 'theme.palette', issues);
  }
}

function checkInteraction(config: AnyObj, issues: ValidationIssue[]): void {
  const interaction = config.interaction;
  if (!isObject(interaction)) return;
  const selection = interaction.selection;
  const pan = interaction.pan;
  if (isObject(selection) && selection.modifier === 'none') {
    const panEnabled = !isObject(pan) || pan.enabled !== false;
    if (panEnabled) {
      issues.push({
        severity: 'warning',
        rule: 'selection-modifier-conflicts-pan',
        path: 'interaction.selection.modifier',
        message:
          "selection.modifier 'none' makes every drag a selection box, which conflicts with panning.",
        fix: 'Set interaction.pan.enabled: false, or keep a modifier key.',
      });
    }
  }
}

function checkPaletteName(name: string, path: string, issues: ValidationIssue[]): void {
  if (!PALETTE_NAMES.includes(name as (typeof PALETTE_NAMES)[number])) {
    issues.push({
      severity: 'warning',
      rule: 'unknown-palette',
      path,
      message:
        `"${name}" is not a built-in palette. Built-ins: ${PALETTE_NAMES.join(', ')}. ` +
        'Custom names only work after ApexMaps.registerPalette().',
    });
  }
}

function checkScale(scale: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(scale)) return;
  if (scale.type !== undefined) {
    if (!SCALE_TYPES.includes(scale.type as (typeof SCALE_TYPES)[number])) {
      issues.push({
        severity: 'error',
        rule: 'unknown-scale-type',
        path: `${path}.type`,
        message: `Unknown scale type "${String(scale.type)}". Supported: ${SCALE_TYPES.join(', ')}.`,
      });
    } else if (scale.type === 'threshold' && !Array.isArray(scale.breaks)) {
      issues.push({
        severity: 'error',
        rule: 'threshold-missing-breaks',
        path: `${path}.breaks`,
        message: "scale type 'threshold' requires explicit breaks.",
        fix: 'Add `breaks: [n1, n2, ...]` to the scale.',
      });
    }
  }
  if (typeof scale.palette === 'string') {
    checkPaletteName(scale.palette, `${path}.palette`, issues);
  }
}

function checkJoinBy(joinBy: unknown, path: string, issues: ValidationIssue[]): void {
  if (joinBy === undefined) return;
  const isPair =
    Array.isArray(joinBy) && joinBy.length === 2 && joinBy.every((v) => typeof v === 'string');
  if (typeof joinBy === 'string' || isPair || isObject(joinBy)) return;
  issues.push({
    severity: 'error',
    rule: 'joinby-invalid',
    path,
    message: "joinBy must be 'field', ['geoField', 'dataField'], or { geo, data }.",
  });
}

function checkSeries(s: unknown, i: number, defaultType: string, issues: ValidationIssue[]): void {
  const path = `series[${i}]`;
  if (!isObject(s)) {
    issues.push({
      severity: 'error',
      rule: 'series-not-object',
      path,
      message: 'Each series must be an object.',
    });
    return;
  }

  const type = typeof s.type === 'string' ? s.type : defaultType;
  if (!SERIES_TYPES.includes(type as (typeof SERIES_TYPES)[number])) {
    issues.push({
      severity: 'error',
      rule: 'unknown-series-type',
      path: `${path}.type`,
      message: `Unknown series type "${type}". Supported: ${SERIES_TYPES.join(', ')}.`,
    });
    return;
  }

  checkJoinBy(s.joinBy, `${path}.joinBy`, issues);
  checkScale(s.scale, `${path}.scale`, issues);
  checkScale(s.colorScale, `${path}.colorScale`, issues);

  if (s.normalizeBy !== undefined && typeof s.normalizeBy !== 'string') {
    issues.push({
      severity: 'error',
      rule: 'normalizeby-not-string',
      path: `${path}.normalizeBy`,
      message: 'normalizeBy must name a data field (a string).',
    });
  }

  if (s.cluster !== undefined && type !== 'marker') {
    issues.push({
      severity: 'warning',
      rule: 'cluster-on-non-marker',
      path: `${path}.cluster`,
      message: 'Clustering is an option on marker series only; other series ignore it.',
      fix: "Move cluster to a series with type: 'marker'.",
    });
  }

  if (type === 'arc' && typeof s.curvature === 'number' && s.curvature > 0 && s.geodesic === true) {
    issues.push({
      severity: 'warning',
      rule: 'curvature-conflicts-geodesic',
      path: `${path}.curvature`,
      message:
        'curvature bulges the arc for looks and abandons the great-circle path; it conflicts with geodesic accuracy.',
      fix: 'Drop curvature for real routes, or drop geodesic for decorative arcs.',
    });
  }

  const data = s.data;
  if (data === undefined) return;
  if (!Array.isArray(data)) {
    issues.push({
      severity: 'error',
      rule: 'series-data-not-array',
      path: `${path}.data`,
      message: 'series data must be an array.',
    });
    return;
  }

  const hasJoin = s.joinBy !== undefined;
  data.forEach((datum, j) => checkDatum(datum, `${path}.data[${j}]`, type, hasJoin, issues));
}

function checkDatum(
  datum: unknown,
  path: string,
  type: string,
  seriesHasJoin: boolean,
  issues: ValidationIssue[],
): void {
  if (!isObject(datum)) {
    // Choropleth rows must be objects carrying a join key; points/arcs/lines too.
    issues.push({
      severity: 'error',
      rule: 'datum-not-object',
      path,
      message: `Each ${type} datum must be an object.`,
    });
    return;
  }

  if ('value' in datum && datum.value === undefined) {
    issues.push({
      severity: 'warning',
      rule: 'undefined-in-data',
      path: `${path}.value`,
      message: 'Use null, never undefined, for missing values.',
      fix: 'Replace undefined with null.',
    });
  } else if (datum.value !== undefined && datum.value !== null && typeof datum.value !== 'number') {
    issues.push({
      severity: 'warning',
      rule: 'value-not-numeric',
      path: `${path}.value`,
      message: `value should be a number or null, got ${typeof datum.value}.`,
    });
  }

  switch (type) {
    case 'bubble':
    case 'marker': {
      const lon = datum.lon ?? datum.lng;
      const lat = datum.lat;
      if (typeof lon !== 'number' || typeof lat !== 'number') {
        if (!seriesHasJoin) {
          issues.push({
            severity: 'error',
            rule: 'point-position-missing',
            path,
            message: `A ${type} datum needs lon + lat coordinates, or the series a joinBy to resolve feature centroids.`,
            fix: 'Add `lon` and `lat` (lng is accepted for lon), or set joinBy on the series.',
          });
        }
      } else if (lonLatOutOfRange([lon, lat])) {
        pushOutOfRange(path, issues);
      }
      break;
    }
    case 'arc': {
      for (const end of ['from', 'to'] as const) {
        const v = datum[end];
        if (v === undefined || v === null) {
          issues.push({
            severity: 'error',
            rule: 'arc-endpoints-missing',
            path: `${path}.${end}`,
            message: `An arc datum requires both from and to, each [lon, lat] or a geometry key.`,
          });
        } else if (typeof v !== 'string' && !isLonLat(v)) {
          issues.push({
            severity: 'error',
            rule: 'arc-endpoint-invalid',
            path: `${path}.${end}`,
            message: `${end} must be a [lon, lat] pair or a geometry key string.`,
          });
        } else if (isLonLat(v) && lonLatOutOfRange(v)) {
          pushOutOfRange(`${path}.${end}`, issues);
        }
      }
      break;
    }
    case 'line': {
      const pathField = datum.path ?? datum.coordinates;
      if (pathField === undefined) {
        issues.push({
          severity: 'error',
          rule: 'line-path-missing',
          path,
          message: 'A line datum needs a path (or coordinates) array of [lon, lat] vertices.',
          fix: 'Add `path: [[lon, lat], ...]` with at least two vertices.',
        });
      } else if (!Array.isArray(pathField) || !pathField.every(isLonLat)) {
        issues.push({
          severity: 'error',
          rule: 'line-path-invalid',
          path: `${path}.${datum.path !== undefined ? 'path' : 'coordinates'}`,
          message: 'path must be an array of [lon, lat] pairs.',
        });
      } else if (pathField.some((v) => lonLatOutOfRange(v as [number, number]))) {
        pushOutOfRange(`${path}.${datum.path !== undefined ? 'path' : 'coordinates'}`, issues);
      }
      break;
    }
    default:
      break;
  }
}

function pushOutOfRange(path: string, issues: ValidationIssue[]): void {
  issues.push({
    severity: 'warning',
    rule: 'lonlat-out-of-range',
    path,
    message:
      'Coordinate outside [-180, 180] longitude / [-90, 90] latitude. Coordinates are [lon, lat]; these look swapped.',
    fix: 'Order coordinates longitude first: [lon, lat].',
  });
}
