import {
  createReferenceReader,
  readSkillCompatibility,
  type ReferenceEntry,
  type SkillCompatibility,
} from '@apexcharts-mcp/core';
import * as skill from 'apexstock-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level ApexStock skill index: the ApexCharts-global requirement, OHLC data format, overlays-vs-oscillators, the render/update/appendData/destroy lifecycle, and framework integration. Read this first.',
  },
  {
    file: 'data-format.md',
    description:
      'OHLC point shape ({ x, y: [o,h,l,c], v? }), chart types (candlestick / ohlc / line / area / heikinashi), timestamp handling, and normalization behavior.',
  },
  {
    file: 'indicators.md',
    description:
      'Full overlay and oscillator list with keys, per-indicator config (period / stdDev), overlays-stack-vs-one-oscillator rule, and the pure calculate* helpers.',
  },
  {
    file: 'streaming-and-aggregation.md',
    description:
      'appendData for live data: view / maxPoints / updateLast options, tick-to-bar and forming-candle recipes, and ApexStock.aggregateOHLC with the accepted INTERVALS.',
  },
  {
    file: 'trading-overlays.md',
    description:
      'Order / stop-loss / take-profit / alert price lines, the PriceLineConfig fields, drag / close / cross callbacks, and the drawing tools.',
  },
  {
    file: 'framework-wrappers.md',
    description: 'React, Vue 3, and Angular integration — props, refs, the ApexCharts-global rule, and cleanup.',
  },
  {
    file: 'theming.md',
    description: 'Light/dark modes and the scoped --apexstock-* CSS custom-property token system with an override recipe.',
  },
];

const reader = createReferenceReader(REFERENCE_INDEX, skill);

export function isKnownReference(file: string): boolean {
  return reader.isKnown(file);
}

export async function readKnownFile(file: string): Promise<string> {
  return reader.read(file);
}

export function readCompatibility(): Promise<SkillCompatibility> {
  return readSkillCompatibility(skill);
}
