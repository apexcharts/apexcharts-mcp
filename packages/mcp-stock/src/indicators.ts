/**
 * The canonical ApexStock indicator keys, split into overlays (drawn on the
 * price chart, multiple allowed) and oscillators (own pane, only one active at
 * a time). Kept in one place so generate + validate agree. Keys are the
 * lowercase full phrases ApexStock's registry uses.
 */
export const OVERLAY_KEYS = [
  'moving average',
  'exponential moving average',
  'bollinger bands',
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
  'chaikin oscillator',
  'commodity channel index',
  'trend strength index',
  'accelerator oscillator',
  'bollinger bands %b',
  'bollinger bands width',
] as const;

export const ALL_INDICATOR_KEYS: string[] = [...OVERLAY_KEYS, ...OSCILLATOR_KEYS];

const OSCILLATOR_SET = new Set<string>(OSCILLATOR_KEYS);

export function isKnownIndicator(key: string): boolean {
  return ALL_INDICATOR_KEYS.includes(key.toLowerCase());
}

export function isOscillator(key: string): boolean {
  return OSCILLATOR_SET.has(key.toLowerCase());
}
