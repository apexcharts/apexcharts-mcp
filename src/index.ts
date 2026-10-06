#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerMetaTools } from '@apexcharts-mcp/core';
import {
  LOOPBACK_HOSTNAMES,
  parseHostAllowList,
  parseOriginAllowList,
  startHttpServer,
  type AccessLogEntry,
} from '@apexcharts-mcp/http';

import * as charts from '@apexcharts-mcp/charts';
import * as gantt from '@apexcharts-mcp/gantt';
import * as grid from '@apexcharts-mcp/grid';
import * as maps from '@apexcharts-mcp/maps';
import * as sankey from '@apexcharts-mcp/sankey';
import * as stock from '@apexcharts-mcp/stock';
import * as tree from '@apexcharts-mcp/tree';

const PRODUCT_MODULES = { charts, gantt, tree, sankey, grid, stock, maps } as const;
type ProductKey = keyof typeof PRODUCT_MODULES;
const PRODUCT_IDS = Object.keys(PRODUCT_MODULES) as ProductKey[];

const SERVER_NAME = 'apexcharts-mcp';
// Read at runtime so clients (and /healthz) always see the published version.
// Both dist/index.js and src/index.ts sit one level below package.json.
const SERVER_VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const LOOPBACK_BIND_ADDRESSES = ['127.0.0.1', 'localhost', '::1'];

const USAGE = `Usage:
  apexcharts-mcp                       MCP over stdio (default; what IDE clients launch)
  apexcharts-mcp --http [--port <n>] [--host <addr>]
                                       MCP over Streamable HTTP at /mcp, health at /healthz

Environment:
  APEXCHARTS_MCP_PRODUCTS         comma-separated product ids to load (default: all)
  PORT                            HTTP port when --port is not given (default: ${DEFAULT_PORT})
  APEXCHARTS_MCP_HOST             bind address when --host is not given (default: ${DEFAULT_HOST})
  APEXCHARTS_MCP_ALLOWED_HOSTS    hostnames /mcp answers to, or * (default: ${LOOPBACK_HOSTNAMES.join(',')})
  APEXCHARTS_MCP_ALLOWED_ORIGINS  browser origins allowed to call /mcp, or * (default: none)`;

class UsageError extends Error {}

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

const KNOWN_FLAGS = ['http', 'port', 'host'];

function parseCli(argv: string[]): { http: boolean; port?: string; host?: string } {
  // Non-strict so an unexpected argument cannot stop an existing stdio
  // install from starting; HTTP mode refuses them below instead.
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      http: { type: 'boolean', default: false },
      port: { type: 'string' },
      host: { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  });
  const unknown = [
    ...Object.keys(values).filter((k) => !KNOWN_FLAGS.includes(k)).map((k) => `--${k}`),
    ...positionals,
  ];
  const http = values.http === true;
  for (const key of ['port', 'host'] as const) {
    if (values[key] !== undefined && typeof values[key] !== 'string') {
      throw new UsageError(`--${key} needs a value.`);
    }
  }
  if (unknown.length > 0) {
    if (http) throw new UsageError(`unknown argument ${unknown.join(' ')}.`);
    process.stderr.write(`apexcharts-mcp: ignoring unknown argument ${unknown.join(' ')}.\n`);
  }
  return { http, port: values.port as string | undefined, host: values.host as string | undefined };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new UsageError(`invalid port "${raw}".`);
  }
  return port;
}

function serverFactory(enabled: ProductKey[]): () => McpServer {
  const modules = enabled.map((id) => PRODUCT_MODULES[id]);
  return () => {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerMetaTools(server, modules);
    for (const m of modules) {
      m.registerTools(server);
    }
    return server;
  };
}

async function runHttp(
  enabled: ProductKey[],
  cli: { port?: string; host?: string },
): Promise<void> {
  const env = process.env;
  const port = parsePort(cli.port ?? env.PORT);
  const host = cli.host ?? env.APEXCHARTS_MCP_HOST ?? DEFAULT_HOST;
  const fromEnv = <T>(name: string, parse: (raw: string | undefined) => T): T => {
    try {
      return parse(env[name]);
    } catch (err) {
      throw new UsageError(`${name}: ${(err as Error).message}.`);
    }
  };
  const allowedHosts = fromEnv('APEXCHARTS_MCP_ALLOWED_HOSTS', (raw) =>
    parseHostAllowList(raw, LOOPBACK_HOSTNAMES),
  );
  const allowedOrigins = fromEnv('APEXCHARTS_MCP_ALLOWED_ORIGINS', (raw) =>
    parseOriginAllowList(raw, []),
  );

  if (!env.APEXCHARTS_MCP_ALLOWED_HOSTS && !LOOPBACK_BIND_ADDRESSES.includes(host)) {
    process.stderr.write(
      `apexcharts-mcp: bound to ${host} but APEXCHARTS_MCP_ALLOWED_HOSTS is unset, so /mcp only ` +
        `answers for ${LOOPBACK_HOSTNAMES.join(', ')}. Set it to the public hostname.\n`,
    );
  }

  const running = await startHttpServer({
    createServer: serverFactory(enabled),
    name: SERVER_NAME,
    version: SERVER_VERSION,
    port,
    host,
    allowedHosts,
    allowedOrigins,
    // stdout is free in HTTP mode; access lines go there, diagnostics to stderr.
    accessLog: (entry: AccessLogEntry) => process.stdout.write(`${JSON.stringify(entry)}\n`),
    onError: (err) =>
      process.stderr.write(`apexcharts-mcp: request failed: ${(err as Error)?.stack ?? err}\n`),
  });

  const describe = (list: typeof allowedHosts) => (list === '*' ? '*' : list.join(',') || 'none');
  process.stderr.write(
    `apexcharts-mcp ${SERVER_VERSION}: listening on ${running.url}/mcp ` +
      `(products: ${enabled.join(',')}; hosts: ${describe(allowedHosts)}; origins: ${describe(allowedOrigins)})\n`,
  );

  let stopping = false;
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    process.stderr.write(`apexcharts-mcp: ${signal} received, draining\n`);
    running.close().then(
      () => process.exit(0),
      (err: unknown) => {
        process.stderr.write(`apexcharts-mcp: shutdown failed: ${(err as Error)?.stack ?? err}\n`);
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

async function runStdio(enabled: ProductKey[]): Promise<void> {
  const server = serverFactory(enabled)();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const enabled = parseProducts(process.env.APEXCHARTS_MCP_PRODUCTS);
  if (cli.http) await runHttp(enabled, cli);
  else await runStdio(enabled);
}

main().catch((err) => {
  if (err instanceof UsageError) {
    process.stderr.write(`apexcharts-mcp: ${err.message}\n\n${USAGE}\n`);
    process.exit(2);
  }
  process.stderr.write(`apexcharts-mcp fatal error: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
