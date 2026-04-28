# apexcharts-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes ApexCharts knowledge and chart-building capabilities to AI assistants.

## What it does

Lets an MCP-aware AI assistant (Claude Desktop, Claude Code, etc.) generate, validate, and explain ApexCharts configurations through MCP tools. The server bundles the ApexCharts skill knowledge base (`references/`) so the AI has authoritative data-format rules, pitfall lists, and per-chart-family guidance available locally.

## Status

Early scaffold. Implemented:

- `generate_chart_config` — given a chart type (and optional series/categories/title/etc.), returns a minimal valid ApexCharts options object.
- `validate_chart_config` — checks a config against the SKILL.md data-format rules and pitfalls (wrong series shape for chart type, radialBar out-of-range values, undefined data points, conflicting tooltip flags, hex colors missing `#`, etc.). Returns structured `{ ok, errors, warnings, issues }` with a `fix` hint per issue.
- `list_chart_types` — returns every supported chart type with name, description, family, series format, expected data shape, and reference doc filename. Optional `family` filter.
- `get_reference` — read the bundled apexcharts-skill knowledge base. Call with no arguments to list available docs (SKILL.md plus per-family references); call with `file: "circular-charts.md"` (etc.) to fetch one as markdown. Use this to look up options, formatter signatures, plotOptions, or worked examples without leaving the MCP session.

## Install

```bash
npm install
npm run build
```

## Run

The server speaks MCP over stdio:

```bash
node dist/index.js
```

### Use with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apexcharts": {
      "command": "node",
      "args": ["/absolute/path/to/apexcharts-mcp/dist/index.js"]
    }
  }
}
```

### Use with Claude Code

```bash
claude mcp add apexcharts -- node /absolute/path/to/apexcharts-mcp/dist/index.js
```

## Develop

```bash
npm run dev        # tsc --watch
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## Knowledge base

Authoritative ApexCharts guidance comes from the [`apexcharts-skill`](https://www.npmjs.com/package/apexcharts-skill) npm package, which ships `SKILL.md` and per-family reference docs. To pick up upstream improvements, bump the dep:

```bash
npm install apexcharts-skill@latest
```

Source of truth: https://github.com/apexcharts/apexcharts-skill

## License

MIT
