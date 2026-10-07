# CLAUDE.md

Project context for Claude Code working in this repo.

## What this is

`apexcharts-mcp` is a Model Context Protocol server that exposes the entire ApexCharts ecosystem (apexcharts, apexgantt, apextree, apexsankey, apex-grid, apexstock, apexmaps) as namespaced tools for AI assistants. It speaks MCP over **stdio** by default (what IDE clients launch) and over **Streamable HTTP** with `--http` (what the hosted endpoint `mcp.apexcharts.com` runs; see "HTTP transport" below). It's distributed as a Node CLI (`bin: apexcharts-mcp`).

## Stack

- TypeScript, ES modules, Node ≥ 18
- `@modelcontextprotocol/sdk` (high-level `McpServer` API from `server/mcp.js`)
- `zod` for tool input schemas
- One `*-skill` npm package per product (`apexcharts-skill`, `apexgantt-skill`, `apextree-skill`, `apexsankey-skill`, `apexgrid-skill`, `apexstock-skill`, `apexmaps-skill`) — each ships SKILL.md and a `references/` directory and exports `{ skillFile, referencesDir, referencePath, referenceFiles }`
- `vitest` for tests
- `tsc -b` for typechecking; `esbuild` for the publish bundle

## Layout (npm workspaces)

```
src/
  index.ts                          # bootstrap: reads APEXCHARTS_MCP_PRODUCTS, builds the server factory, runs stdio (default) or --http
Dockerfile                          # production image for HTTP mode (the hosted endpoint)
scripts/
  bundle.mjs                        # esbuild bundle step — externalizes SDK / zod / *-skill packages
  _skill-meta.mjs                   # shared: SKILL.md frontmatter, semver, skill package/source loading
  _lib-cache.mjs                    # shared: install one exact upstream version into an isolated cache
  _surface.mjs                      # shared: per-product type-walk config, surface extraction, evidence tiers
  extract-api-surface.cjs           # VENDORED from the website repo: the .d.ts walk. Do not edit here.
  check-versions.mjs                # layer 1: is any upstream library ahead of its skill's pin?
  verify-skills.mjs                 # layer 2: doc examples referencing names the types don't have (signal)
  skill-review.md                   # layer 3: agent-review prompt template (authoritative)
  check-chart-types.mjs             # layer 4: hard gate, every shipped chart type is documented
  check-surface-delta.mjs           # layer 5: what shipped since the pin that the docs never mention
packages/
  mcp-core/                         # @apexcharts-mcp/core (private)
    src/
      registry.ts                   # ProductId, ProductModule interface
      skill-loader.ts               # createReferenceReader factory used by every product
      index.ts                      # public exports
  mcp-http/                         # @apexcharts-mcp/http (private): stateless Streamable HTTP transport
    src/
      http.ts                       # request listener (/mcp, /healthz), body cap, CORS, startHttpServer + drain
      policy.ts                     # Host / Origin allow-lists (pure functions)
  mcp-charts/                       # @apexcharts-mcp/charts (private)
    src/
      index.ts                      # exports { id, registerTools }
      register.ts                   # the four apexcharts_* registerTool calls
      chartCatalog.ts               # single source of truth for the 29 supported chart types (incl. v6 violin/funnel/pyramid/gauge, v6.6/6.7 unit/waffle/sunburst, v6.9 histogram, v7.1 waterfall/dumbbell/streamgraph/raincloud, and v7.6 icicle)
      generateConfig.ts             # pure function: chart type + options → ApexCharts options object
      validateConfig.ts             # structural/semantic validator (39 rules)
      skill.ts                      # REFERENCE_INDEX + thin wrapper over core's reader
      apexcharts-skill.d.ts         # ambient module decl (skill package ships no types)
    tests/                          # vitest tests for the above
  mcp-gantt/                        # @apexcharts-mcp/gantt  — generate/validate/get_reference
  mcp-tree/                         # @apexcharts-mcp/tree   — generate/validate/get_reference
  mcp-sankey/                       # @apexcharts-mcp/sankey — generate/validate/get_reference
  mcp-grid/                         # @apexcharts-mcp/grid   — generate/validate/get_reference
  mcp-stock/                        # @apexcharts-mcp/stock  — generate/validate/get_reference (OHLC-aware)
  mcp-maps/                         # @apexcharts-mcp/maps   — generate/validate/get_reference (six series types, geo registry)
```

Each workspace package is `private: true` — only the root `apexcharts-mcp` ships to npm, with all workspace code inlined by esbuild.

## Tools

| Tool                          | Status      | Purpose                                                                |
| ----------------------------- | ----------- | ---------------------------------------------------------------------- |
| `apexcharts_list_products`    | implemented | Meta: list the products this server exposes with a "when to pick this" hint, their tool names, and a `compatibility` block (skill version + upstream `library_version` the docs were verified against, read live from each SKILL.md). Respects env-var gating. |
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
| `apexsankey_validate_config`  | implemented | Validate an ApexSankey config (unique node ids, edge refs, edge.value > 0; cycles warn, supported since apexsankey 1.11). |
| `apextree_generate_config`    | implemented | Build a valid ApexTree config with a recursive NestedNode root. |
| `apextree_validate_config`    | implemented | Validate an ApexTree config (every node has id/name/children, ids unique, valid options). |
| `apexgrid_generate_config`    | implemented | Build a valid `<apex-grid>` config `{ columns, data }`, inferring columns from data when omitted. |
| `apexgrid_validate_config`    | implemented | Validate an apex-grid config (column.key in data, type is one of apex-grid's 13 column types). |
| `apexstock_get_reference`     | implemented | List or read files from the apexstock-skill knowledge base.            |
| `apexstock_generate_config`   | implemented | Build a valid ApexStock config (OHLC series, indicators, overlays).    |
| `apexstock_validate_config`   | implemented | Validate an ApexStock config (flat o/h/l/c keys, tuple order, x, ordering, indicators). |
| `apexmaps_get_reference`      | implemented | List or read files from the apexmaps-skill knowledge base.             |
| `apexmaps_generate_config`    | implemented | Build a valid ApexMaps options object (choropleth/bubble/marker/arc/line/hexbin, geo registry pack, joinBy). |
| `apexmaps_validate_config`    | implemented | Validate an ApexMaps config (geo.map present, series union shapes, arc from/to, hexbin positions/aggregate, [lon, lat] order, joinBy, scale/projection/palette names). |

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

Rare, but it happens (stock and maps arrived after the original five). The full checklist:

1. Create `packages/mcp-<id>/` mirroring an existing package (mcp-sankey is the minimal complete template: package.json, tsconfig.json, src/{index,register,skill,generateConfig,validateConfig}.ts, the ambient `<skill>.d.ts`, tests/).
2. Add the product id to the `ProductId` union in `packages/mcp-core/src/registry.ts`.
3. Import and register it in `src/index.ts`'s `PRODUCT_MODULES`.
4. Add `{ "path": "./packages/mcp-<id>" }` to the `references` arrays in BOTH root `tsconfig.json` and `tsconfig.app.json` (or `tsc -b` skips it).
5. Add the skill package as a `dependencies` entry in the root `package.json` (so the published artifact carries it).
6. Add the skill package to the `external` list in `scripts/bundle.mjs`.
7. Add the skill package to `SKILL_PACKAGES` in `scripts/_skill-meta.mjs` (drives check:versions and verify:skills).
8. Update the product list in the `apexcharts_list_products` description string in `packages/mcp-core/src/meta.ts`.
9. Update README.md (intro, tools table, valid ids, knowledge base) and this file (layout, tools table).

## Critical things to know

### Charts data format

The data-format rules in `apexcharts-skill`'s `SKILL.md` (section 2 — Series Data Format Table) are the single most important reference for the chart tools. Most "broken chart" bugs come from using the wrong series shape for the chart type. Anything that generates or validates configs MUST encode those rules.

Highlights:

- Pie / donut / polarArea / radialBar use a **flat number array** for `series` plus a `labels` array, or series objects whose `data` holds `{ x, y }` points. Everything else uses `[{ name, data }]`.
- `radialBar` values fall inside `plotOptions.radialBar.min`/`max` (default 0 to 100).
- Use `null`, never `undefined`, for missing data points.
- `chart.stacked` works with `bar`, `area` and `line` (including mixed charts).
- Multiple y-axes must be an array, each with `seriesName`. Horizontal bars take only one.
- A validator rule is a claim about the library. Before adding or changing one, confirm it in the library source at the release tag and run the library's own samples through it: every rule the October 2026 audit removed or relaxed had been written from the skill text alone.

### Stdio transport caveat

The MCP server communicates via JSON-RPC on stdout. **Never `console.log` from server code**: it corrupts the protocol stream. Use `process.stderr.write(...)` for diagnostics. This still applies with HTTP mode in the picture: tool and product code runs under both transports. Only HTTP-mode bootstrap code may write to stdout (the access log).

### HTTP transport

`--http` serves `/mcp` (Streamable HTTP) and `/healthz` from `packages/mcp-http`. Infra docs for the hosted endpoint live in the website repo (`docs/mcp-hosting.md`, `docs/mcp-hosting-devops.md`).

**It is stateless with JSON responses, and the infrastructure depends on that.** Every tool is a quick read-only call with no server push, so each POST gets a freshly built server (well under 1 ms for all seven products) and `GET`/`DELETE` answer 405. That is why no connection outlives one call (a load balancer's 60s idle timeout never bites), and why replicas need no sticky sessions and memory cannot grow with abandoned clients. Adding a tool that needs sessions, progress notifications, sampling or elicitation means revisiting the load balancer, nginx and replica setup, not just this package.

- **Host allow-list** (`APEXCHARTS_MCP_ALLOWED_HOSTS`, default loopback names) is the spec's DNS-rebinding defence and guards `/mcp` only. `/healthz` is exempt because balancer health checks send the target's IP as Host.
- **Origin allow-list** (`APEXCHARTS_MCP_ALLOWED_ORIGINS`, default none) decides which browser pages may call `/mcp`. No `Origin` header means a non-browser client, always accepted. The service owns all CORS headers; nginx must not add them, or clients see duplicates.
- **Keep-alive timeout is 65s**, above the AWS ALB's 60s idle timeout, so the balancer never reuses a socket Node is closing (a 502). Shutdown marks unsent responses `Connection: close` so a client's idle keep-alive socket cannot hold `SIGTERM` open.
- **Access log**: one JSON line per `/mcp` request on stdout with the JSON-RPC method and tool name. Never log arguments: they carry users' data.
- **Docker**: `COPY . .` then `npm ci`, whose `prepare` runs the full build, so a new product needs no Dockerfile change. `.dockerignore` must keep excluding `*.tsbuildinfo`: a stale one without its `dist/` makes `tsc -b` emit nothing.
- **Deploy**: the website repo's `scripts/deploy-mcp.sh` builds the image from this repo's committed HEAD (`git archive`, never the working copy) and ships it to the prod box. Uncommitted work is never deployed.

### Changing dependencies: use npm 11

npm 10.9.x crashes with `Cannot read properties of null (reading 'edgesOut')` on any `npm install`, `npm update` or `npm audit fix` that has to change an already-resolved package in this workspace tree (reproduced on the untouched 0.9.1 tree, with and without `overrides`, on 2026-10-06). npm 11 does not: run dependency changes as `npx -y npm@11 install` (CI publishes with npm 11 too). `npm ci` on npm 10, which the Docker build uses, reads the resulting lockfile fine.

Security pins for transitive dependencies live in `overrides` (the MCP SDK's own tree pulls in `proxy-addr`, `qs`, `ip-address`, `fast-uri` and `hono`). The hosted endpoint is public, so keep `npm audit --omit=dev` at zero before deploying it.

Every tool input must declare a JSON Schema type: never `z.unknown()` or `z.any()` at the top level of an input schema. A client that cannot see the shape guesses, and Claude Code guesses a string, which is how every `*_validate_config` call once failed with `config-not-object`. `tests/tool-schemas.test.ts` fails on an untyped input.

### Releasing and the MCP Registry

A commit titled `release: X.Y.Z`, pushed to `main`, publishes to npm (`.github/workflows/publish.yml`), then tags and drafts the GitHub release. Bump the version in **both** `package.json` and `server.json` (the server and its npm package entry); `tests/registry.test.ts` fails when they disagree.

`server.json` is the official MCP Registry listing, under the domain namespace `com.apexcharts/mcp` (the npm package declares it as `mcpName`). After npm has the new version, publish the listing with the registry's `mcp-publisher` CLI: `mcp-publisher login http --domain apexcharts.com --private-key <hex key>`, then `mcp-publisher publish`. The login proves the domain against the public key served at `https://apexcharts.com/.well-known/mcp-registry-auth` (website repo, `nextjs/public/.well-known/`). The private key is held by the owner and never committed.

### Knowledge base sources

Reference docs come from the individual `*-skill` npm packages and are NOT vendored here. To refresh them, bump the skill version in the root `package.json` and `npm install`. Source of truth for each lives in its own repo (apexcharts/apexcharts-skill, apexcharts/apexgantt-skill, …). Open doc PRs there, not here.

Each product's `tests/skill.test.ts` asserts two invariants against the installed skill package, via the shared helpers in `packages/mcp-core/tests/helpers/reference-index.ts`: **every index entry resolves and reads** (catches an upstream rename, or a dependency not yet bumped) and **every doc the package ships is indexed** (catches a doc added upstream that no `get_reference` call can reach). Both have caught real drift; when a skill bump renames or adds a reference file, these fail loudly instead of breaking at runtime. Add the pair for any new product.

Always read knowledge-base files through the per-product `skill.ts` helpers (which use `@apexcharts-mcp/core`'s `createReferenceReader`) — never hardcode `node_modules/*-skill/...` paths, since that breaks under pnpm strict mode and yarn PnP.

### Version tracking (which upstream version each skill targets)

Each skill's `SKILL.md` frontmatter declares `metadata.library_version` — the upstream library version its docs were verified against — and `metadata.npm` — the upstream package name. These two fields are the single source of truth; everything below derives from them, nothing is hand-maintained in this repo.

- **Drift check + release review**: `npm run check:versions` (`scripts/check-versions.mjs`) reads each installed skill's `library_version` + `npm` + `github` and compares against the latest on the npm registry, printing a table and exiting non-zero when any upstream library is ahead. For each skill that's behind it also prints a **review block**: the upstream GitHub releases published since the verified version (fetched via the `gh` CLI — public repos, your gh auth) and a checklist of that skill's reference files to re-read for relevance. This is the "after every release, check the references" loop in one command: detect → what-changed → what-to-review. `--json` for machine output (never exits non-zero; includes `review.releases` + `referenceFiles`). Good for CI / pre-release. If `gh` is unavailable the checklist still prints and points at the releases page.
- **Runtime self-report**: `apexcharts_list_products` surfaces the same fields per product in a `compatibility` block (via `@apexcharts-mcp/core`'s `readSkillCompatibility`), so an AI client can tell the user which library version this server's guidance targets.

`library_version` is most useful pinned to an *exact* version (e.g. `5.15.0`); a range (`>=5.0.0`) still works but weakens drift detection. The update loop when upstream ships a release: update the SKILL.md in the skill repo → bump the skill version → bump it in this repo's `package.json` → `npm install`.

#### Verifying a skill is actually accurate for its pinned version

Detecting that a release happened (above) is separate from confirming the docs are *correct* for it. A `library_version` pin is only a defensible claim once the docs review clean against that version. Two layers, run against the **source** skill repos (the sibling checkouts you edit), not node_modules:

1. **Mechanical signal** — `npm run verify:skills` (`scripts/verify-skills.mjs`) installs each skill's exact pinned library into an isolated cache (`node_modules/.cache/skill-verify/`), loads its shipped `.d.ts`, and reports doc code examples that reference imports/methods/keys the library doesn't appear to have. It is **informational, never a gate** (always exits 0): method checks are scoped to detected library instances to cut noise, but examples still mix in other libraries (Vue/Express), untyped sub-entry points (`apexcharts/ssr`), and sub-object methods. Treat hits as candidates, not failures. `--json` / `verify:skills <product>` supported. Override the source location with `SKILL_SRC_ROOT=/path`.
2. **Agent review (authoritative)** — `scripts/skill-review.md` is a ready-to-fill prompt template: spawn one agent per skill, feed it the source docs + the pinned library's `.d.ts` + the mechanical signal, and it reports doc claims the types contradict, with judgment the regex can't make (e.g. recognizing that `app.use()` is Vue, or that an event API moved to the container element). This is what actually earns the pin.

Reality check from the first run: the apexgantt skill pinned at 3.11.1 still documented the removed `ViewMode` / `viewMode` API (replaced by `pixelsPerDay`) — i.e. pinning to "latest" without this review can assert a compatibility that's false. Always review before trusting a pin; if docs can't be fixed yet, pin to the last version they actually match.

#### The reverse direction: what the library has that the docs never mention

Everything above starts from what the skill docs SAY and tests it against the types. That direction cannot see an omission, because an omission makes no claim. apexcharts 7.6.0 added the `icicle` chart type; the skill said nothing false about it, so `check:versions` reported only "behind" and `verify:skills` was correctly silent, while an agent holding the skill could not produce an icicle chart at all. Two checks run the other way, starting from the library's shipped `.d.ts`:

3. **Chart-type gate (hard)**: `npm run check:chart-types` (`scripts/check-chart-types.mjs`) extracts the string-literal union behind `chart.type` at the pinned version and requires every member to be covered in **two** places, exiting 1 on a miss, with deliberately no accept flag:
   - **the skill docs**, so an agent knows the type exists and how to write it;
   - **this repo's own hardcoded lists** (`SURFACE_CONFIG.catalogs`), so the tools accept it. These are separate failures with the same symptom for the caller. apexmaps 0.4.0 shipped a `hexbin` series, the skill documented it in three files, and three lists in here still enumerated five types, so `apexmaps_validate_config` returned a hard error for a config the library renders. A docs-only gate passes that.

   Catalog lists are read by anchored AST lookup (a named declaration, or the `z.enum()` under a named input-schema property), never by scanning the file for the words: a type name appearing in a nearby description string is not the type being supported. A drift in either direction fails, because a catalog entry the library does not have means the tools emit something that cannot render.

   Applies to the three products that enumerate their kinds this way: apexcharts (`ApexChart.type`, 29 types at 7.6.1), apexmaps (`Series.type`, 6 series types) and apex-grid (`ColumnConfiguration.type`, 13 column types at 3.5.0). apex-grid was added after its validator kept only three types and rejected `type: 'date'` while the bundled skill documented it. `--at <version>` gates against a different version, which is how it is retro-tested: `check:chart-types charts --at 7.6.0` against the pre-7.6 docs reports `icicle` missing from both the docs and `chartCatalog.ts` and exits 1, while `--at 7.5.1` passes.

   **It enforces the publish order**, which is the one thing to know before a release. The gate reads the source skill repos locally and the **installed** skill packages in CI (`npm run check:chart-types` is a step in `publish.yml` before `npm publish`). So after adding a chart type to the catalog, CI fails with "not in the library" until the matching skill is published and bumped here: a build whose `list_types` advertises a type its own bundled knowledge base cannot explain does not ship. Publish the skill, bump it in `package.json`, `npm install`, then re-run.
4. **Surface delta (report)**: `npm run check:surface-delta` (`scripts/check-surface-delta.mjs`) extracts the surface at the pinned version AND at latest, diffs four dimensions (chart types, methods, option paths, API types + members added to existing types), and reports what appeared that the docs never mention. Scoped to the delta, not to total coverage: a skill is a curated brief, so it never fails on a delta and a human decides what earns a mention. `--from`/`--to` retro-test a past release pair. Exits non-zero only when it could not measure.

Evidence is graded in both, never collapsed to a boolean: `declared`/`called`/`path` (the docs write it and an agent can copy it) vs `quoted`/`bare`/`key` (a same-named token appears somewhere). Weak evidence is reported as weak, never counted as documented. This is not fussiness. 7.2.0's honeycomb heatmap adds `plotOptions.heatmap.shape`, and the leaf `shape:` matches marker, funnel and raincloud examples in five reference files. A boolean "mentioned" test would have called that feature documented.

Both share `scripts/_surface.mjs`, whose type walk is `scripts/extract-api-surface.cjs`, **vendored verbatim from the website repo**. Do not edit the vendored copy or reimplement the walk: its comments record six ways the walk silently produces junk (tuples emitting Array prototypes, aliased arrays leaking `.map`/`.length`, `string & {}` being an intersection, generic symbol-name collisions deleting subtrees, Lit elements dragging in the DOM, and scoping to one package root hiding siblings). Fix bugs upstream in the website repo, then re-copy.

Known limits, both inherited and worth restating before anyone trusts a green run:

- **A type surface cannot see behaviour.** A release that changes what a value means moves no type. apexcharts 7.5.1 and 7.6.1 both report no surface change here and both were real releases.
- **The types can lag the runtime.** `api.pointer()` shipped in 7.3.0 but the `.d.ts` did not declare it until 7.6.0, so the delta attributes it to 7.6.0. The release notes `check:versions` prints are what cover that gap.
- **A tuple changing arity is reported by no dimension** (tuples are treated as leaves; tracking the prototype to catch it would cost ~40 noise members per tuple).

So a green delta never means a skill is accurate. It means nothing NEW is missing. The agent review is still what earns the pin.

### Env-var product gating

`APEXCHARTS_MCP_PRODUCTS=charts,gantt` (comma-separated, ids only) limits which products' tools are registered. Empty/unset = all seven. Unknown ids log a stderr warning and are skipped; the server still starts.
