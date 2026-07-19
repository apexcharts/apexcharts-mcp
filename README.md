# apexcharts-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants like Claude expert-level help with the **ApexCharts ecosystem**: charts, gantt, tree, sankey, grid, and stock. It generates valid configs, catches common mistakes, and serves the official knowledge base for each product on demand, so the AI gets your visualization right the first time.

One MCP, six products. Tools are namespaced per product (`apexcharts_*`, `apexgantt_*`, `apextree_*`, `apexsankey_*`, `apexgrid_*`, `apexstock_*`) so you can use any combination together.

## Install

Pick your editor / client. You only need to do this once.

### Claude Code

```bash
claude mcp add apexcharts -- npx -y apexcharts-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apexcharts": {
      "command": "npx",
      "args": ["-y", "apexcharts-mcp"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "apexcharts": {
      "command": "npx",
      "args": ["-y", "apexcharts-mcp"]
    }
  }
}
```

After installing, restart the client. Your AI assistant will now have tools for every ApexCharts product available — no further commands needed.

## What you can ask the AI

Once installed, the assistant uses the server's tools automatically. Things you can ask:

- *"Build me a stacked area chart of monthly revenue across three regions."*
- *"Here's my pie chart config — why isn't it rendering?"* (paste the config)
- *"What data format does ApexGantt expect for dependencies?"*
- *"Show me the recursive node shape ApexTree uses."*
- *"How do I configure layer ordering in ApexSankey?"*
- *"Explain `cellTemplate` in apex-grid and give me an example."*

The AI decides which tool to call. You don't invoke them directly.

## Tools

| Product   | Tools |
|-----------|-------|
| **meta** | `apexcharts_list_products` |
| **apexcharts** | `apexcharts_generate_config`, `apexcharts_validate_config`, `apexcharts_list_types`, `apexcharts_get_reference` |
| **apexgantt** | `apexgantt_generate_config`, `apexgantt_validate_config`, `apexgantt_get_reference` |
| **apextree** | `apextree_generate_config`, `apextree_validate_config`, `apextree_get_reference` |
| **apexsankey** | `apexsankey_generate_config`, `apexsankey_validate_config`, `apexsankey_get_reference` |
| **apexgrid** | `apexgrid_generate_config`, `apexgrid_validate_config`, `apexgrid_get_reference` |
| **apexstock** | `apexstock_generate_config`, `apexstock_validate_config`, `apexstock_get_reference` |

Every product exposes `generate_config` (build a valid config from a short spec) and `validate_config` (check a config against its skill's rules and return structured issues), plus `get_reference` to read that product's knowledge base on demand. The chart tools add `apexcharts_list_types` (a typed catalog of the 20 supported chart types, including the v6 additions violin, funnel, pyramid, and gauge); `apexcharts_generate_config` covers all 20 and `apexcharts_validate_config` checks against 24 rules. `apexcharts_list_products` is a meta tool that lists the products this server exposes, their tool names, and the upstream library version each product's guidance targets.

## Limiting which products load

By default, all six products' tools are registered. To load only a subset, set `APEXCHARTS_MCP_PRODUCTS` to a comma-separated list of product ids:

```json
{
  "mcpServers": {
    "apexcharts": {
      "command": "npx",
      "args": ["-y", "apexcharts-mcp"],
      "env": { "APEXCHARTS_MCP_PRODUCTS": "charts,gantt" }
    }
  }
}
```

Valid ids: `charts`, `gantt`, `tree`, `sankey`, `grid`, `stock`. Unknown ids are skipped with a stderr warning; the server still starts.

## Knowledge base

Authoritative guidance comes from the per-product skill packages on npm:

- [`apexcharts-skill`](https://www.npmjs.com/package/apexcharts-skill) — SKILL.md + cartesian/bar/financial/circular/grid/radar references + tree-shaking, SSR, framework wrappers
- [`apexgantt-skill`](https://www.npmjs.com/package/apexgantt-skill) — task data, dependencies, columns/toolbar, events, framework wrappers
- [`apextree-skill`](https://www.npmjs.com/package/apextree-skill) — data format, graph API, framework wrappers
- [`apexsankey-skill`](https://www.npmjs.com/package/apexsankey-skill) — data format, styling/interaction, framework wrappers
- [`apexgrid-skill`](https://www.npmjs.com/package/apexgrid-skill) — columns/templates, data pipeline, sort/filter, framework integration, vanilla JS
- [`apexstock-skill`](https://www.npmjs.com/package/apexstock-skill): OHLC data format, technical indicators, streaming/appendData, trading overlays, theming, framework wrappers

They're regular dependencies — bump the version in this repo's [package.json](package.json) to pick up upstream improvements. Each skill repo is the source of truth for its own docs.

---

## Contributing

For working on `apexcharts-mcp` itself.

```bash
git clone https://github.com/apexcharts/apexcharts-mcp.git
cd apexcharts-mcp
npm install
npm run build
```

This is an npm workspace monorepo:

```
apexcharts-mcp/
  src/index.ts            # bootstrap — reads APEXCHARTS_MCP_PRODUCTS, wires up products
  packages/
    mcp-core/             # shared types and the reference-reader factory
    mcp-charts/           # apexcharts_* tools
    mcp-gantt/            # apexgantt_* tools
    mcp-tree/             # apextree_* tools
    mcp-sankey/           # apexsankey_* tools
    mcp-grid/             # apexgrid_* tools
```

The build runs `tsc -b` across all workspaces, then bundles `src/index.ts` (plus all workspace packages) into a single `dist/index.js` via esbuild. Skill packages stay external because they resolve file paths via `import.meta.url`.

Run the server directly (for manual testing):

```bash
node dist/index.js
```

Point your client at the local build instead of the published package:

```bash
claude mcp add apexcharts -- node /absolute/path/to/apexcharts-mcp/dist/index.js
```

Common scripts:

```bash
npm run dev        # tsc -b --watch
npm test           # vitest
npm run typecheck  # tsc -b
npm run clean      # remove all dist/ output
```

## License

MIT
