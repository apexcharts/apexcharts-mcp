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
      'Top-level ApexStock skill index: the apexcharts peer range (^7.1.0 || ^8.0.0 since 0.5.2), providing the ApexCharts constructor (per-instance injection, ApexStock.setApexCharts, or the window global), OHLC data format, overlays-vs-oscillators, the render/update/appendData/destroy lifecycle, and framework integration. Read this first.',
  },
  {
    file: 'analysis.md',
    description:
      'The 0.5.0 financial-analysis workspace: getRangeStats field by field, getDrawdown and the drawdown pane, per-pane heights, measureRange with the analysis panel and ApexCharts measure-ruler interop, comparison v2 (instrument alignment, the four baseline policies, the five modes, the benchmark role, getComparisonStats), getDataAt, price-scale modes, and the headless ApexStock.stats namespace.',
  },
  {
    file: 'data-format.md',
    description:
      'OHLC point shape ({ x, y: [o,h,l,c], v? }), the data adapters (normalize / fromArrays / fromCSV), chart types (candlestick / line / area / column / heikin-ashi / renko), timestamp handling, normalization behavior, and the apexcharts peer range (^7.1.0 || ^8.0.0 since apexstock 0.5.2).',
  },
  {
    file: 'indicators.md',
    description:
      'Full overlay and oscillator list with keys, per-indicator config (period / stdDev), the stacking rules, the 0.5.0 drawdown analysis pane and per-pane heightRatio, and the pure calculate* helpers.',
  },
  {
    file: 'state-and-export.md',
    description:
      'The v2 getState/setState shape field by field, exactly what is and is not captured (price-line callbacks and comparison instrument data) and how to restore each, the unified export() over png/svg/pdf/csv/json with the include selector, and ApexStock.sync for linking independent charts.',
  },
  {
    file: 'streaming-and-aggregation.md',
    description:
      'appendData for live data: view / maxPoints / updateLast options, tick-to-bar and forming-candle recipes, rangeChange (once per gesture) vs the 0.5.0 rangeChanging (per frame), and ApexStock.aggregateOHLC with the accepted INTERVALS.',
  },
  {
    file: 'trading-overlays.md',
    description:
      'Order / stop-loss / take-profit / alert price lines, the PriceLineConfig fields, drag / close / cross callbacks, the drawing tools (incl. 0.5.0 reshapeable two-anchor drawings), and the 0.5.0 chart furniture: event markers, the on-chart data legend, and toolbar customization.',
  },
  {
    file: 'framework-wrappers.md',
    description:
      'React, Vue 3, and Angular integration: props incl. the apexCharts injection prop, refs, wrapper versions and peer ranges, and cleanup.',
  },
  {
    file: 'theming.md',
    description: 'Light/dark modes, the 0.5.0 named theme-preset pack and registerTheme, and the scoped --apexstock-* CSS custom-property token system with an override recipe.',
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
