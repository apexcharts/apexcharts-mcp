#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import * as charts from '@apexcharts-mcp/charts';
import * as gantt from '@apexcharts-mcp/gantt';
import * as grid from '@apexcharts-mcp/grid';
import * as sankey from '@apexcharts-mcp/sankey';
import * as tree from '@apexcharts-mcp/tree';

const PRODUCT_MODULES = { charts, gantt, tree, sankey, grid } as const;
type ProductKey = keyof typeof PRODUCT_MODULES;
const PRODUCT_IDS = Object.keys(PRODUCT_MODULES) as ProductKey[];

function parseProducts(env: string | undefined): ProductKey[] {
  if (!env || env.trim() === '') return PRODUCT_IDS;
  const raw = env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<ProductKey>();
  const result: ProductKey[] = [];
  for (const id of raw) {
    if ((PRODUCT_IDS as string[]).includes(id)) {
      const typed = id as ProductKey;
      if (!seen.has(typed)) {
        seen.add(typed);
        result.push(typed);
      }
    } else {
      process.stderr.write(
        `apexcharts-mcp: ignoring unknown product "${id}" in APEXCHARTS_MCP_PRODUCTS. ` +
          `Known: ${PRODUCT_IDS.join(', ')}.\n`,
      );
    }
  }
  return result;
}

async function main(): Promise<void> {
  const enabled = parseProducts(process.env.APEXCHARTS_MCP_PRODUCTS);
  const server = new McpServer({ name: 'apexcharts-mcp', version: '0.2.0' });
  for (const id of enabled) {
    PRODUCT_MODULES[id].registerTools(server);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`apexcharts-mcp fatal error: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
