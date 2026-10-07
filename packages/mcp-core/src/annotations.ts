import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/**
 * Behaviour hints for every tool this server registers. Each tool reads the
 * bundled knowledge base or computes over its input: it changes nothing,
 * returns the same answer for the same input, and never reaches the network.
 *
 * Directories read these. Claude's connectors directory requires readOnlyHint
 * or destructiveHint on every tool, and ChatGPT's requires all three of
 * readOnlyHint, destructiveHint and openWorldHint as explicit booleans.
 * A tool that writes, deletes or calls out must declare its own.
 */
export const READ_ONLY_TOOL: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
