/**
 * The canonical ApexStock indicator keys, as registered in apexstock 0.5.2:
 * overlays (drawn on the price chart, multiple allowed), oscillators (own
 * pane; several can be active at once since 0.4.0) and analysis panes (0.5.0;
 * an oscillator entry the dropdown groups under "Analysis"). Kept in one place
 * so generate + validate agree. Keys are the lowercase full phrases ApexStock's
 * registry uses.
 */
export const OVERLAY_KEYS = [
  'moving average',
  'exponential moving average',
  'vwap',
  'bollinger bands',
  'donchian channels',
  'keltner channels',
  'fibonacci retracements',
  'linear regression',
  'ichimoku cloud indicator',
] as const;

export const OSCILLATOR_KEYS = [
  'rsi',
  'macd',
  'volumes',
  'price volume trend',
  'stochastic oscillator',
  'standard deviation indicator',
  'average directional index',
  'atr',
  'chaikin oscillator',
  'commodity channel index',
  'trend strength index',
  'accelerator oscillator',
  'bollinger bands %b',
  'bollinger bands width',
] as const;

export const ANALYSIS_KEYS = ['drawdown'] as const;

export const ALL_INDICATOR_KEYS: string[] = [...OVERLAY_KEYS, ...OSCILLATOR_KEYS, ...ANALYSIS_KEYS];

// The library registers an analysis pane as an oscillator entry: it gets its
// own pane the same way.
const OSCILLATOR_SET = new Set<string>([...OSCILLATOR_KEYS, ...ANALYSIS_KEYS]);

export function isKnownIndicator(key: string): boolean {
  return ALL_INDICATOR_KEYS.includes(key.toLowerCase());
}

export function isOscillator(key: string): boolean {
  return OSCILLATOR_SET.has(key.toLowerCase());
}
