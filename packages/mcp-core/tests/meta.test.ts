import { describe, expect, it } from 'vitest';

import { registerMetaTools } from '../src/meta.js';
import type { ProductModule } from '../src/registry.js';

// Minimal stand-in for the SDK's McpServer that captures the registration.
function makeFakeServer() {
  const registrations: Array<{
    name: string;
    schema: unknown;
    handler: (args: unknown) => unknown;
  }> = [];
  return {
    registerTool(name: string, schema: unknown, handler: (args: unknown) => unknown): void {
      registrations.push({ name, schema, handler });
    },
    registrations,
  };
}

const charts: ProductModule = {
  id: 'charts',
  metadata: {
    name: 'ApexCharts',
    useFor: 'Standard charts.',
    tools: ['apexcharts_generate_config', 'apexcharts_validate_config'],
    docs: 'https://apexcharts.com/docs/',
  },
  registerTools() {},
};

const gantt: ProductModule = {
  id: 'gantt',
  metadata: {
    name: 'ApexGantt',
    useFor: 'Schedules.',
    tools: ['apexgantt_generate_config'],
  },
  registerTools() {},
};

describe('registerMetaTools', () => {
  it('registers exactly one tool named apexcharts_list_products', () => {
    const server = makeFakeServer();
    registerMetaTools(server as unknown as Parameters<typeof registerMetaTools>[0], [charts, gantt]);
    expect(server.registrations).toHaveLength(1);
    expect(server.registrations[0].name).toBe('apexcharts_list_products');
  });

  it('returns the enabled products in input order with the expected payload', async () => {
    const server = makeFakeServer();
    registerMetaTools(server as unknown as Parameters<typeof registerMetaTools>[0], [charts, gantt]);
    const result = (await server.registrations[0].handler({})) as {
      content: Array<{ type: string; text: string }>;
    };
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.products.map((p: { id: string }) => p.id)).toEqual(['charts', 'gantt']);
    expect(payload.products[0]).toMatchObject({
      id: 'charts',
      name: 'ApexCharts',
      useFor: 'Standard charts.',
      tools: ['apexcharts_generate_config', 'apexcharts_validate_config'],
      docs: 'https://apexcharts.com/docs/',
    });
    // gantt has no docs — the docs key should be omitted, not null/undefined
    expect('docs' in payload.products[1]).toBe(false);
  });

  it('respects env-var gating: only the modules passed in are listed', async () => {
    const server = makeFakeServer();
    registerMetaTools(server as unknown as Parameters<typeof registerMetaTools>[0], [gantt]);
    const result = (await server.registrations[0].handler({})) as {
      content: Array<{ type: string; text: string }>;
    };
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.products[0].id).toBe('gantt');
  });
});
