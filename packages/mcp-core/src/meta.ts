import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductModule } from './registry.js';

/**
 * Register the `apexcharts_list_products` meta-tool. Returns a one-call
 * overview of which products are exposed by this server, what each product
 * is for, and which tools it registers — so an AI client can pick the right
 * product without first inspecting every individual tool schema.
 *
 * Only products in `modules` (i.e. the ones the env-var gating actually
 * enabled) are listed.
 */
export function registerMetaTools(server: McpServer, modules: readonly ProductModule[]): void {
  server.registerTool(
    'apexcharts_list_products',
    {
      title: 'List ApexCharts products exposed by this server',
      description:
        'Return every product (charts, gantt, tree, sankey, grid) currently exposed ' +
        'by this MCP server, with a "when to pick this" hint and the tool names it ' +
        'registers. Use this once at the start of a session to decide which product ' +
        "matches the user's task; then call that product's tools directly. " +
        'Each product also reports `compatibility`: the bundled skill version and the ' +
        'upstream library version its guidance was verified against — use it to tell ' +
        'the user which library version this server targets. ' +
        'Results respect the APEXCHARTS_MCP_PRODUCTS env-var gating.',
      inputSchema: {},
    },
    async () => {
      const products = await Promise.all(
        modules.map(async (m) => ({
          id: m.id,
          name: m.metadata.name,
          useFor: m.metadata.useFor,
          tools: m.metadata.tools,
          ...(m.metadata.docs ? { docs: m.metadata.docs } : {}),
          ...(m.readCompatibility ? { compatibility: await m.readCompatibility() } : {}),
        })),
      );
      const payload = { count: modules.length, products };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
