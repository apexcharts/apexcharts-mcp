/**
 * Input shape for apexstock_generate_config.
 */
export interface GenerateStockConfigInput {
  /**
   * OHLC candles for `series[0].data`. Each point is `{ x, y: [o,h,l,c], v? }`.
   * If omitted, a small placeholder candle series is generated so the config
   * renders as-is.
   */
  data?: unknown;
  /** Series name (default "Price"). */
  name?: string;
  /** Optional chart title. */
  title?: string;
  /** Chart height in px (default 600). */
  height?: number;
  /** Theme mode (default "light"). */
  theme?: 'light' | 'dark';
  /**
   * Indicators to enable, as a list of keys (e.g. `["moving average", "rsi"]`)
   * or a keyed config map (e.g. `{ "bollinger bands": { period: 20, stdDev: 2 } }`).
   * Placed under `plotOptions.stockChart.indicators`.
   */
  indicators?: string[] | Record<string, unknown>;
}

/**
 * Build a minimal valid ApexStock options object.
 *
 * When `data` is not supplied, a short placeholder candle series (ascending
 * daily OHLCV bars) is generated so the returned config renders something
 * useful as-is. Note: ApexStock also requires `window.ApexCharts` to be set at
 * runtime — that's a host-page concern, not part of the options object.
 */
export function generateStockConfig(
  input: GenerateStockConfigInput,
): Record<string, unknown> {
  const height = input.height ?? 600;
  const name = input.name ?? 'Price';
  const mode = input.theme ?? 'light';

  const config: Record<string, unknown> = {
    chart: { height },
    series: [{ name, data: input.data ?? defaultCandles() }],
    theme: { mode },
  };

  if (input.title) {
    config.title = { text: input.title };
  }

  if (input.indicators !== undefined) {
    config.plotOptions = { stockChart: { indicators: input.indicators } };
  }

  return config;
}

/**
 * A short deterministic placeholder OHLCV series (ascending daily bars, early
 * 2026). ISO date strings for `x`; a single `y: [open, high, low, close]`
 * array plus `v` per the ApexStock data format.
 */
function defaultCandles(): Array<{ x: string; y: [number, number, number, number]; v: number }> {
  // open, high, low, close, volume — a mild uptrend with one pullback.
  const rows: Array<[number, number, number, number, number]> = [
    [100, 104, 99, 103, 1_200_000],
    [103, 106, 101, 102, 980_000],
    [102, 105, 100, 104, 1_050_000],
    [104, 110, 103, 109, 1_600_000],
    [109, 111, 106, 107, 1_100_000],
    [107, 108, 102, 103, 1_400_000],
    [103, 107, 102, 106, 900_000],
    [106, 112, 105, 111, 1_750_000],
    [111, 114, 110, 113, 1_300_000],
    [113, 115, 109, 110, 1_500_000],
  ];
  return rows.map(([o, h, l, c, v], i) => ({
    x: `2026-01-${String(i + 1).padStart(2, '0')}`,
    y: [o, h, l, c],
    v,
  }));
}
