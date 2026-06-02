#!/usr/bin/env node
/**
 * Produce the published `dist/index.js`: a single ES-module bundle that inlines
 * the workspace packages (@apexcharts-mcp/*) but leaves the MCP SDK, zod, and
 * each *-skill package as external runtime deps. The skills are intentionally
 * external because they resolve file paths via `import.meta.url` at runtime —
 * bundling them would break that resolution.
 */
import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';

const external = [
  '@modelcontextprotocol/sdk',
  '@modelcontextprotocol/sdk/*',
  'zod',
  'apexcharts-skill',
  'apexgantt-skill',
  'apextree-skill',
  'apexsankey-skill',
  'apexgrid-skill',
];

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  external,
  legalComments: 'none',
  logLevel: 'info',
});

await chmod('dist/index.js', 0o755);
