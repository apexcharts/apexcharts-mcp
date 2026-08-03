/**
 * Input shape for apexmaps_generate_config.
 */
export type MapsSeriesType = 'choropleth' | 'bubble' | 'marker' | 'arc' | 'line';

export interface GenerateMapsConfigInput {
  /** Series type. Default 'choropleth' (also ApexMaps' own default). */
  type?: MapsSeriesType;
  /** Geometry registry pack id or alias (e.g. 'world/countries', 'us', 'eu/nuts2'). Default 'world/countries'. */
  map?: string;
  /** Display name for the series (legend / tooltip). */
  seriesName?: string;
  /** Data array in the datum shape of `type`. If omitted, a small placeholder dataset is generated. */
  data?: unknown;
  /** Join spec: 'field', ['geoField', 'dataField'], or { geo, data }. Only emitted when provided. */
  joinBy?: unknown;
  /** Palette name for the series scale (choropleth) or theme (other types). */
  palette?: string;
  /** Projection name or spec object. Omit to use the pack's recommended projection. */
  projection?: unknown;
  /** Theme mode. */
  themeMode?: 'light' | 'dark' | 'auto';
}

/**
 * Build a minimal valid ApexMaps options object for
 * `new ApexMaps(el, options)` + `await map.render()`.
 *
 * Deliberately sparse: ApexMaps' defaults are meant to be publishable, so only
 * the keys the caller asked for are emitted. When `data` is omitted, a small
 * placeholder dataset in the right datum shape for `type` is generated so the
 * result renders something meaningful as-is.
 */
export function generateMapsConfig(input: GenerateMapsConfigInput): Record<string, unknown> {
  const type: MapsSeriesType = input.type ?? 'choropleth';
  const map = input.map ?? 'world/countries';

  const geo: Record<string, unknown> = { map };
  if (input.projection !== undefined) geo.projection = input.projection;

  const usingPlaceholder = input.data === undefined;
  const series: Record<string, unknown> = {};
  // choropleth is the library default; keep the minimal config minimal.
  if (type !== 'choropleth') series.type = type;
  if (input.seriesName) series.name = input.seriesName;

  if (input.joinBy !== undefined) {
    series.joinBy = input.joinBy;
  } else if (usingPlaceholder && type === 'choropleth') {
    // The placeholder joins world countries on ISO alpha-3 codes.
    series.joinBy = ['iso_a3', 'code'];
  }

  series.data = usingPlaceholder ? placeholderData(type) : input.data;

  if (input.palette) {
    if (type === 'choropleth') {
      series.scale = { palette: input.palette };
    } else {
      series.colorScale = { palette: input.palette };
    }
  }

  const config: Record<string, unknown> = { geo, series: [series] };
  if (input.themeMode) config.theme = { mode: input.themeMode };
  return config;
}

function placeholderData(type: MapsSeriesType): unknown[] {
  switch (type) {
    case 'choropleth':
      // Population, millions (illustrative). null shows the no-data rendering.
      return [
        { code: 'USA', value: 335 },
        { code: 'BRA', value: 216 },
        { code: 'DEU', value: 84 },
        { code: 'FRA', value: 68 },
        { code: 'JPN', value: 124 },
        { code: 'AUS', value: 27 },
        { code: 'GRL', value: null },
      ];
    case 'bubble':
      return [
        { name: 'Tokyo', lon: 139.69, lat: 35.69, value: 37.4 },
        { name: 'Delhi', lon: 77.21, lat: 28.61, value: 32.9 },
        { name: 'Sao Paulo', lon: -46.63, lat: -23.55, value: 22.6 },
        { name: 'New York', lon: -74.01, lat: 40.71, value: 18.8 },
        { name: 'Lagos', lon: 3.38, lat: 6.52, value: 15.9 },
      ];
    case 'marker':
      return [
        { name: 'Berlin HQ', lon: 13.4, lat: 52.52, category: 'HQ' },
        { name: 'London office', lon: -0.13, lat: 51.51, category: 'Office' },
        { name: 'Singapore office', lon: 103.85, lat: 1.29, category: 'Office' },
        { name: 'Denver data center', lon: -104.99, lat: 39.74, category: 'Data center' },
      ];
    case 'arc':
      return [
        { from: [139.69, 35.69], to: [-74.01, 40.71], value: 120, name: 'Tokyo to New York' },
        { from: [-0.13, 51.51], to: [103.85, 1.29], value: 95, name: 'London to Singapore' },
        { from: [-46.63, -23.55], to: [13.4, 52.52], value: 60, name: 'Sao Paulo to Berlin' },
      ];
    case 'line':
      return [
        {
          name: 'Shipping route',
          path: [
            [121.47, 31.23],
            [103.85, 1.29],
            [80.28, 6.03],
            [43.15, 12.6],
            [32.55, 29.97],
            [5.37, 36.13],
            [-9.14, 38.71],
            [4.48, 51.92],
          ],
        },
      ];
  }
}
