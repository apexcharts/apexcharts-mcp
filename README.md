# apexcharts-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants like Claude expert-level help with [ApexCharts.js](https://apexcharts.com/). It generates valid chart configs, catches common mistakes, and serves the official ApexCharts knowledge base on demand — so the AI gets your charts right the first time.

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

After installing, restart the client. Your AI assistant will now have the ApexCharts tools available — no further commands needed.

## What you can ask the AI

Once installed, the assistant can use the server's tools automatically. Things you can ask:

- *"Build me a stacked area chart of monthly revenue across three regions."*
- *"Here's my pie chart config — why isn't it rendering?"* (paste the config)
- *"What chart type should I use for OHLC stock data?"*
- *"Show me the formatter signatures for tooltips on a bar chart."*
- *"Explain `plotOptions.bar.horizontal` and give me an example."*

The AI decides which tool to call. You don't invoke them directly.

## What's inside

Four tools the AI can call:

| Tool | What it does |
|---|---|
| `generate_chart_config` | Builds a minimal valid options object for any of 16 chart types, with the correct series-data format and sensible placeholder data. |
| `validate_chart_config` | Checks a config against 15 rules drawn from the ApexCharts skill — wrong series shape, radialBar out-of-range, conflicting tooltip flags, hex colors without `#`, and more. Returns structured issues with `fix` hints. |
| `list_chart_types` | Returns every supported chart type with metadata. Filterable by family (cartesian, bar, financial, circular, grid, radar). |
| `get_reference` | Reads the bundled ApexCharts knowledge base. Call with no arguments to list available docs; call with `file: "circular-charts.md"` to fetch one. |

## Knowledge base

Authoritative ApexCharts guidance comes from the [`apexcharts-skill`](https://www.npmjs.com/package/apexcharts-skill) npm package — `SKILL.md` plus per-family reference docs (cartesian, bar, financial, circular, grid, radar) and topic guides (tree-shaking, SSR, framework wrappers). It's a regular dependency, so pick up upstream improvements by bumping the version on the apexcharts-mcp side. The source of truth lives at https://github.com/apexcharts/apexcharts-skill.

---

## Contributing

For working on `apexcharts-mcp` itself.

```bash
git clone https://github.com/apexcharts/apexcharts-mcp.git
cd apexcharts-mcp
npm install
npm run build
```

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
npm run dev        # tsc --watch
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## License

MIT
