/**
 * Streamable HTTP transport for the hosted endpoint (`https://mcp.apexcharts.com/mcp`).
 *
 * It runs STATELESS with JSON responses, and that choice is load-bearing for
 * the infrastructure:
 *
 * - Every tool here is a quick read-only request/response call. Nothing pushes
 *   from server to client (no notifications, sampling or elicitation), so a
 *   session or a standing SSE stream would buy nothing.
 * - With no standing streams, no connection outlives one tool call, so a load
 *   balancer's 60s idle timeout never cuts a client off.
 * - With no sessions, nothing lives in process memory between requests: any
 *   number of replicas can sit behind a balancer without stickiness, and
 *   memory cannot grow with clients that disconnect without saying goodbye.
 *
 * Each POST gets a freshly built server, which is the SDK's documented
 * stateless pattern; registering every product's tools takes well under a
 * millisecond. GET (server-to-client stream) and DELETE (end session) answer
 * 405, which the spec defines as "this server offers neither".
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { isHostAllowed, resolveAllowedOrigin, type AllowList } from './policy.js';

export const MCP_PATH = '/mcp';
/** Liveness only: no dependencies, never touches the MCP path. Poll this, not `/mcp`. */
export const HEALTH_PATH = '/healthz';

/** JSON-RPC payloads are small. 1 MiB stays under the origin nginx's 2m cap. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

// Longer than the AWS ALB's 60s idle timeout. If Node closed an idle
// keep-alive socket first, the balancer could send the next request down a
// socket Node is closing and answer the client with a 502.
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
// Kept above keepAliveTimeout, as Node recommends behind a load balancer.
const HEADERS_TIMEOUT_MS = 66_000;
// Caps how long a client may take to send one request (slow-body abuse).
// Node requires it to be at least headersTimeout.
const REQUEST_TIMEOUT_MS = 70_000;
// `docker stop` sends SIGKILL 10s after SIGTERM; finish well inside that.
const SHUTDOWN_GRACE_MS = 5_000;

const CORS_ALLOW_METHODS = 'GET, POST, DELETE, OPTIONS';
const CORS_ALLOW_HEADERS =
  'Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID';
const CORS_EXPOSE_HEADERS = 'Mcp-Protocol-Version, Mcp-Session-Id';
const CORS_MAX_AGE_SECONDS = '86400';

const MAX_RPC_LABEL_LENGTH = 100;

/** One line per `/mcp` request. Carries no arguments and no client address. */
export interface AccessLogEntry {
  /** ISO time the request arrived. */
  time: string;
  /** HTTP method. */
  method: string;
  status: number;
  /** Wall time to response close, in milliseconds. */
  ms: number;
  /** JSON-RPC methods in the body; `tools/call` carries the tool name (`tools/call:apexcharts_generate_config`). */
  rpc: string[];
}

export interface HttpTransportOptions {
  /** Builds a fresh server with every enabled tool registered. Called once per POST. */
  createServer: () => McpServer;
  /** Reported by the health endpoint. */
  name: string;
  version: string;
  /** Hostnames `/mcp` answers to. `/healthz` is exempt: balancer health checks send the target's IP as Host. */
  allowedHosts: AllowList;
  /** Browser origins that may call `/mcp`. Requests without an Origin header always pass. */
  allowedOrigins: AllowList;
  /** Largest request body accepted. Defaults to {@link DEFAULT_MAX_BODY_BYTES}. */
  maxBodyBytes?: number;
  accessLog?: (entry: AccessLogEntry) => void;
  /** Unexpected failures inside the handler. Client mistakes (bad JSON, wrong headers) are answered, not reported. */
  onError?: (error: unknown) => void;
}

export interface StartHttpServerOptions extends HttpTransportOptions {
  port: number;
  host: string;
}

export interface RunningHttpServer {
  /** Base URL actually bound, e.g. `http://127.0.0.1:3000`. */
  url: string;
  server: Server;
  /** Stop accepting connections, let in-flight requests finish, then resolve. */
  close(): Promise<void>;
}

export function createRequestListener(
  options: HttpTransportOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const healthBody = JSON.stringify({
    status: 'ok',
    name: options.name,
    version: options.version,
  });

  async function handleMcp(req: IncomingMessage, res: ServerResponse, rpc: string[]): Promise<void> {
    if (!isHostAllowed(req.headers.host, options.allowedHosts)) {
      sendRpcError(res, 403, -32000, 'Forbidden: this server does not answer for that Host');
      return;
    }

    const origin = resolveAllowedOrigin(req.headers.origin, options.allowedOrigins);
    if (!origin.allowed) {
      sendRpcError(res, 403, -32000, 'Forbidden: Origin not allowed');
      return;
    }
    if (options.allowedOrigins !== '*') res.setHeader('Vary', 'Origin');
    if (origin.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin.corsOrigin);
      res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSE_HEADERS);
    }

    switch (req.method) {
      case 'OPTIONS':
        res.writeHead(204, {
          'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
          'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
          'Access-Control-Max-Age': CORS_MAX_AGE_SECONDS,
          Allow: 'POST, OPTIONS',
        });
        res.end();
        return;
      case 'POST':
        await handlePost(req, res, rpc);
        return;
      default:
        sendRpcError(
          res,
          405,
          -32000,
          'Method not allowed: this server is stateless and opens no streams or sessions. Send JSON-RPC messages with POST.',
          { Allow: 'POST, OPTIONS' },
        );
    }
  }

  async function handlePost(req: IncomingMessage, res: ServerResponse, rpc: string[]): Promise<void> {
    const body = await readBody(req, maxBodyBytes);
    if (body.kind === 'aborted') return;
    if (body.kind === 'too-large') {
      sendRpcError(res, 413, -32000, `Payload too large: the limit is ${maxBodyBytes} bytes`, {
        Connection: 'close',
      });
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(body.text);
    } catch {
      sendRpcError(res, 400, -32700, 'Parse error: Invalid JSON');
      return;
    }
    rpc.push(...describeRpc(message));

    const server = options.createServer();
    res.once('close', () => {
      server.close().catch(() => {});
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    // Accept, Content-Type, JSON-RPC shape and protocol-version checks all
    // happen inside the transport, which answers them per the spec.
    await transport.handleRequest(req, res, message);
  }

  return (req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0];

    if (path === HEALTH_PATH) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(healthBody),
          'Cache-Control': 'no-store',
        });
        res.end(req.method === 'GET' ? healthBody : undefined);
      } else {
        sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' });
      }
      return;
    }

    if (path !== MCP_PATH) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const rpc: string[] = [];
    const { accessLog } = options;
    if (accessLog) {
      const time = new Date().toISOString();
      const started = performance.now();
      res.once('close', () => {
        accessLog({
          time,
          method: req.method ?? '',
          status: res.statusCode,
          ms: Math.round((performance.now() - started) * 10) / 10,
          rpc,
        });
      });
    }

    handleMcp(req, res, rpc).catch((error: unknown) => {
      options.onError?.(error);
      if (!res.headersSent) sendRpcError(res, 500, -32603, 'Internal server error');
      else res.destroy();
    });
  };
}

export function startHttpServer(options: StartHttpServerOptions): Promise<RunningHttpServer> {
  const listener = createRequestListener(options);
  // server.close() only waits: a keep-alive socket that goes idle after an
  // in-flight response would hold shutdown open until the force timer. While
  // draining, every response not yet sent carries `Connection: close`, so each
  // socket closes as soon as its last response is out.
  const inFlight = new Set<ServerResponse>();
  let draining = false;
  const server = createServer((req, res) => {
    if (draining) res.setHeader('Connection', 'close');
    inFlight.add(res);
    res.once('close', () => inFlight.delete(res));
    listener(req, res);
  });
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;

  const close = (): Promise<void> => {
    draining = true;
    for (const res of inFlight) {
      if (!res.headersSent) res.setHeader('Connection', 'close');
    }
    return closeServer(server);
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      const { address, port } = server.address() as AddressInfo;
      const host = address.includes(':') ? `[${address}]` : address;
      resolve({ url: `http://${host}:${port}`, server, close });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const force = setTimeout(() => server.closeAllConnections(), SHUTDOWN_GRACE_MS);
    force.unref();
    server.close((error) => {
      clearTimeout(force);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}

type BodyResult = { kind: 'ok'; text: string } | { kind: 'too-large' } | { kind: 'aborted' };

function readBody(req: IncomingMessage, limit: number): Promise<BodyResult> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.resolve({ kind: 'too-large' });

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (result: BodyResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) settle({ kind: 'too-large' });
      else chunks.push(chunk);
    });
    req.on('end', () => settle({ kind: 'ok', text: Buffer.concat(chunks).toString('utf8') }));
    // A client that hangs up mid-body has nobody left to answer.
    req.on('error', () => settle({ kind: 'aborted' }));
    req.on('close', () => settle({ kind: 'aborted' }));
  });
}

function describeRpc(message: unknown): string[] {
  const labels: string[] = [];
  for (const entry of Array.isArray(message) ? message : [message]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { method, params } = entry as { method?: unknown; params?: { name?: unknown } | null };
    if (typeof method !== 'string') continue;
    const tool = method === 'tools/call' && typeof params?.name === 'string' ? `:${params.name}` : '';
    labels.push(`${method}${tool}`.slice(0, MAX_RPC_LABEL_LENGTH));
  }
  return labels;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  headers?: Record<string, string>,
): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null }, headers);
}
