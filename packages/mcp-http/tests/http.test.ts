import { request, type IncomingHttpHeaders } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

import {
  startHttpServer,
  type AccessLogEntry,
  type RunningHttpServer,
  type StartHttpServerOptions,
} from '../src/http.js';
import { LOOPBACK_HOSTNAMES } from '../src/policy.js';

const ALLOWED_ORIGIN = 'https://allowed.example';
const MAX_BODY = 16 * 1024;

function makeServer(): McpServer {
  const server = new McpServer({ name: 'test-server', version: '1.2.3' });
  server.registerTool(
    'echo',
    { description: 'Echo text back', inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: 'text', text }] }),
  );
  server.registerTool(
    'slow',
    { description: 'Answer after a delay', inputSchema: { ms: z.number() } },
    async ({ ms }) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { content: [{ type: 'text', text: 'done' }] };
    },
  );
  return server;
}

function start(overrides: Partial<StartHttpServerOptions> = {}): Promise<RunningHttpServer> {
  return startHttpServer({
    createServer: makeServer,
    name: 'test-server',
    version: '1.2.3',
    port: 0,
    host: '127.0.0.1',
    allowedHosts: [...LOOPBACK_HOSTNAMES, 'mcp.example.com'],
    allowedOrigins: [ALLOWED_ORIGIN],
    maxBodyBytes: MAX_BODY,
    ...overrides,
  });
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

// node:http rather than fetch, because fetch will not let a test set Host.
function raw(
  baseUrl: string,
  options: { method?: string; path?: string; headers?: Record<string, string>; body?: string | string[] },
): Promise<RawResponse> {
  const url = new URL(baseUrl);
  const headers = { ...options.headers };
  if (typeof options.body === 'string') headers['Content-Length'] = String(Buffer.byteLength(options.body));
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, method: options.method ?? 'GET', path: options.path ?? '/mcp', headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    if (Array.isArray(options.body)) for (const chunk of options.body) req.write(chunk);
    else if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'raw-test', version: '0.0.0' },
  },
});

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: 'sdk-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
  return client;
}

describe('HTTP transport', () => {
  let running: RunningHttpServer;
  const accessLog: AccessLogEntry[] = [];

  beforeAll(async () => {
    running = await start({ accessLog: (entry) => accessLog.push(entry) });
  });

  afterAll(async () => {
    await running.close();
  });

  describe('health check', () => {
    it('answers 200 with name and version, even for a Host /mcp would refuse', async () => {
      // Load-balancer health checks send the target's IP as Host.
      const res = await raw(running.url, { path: '/healthz', headers: { Host: '10.0.1.23:3000' } });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(JSON.parse(res.body)).toEqual({ status: 'ok', name: 'test-server', version: '1.2.3' });
    });

    it('supports HEAD and refuses other methods', async () => {
      const head = await raw(running.url, { method: 'HEAD', path: '/healthz' });
      expect(head.status).toBe(200);
      expect(head.body).toBe('');
      const post = await raw(running.url, { method: 'POST', path: '/healthz', body: '{}' });
      expect(post.status).toBe(405);
      expect(post.headers.allow).toBe('GET, HEAD');
    });
  });

  describe('with the SDK client', () => {
    it('initializes, lists tools and calls one across separate stateless requests', async () => {
      const client = await connectClient(running.url);
      try {
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(['echo', 'slow']);
        const result = await client.callTool({ name: 'echo', arguments: { text: 'hello' } });
        expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
      } finally {
        await client.close();
      }
    });

    it('keeps concurrent calls isolated from each other', async () => {
      const client = await connectClient(running.url);
      try {
        const texts = Array.from({ length: 25 }, (_, i) => `call-${i}`);
        const results = await Promise.all(
          texts.map((text) => client.callTool({ name: 'echo', arguments: { text } })),
        );
        expect(results.map((r) => (r.content as Array<{ text: string }>)[0].text)).toEqual(texts);
      } finally {
        await client.close();
      }
    });

    it('logs one entry per request naming the JSON-RPC method and tool, never the arguments', async () => {
      const client = await connectClient(running.url);
      try {
        await client.callTool({ name: 'echo', arguments: { text: 'secret-argument' } });
      } finally {
        await client.close();
      }
      const rpc = accessLog.flatMap((e) => e.rpc);
      expect(rpc).toContain('initialize');
      expect(rpc).toContain('tools/call:echo');
      expect(JSON.stringify(accessLog)).not.toContain('secret-argument');
      const call = accessLog.find((e) => e.rpc.includes('tools/call:echo'));
      expect(call).toMatchObject({ method: 'POST', status: 200 });
      expect(typeof call?.ms).toBe('number');
    });
  });

  describe('protocol surface', () => {
    it('answers initialize with JSON and no session id', async () => {
      const res = await raw(running.url, { method: 'POST', headers: MCP_HEADERS, body: INITIALIZE });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['mcp-session-id']).toBeUndefined();
      expect(JSON.parse(res.body).result.serverInfo).toEqual({ name: 'test-server', version: '1.2.3' });
    });

    it('refuses GET and DELETE with 405, which the spec defines as "no stream, no sessions"', async () => {
      for (const method of ['GET', 'DELETE']) {
        const res = await raw(running.url, { method, headers: { Accept: 'text/event-stream' } });
        expect(res.status).toBe(405);
        expect(res.headers.allow).toBe('POST, OPTIONS');
        expect(JSON.parse(res.body).error.code).toBe(-32000);
      }
    });

    it('404s every other path, including /mcp/ and the root', async () => {
      for (const path of ['/', '/mcp/', '/mcpx', '/healthz/']) {
        expect((await raw(running.url, { path })).status).toBe(404);
      }
    });

    it('ignores a query string when routing', async () => {
      const res = await raw(running.url, { method: 'POST', path: '/mcp?x=1', headers: MCP_HEADERS, body: INITIALIZE });
      expect(res.status).toBe(200);
    });

    it('answers malformed JSON with a JSON-RPC parse error', async () => {
      const res = await raw(running.url, { method: 'POST', headers: MCP_HEADERS, body: '{"jsonrpc":' });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe(-32700);
    });

    it('leaves Accept and Content-Type checks to the SDK transport', async () => {
      const noStream = await raw(running.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: INITIALIZE,
      });
      expect(noStream.status).toBe(406);
      const wrongType = await raw(running.url, {
        method: 'POST',
        headers: { ...MCP_HEADERS, 'Content-Type': 'text/plain' },
        body: INITIALIZE,
      });
      expect(wrongType.status).toBe(415);
    });
  });

  describe('request limits', () => {
    it('rejects a body declared larger than the limit with 413', async () => {
      const res = await raw(running.url, {
        method: 'POST',
        headers: MCP_HEADERS,
        body: JSON.stringify({ padding: 'x'.repeat(MAX_BODY) }),
      });
      expect(res.status).toBe(413);
      expect(JSON.parse(res.body).error.message).toContain(String(MAX_BODY));
    });

    it('rejects a chunked body that grows past the limit with 413', async () => {
      const chunk = 'x'.repeat(4096);
      const res = await raw(running.url, {
        method: 'POST',
        headers: MCP_HEADERS,
        body: ['{"padding":"', ...Array.from({ length: 6 }, () => chunk), '"}'],
      });
      expect(res.status).toBe(413);
    });
  });

  describe('Host and Origin policy', () => {
    it('refuses a Host that is not allowed', async () => {
      const res = await raw(running.url, {
        method: 'POST',
        headers: { ...MCP_HEADERS, Host: 'evil.example' },
        body: INITIALIZE,
      });
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body).error.message).toMatch(/Host/);
    });

    it('accepts an allowed Host whatever its port', async () => {
      const res = await raw(running.url, {
        method: 'POST',
        headers: { ...MCP_HEADERS, Host: 'mcp.example.com:443' },
        body: INITIALIZE,
      });
      expect(res.status).toBe(200);
    });

    it('refuses an unlisted browser Origin without CORS headers', async () => {
      const res = await raw(running.url, {
        method: 'POST',
        headers: { ...MCP_HEADERS, Origin: 'https://evil.example' },
        body: INITIALIZE,
      });
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers preflight for an allowed Origin', async () => {
      const res = await raw(running.url, {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, mcp-protocol-version',
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Mcp-Protocol-Version');
      expect(res.headers.vary).toBe('Origin');
    });

    it('adds CORS headers to the real response for an allowed Origin', async () => {
      const res = await raw(running.url, {
        method: 'POST',
        headers: { ...MCP_HEADERS, Origin: ALLOWED_ORIGIN },
        body: INITIALIZE,
      });
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-expose-headers']).toContain('Mcp-Protocol-Version');
    });

    it('answers * when every origin is allowed', async () => {
      const open = await start({ allowedOrigins: '*' });
      try {
        const res = await raw(open.url, {
          method: 'POST',
          headers: { ...MCP_HEADERS, Origin: 'https://anyone.example' },
          body: INITIALIZE,
        });
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers.vary).toBeUndefined();
      } finally {
        await open.close();
      }
    });
  });
});

describe('HTTP transport lifecycle', () => {
  it('reports an unexpected failure and answers 500 with a JSON-RPC error', async () => {
    const errors: unknown[] = [];
    const broken = await start({
      createServer: () => {
        throw new Error('boom');
      },
      onError: (err) => errors.push(err),
    });
    try {
      const res = await raw(broken.url, { method: 'POST', headers: MCP_HEADERS, body: INITIALIZE });
      expect(res.status).toBe(500);
      expect(JSON.parse(res.body).error.code).toBe(-32603);
      expect(res.body).not.toContain('boom');
      expect((errors[0] as Error).message).toBe('boom');
    } finally {
      await broken.close();
    }
  });

  it('lets an in-flight call finish on close, then stops accepting connections', async () => {
    const server = await start();
    const client = await connectClient(server.url);
    const inFlight = client.callTool({ name: 'slow', arguments: { ms: 300 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closingAt = Date.now();
    const closed = server.close();

    const result = await inFlight;
    expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
    await closed;
    // Closes when the last response is out, not when the 5s force timer fires:
    // the client's keep-alive socket must not hold shutdown open.
    expect(Date.now() - closingAt).toBeLessThan(2_000);
    await expect(raw(server.url, { path: '/healthz' })).rejects.toThrow(/ECONNREFUSED/);
    await client.close().catch(() => {});
  });

  it('rejects when the port is already taken', async () => {
    const first = await start();
    try {
      const port = Number(new URL(first.url).port);
      await expect(start({ port })).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await first.close();
    }
  });
});
