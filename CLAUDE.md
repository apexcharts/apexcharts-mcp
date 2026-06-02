# CLAUDE.md

Project context for Claude Code working in this repo.

## What this is

`apexcharts-mcp` is a Model Context Protocol server that exposes the entire ApexCharts ecosystem — apexcharts, apexgantt, apextree, apexsankey, apex-grid — as namespaced tools for AI assistants. It speaks MCP over **stdio** (no HTTP). It's distributed as a Node CLI (`bin: apexcharts-mcp`).

## Stack

- TypeScript, ES modules, Node ≥ 18
- `@modelcontextprotocol/sdk` (high-level `McpServer` API from `server/mcp.js`)
- `zod` for tool input schemas
- One `*-skill` npm package per product (`apexcharts-skill`, `apexgantt-skill`, `apextree-skill`, `apexsankey-skill`, `apexgrid-skill`) — each ships SKILL.md and a `references/` directory and exports `{ skillFile, referencesDir, referencePath, referenceFiles }`
- `vitest` for tests
- `tsc -b` for typechecking; `esbuild` for the publish bundle

## Layout (npm workspaces)

```
src/
  index.ts                          # bootstrap: reads APEXCHARTS_MCP_PRODUCTS, registers selected products, connects stdio
scripts/
  bundle.mjs                        # esbuild bundle step — externalizes SDK / zod / *-skill packages
packages/
  mcp-core/                         # @apexcharts-mcp/core (private)
    src/
      registry.ts                   # ProductId, ProductModule interface
      skill-loader.ts               # createReferenceReader factory used by every product
      index.ts                      # public exports
  mcp-charts/                       # @apexcharts-mcp/charts (private)
    src/
      index.ts                      # exports { id, registerTools }
      register.ts                   # the four apexcharts_* registerTool calls
      chartCatalog.ts               # single source of truth for the 16 supported chart types
      generateConfig.ts             # pure function: chart type + options → ApexCharts options object
      validateConfig.ts             # 15-rule structural/semantic validator
      skill.ts                      # REFERENCE_INDEX + thin wrapper over core's reader
      apexcharts-skill.d.ts         # ambient module decl (skill package ships no types)
    tests/                          # vitest tests for the above
  mcp-gantt/                        # @apexcharts-mcp/gantt — scaffold, currently registers only apexgantt_get_reference
  mcp-tree/                         # @apexcharts-mcp/tree   — scaffold
  mcp-sankey/                       # @apexcharts-mcp/sankey — scaffold
  mcp-grid/                         # @apexcharts-mcp/grid   — scaffold
```

Each workspace package is `private: true` — only the root `apexcharts-mcp` ships to npm, with all workspace code inlined by esbuild.

## Tools

| Tool                          | Status      | Purpose                                                                |
| ----------------------------- | ----------- | ---------------------------------------------------------------------- |
| `apexcharts_generate_config`  | implemented | Build a minimal valid ApexCharts options object.                       |
| `apexcharts_validate_config`  | implemented | Check a config against SKILL.md rules. Returns structured issues.      |
| `apexcharts_list_types`       | implemented | Return supported chart types with metadata. Filterable by family.      |
| `apexcharts_get_reference`    | implemented | List or read files from the apexcharts-skill knowledge base.           |
| `apexgantt_get_reference`     | implemented | List or read files from the apexgantt-skill knowledge base.            |
| `apextree_get_reference`      | implemented | List or read files from the apextree-skill knowledge base.             |
| `apexsankey_get_reference`    | implemented | List or read files from the apexsankey-skill knowledge base.           |
| `apexgrid_get_reference`      | implemented | List or read files from the apexgrid-skill knowledge base.             |
| `apexgantt_generate_config`   | implemented | Build a valid ApexGantt config (tasks, hierarchy, dependencies, milestone, baseline). |
| `apexgantt_validate_config`   | implemented | Validate an ApexGantt config (ids, dates, dependency shape, cycles, baseline). |
| `apexsankey_generate_config`  | implemented | Build a valid ApexSankey config split into `{ options, data: { nodes, edges } }`. |
| `apexsankey_validate_config`  | implemented | Validate an ApexSankey config (DAG, unique node ids, edge refs, edge.value > 0). |
| _(same generate/validate pattern for tree, grid: TODO)_ |  |  |

### Validator rule conventions (charts)

Each rule has a stable `rule` id (kebab-case) so callers can pattern-match on it. New rules: pick a clear id, set `severity` ('error' breaks rendering, 'warning' is a "probably wrong" hint), include a dot/bracket `path`, and provide a `fix` line when there's a one-shot remedy. Add a test in `packages/mcp-charts/tests/validateConfig.test.ts` per rule.

## How to add a new tool

1. Put the pure logic in its own module under the relevant `packages/mcp-<product>/src/`. Keep it framework-free so it's easy to unit-test.
2. Register it in `packages/mcp-<product>/src/register.ts` via `server.registerTool(name, { title, description, inputSchema }, handler)`.
3. Name the tool `<product>_<verb>_<noun>` (e.g. `apexgantt_validate_config`). Never use an unprefixed name — collisions across products are real.
4. `inputSchema` is a zod shape (object of zod schemas), not a wrapped `z.object(...)`.
5. Handler returns `{ content: [{ type: 'text', text: '...' }] }`.
6. Add a test under that package's `tests/`.

## How to add a new product

Unlikely (the five are fixed), but if you do:

1. Create `packages/mcp-<id>/` mirroring an existing scaffold.
2. Add the product id to the `ProductId` union in `packages/mcp-core/src/registry.ts`.
3. Import and register it in `src/index.ts`'s `PRODUCT_MODULES`.
4. Add it as a workspace dependency wherever needed.
5. Add the skill package as a `dependencies` entry in the root `package.json` (so the published artifact carries it).
6. Add the skill package to the `external` list in `scripts/bundle.mjs`.

## Critical things to know

### Charts data format

The data-format rules in `apexcharts-skill`'s `SKILL.md` (section 2 — Series Data Format Table) are the single most important reference for the chart tools. Most "broken chart" bugs come from using the wrong series shape for the chart type. Anything that generates or validates configs MUST encode those rules.

Highlights:

- Pie / donut / polarArea / radialBar use a **flat number array** for `series` plus a `labels` array. Everything else uses `[{ name, data }]`.
- `radialBar` values are 0–100 (percentages).
- Use `null`, never `undefined`, for missing data points.
- `chart.stacked` only works with `bar` and `area`.
- Multiple y-axes must be an array, each with `seriesName`.

### Stdio transport caveat

The MCP server communicates via JSON-RPC on stdout. **Never `console.log` from server code** — it corrupts the protocol stream. Use `process.stderr.write(...)` for diagnostics.

### Knowledge base sources

Reference docs come from the individual `*-skill` npm packages and are NOT vendored here. To refresh them, bump the skill version in the root `package.json` and `npm install`. Source of truth for each lives in its own repo (apexcharts/apexcharts-skill, apexcharts/apexgantt-skill, …). Open doc PRs there, not here.

Always read knowledge-base files through the per-product `skill.ts` helpers (which use `@apexcharts-mcp/core`'s `createReferenceReader`) — never hardcode `node_modules/*-skill/...` paths, since that breaks under pnpm strict mode and yarn PnP.

### Env-var product gating

`APEXCHARTS_MCP_PRODUCTS=charts,gantt` (comma-separated, ids only) limits which products' tools are registered. Empty/unset = all five. Unknown ids log a stderr warning and are skipped; the server still starts.
