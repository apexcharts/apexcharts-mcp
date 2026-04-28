# CLAUDE.md

Project context for Claude Code working in this repo.

## What this is

`apexcharts-mcp` is a Model Context Protocol server that exposes ApexCharts knowledge and chart-building tools to AI assistants. It speaks MCP over **stdio** (no HTTP). It's distributed as a Node CLI (`bin: apexcharts-mcp`).

## Stack

- TypeScript, ES modules, Node ≥ 18
- `@modelcontextprotocol/sdk` (high-level `McpServer` API from `server/mcp.js`)
- `zod` for tool input schemas
- `apexcharts-skill` — npm dep that ships the ApexCharts reference docs (SKILL.md + references/*.md)
- `vitest` for tests
- `tsc` for builds — output in `dist/`

## Layout

```
src/
  index.ts          # MCP server entry point, registers tools, connects stdio transport
  chartCatalog.ts   # Single source of truth for supported chart types
  generateConfig.ts # Pure function: chart type + options -> ApexCharts options object
  skill.ts          # Resolver/reader for the apexcharts-skill knowledge base
  types/            # Ambient .d.ts files (apexcharts-skill ships no types)
tests/              # Vitest tests
```

## Tools

| Tool                    | Status      | Purpose                                                  |
| ----------------------- | ----------- | -------------------------------------------------------- |
| `generate_chart_config` | implemented | Build a minimal valid ApexCharts options object.         |
| `validate_chart_config` | implemented | Check a config against SKILL.md rules. Returns structured issues. |
| `list_chart_types`      | implemented | Return supported types with metadata. Filterable by family. |
| `get_reference`         | implemented | List or read files from the apexcharts-skill knowledge base. |

### Validator rule conventions

Each rule has a stable `rule` id (kebab-case) so callers can pattern-match on it. New rules: pick a clear id, set `severity` ('error' breaks rendering, 'warning' is a "probably wrong" hint), include a dot/bracket `path`, and provide a `fix` line when there's a one-shot remedy. Add a test in `tests/validateConfig.test.ts` per rule.

## How to add a new tool

1. Put the pure logic in its own module under `src/` (e.g. `src/validateConfig.ts`). Keep it framework-free so it's easy to unit-test.
2. Register it in `src/index.ts` via `server.registerTool(name, { title, description, inputSchema }, handler)`.
3. `inputSchema` is a zod shape (object of zod schemas), not a wrapped `z.object(...)`.
4. Handler returns `{ content: [{ type: 'text', text: '...' }] }`.
5. Add a test under `tests/`.

## Critical things to know about ApexCharts

The data-format rules in `apexcharts-skill`'s `SKILL.md` (section 2 — Series Data Format Table) are the single most important reference. Read it via `import { readSkill } from './skill.js'`. Most "broken chart" bugs come from using the wrong series shape for the chart type. Anything that generates or validates configs MUST encode those rules.

Highlights:

- Pie / donut / polarArea / radialBar use a **flat number array** for `series` plus a `labels` array. Everything else uses `[{ name, data }]`.
- `radialBar` values are 0–100 (percentages).
- Use `null`, never `undefined`, for missing data points.
- `chart.stacked` only works with `bar` and `area`.
- Multiple y-axes must be an array, each with `seriesName`.

## Stdio transport caveat

The MCP server communicates via JSON-RPC on stdout. **Never `console.log` from server code** — it corrupts the protocol stream. Use `process.stderr.write(...)` for diagnostics.

## Knowledge base

The reference docs come from the [`apexcharts-skill`](https://www.npmjs.com/package/apexcharts-skill) npm package — they are NOT vendored in this repo. To refresh them, bump `apexcharts-skill` in `package.json` and `npm install`. Source of truth lives at https://github.com/apexcharts/apexcharts-skill — open issues and PRs there, not here.

Always read knowledge-base files through `src/skill.ts` (`readSkill()`, `readReference(filename)`) — never hardcode `node_modules/apexcharts-skill/...` paths, since that breaks under pnpm strict mode and yarn PnP.
