import { getChartInfo } from './chartCatalog.js';

/**
 * Input shape for generate_chart_config.
 */
export interface GenerateChartConfigInput {
  type: string;
  /**
   * Optional series data. If omitted, a placeholder series matching the chart
   * type's expected format is generated.
   */
  series?: unknown;
  /** Optional category labels (for axis charts) or pie/donut labels (non-axis). */
  categories?: string[];
  /** Optional chart title. */
  title?: string;
  /** Optional explicit height in px (default 350). */
  height?: number;
  /** Stack bars/area (only honored for bar and area types). */
  stacked?: boolean;
  /** Render bar chart horizontally (only honored for bar type). */
  horizontal?: boolean;
}

/**
 * Build a minimal valid ApexCharts options object for a given chart type.
 *
 * The returned object follows the data-format rules in references/SKILL.md
 * section 2 (Series Data Format Table). When series data is not supplied, a
 * placeholder series is generated so the result can be rendered as-is.
 */
export function generateChartConfig(input: GenerateChartConfigInput): Record<string, unknown> {
  const info = getChartInfo(input.type);
  if (!info) {
    throw new Error(
      `Unsupported chart type "${input.type}". Use list_chart_types to see supported types.`,
    );
  }

  const height = input.height ?? 350;
  const chart: Record<string, unknown> = { type: info.type, height };

  if (input.stacked && (info.type === 'bar' || info.type === 'area')) {
    chart.stacked = true;
  }

  const config: Record<string, unknown> = { chart };

  if (input.title) {
    config.title = { text: input.title };
  }

  if (info.seriesFormat === 'non-axis') {
    config.series = input.series ?? defaultNonAxisSeries(info.type);
    config.labels = input.categories ?? defaultLabels(config.series as unknown[]);
    return config;
  }

  // Axis chart
  config.series = input.series ?? defaultAxisSeries(info.type);

  if (info.type === 'bar' && input.horizontal !== undefined) {
    config.plotOptions = { bar: { horizontal: input.horizontal } };
  }

  if (input.categories) {
    config.xaxis = { categories: input.categories };
  } else if (needsCategoriesByDefault(info.type)) {
    // Line/area/bar/radar default to category axis with placeholder labels
    config.xaxis = { categories: defaultCategories(config.series as unknown[]) };
  }

  return config;
}

function needsCategoriesByDefault(type: string): boolean {
  // These types use a flat number array per series and rely on xaxis.categories
  // for x labels. Types like scatter/bubble/heatmap/etc. carry x in the data.
  // funnel/pyramid are first-class bar aliases whose stage labels come from
  // xaxis.categories, same as bar.
  return (
    type === 'line' ||
    type === 'area' ||
    type === 'bar' ||
    type === 'radar' ||
    type === 'funnel' ||
    type === 'pyramid'
  );
}

function defaultAxisSeries(type: string): unknown[] {
  switch (type) {
    case 'scatter':
      return [
        {
          name: 'Series 1',
          data: [
            { x: 1, y: 5 },
            { x: 2, y: 10 },
            { x: 3, y: 8 },
            { x: 4, y: 14 },
          ],
        },
      ];
    case 'bubble':
      return [
        {
          name: 'Series 1',
          data: [
            { x: 1, y: 30, z: 10 },
            { x: 2, y: 20, z: 25 },
            { x: 3, y: 50, z: 15 },
          ],
        },
      ];
    case 'rangeArea':
      return [
        {
          name: 'Range',
          data: [
            { x: 'Jan', y: [5, 15] },
            { x: 'Feb', y: [8, 18] },
            { x: 'Mar', y: [10, 22] },
          ],
        },
      ];
    case 'rangeBar':
      return [
        {
          name: 'Tasks',
          data: [
            { x: 'Design', y: [1, 5] },
            { x: 'Build', y: [4, 9] },
            { x: 'Test', y: [8, 11] },
          ],
        },
      ];
    case 'candlestick':
      return [
        {
          data: [
            { x: new Date('2024-01-01').getTime(), y: [51, 56, 48, 53] },
            { x: new Date('2024-01-02').getTime(), y: [53, 58, 50, 55] },
            { x: new Date('2024-01-03').getTime(), y: [55, 60, 52, 57] },
          ],
        },
      ];
    case 'boxPlot':
      return [
        {
          data: [
            { x: 'Group A', y: [10, 20, 30, 40, 50] },
            { x: 'Group B', y: [15, 25, 35, 45, 55] },
          ],
        },
      ];
    case 'heatmap':
      return [
        {
          name: 'Mon',
          data: [
            { x: '10am', y: 45 },
            { x: '11am', y: 52 },
            { x: '12pm', y: 38 },
          ],
        },
        {
          name: 'Tue',
          data: [
            { x: '10am', y: 30 },
            { x: '11am', y: 60 },
            { x: '12pm', y: 50 },
          ],
        },
      ];
    case 'treemap':
      return [
        {
          data: [
            { x: 'Item A', y: 100 },
            { x: 'Item B', y: 60 },
            { x: 'Item C', y: 40 },
          ],
        },
      ];
    case 'radar':
      return [{ name: 'Skill', data: [80, 50, 30, 40, 100] }];
    case 'violin':
      // Each point carries a density profile ([value, weight] pairs) and,
      // optionally, the raw sample points to overlay as jitter.
      return [
        {
          name: 'Measurement',
          data: [
            {
              x: 'Group A',
              y: {
                density: [
                  [20, 0.02],
                  [30, 0.08],
                  [40, 0.18],
                  [50, 0.1],
                  [60, 0.03],
                ],
                points: [22, 31, 38, 41, 47, 52, 58],
              },
            },
            {
              x: 'Group B',
              y: {
                density: [
                  [25, 0.03],
                  [35, 0.12],
                  [45, 0.2],
                  [55, 0.09],
                  [65, 0.02],
                ],
                points: [27, 34, 44, 48, 53, 61],
              },
            },
          ],
        },
      ];
    case 'funnel':
      // Stages ordered largest-to-smallest; labels come from xaxis.categories.
      return [{ name: 'Funnel', data: [1380, 1100, 990, 740, 548, 330] }];
    case 'pyramid':
      // Pyramid is a funnel ordered smallest-to-largest (wide base at bottom).
      return [{ name: 'Pyramid', data: [330, 548, 740, 990, 1100, 1380] }];
    case 'line':
    case 'area':
    case 'bar':
    default:
      return [{ name: 'Series 1', data: [30, 40, 35, 50, 49, 60, 70] }];
  }
}

function defaultNonAxisSeries(type: string): number[] {
  if (type === 'radialBar') return [76, 67, 61];
  // gauge is a single-value radialBar alias; one value + one label.
  if (type === 'gauge') return [72];
  return [44, 55, 13, 43, 22];
}

function defaultLabels(series: unknown[]): string[] {
  const len = Array.isArray(series) ? series.length : 0;
  return Array.from({ length: len }, (_, i) => `Item ${i + 1}`);
}

function defaultCategories(series: unknown[]): string[] {
  const first = Array.isArray(series) ? (series[0] as { data?: unknown[] } | undefined) : undefined;
  const len = Array.isArray(first?.data) ? first!.data!.length : 7;
  if (len === 7) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Array.from({ length: len }, (_, i) => `Cat ${i + 1}`);
}
