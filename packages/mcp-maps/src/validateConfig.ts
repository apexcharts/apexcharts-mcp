import { BUILT_IN_MAPS, HEX_LAYOUT_MAPS } from './mapCatalog.js';

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

const SERIES_TYPES = ['choropleth', 'bubble', 'marker', 'arc', 'line', 'hexbin'] as const;

/** What a hexbin cell's colour encodes (apexmaps HexbinSeriesOptions.aggregate). */
const HEXBIN_AGGREGATES = ['count', 'sum', 'mean', 'min', 'max'] as const;

/** Hexbin cell orientation: vertex up, or a vertex to the side. */
const HEXBIN_ORIENTATIONS = ['pointy', 'flat'] as const;

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

/**
 * A position the library's readLonLat accepts: an array of two or more numbers
 * (a GeoJSON position may carry altitude as a third), or `{ lon, lat }` /
 * `{ lng, lat }`. Returns the [lon, lat] pair, or null.
 */
function readLonLat(v: unknown): [number, number] | null {
  if (Array.isArray(v)) {
    return v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number' ? [v[0], v[1]] : null;
  }
  if (isObject(v)) {
    const lon = typeof v.lon === 'number' ? v.lon : v.lng;
    return typeof lon === 'number' && typeof v.lat === 'number' ? [lon, v.lat] : null;
  }
  return null;
}

/** The fields the join tries, in order, when a series sets no joinBy (apexmaps Join.ts). */
const AUTO_JOIN_KEYS = [
  'id', 'key', 'code', 'iso', 'iso_a3', 'iso3', 'iso_a2', 'iso2', 'fips', 'geoid', 'hc-key',
  'region', 'state', 'country', 'name',
];

/** Same test as the library's MapRegistry: these strings are fetched, not looked up. */
function looksLikeUrl(value: string): boolean {
  return /^(https?:)?\/\//.test(value) || value.startsWith('/') || value.startsWith('./') || value.endsWith('.json');
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
  const layout = isObject(geo) ? geo.layout : undefined;
  if (map === undefined || map === null || map === '') {
    issues.push({
      severity: 'error',
      rule: 'geo-map-missing',
      path: 'geo.map',
      message: 'No geometry configured: nothing can render without geo.map.',
      fix: "Set geo.map to a registry pack id (e.g. 'world/countries', 'us', 'eu/nuts2'), a URL, or inline GeoJSON/TopoJSON.",
    });
  } else if (typeof map !== 'string' && !isObject(map) && !Array.isArray(map)) {
    issues.push({
      severity: 'error',
      rule: 'geo-map-invalid',
      path: 'geo.map',
      message: 'geo.map must be a registry id / URL string, a GeoJSON/TopoJSON object, or an array of GeoJSON features.',
    });
  } else if (typeof map === 'string' && !looksLikeUrl(map)) {
    if (!BUILT_IN_MAPS.has(map)) {
      issues.push({
        severity: 'warning',
        rule: 'unknown-map',
        path: 'geo.map',
        message:
          `"${map}" is not a built-in map id, so ApexMaps throws "unknown map" unless it was registered with ApexMaps.registerMap() first.`,
        fix: "Use a built-in id such as 'world/countries', 'us/states', 'us/counties', 'eu/nuts2' or 'jp/prefectures' (ApexMaps.listMaps() lists them all), or a URL.",
      });
    } else if (typeof layout === 'string' && layout !== '' && (layout !== 'hex' || !HEX_LAYOUT_MAPS.has(map))) {
      issues.push({
        severity: 'warning',
        rule: 'hex-layout-unavailable',
        path: 'geo.layout',
        message: `There is no built-in "${layout}" layout for "${map}", so ApexMaps throws unless one was added with ApexMaps.registerLayout().`,
        fix: "The built-in layouts are layout: 'hex' for us/states, au/admin1, ca/admin1, de/admin1, br/admin1, jp/admin1 and eu/nuts0 (and their aliases). Remove layout for any other map.",
      });
    }
  }

  // A fit box the projection cannot frame (east past the antimeridian, or east
  // not after west) is silently replaced by the whole world.
  const view = isObject(geo) ? geo.view : undefined;
  const fit = isObject(view) ? view.fit : undefined;
  if (Array.isArray(fit) && fit.length === 4 && fit.every((n) => typeof n === 'number')) {
    const [west, , east] = fit as number[];
    if (east > 180 || east <= west) {
      issues.push({
        severity: 'warning',
        rule: 'view-fit-unframeable',
        path: 'geo.view.fit',
        message:
          `fit [west, south, east, north] has east ${east}${east > 180 ? ' beyond 180' : ` not greater than west ${west}`}, so ApexMaps ignores the box and frames the whole world.`,
        fix: 'Keep east at or below 180 and greater than west. A region crossing the antimeridian has to be framed on one side of it.',
      });
    }
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
    } else if (scale.type === 'threshold' && !(Array.isArray(scale.breaks) && scale.breaks.length > 0)) {
      issues.push({
        severity: 'error',
        rule: 'threshold-missing-breaks',
        path: `${path}.breaks`,
        message: "scale type 'threshold' requires explicit breaks; without them (or with an empty list) it falls back to quantile.",
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

/**
 * Hexbin-specific rules.
 *
 * A hexbin is the one series that bins its input rather than drawing it, so the
 * mistakes it invites are different from every other type's: keying rows to
 * regions (which wants a choropleth), asking for an aggregate the points carry
 * no number for, and averaging over bins that may hold a single point.
 */
function checkHexbin(s: AnyObj, path: string, issues: ValidationIssue[]): void {
  // Deliberately absent from the library, not merely unimplemented: binning
  // region centroids answers a question about how the regions were drawn, and
  // the answer changes when the map does.
  if (s.joinBy !== undefined) {
    issues.push({
      severity: 'error',
      rule: 'hexbin-joinby',
      path: `${path}.joinBy`,
      message:
        'A hexbin series has no joinBy: it bins point positions, and joining rows to regions ' +
        'would bin the geometry instead of the data.',
      fix: "Use type: 'choropleth' for rows keyed to regions, or give each row lon/lat.",
    });
  }

  const aggregate = s.aggregate;
  const isKnownAggregate =
    aggregate === undefined ||
    HEXBIN_AGGREGATES.includes(aggregate as (typeof HEXBIN_AGGREGATES)[number]);
  if (!isKnownAggregate) {
    issues.push({
      severity: 'error',
      rule: 'unknown-hexbin-aggregate',
      path: `${path}.aggregate`,
      message: `Unknown aggregate "${String(aggregate)}". Supported: ${HEXBIN_AGGREGATES.join(', ')}.`,
    });
  }

  if (
    s.orientation !== undefined &&
    !HEXBIN_ORIENTATIONS.includes(s.orientation as (typeof HEXBIN_ORIENTATIONS)[number])
  ) {
    issues.push({
      severity: 'error',
      rule: 'unknown-hexbin-orientation',
      path: `${path}.orientation`,
      message: `Unknown orientation "${String(s.orientation)}". Supported: ${HEXBIN_ORIENTATIONS.join(', ')}.`,
    });
  }

  // Every aggregate except 'count' reads valueField (default 'value'), so data
  // carrying no number under that field colours every cell as no-data. The
  // library resolves dotted paths and numeric strings; an accessor function
  // cannot be checked here.
  const valueField = s.valueField === undefined ? 'value' : s.valueField;
  if (isKnownAggregate && aggregate !== undefined && aggregate !== 'count' && typeof valueField === 'string') {
    const field = valueField;
    const data = s.data;
    if (Array.isArray(data) && data.length > 0) {
      const hasNumber = data.some((d) => readNumber(d, field) !== null);
      if (!hasNumber) {
        issues.push({
          severity: 'warning',
          rule: 'hexbin-aggregate-needs-value',
          path: `${path}.aggregate`,
          message:
            `aggregate '${String(aggregate)}' reads each point's "${field}", and no datum carries ` +
            `a number there, so every cell reports null.`,
          fix: `Add a numeric "${field}" to the data, set valueField to the field that has it, or use aggregate: 'count'.`,
        });
      }
    }
  }

  if (aggregate === 'mean') {
    const minCount = s.minCount;
    if (minCount === undefined || (typeof minCount === 'number' && minCount <= 1)) {
      issues.push({
        severity: 'warning',
        rule: 'hexbin-mean-mincount',
        path: `${path}.minCount`,
        message:
          "aggregate 'mean' with minCount 1 (the default) lets a cell holding one point read as " +
          'loudly as a cell holding a hundred.',
        fix: 'Raise minCount so thin cells are dropped, or switch to count.',
      });
    }
  }
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
  if (type === 'hexbin') checkHexbin(s, path, issues);

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

  // geodesic defaults to true, so curvature conflicts with it unless geodesic
  // is switched off explicitly.
  if (type === 'arc' && typeof s.curvature === 'number' && s.curvature !== 0 && s.geodesic !== false) {
    issues.push({
      severity: 'warning',
      rule: 'curvature-conflicts-geodesic',
      path: `${path}.curvature`,
      message:
        'curvature bulges the arc for looks and abandons the great-circle path, but geodesic is on (it defaults to true), so ApexMaps warns about the conflict.',
      fix: 'Drop curvature for real routes, or set geodesic: false for decorative arcs.',
    });
  }

  if (type === 'arc' && s.joinBy !== undefined) {
    issues.push({
      severity: 'warning',
      rule: 'arc-joinby-ignored',
      path: `${path}.joinBy`,
      message:
        "ApexMaps 1.0 ignores joinBy on arc series: string endpoints resolve against each feature's key only (the pack's keyField), so an endpoint naming another field is dropped.",
      fix: 'Use the feature key (e.g. ISO-3 codes on world/countries) or [lon, lat] for from/to.',
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
  const valueField = s.valueField === undefined ? 'value' : s.valueField;
  data.forEach((datum, j) => checkDatum(datum, `${path}.data[${j}]`, type, hasJoin, valueField, issues));
}

/** The library's readNumber: dotted paths, numbers and numeric strings. */
function readNumber(source: unknown, field: string): number | null {
  const raw = field.split('.').reduce<unknown>((acc, key) => (isObject(acc) ? acc[key] : undefined), source);
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function checkDatum(
  datum: unknown,
  path: string,
  type: string,
  seriesHasJoin: boolean,
  valueField: unknown,
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
  } else if (typeof valueField === 'string') {
    // The value is read from valueField (default 'value'); numeric strings count.
    const raw = valueField.split('.').reduce<unknown>((acc, key) => (isObject(acc) ? acc[key] : undefined), datum);
    if (raw !== undefined && raw !== null && raw !== '' && readNumber(datum, valueField) === null) {
      issues.push({
        severity: 'warning',
        rule: 'value-not-numeric',
        path: `${path}.${valueField}`,
        message: `${valueField} should be a number or null, got ${JSON.stringify(raw)}, which reads as no data.`,
      });
    }
  }

  switch (type) {
    case 'bubble':
    case 'marker': {
      const lon = datum.lon ?? datum.lng;
      const lat = datum.lat;
      if (typeof lon !== 'number' || typeof lat !== 'number') {
        // Without coordinates the series joins rows to features. With no joinBy
        // the library tries a list of common key fields, then falls back to the
        // first string field (usually a label, which rarely matches).
        if (!seriesHasJoin && !AUTO_JOIN_KEYS.some((k) => datum[k] != null && datum[k] !== '')) {
          const hasString = Object.values(datum).some((v) => typeof v === 'string' && v !== '');
          issues.push({
            severity: hasString ? 'warning' : 'error',
            rule: 'point-position-missing',
            path,
            message: hasString
              ? `This ${type} datum has no lon/lat and no common key field (id, code, iso_a3, name, ...), so the join falls back to its first text field, which rarely matches a feature.`
              : `This ${type} datum has no lon/lat and nothing to join on, so it is dropped.`,
            fix: 'Add `lon` and `lat` (lng is accepted for lon), or a key field such as `id`, or set joinBy on the series.',
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
        } else if (typeof v !== 'string') {
          const pos = readLonLat(v);
          if (!pos) {
            issues.push({
              severity: 'error',
              rule: 'arc-endpoint-invalid',
              path: `${path}.${end}`,
              message: `${end} must be a [lon, lat] pair, { lon, lat }, or a geometry key string.`,
            });
          } else if (lonLatOutOfRange(pos)) {
            pushOutOfRange(`${path}.${end}`, issues);
          }
        }
      }
      break;
    }
    case 'hexbin': {
      // Same [lon, lat] rule, but two differences from bubble/marker: a hexbin
      // datum may carry its position as a `coordinates` pair (data that arrived
      // as GeoJSON), and joinBy can never stand in for a position here, because
      // a hexbin has no joinBy at all.
      const lon = typeof datum.lon === 'number' ? datum.lon : datum.lng;
      const lat = datum.lat;
      const coords = Array.isArray(datum.coordinates) ? readLonLat(datum.coordinates) : null;
      if (typeof lon === 'number' && typeof lat === 'number') {
        if (lonLatOutOfRange([lon, lat])) pushOutOfRange(path, issues);
      } else if (coords) {
        if (lonLatOutOfRange(coords)) pushOutOfRange(`${path}.coordinates`, issues);
      } else {
        issues.push({
          severity: 'error',
          rule: 'hexbin-position-missing',
          path,
          message:
            'A hexbin datum needs a position: lon + lat, or a [lon, lat] coordinates pair. ' +
            'Points with no usable position are dropped before binning.',
          fix: 'Add `lon` and `lat` (lng is accepted for lon), or `coordinates: [lon, lat]`.',
        });
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
      } else {
        const field = datum.path !== undefined ? 'path' : 'coordinates';
        const vertices = Array.isArray(pathField) ? pathField.map(readLonLat) : [];
        if (!Array.isArray(pathField) || vertices.some((v) => v === null)) {
          issues.push({
            severity: 'error',
            rule: 'line-path-invalid',
            path: `${path}.${field}`,
            message: 'path must be an array of [lon, lat] positions (a third altitude value is fine) or { lon, lat } objects.',
          });
        } else if (vertices.length < 2) {
          issues.push({
            severity: 'error',
            rule: 'line-path-invalid',
            path: `${path}.${field}`,
            message: 'A line needs at least two vertices; ApexMaps drops a shorter path.',
          });
        } else if (vertices.some((v) => lonLatOutOfRange(v as [number, number]))) {
          pushOutOfRange(`${path}.${field}`, issues);
        }
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
      'Coordinate outside [-180, 180] longitude / [-90, 90] latitude. Coordinates are [lon, lat]: a latitude past 90 usually means the pair is swapped (a longitude past 180 wraps around).',
    fix: 'Order coordinates longitude first: [lon, lat].',
  });
}
