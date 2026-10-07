# apexcharts-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants like Claude expert-level help with the **ApexCharts ecosystem**: charts, gantt, tree, sankey, grid, stock, and maps. It generates valid configs, catches common mistakes, and serves the official knowledge base for each product on demand, so the AI gets your visualization right the first time.

One MCP, seven products. Tools are namespaced per product (`apexcharts_*`, `apexgantt_*`, `apextree_*`, `apexsankey_*`, `apexgrid_*`, `apexstock_*`, `apexmaps_*`) so you can use any combination together.

## Install

Pick your editor / client. You only need to do this once.

### Hosted server (nothing to install)

The quickest way: point your client at the hosted server, `https://mcp.apexcharts.com/mcp`. It needs no Node.js and stays on the latest release.

**Claude Code**

```bash
claude mcp add --transport http apexcharts https://mcp.apexcharts.com/mcp
```

**Cursor**, in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "apexcharts": {
      "url": "https://mcp.apexcharts.com/mcp"
    }
  }
}
```

**VS Code**, in `.vscode/mcp.json`:

```json
{
  "servers": {
    "apexcharts": {
      "type": "http",
      "url": "https://mcp.apexcharts.com/mcp"
    }
  }
}
```

Any other client that accepts a remote MCP server URL (Streamable HTTP) connects the same way. To run the server on your own machine instead, use one of the local installs below.

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

After installing, restart the client. Your AI assistant now has tools for every ApexCharts product, with no further commands needed.

## What you can ask the AI

Once installed, the assistant uses the server's tools automatically. Things you can ask:

- *"Build me a stacked area chart of monthly revenue across three regions."*
- *"Here's my pie chart config — why isn't it rendering?"* (paste the config)
- *"What data format does ApexGantt expect for dependencies?"*
- *"Show me the recursive node shape ApexTree uses."*
- *"How do I configure layer ordering in ApexSankey?"*
- *"Explain `cellTemplate` in apex-grid and give me an example."*
- *"Map unemployment by US state as a choropleth with ApexMaps."*

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
| **apexmaps** | `apexmaps_generate_config`, `apexmaps_validate_config`, `apexmaps_get_reference` |

Every product exposes `generate_config` (build a valid config from a short spec) and `validate_config` (check a config against its skill's rules and return structured issues), plus `get_reference` to read that product's knowledge base on demand. The chart tools add `apexcharts_list_types` (a typed catalog of the 29 supported chart types, including the v6 additions violin, funnel, pyramid, gauge, unit, waffle, sunburst and histogram, the v7.1 additions waterfall, dumbbell, streamgraph and raincloud, and the v7.6 addition icicle); `apexcharts_generate_config` covers all 29 and `apexcharts_validate_config` checks against 39 rules. `apexcharts_list_products` is a meta tool that lists the products this server exposes, their tool names, and the upstream library version each product's guidance targets.

## Limiting which products load

By default, all seven products' tools are registered. To load only a subset, set `APEXCHARTS_MCP_PRODUCTS` to a comma-separated list of product ids:

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

Valid ids: `charts`, `gantt`, `tree`, `sankey`, `grid`, `stock`, `maps`. Unknown ids are skipped with a stderr warning; the server still starts.

## Running over HTTP

The install commands above run the server locally over stdio. To serve it over the network instead (for a shared team server, or a client that only takes a URL), start it with `--http`:

```bash
npx -y apexcharts-mcp --http --port 3000
```

It speaks [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http) at `/mcp` and answers a dependency-free health check at `/healthz`. Connect a client to it:

```bash
claude mcp add --transport http apexcharts http://localhost:3000/mcp
```

The server is **stateless** and answers every request with plain JSON. Every tool is a quick read-only call, so it keeps no sessions and opens no long-lived streams: `GET` and `DELETE` on `/mcp` return 405, which the spec defines as "this server offers neither". Nothing outlives a single request, so it runs behind any load balancer without sticky sessions or a raised idle timeout.

| Setting | Default | Meaning |
|---|---|---|
| `--port` or `PORT` | `3000` | Port to listen on |
| `--host` or `APEXCHARTS_MCP_HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` in a container |
| `APEXCHARTS_MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Hostnames `/mcp` answers for (DNS-rebinding defence), or `*`. Set it to your public hostname when exposing the server |
| `APEXCHARTS_MCP_ALLOWED_ORIGINS` | none | Browser origins that may call `/mcp` (CORS), or `*`. Requests without an `Origin` header, which is every IDE and desktop client, are always accepted |
| `APEXCHARTS_MCP_PRODUCTS` | all | Same as in stdio mode |

Request bodies are capped at 1 MiB. Each request writes one JSON line to stdout naming the JSON-RPC method and tool (never the arguments); diagnostics go to stderr. `SIGTERM` lets in-flight requests finish before exiting.

A [Dockerfile](Dockerfile) builds a production image that listens on port 3000 inside the container:

```bash
docker build -t apexcharts-mcp .
docker run -d -p 127.0.0.1:3100:3000 --memory=256m \
  -e APEXCHARTS_MCP_ALLOWED_HOSTS=mcp.example.com,localhost apexcharts-mcp
```

Configure the container through environment variables rather than flags; its `HEALTHCHECK` reads `PORT`.

## Knowledge base

Authoritative guidance comes from the per-product skill packages on npm:

- [`apexcharts-skill`](https://www.npmjs.com/package/apexcharts-skill) — SKILL.md + cartesian/bar/financial/circular/grid/radar references + the feature platform and its v7 bundle tiers, tree-shaking, SSR, framework wrappers
- [`apexgantt-skill`](https://www.npmjs.com/package/apexgantt-skill) — task data, dependencies, columns/toolbar, events, editing (CRUD/undo/calendar), the task-list grid (sort/filter/group), interaction (UI state, draw-to-create, export), framework wrappers
- [`apextree-skill`](https://www.npmjs.com/package/apextree-skill) — data format, graph API, framework wrappers
- [`apexsankey-skill`](https://www.npmjs.com/package/apexsankey-skill) — data format, styling/interaction, framework wrappers
- [`apexgrid-skill`](https://www.npmjs.com/package/apexgrid-skill) — columns/templates, data pipeline, sort/filter, state and interaction features (row pinning/reordering, undo-redo, validators, localization), framework integration, vanilla JS
- [`apexstock-skill`](https://www.npmjs.com/package/apexstock-skill): OHLC data format, technical indicators, streaming/appendData, trading overlays, the analysis workspace (range statistics, drawdown, measurements, comparison), state and export, theming, framework wrappers
- [`apexmaps-skill`](https://www.npmjs.com/package/apexmaps-skill): series data formats, geo joins, geometry registry, projections, scales, drilldown, framework wrappers

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
  src/index.ts            # bootstrap: reads APEXCHARTS_MCP_PRODUCTS, wires up products, picks stdio or --http
  Dockerfile              # production image for HTTP mode
  packages/
    mcp-core/             # shared types and the reference-reader factory
    mcp-http/             # stateless Streamable HTTP transport, /healthz, Host/Origin policy
    mcp-charts/           # apexcharts_* tools
    mcp-gantt/            # apexgantt_* tools
    mcp-tree/             # apextree_* tools
    mcp-sankey/           # apexsankey_* tools
    mcp-grid/             # apexgrid_* tools
    mcp-stock/            # apexstock_* tools
    mcp-maps/             # apexmaps_* tools
```

The build runs `tsc -b` across all workspaces, then bundles `src/index.ts` (plus all workspace packages) into a single `dist/index.js` via esbuild. Skill packages stay external because they resolve file paths via `import.meta.url`.

Run the server directly (for manual testing):

```bash
node dist/index.js          # stdio
node dist/index.js --http   # HTTP on 127.0.0.1:3000
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

Keeping the bundled knowledge base honest (see [CLAUDE.md](CLAUDE.md) for the full loop):

```bash
npm run check:versions       # is any upstream library ahead of what its skill was verified against?
npm run check:chart-types    # hard gate: every chart type the library ships is documented and supported
npm run check:surface-delta  # what shipped since the pin that the docs never mention
npm run verify:skills        # signal: doc examples referencing names the types don't have
```
