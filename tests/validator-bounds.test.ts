import { readdirSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { MAX_ISSUES_PER_RULE, type ProductModule } from '../packages/mcp-core/src/index.js';

// A validator reports one issue per bad row, task, node or point. Uncapped, a
// 1 MB `data` array of bad rows made the grid validator answer with 524,269
// issues and 112 MB of JSON, on a hosted server with 256 MB. This sends every
// product's validator its own generated config with each array in turn
// replaced by a long run of junk, and checks the answer stays bounded.

const LENGTH = 2_000;
const JUNK: unknown[] = [1, 'x', null, {}];
/** Generate arguments for products whose generator needs some. */
const GENERATE_ARGS: Record<string, Record<string, unknown>> = {
  apexcharts_generate_config: { type: 'line' },
};

type Json = unknown;

/** Paths of every array in `value`, as lists of keys. */
function arrayPaths(value: Json, at: (string | number)[] = [], out: (string | number)[][] = []) {
  if (Array.isArray(value)) {
    out.push(at);
    value.forEach((v, i) => arrayPaths(v, [...at, i], out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) arrayPaths(v, [...at, k], out);
  }
  return out;
}

function withArray(config: Json, path: (string | number)[], replacement: unknown[]): Json {
  const copy = structuredClone(config) as Record<string | number, unknown>;
  if (path.length === 0) return replacement;
  let node = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  node[path[path.length - 1]] = replacement;
  return copy;
}

let client: Client;
let pairs: { generate: string; validate: string }[];

beforeAll(async () => {
  const packages = new URL('../packages/', import.meta.url);
  const modules = await Promise.all(
    readdirSync(packages).map((dir) => import(/* @vite-ignore */ new URL(`${dir}/src/index.ts`, packages).href)),
  );
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  for (const m of modules as ProductModule[]) if (typeof m.registerTools === 'function') m.registerTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  const names = new Set((await client.listTools()).tools.map((t) => t.name));
  pairs = [...names]
    .filter((n) => n.endsWith('_generate_config') && names.has(n.replace('_generate_', '_validate_')))
    .map((generate) => ({ generate, validate: generate.replace('_generate_', '_validate_') }));
});

async function text(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  return (result.content as Array<{ text: string }>)[0].text;
}

describe('validator answers stay bounded', () => {
  it('covers every product that has a validator', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(7);
  });

  it('lists at most the cap per rule, plus one count, however many items are bad', async () => {
    let capped = 0;
    for (const { generate, validate } of pairs) {
      const config = JSON.parse(await text(generate, GENERATE_ARGS[generate] ?? {}));
      for (const path of arrayPaths(config)) {
        for (const junk of JUNK) {
          const answer = await text(validate, { config: withArray(config, path, Array(LENGTH).fill(junk)) });
          const where = `${validate} ${path.join('.') || '(root)'} = [${JSON.stringify(junk)} x ${LENGTH}]`;
          expect(answer.length, where).toBeLessThan(200_000);
          const { issues } = JSON.parse(answer) as { issues: { rule: string; path: string }[] };
          const perRule = new Map<string, number>();
          for (const issue of issues) perRule.set(issue.rule, (perRule.get(issue.rule) ?? 0) + 1);
          for (const [rule, n] of perRule) expect(n, `${where}: ${rule}`).toBeLessThanOrEqual(MAX_ISSUES_PER_RULE + 1);
          if (issues.some((i) => /more ".*" issues are not listed/.test((i as { message?: string }).message ?? ''))) capped++;
        }
      }
    }
    // The cap has to have engaged somewhere, or this test proves nothing.
    expect(capped).toBeGreaterThan(0);
  }, 60_000);
});
