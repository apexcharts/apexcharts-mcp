import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerStockTools } from './register.js';

export const id = 'stock' as const;

export const metadata: ProductMetadata = {
  name: 'ApexStock',
  useFor:
    'Financial and stock charts: candlestick / OHLC / heikin-ashi price series, technical indicators (RSI, MACD, Bollinger Bands, moving averages, Ichimoku), trading price lines, real-time streaming, and timeframe aggregation.',
  tools: ['apexstock_generate_config', 'apexstock_validate_config', 'apexstock_get_reference'],
  docs: 'https://apexcharts.com/docs/apexstock/',
};

export function registerTools(server: McpServer): void {
  registerStockTools(server);
}

export { readCompatibility } from './skill.js';
