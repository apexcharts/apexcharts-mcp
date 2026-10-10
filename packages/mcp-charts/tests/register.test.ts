import { beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CHART_CATALOG, TIER2_CHART_TYPES } from '../src/chartCatalog.js';
import { registerChartsTools } from '../src/register.js';

let client: Client;

beforeAll(async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerChartsTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
});

async function callJson(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(first.text) as Record<string, unknown>;
}

describe('apexcharts_list_types', () => {
  it('returns a bundle tier for every type, with the add-on a Tier 2 type needs', async () => {
    const payload = await callJson('apexcharts_list_types', {});
    const types = payload.types as Array<{ type: string; description: string; bundle: Record<string, unknown> }>;
    expect(types).toHaveLength(CHART_CATALOG.length);
    for (const t of types) {
      if (TIER2_CHART_TYPES.includes(t.type)) {
        expect(t.bundle.tier, t.type).toBe(2);
        expect(t.description, t.type).toContain(`\`import '${t.bundle.import as string}'\``);
      } else {
        expect(t.bundle, t.type).toEqual({ tier: 1 });
      }
    }
    const raincloud = types.find((t) => t.type === 'raincloud')!;
    expect(raincloud.bundle).toMatchObject({
      tier: 2,
      import: 'apexcharts/raincloud',
      scripts: ['dist/violin.js', 'dist/features/raincloud.js'],
      failure: 'throws',
    });
  });
});

describe('apexcharts_generate_config', () => {
  it('names the Tier 2 types and list_types in its description', async () => {
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === 'apexcharts_generate_config')!;
    for (const type of TIER2_CHART_TYPES) expect(generate.description).toContain(type);
    expect(generate.description).toContain("'apexcharts/full'");
    expect(generate.description).toContain('apexcharts_list_types');
  });

  it('accepts type column', async () => {
    const config = await callJson('apexcharts_generate_config', { type: 'column' });
    expect((config.chart as { type: string }).type).toBe('column');
  });
});
