/**
 * Shared machinery for the two REVERSE-direction checks.
 *
 * check-versions, verify-skills and the agent review all start from what the
 * skill docs SAY and test it against the library's types. That direction cannot
 * see an omission, because an omission makes no claim: when apexcharts 7.6.0
 * added the `icicle` chart type, the apexcharts skill said nothing false about
 * it, so every layer was correctly silent while an agent holding that skill
 * could not produce an icicle chart at all.
 *
 * These two checks run the other way: start from what the library HAS, and ask
 * the docs about it.
 *
 *   check-chart-types.mjs    hard gate: every member of a product's chart-type
 *                            (or series-type) union must be mentioned.
 *   check-surface-delta.mjs  report: what the surface gained between the pinned
 *                            version and latest that the docs never mention.
 *
 * The type walk itself is scripts/extract-api-surface.cjs, vendored from the
 * website repo. Read its comments before changing anything here: six distinct
 * ways the walk silently produces junk are documented in it, each found the
 * hard way.
 *
 * Standing limits, inherited and not fixable at this layer:
 *  - A tuple changing ARITY is reported by no dimension, because tuples are
 *    treated as leaves (see extractApiTypes in the vendored file).
 *  - A type surface cannot see BEHAVIOUR. A release that changes which value a
 *    string carries, or what a default means, moves no type at all and shows up
 *    here as nothing. A green delta does not mean a skill is accurate; that is
 *    what check:versions' release notes and the agent review are for.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFile } from 'node:fs/promises';

import { loadSkill, loadSkillSource, readAllDocs, bareVersion } from './_skill-meta.mjs';
import { ensureInstalled, resolveEntryDts } from './_lib-cache.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { extractSurface, createProgram } = require('./extract-api-surface.cjs');

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Separate from skill-verify's cache: this one holds several versions at once. */
export const SURFACE_CACHE = join(REPO_ROOT, 'node_modules/.cache/skill-surface');
export const SRC_ROOT = process.env.SKILL_SRC_ROOT || join(REPO_ROOT, '..');

/**
 * Per-product type-walk configuration, keyed by skill package.
 *
 * Everything else about a product (npm name, pinned version, doc files) comes
 * from its SKILL.md and the skill package's own exports. Only the type-graph
 * entry points live here, because a .d.ts cannot say which of its types is
 * "the options root".
 *
 * - `classes`         classes whose public methods form the `methods` dimension
 * - `optionsRootType` root of the option walk; omit when the product has none
 * - `typeUnion`       a string-literal union that enumerates a product's kinds
 *                     (host type + property), plus the label used in output
 * - `catalogs`        every place THIS repo hardcodes that same union, so the
 *                     gate can check the tools as well as the docs. apexmaps
 *                     0.4.0 is why: it shipped a sixth series type, the skill
 *                     documented it, and three hardcoded lists in here still
 *                     said five, so validate_config rejected a valid config.
 *                     One list per file, because they drift independently.
 *
 * A name in here that no longer resolves is a HARD failure, never a skip: a
 * missing root type makes the surface silently empty, and an empty surface
 * diffs clean forever. That is how a checker goes quiet without anyone noticing.
 */
export const SURFACE_CONFIG = {
  'apexcharts-skill': {
    classes: ['ApexCharts'],
    optionsRootType: 'ApexOptions',
    typeUnion: { host: 'ApexChart', prop: 'type', label: 'chart type', docPath: 'chart.type' },
    catalogs: [
      { file: 'packages/mcp-charts/src/chartCatalog.ts', symbol: 'CHART_CATALOG', property: 'type' },
    ],
  },
  'apexgantt-skill': {
    classes: ['ApexGantt'],
    // GanttUserOptions is what a caller passes; GanttOptions is the resolved
    // internal shape, which would report defaults nobody writes.
    optionsRootType: 'GanttUserOptions',
  },
  'apextree-skill': {
    // Graph is the renderer ApexTree returns; its methods are documented too.
    classes: ['ApexTree', 'Graph'],
    optionsRootType: 'TreeOptions',
  },
  'apexsankey-skill': {
    classes: ['ApexSankey', 'SankeyGraphRenderer'],
    optionsRootType: 'SankeyOptions',
  },
  'apexgrid-skill': {
    classes: ['ApexGrid'],
    // No options root: apex-grid is configured through element properties and
    // per-column objects, not one options tree. With no root walked, every
    // named type the package exports lands in the apiTypes dimension instead,
    // which is the right shape for this product rather than a gap.
    optionsRootType: null,
    // Its enumeration is the column type union, thirteen types at 3.5.0. The
    // validator kept only three, so apexgrid_validate_config called
    // `type: 'date'` a mistake while the bundled skill documented it.
    typeUnion: { host: 'ColumnConfiguration', prop: 'type', label: 'column type', docPath: 'columns[].type' },
    catalogs: [{ file: 'packages/mcp-grid/src/validateConfig.ts', symbol: 'VALID_TYPES' }],
  },
  'apexstock-skill': {
    classes: ['ApexStock'],
    optionsRootType: 'StockChartOptions',
  },
  'apexmaps-skill': {
    classes: ['ApexMaps'],
    optionsRootType: 'ApexMapsOptions',
    // apexmaps has no chart types; its equivalent enumeration is the series
    // union (choropleth, bubble, marker, arc, line, hexbin). Same gate, same
    // reason: a new series type is the most doc-visible thing a release can add.
    typeUnion: { host: 'Series', prop: 'type', label: 'series type', docPath: 'series[].type' },
    catalogs: [
      { file: 'packages/mcp-maps/src/validateConfig.ts', symbol: 'SERIES_TYPES' },
      { file: 'packages/mcp-maps/src/generateConfig.ts', symbol: 'MapsSeriesType' },
      // The zod enum gates the tool's INPUT: a type missing here is rejected
      // before any of the code above runs.
      { file: 'packages/mcp-maps/src/register.ts', zodEnum: 'type' },
    ],
  },
};

/**
 * Public method names (own + inherited + static) of the named classes.
 *
 * Adapted from the website's check-docs-api-drift.js. Uses the checker rather
 * than the syntax tree so `extends` and imported base types resolve on their
 * own, which is what makes ApexGantt's internal BaseChart come out right.
 *
 * `ownRoot` then keeps only methods DECLARED inside the product's own package.
 * apex-grid is why: ApexGrid extends a Lit element base, so the checker hands
 * back 279 methods, 200-odd of which are `addEventListener`, `querySelector`
 * and the rest of the DOM. Left in, every Lit or TypeScript-lib bump would read
 * as a hundred new "product methods" and the delta becomes something people
 * skim past. Same reasoning as the vendored extractor's structural DOM filter
 * for types, applied to the one dimension that filter does not cover.
 */
function extractMethods(program, classNames, ownRoot) {
  const checker = program.getTypeChecker();
  const methods = new Set();
  const found = new Set();
  const wanted = new Set(classNames);
  const root = resolve(ownRoot);

  const declaredInProduct = (prop) =>
    (prop.getDeclarations() ?? []).some((d) => resolve(d.getSourceFile().fileName).startsWith(root));

  const methodNamesOfType = (type, atNode) => {
    for (const prop of checker.getPropertiesOfType(type)) {
      const name = prop.getName();
      if (name.startsWith('_') || name.startsWith('#')) continue;
      if (!declaredInProduct(prop)) continue;
      let propType;
      try {
        propType = checker.getTypeOfSymbolAtLocation(prop, atNode);
      } catch {
        continue;
      }
      if (propType.getCallSignatures().length > 0) methods.add(name);
    }
  };

  for (const sf of program.getSourceFiles()) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isClassDeclaration(node) && node.name && wanted.has(node.name.text)) {
        found.add(node.name.text);
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol) {
          methodNamesOfType(checker.getDeclaredTypeOfSymbol(symbol), node);
          methodNamesOfType(checker.getTypeOfSymbolAtLocation(symbol, node), node);
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return { methods: [...methods].sort(), missingClasses: classNames.filter((c) => !found.has(c)) };
}

/**
 * Read the string literals of one hardcoded union in THIS repo's source.
 *
 * Anchored to a named declaration (or, for `zodEnum`, to a named input-schema
 * property) rather than scanning the file for the words. Scanning would pass on
 * a chart type that happens to appear in a description string nearby, which is
 * the same silent-widening failure the evidence tiers exist to avoid: here it
 * would report a type as supported when only its name is present.
 *
 * Syntax only, no type checking. These are literal lists; a full program would
 * cost a resolution pass to learn nothing extra.
 *
 * - `symbol` + `property`: literals assigned to that property inside the
 *   declaration, e.g. every `type:` in `CHART_CATALOG`.
 * - `symbol` alone: every literal in the declaration, which covers both a
 *   `['a', 'b'] as const` array and an `'a' | 'b'` union alias.
 * - `zodEnum`: literals in the `.enum([...])` of that input-schema property.
 */
export async function catalogTypes(source) {
  const file = join(REPO_ROOT, source.file);
  const text = await readFile(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = new Set();

  const collectStrings = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.add(node.text);
    else if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) found.add(node.literal.text);
    ts.forEachChild(node, collectStrings);
  };

  let anchor = null;
  const visit = (node) => {
    if (source.symbol) {
      const named =
        (ts.isVariableDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === source.symbol;
      if (named) {
        anchor = node;
        if (source.property) {
          const perProperty = (n) => {
            if (
              ts.isPropertyAssignment(n) &&
              ts.isIdentifier(n.name) &&
              n.name.text === source.property
            ) {
              collectStrings(n.initializer);
            }
            ts.forEachChild(n, perProperty);
          };
          perProperty(node);
        } else {
          collectStrings(node.type ?? node.initializer ?? node);
        }
      }
    }
    if (source.zodEnum) {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === source.zodEnum
      ) {
        const findEnumCall = (n) => {
          if (
            ts.isCallExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            n.expression.name.text === 'enum' &&
            n.arguments[0]
          ) {
            anchor = n;
            collectStrings(n.arguments[0]);
          }
          ts.forEachChild(n, findEnumCall);
        };
        findEnumCall(node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // An anchor that no longer resolves means an empty set, and an empty set
  // "misses" every type at once rather than passing silently. Say which it is.
  if (!anchor) {
    throw new Error(
      `${source.file}: no ${source.symbol ? `declaration named ${source.symbol}` : `z.enum() under "${source.zodEnum}"`}. ` +
        `It was renamed or moved; fix SURFACE_CONFIG.catalogs.`,
    );
  }
  return found;
}

/**
 * Extract one product's full surface at one exact library version.
 *
 * Installs the version into the isolated cache, resolves its declared entry
 * .d.ts from its own manifest (never a hardcoded path per product, which goes
 * stale silently when a package moves its types), and walks it.
 *
 * Throws on anything that would make the surface quietly incomplete: no entry
 * .d.ts, a configured class or root type that does not resolve, a configured
 * union that resolves to nothing. Callers report those as failures.
 */
export async function surfaceAt(npm, version, cfg) {
  const installDir = await ensureInstalled(npm, version, join(SURFACE_CACHE, `${npm}@${version}`));
  const entryDts = await resolveEntryDts(installDir);
  if (!entryDts) throw new Error(`${npm}@${version} declares no entry .d.ts (types/typings/exports)`);

  const program = createProgram([entryDts]);
  const { methods, missingClasses } = extractMethods(program, cfg.classes ?? [], installDir);
  if (missingClasses.length) {
    throw new Error(
      `class(es) not found in ${npm}@${version}: ${missingClasses.join(', ')}. ` +
        `SURFACE_CONFIG.classes is stale, and the methods dimension is measuring less than it claims`,
    );
  }

  const surface = extractSurface(entryDts, {
    program,
    optionsRootType: cfg.optionsRootType || undefined,
    chartTypeHost: cfg.typeUnion?.host,
    chartTypeProp: cfg.typeUnion?.prop,
    skipTypes: cfg.classes ?? [],
  });
  if (!surface) throw new Error(`could not parse ${entryDts}`);
  if (cfg.optionsRootType && !surface.optionsRootFound) {
    throw new Error(
      `options root "${cfg.optionsRootType}" not found in ${npm}@${version}. ` +
        `It was renamed or moved, and the option dimension is now blank`,
    );
  }
  if (cfg.typeUnion && !surface.chartTypeHostFound) {
    throw new Error(
      `union host "${cfg.typeUnion.host}" not found in ${npm}@${version}. ` +
        `Fix SURFACE_CONFIG.typeUnion, or new ${cfg.typeUnion.label}s stop being detected`,
    );
  }
  if (cfg.typeUnion && surface.chartTypes.length === 0) {
    throw new Error(
      `union ${cfg.typeUnion.host}.${cfg.typeUnion.prop} resolved to zero literals in ` +
        `${npm}@${version}, so the gate would pass vacuously`,
    );
  }

  return {
    npm,
    version,
    entryDts,
    methods,
    unionMembers: surface.chartTypes,
    options: surface.options,
    apiTypes: surface.apiTypes,
    skippedDomTypes: surface.skippedDomTypes,
  };
}

/**
 * Load a skill's docs, preferring the SOURCE repo (the sibling checkout you
 * edit and where a fix has to land) and falling back to the installed package.
 * Which one was used is returned, never assumed: the two can differ by several
 * releases, and a gate that silently checked the wrong copy would be worse than
 * no gate.
 */
export async function loadDocs(skillPkg) {
  let skill;
  let origin;
  // The published package's own pin, read separately. A source repo is often
  // several releases ahead of what npm has, so check:versions (which reads the
  // installed package) and these checks (which read the source) can print
  // different "pinned" numbers for the same skill and both be right. Saying so
  // is cheaper than letting someone discover it and stop trusting either.
  let installedPin = null;
  let installedSkillVersion = null;
  try {
    const installed = await loadSkill(skillPkg);
    installedPin = bareVersion(installed.libraryVersion);
    installedSkillVersion = installed.skillVersion;
  } catch {
    /* not installed; the source copy is all there is */
  }
  try {
    skill = await loadSkillSource(skillPkg, SRC_ROOT);
    origin = `source ${join(SRC_ROOT, skillPkg)}`;
  } catch {
    skill = await loadSkill(skillPkg);
    origin = `installed ${skillPkg}@${skill.skillVersion ?? '?'} (no source repo under ${SRC_ROOT})`;
    installedPin = null;
  }
  const pinned = bareVersion(skill.libraryVersion);
  const blob = await readAllDocs(skill);
  return {
    skill,
    origin,
    // Set only when the two copies disagree, so callers can print it verbatim.
    pinNote:
      installedPin && installedPin !== pinned
        ? `published ${skillPkg}@${installedSkillVersion ?? '?'} still pins ${installedPin}; ` +
          `this reads the source repo, which is at ${pinned}`
        : null,
    sections: docSections(blob),
    npm: skill.npm,
    pinned,
    libraryVersion: skill.libraryVersion,
  };
}

/** Split a readAllDocs blob back into { file, body } sections. */
export function docSections(blob) {
  const parts = blob.split(/\n@@FILE (.+)\n/);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ file: parts[i], body: parts[i + 1] || '' });
  return out;
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the STRONGEST evidence that the docs mention a name, and say which kind
 * it is. Tiers are ordered strongest-first and each is a different claim:
 *
 *   declared  the docs actually write it (`type: 'icicle'`, `.pointer(`), so
 *             an agent reading this can produce working code
 *   quoted    it appears as a token in prose or a table (`` `icicle` ``), so the
 *             reader is told it exists, but not how to use it
 *   bare      the word appears, which for a name like `unit` or `line` may be
 *             ordinary prose, so it is reported as evidence and labelled weak
 *
 * Returning the tier rather than a boolean is the point. Collapsing all three
 * into "mentioned" is the silent-widening failure: a bare-word match on `line`
 * would mark a chart type documented on the strength of the word "line".
 */
export function evidence(sections, tiers) {
  for (const { tier, re, test } of tiers) {
    const files = [];
    for (const { file, body } of sections) {
      if (re) re.lastIndex = 0;
      if (re ? re.test(body) : test(body)) files.push(file);
    }
    if (files.length) return { tier, files };
  }
  return null;
}

/** Fenced code blocks in a markdown body. */
function fences(body) {
  return [...body.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** `name:` written as an object key. */
function keyRe(name) {
  return new RegExp(`\\b${escapeRe(name)}\\s*\\??:`);
}

/** Evidence tiers for a member of a chart-type / series-type union. */
export function unionMemberEvidence(sections, name, prop = 'type') {
  const n = escapeRe(name);
  const p = escapeRe(prop);
  return evidence(sections, [
    // `type: 'icicle'`, `type="icicle"`, `"type": "icicle"`, a real usage.
    { tier: 'declared', re: new RegExp(`["'\`]?${p}["'\`]?\\s*[:=]\\s*["'\`]${n}["'\`]`) },
    { tier: 'quoted', re: new RegExp(`["'\`]${n}["'\`]`) },
    { tier: 'bare', re: new RegExp(`\\b${n}\\b`) },
  ]);
}

/** Evidence tiers for a method name. */
export function methodEvidence(sections, name) {
  const n = escapeRe(name);
  return evidence(sections, [
    { tier: 'called', re: new RegExp(`\\.${n}\\s*\\(`) },
    { tier: 'quoted', re: new RegExp(`["'\`]${n}["'\`]|\\b${n}\\(\\)`) },
    { tier: 'bare', re: new RegExp(`\\b${n}\\b`) },
  ]);
}

/**
 * Evidence tiers for a dotted option path.
 *
 * No bare tier here, deliberately. An option's leaf name is a common English
 * word (`padding`, `enabled`, `size`), so a bare-word match says nothing about
 * whether THIS option is documented. `key` (the leaf written as an object key
 * ANYWHERE) stays weak for that reason: `plotOptions.icicle.borderRadius`
 * matches a `borderRadius:` written years ago for bars.
 *
 * `scoped` sits between the two, and it is what docs actually look like. Nobody
 * writes `plotOptions.icicle.direction` as a sentence; they write a config
 * block with `icicle: {` and `direction:` inside it.
 *
 * EVERY segment has to be a key in that one fence, not just the leaf and its
 * parent. Config examples are written top-down so a real one carries the whole
 * chain, while a near-miss does not: the sunburst's own block has
 * `plotOptions`, `dataLabels`, `style` and `colors` in it, so a parent-only
 * test credited it with documenting `plotOptions.icicle.dataLabels.style.colors`.
 * Requiring `icicle` too rejects it. A doc that legitimately starts deeper than
 * the root falls back to `key` and is reported as weak, which errs toward a
 * human looking rather than toward a silent pass.
 */
export function optionPathEvidence(sections, path) {
  const segs = path.split('.');
  const leafKey = keyRe(segs[segs.length - 1]);
  const chain = segs.map(keyRe);
  return evidence(sections, [
    { tier: 'path', re: new RegExp(escapeRe(path)) },
    ...(segs.length > 1
      ? [{ tier: 'scoped', test: (body) => fences(body).some((f) => chain.every((re) => re.test(f))) }]
      : []),
    { tier: 'key', re: leafKey },
  ]);
}

/** Evidence tiers for an exported type name (distinctive enough for a bare match). */
export function typeNameEvidence(sections, name) {
  const n = escapeRe(name);
  return evidence(sections, [
    { tier: 'named', re: new RegExp(`\\b${n}\\b`) },
  ]);
}

/**
 * Evidence tiers for a member added to an existing type.
 *
 * `read` matters as much as `called`: half of what a plugin facade adds is
 * properties, not methods, and `api.capabilities` is how you document one. With
 * only a call tier, a correctly documented property reads as undocumented.
 */
export function memberEvidence(sections, name) {
  const n = escapeRe(name);
  return evidence(sections, [
    { tier: 'called', re: new RegExp(`\\.${n}\\s*\\(`) },
    { tier: 'read', re: new RegExp(`\\.${n}\\b`) },
    { tier: 'key', re: new RegExp(`\\b${n}\\s*\\??:`) },
    { tier: 'quoted', re: new RegExp(`["'\`]${n}["'\`]`) },
  ]);
}

/**
 * The skill packages a CLI filter argument selects, or all of them.
 *
 * Accepts the product id these tools use everywhere else (`charts`, `grid`, as
 * in APEXCHARTS_MCP_PRODUCTS) as well as a package-name prefix. A plain prefix
 * match alone is not enough: `apexcharts-skill`.startsWith('charts') is false,
 * so a filter of `charts` selected nothing and the script printed an empty
 * report that looked like a pass.
 */
export function selectSkills(all, filter) {
  if (!filter) return all;
  const id = (p) => p.replace(/^apex-?/, '').replace(/-skill$/, '');
  const want = id(filter);
  return all.filter((p) => p.startsWith(filter) || id(p) === want);
}
