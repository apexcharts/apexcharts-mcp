import { readdirSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import { registerMetaTools, type ProductModule } from '../packages/mcp-core/src/index.js';

// The whole server as it ships: meta tools plus every product package. Products
// are found on disk by their export shape, so a new one is covered without
// editing this file.
async function loadProducts(): Promise<ProductModule[]> {
  const packages = new URL('../packages/', import.meta.url);
  const modules = await Promise.all(
    readdirSync(packages).map((dir) => import(/* @vite-ignore */ new URL(`${dir}/src/index.ts`, packages).href)),
  );
  return modules.filter(
    (m): m is ProductModule => typeof m.registerTools === 'function' && m.metadata !== undefined,
  );
}

// A property with no JSON Schema type leaves the client to guess its shape.
// Claude Code then sends an object as a JSON string, and the tool rejects it.
function isTyped(schema: Record<string, unknown>): boolean {
  if ('type' in schema || 'enum' in schema || 'const' in schema) return true;
  const branches = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[] | undefined;
  return Array.isArray(branches) && branches.length > 0 && branches.every(isTyped);
}

let products: ProductModule[];
let client: Client;
let tools: Tool[];

beforeAll(async () => {
  products = await loadProducts();
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerMetaTools(server, products);
  for (const p of products) p.registerTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  tools = (await client.listTools()).tools;
});

describe('tool input schemas', () => {
  it('registers every tool each product declares', () => {
    expect(products.length).toBeGreaterThan(0);
    const listed = new Set(tools.map((t) => t.name));
    const missing = products.flatMap((p) => p.metadata.tools.filter((name) => !listed.has(name)));
    expect(missing).toEqual([]);
  });

  it('declares a JSON Schema type for every input', () => {
    const untyped = tools.flatMap((t) =>
      Object.entries(t.inputSchema.properties ?? {})
        .filter(([, schema]) => !isTyped(schema as Record<string, unknown>))
        .map(([prop]) => `${t.name}.${prop}`),
    );
    expect(untyped).toEqual([]);
  });

  // Claude's connectors directory requires a title plus readOnlyHint or
  // destructiveHint on every tool, and its submission form reads the title
  // from annotations.title, not the top-level title clients display. ChatGPT's
  // requires readOnlyHint, destructiveHint and openWorldHint as explicit
  // booleans. Both titles are set, and must say the same thing.
  it('gives every tool a title and the behaviour hints directories require', () => {
    const lacking = tools
      .filter(
        (t) =>
          !t.title ||
          t.annotations?.title !== t.title ||
          typeof t.annotations?.readOnlyHint !== 'boolean' ||
          typeof t.annotations?.destructiveHint !== 'boolean' ||
          typeof t.annotations?.openWorldHint !== 'boolean',
      )
      .map((t) => t.name);
    expect(lacking).toEqual([]);
  });

  it('takes a config as an object and validates it', async () => {
    const result = await client.callTool({
      name: 'apexcharts_validate_config',
      arguments: {
        config: { chart: { type: 'pie' }, series: [{ name: 'Sales', data: [44, 55, 13] }], labels: ['A', 'B', 'C'] },
      },
    });
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content.text).errors.map((e: { rule: string }) => e.rule)).toContain(
      'wrong-series-format-non-axis',
    );
  });

  it('refuses a config sent as a JSON string, naming the expected type', async () => {
    const result = await client.callTool({
      name: 'apexcharts_validate_config',
      arguments: { config: '{"chart":{"type":"pie"}}' },
    });
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBe(true);
    // zod 4 names a z.record input 'record' where zod 3 said 'object'; either
    // tells the client to send an object, not a JSON string.
    expect(content.text).toMatch(/expected (object|record), received string/i);
  });

  it('caps every array input whose entries can fail, so a hostile list is rejected cheaply', () => {
    // Without a length cap zod records one issue per bad element: a 1 MB list
    // cost about 240 MB of heap on a server with 256 MB. An array of anything
    // (`{}` items, from z.unknown()) has no element that can fail.
    const uncapped: string[] = [];
    const walk = (schema: Record<string, unknown>, at: string) => {
      const items = schema.items as Record<string, unknown> | undefined;
      const itemsCanFail = items !== undefined && Object.keys(items).length > 0;
      if (schema.type === 'array' && itemsCanFail && typeof schema.maxItems !== 'number') uncapped.push(at);
      for (const branch of ((schema.anyOf ?? schema.oneOf) as Record<string, unknown>[] | undefined) ?? []) walk(branch, at);
      const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
      for (const [k, v] of Object.entries(props ?? {})) walk(v, `${at}.${k}`);
      if (schema.items && typeof schema.items === 'object') walk(schema.items as Record<string, unknown>, `${at}[]`);
    };
    for (const tool of tools) walk(tool.inputSchema as Record<string, unknown>, tool.name);
    expect(uncapped).toEqual([]);
  });
});
