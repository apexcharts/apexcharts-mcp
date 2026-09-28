/**
 * VENDORED COPY. Do not edit here.
 *
 * Source: apexcharts/website `nextjs/scripts/extract-api-surface.js`, copied
 * verbatim apart from this header. Every comment below records a way the type
 * walk went wrong in that repo and was fixed; re-deriving them costs more than
 * carrying the file. `.cjs` because this repo is ESM and the original is
 * CommonJS; keeping the body byte-identical means `diff` against the website
 * copy shows exactly this one hunk, so a drift between the two is obvious.
 *
 * Fix bugs upstream in the website repo, then re-copy:
 *   cp ../website/nextjs/scripts/extract-api-surface.js scripts/extract-api-surface.cjs
 *   (then re-apply this header)
 *
 * ---------------------------------------------------------------------------
 *
 * extract-api-surface.js
 *
 * Extracts the public API surface of a shipped .d.ts as three plain lists that
 * can be diffed between two versions:
 *
 *   chartTypes  the string-literal union behind `chart.type`
 *   options     every option path reachable from the root options type
 *   apiTypes    named types NOT reachable from the options root, with members
 *
 * Why three dimensions and not one: they catch different releases. 7.6.0 added
 * a chart type (`icicle`), an option (`tooltip.interactive`), an option subtree
 * (`plotOptions.icicle.*`) and nine members on a type no option ever mentions
 * (`ApexPluginAPI`). A checker that counts only class methods sees none of it,
 * because the ApexCharts class kept exactly the same 80 methods throughout.
 *
 * Used by check-docs-api-drift.js. Also runnable on its own, which is how you
 * retro-test a release:
 *
 *   git -C ../../apexcharts-js show v7.4.0:types/apexcharts.d.ts > /tmp/old.d.ts
 *   node scripts/extract-api-surface.js /tmp/old.d.ts ApexOptions > /tmp/old.json
 *
 * Usage: node scripts/extract-api-surface.js <dts> [rootOptionsType] [chartTypeHost]
 */

const ts = require('typescript')
const fs = require('fs')
const path = require('path')

const COMPILER_OPTIONS = {
  noEmit: true,
  allowJs: true,
  skipLibCheck: true,
  types: [],
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
}

/**
 * Primitive-ish flags. A property of one of these types is a leaf: it is a real
 * option, but there is nothing below it to walk. Descending anyway is how a
 * naive walk ends up reporting `annotations.yaxis.borderColor.charCodeAt` as an
 * option, because `string` carries the whole String prototype.
 */
const PRIMITIVE_FLAGS =
  ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean |
  ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Any |
  ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.ESSymbol | ts.TypeFlags.BigInt

/**
 * Types whose members are the standard library's, not ours. Without this a
 * `Date` option contributes `getUTCMilliseconds` and an `HTMLElement` option
 * contributes the entire DOM.
 */
const OPAQUE_TYPES = new Set([
  'String', 'Number', 'Boolean', 'Date', 'Function', 'RegExp', 'Promise', 'Error',
  'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event', 'Map', 'Set', 'WeakMap',
  'WeakSet', 'ArrayBuffer', 'Uint8Array', 'Float32Array', 'Float64Array',
])

const ANONYMOUS_SYMBOL_NAMES = new Set(['__type', '__object', '__function'])

/**
 * A custom element is not a config object, and tracking one means tracking the
 * whole DOM.
 *
 * apex-grid's core package is built on Lit, so `ApexGrid` and `GridHost` carry
 * 472 members each, `ApexGridRow` 366, and eleven such types account for 4171
 * of the package's 6456 members. Left in, every Lit or TypeScript-lib bump
 * would produce a diff of hundreds of inherited DOM members, and this check
 * becomes something people learn to `--accept` blind. Which is the exact
 * failure the surface tracking exists to prevent.
 *
 * Detected structurally rather than by a name list, so a new element added to
 * that package is caught without anyone remembering to register it.
 */
const DOM_MARKERS = [
  'addEventListener',
  'querySelector',
  'shadowRoot',
  'attachShadow',
  'getBoundingClientRect',
]
const DOM_MARKER_THRESHOLD = 3

function isDomElementType(memberNames) {
  let hits = 0
  for (const m of DOM_MARKERS) if (memberNames.includes(m)) hits++
  return hits >= DOM_MARKER_THRESHOLD
}

/**
 * Resolve the npm package root that owns a file, so the walk can tell "declared
 * by this product" from "declared by TypeScript's lib or a dependency".
 */
function packageRootOf(filePath) {
  const parts = filePath.split(path.sep).join('/').split('/')
  const nmIndex = parts.lastIndexOf('node_modules')
  if (nmIndex === -1) return path.dirname(filePath).split(path.sep).join('/')
  const scoped = parts[nmIndex + 1] && parts[nmIndex + 1].startsWith('@')
  return parts.slice(0, nmIndex + (scoped ? 3 : 2)).join('/')
}

function createProgram(dtsPath) {
  return ts.createProgram([].concat(dtsPath), COMPILER_OPTIONS)
}

/**
 * Source files belonging to the product itself (not lib.*.d.ts, not deps).
 *
 * Takes a LIST of entry paths, because a product can span more than one npm
 * package. apexgrid is the case that forced it: its entry is
 * `apex-grid-enterprise/grid-enterprise.d.ts`, and scoping to that one package
 * root excluded the whole `apex-grid` core package, so `ColumnConfiguration`,
 * `PaginationConfiguration` and 157 other types were tracked by nothing at all.
 */
function ownSourceFiles(program, dtsPaths) {
  const roots = [].concat(dtsPaths).map((p) => packageRootOf(path.resolve(p)))
  return program.getSourceFiles().filter((sf) => {
    if (sf.isDeclarationFile && /[/\\]typescript[/\\]lib[/\\]/.test(sf.fileName)) return false
    const f = path.resolve(sf.fileName).split(path.sep).join('/')
    return roots.some((r) => f.startsWith(r))
  })
}

/** Every named interface / type alias / class declared in the product's files. */
function namedDeclarations(sourceFiles) {
  const decls = new Map()
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (
        (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.name && !decls.has(node.name.text)
      ) {
        decls.set(node.name.text, node)
      }
      ts.forEachChild(node, visit)
    })
  }
  return decls
}

function isPrimitive(type) {
  return (type.flags & PRIMITIVE_FLAGS) !== 0
}

function symbolNameOf(type) {
  const sym = type.aliasSymbol || (type.getSymbol && type.getSymbol())
  return sym ? sym.getName() : null
}

/**
 * A type is "named" when it has a real declared name we can canonicalise on.
 *
 * The key is the FULL type string, not the symbol name, because a generic's
 * symbol name is just the generic: `Partial<GanttMessages>` and
 * `Partial<CalendarOptions>` both report `Partial`. Keying on that made the
 * first one expand and silently suppressed every other `Partial<...>` in the
 * product, which is how `locale.messages.*` went missing from the walk.
 */
function namedKeyOf(checker, type) {
  const name = symbolNameOf(type)
  if (!name || ANONYMOUS_SYMBOL_NAMES.has(name)) return null
  try {
    return checker.typeToString(type)
  } catch {
    return name
  }
}

/**
 * Reduce a property's type to the object shapes worth walking: drop primitives
 * and literals from unions, unwrap arrays to their element type, and refuse the
 * standard library.
 */
function objectShapesOf(checker, type) {
  const shapes = []
  const seen = new Set()
  const push = (t) => {
    if (!t || seen.has(t)) return
    seen.add(t)
    if (t.isUnion && t.isUnion()) return t.types.forEach(push)
    if (isPrimitive(t)) return
    // `string & {}` is the keep-the-literal-autocomplete idiom, e.g.
    // `type TreeTheme = 'light' | 'dark' | (string & {})`. It is an
    // INTERSECTION, so the primitive flag test above misses it, and asking for
    // its properties hands back the whole String prototype: that is where
    // `theme.charCodeAt` and `theme.blink` came from. Any intersection with a
    // primitive constituent is a leaf.
    if (t.isIntersection && t.isIntersection() && t.types.some(isPrimitive)) return
    // A TUPLE is a leaf: one positional value, not a subtree. `easing` is a
    // cubic-bezier `[number, number, number, number]` and apexmaps'
    // `annotations.areas.bounds` is a bounding box, and neither has children a
    // reader can set by name.
    //
    // It has to be tested here, before the Array check below, because a tuple
    // is ANONYMOUS: its symbol is not `Array`, so it fell through to being
    // walked as an ordinary object, and an object's properties for a tuple are
    // its numeric indices plus the whole Array prototype. That is where
    // `easing.0` and `easing.concat` came from, 54 junk paths in apexcharts and
    // 143 in apexmaps, a sixth of its surface.
    //
    // Specifically isTupleType and NOT isArrayLikeType: the latter is also true
    // of a real array of objects, and swallowing those would silently drop the
    // element keys that give us `toolbarItems.onClick`.
    if (checker.isTupleType && checker.isTupleType(t)) return
    const name = symbolNameOf(t)
    // Ask the checker, not the name. `symbolNameOf` prefers `aliasSymbol`, so
    // an ALIASED array reports its alias: `type ApexAxisChartSeries = {...}[]`
    // came back as `ApexAxisChartSeries`, missed this branch, and was walked as
    // an object, which put all 25 of `series.map`, `series.length`,
    // `series.push` and friends into the option surface. Same family as the
    // tuple leak above, hidden one level further down.
    if (
      (checker.isArrayType && checker.isArrayType(t)) ||
      name === 'Array' ||
      name === 'ReadonlyArray'
    ) {
      const args = checker.getTypeArguments ? checker.getTypeArguments(t) : []
      if (args && args[0]) push(args[0])
      return
    }
    if (name && OPAQUE_TYPES.has(name)) return
    // A callback option (`formatter`, an event handler) is a leaf, not a branch.
    if (t.getCallSignatures && t.getCallSignatures().length > 0) return
    if (checker.getPropertiesOfType(t).length === 0) return
    shapes.push(t)
  }
  push(type)
  return shapes
}

/**
 * Walk the option tree from a root type, producing dotted paths.
 *
 * Canonicalisation: a NAMED type is expanded at exactly one path and merely
 * recorded everywhere else. Without this,
 * `ApexDrilldownSeries.plotOptions?: ApexPlotOptions` mirrors the whole
 * plotOptions tree under `drilldown.series.*`, and adding one chart type looks
 * like 46 new options instead of 23.
 *
 * The walk is breadth-first so that the one path is the SHORTEST one, which is
 * the path a reader would actually write. Depth-first with sorted properties
 * would canonicalise `ApexPlotOptions` under `drilldown.series.plotOptions`,
 * purely because `drilldown` sorts before `plotOptions`.
 *
 * Anonymous type literals are always expanded: they exist at exactly one place
 * in the graph, so there is nothing to canonicalise them to.
 */
function extractOptionPaths(checker, rootType, atNode, maxDepth = 12, canonicalize = true) {
  const paths = []
  const expandedNamed = new Map()
  // Where each NAMED type appears, recorded for every property regardless of
  // whether the walk descends into it. Kept apart from expandedNamed, which
  // drives canonicalisation and must not gain entries: an array alias like
  // `ApexAxisChartSeries` is unwrapped rather than expanded, so its name never
  // reaches expandedNamed, and docs pages that declare it as their optionType
  // could not be resolved.
  const typeLocations = new Map()
  const queue = [{ type: rootType, prefix: '', depth: 0, chain: [] }]

  for (let head = 0; head < queue.length; head++) {
    const { type, prefix, depth, chain } = queue[head]
    if (depth > maxDepth) continue

    for (const shape of objectShapesOf(checker, type)) {
      if (chain.includes(shape)) continue // self-reference on THIS path

      const key = canonicalize ? namedKeyOf(checker, shape) : null
      if (key) {
        if (expandedNamed.has(key) && expandedNamed.get(key) !== prefix) continue
        if (!expandedNamed.has(key)) expandedNamed.set(key, prefix)
      }

      const nextChain = chain.concat([shape])
      const props = checker.getPropertiesOfType(shape)
        .filter((p) => {
          const n = p.getName()
          return !n.startsWith('_') && !n.startsWith('#')
        })
        .sort((a, b) => (a.getName() < b.getName() ? -1 : a.getName() > b.getName() ? 1 : 0))

      for (const prop of props) {
        const full = prefix ? `${prefix}.${prop.getName()}` : prop.getName()
        paths.push(full)
        let propType
        try {
          propType = checker.getTypeOfSymbolAtLocation(prop, atNode)
        } catch {
          continue
        }
        // Record the property's type AND, when it is a union, each named
        // constituent. `series?: ApexAxisChartSeries | ApexNonAxisChartSeries`
        // is an unnamed union, so recording only the union itself left both
        // members unmapped at depth 1 and let a deeper occurrence
        // (`drilldown.series.series`) claim the name instead.
        for (const cand of propType.isUnion && propType.isUnion() ? [propType, ...propType.types] : [propType]) {
          const locKey = namedKeyOf(checker, cand)
          if (!locKey) continue
          // EVERY location, not just the first. `ApexTitleSubtitle` sits at both
          // `title` and `subtitle`, and a docs page declaring it needs to know
          // which one it is describing. Consumers pick; this only records.
          if (!typeLocations.has(locKey)) typeLocations.set(locKey, [])
          const at = typeLocations.get(locKey)
          if (!at.includes(full)) at.push(full)
        }
        queue.push({ type: propType, prefix: full, depth: depth + 1, chain: nextChain })
      }
    }
  }

  return { paths: [...new Set(paths)].sort(), expandedNamed, typeLocations }
}

/** The string-literal union behind a `type` property, e.g. `chart.type`. */
function extractChartTypes(checker, decls, hostTypeName, propName) {
  const host = decls.get(hostTypeName)
  if (!host || !host.name) return []
  const sym = checker.getSymbolAtLocation(host.name)
  if (!sym) return []
  let hostType
  try {
    hostType = checker.getDeclaredTypeOfSymbol(sym)
  } catch {
    return []
  }
  const prop = checker.getPropertiesOfType(hostType).find((p) => p.getName() === propName)
  if (!prop) return []
  let propType
  try {
    propType = checker.getTypeOfSymbolAtLocation(prop, host)
  } catch {
    return []
  }
  const out = []
  const collect = (t) => {
    if (t.isUnion && t.isUnion()) return t.types.forEach(collect)
    if (t.isStringLiteral && t.isStringLiteral()) out.push(t.value)
  }
  collect(propType)
  return [...new Set(out)].sort()
}

/**
 * Members of every named type the option walk did NOT reach. This is where the
 * plugin contract lives: `ApexOptions.plugins` is an `ApexPlugin[]`, and
 * `ApexPluginAPI` only ever appears as a parameter of `setup(api)`, so no walk
 * over option VALUES can see it.
 */
function extractApiTypes(checker, decls, reachedNames, skipTypes, skippedDomTypes) {
  const out = {}
  for (const [name, node] of decls) {
    if (reachedNames.has(name)) continue
    // The product's own classes are the `methods` dimension's job, and that one
    // also drives the doc-snippet scan. Listing them here too would report every
    // new method twice.
    if (skipTypes.has(name)) continue
    if (!node.name) continue
    const sym = checker.getSymbolAtLocation(node.name)
    if (!sym) continue
    let type
    try {
      type = ts.isClassDeclaration(node)
        ? checker.getDeclaredTypeOfSymbol(sym)
        : checker.getDeclaredTypeOfSymbol(sym)
    } catch {
      continue
    }
    if (!type) continue
    // A tuple or array alias (`type BBox4 = [number, number, number, number]`)
    // has no members of its own: asking gives the Array prototype. Once the
    // option walk stopped expanding tuples they stopped being "reached", so
    // they arrived here instead and `LonLat` was recorded as `0, 1, at,
    // concat, copyWithin, ...`. The junk moved dimension rather than going
    // away.
    //
    // KNOWN LIMIT: skipping them means a tuple changing ARITY (BBox4 going
    // from four numbers to six) is not reported by any dimension. Tracking the
    // prototype to catch that would cost 40 noise members per tuple.
    if (
      (checker.isTupleType && checker.isTupleType(type)) ||
      (checker.isArrayType && checker.isArrayType(type))
    ) {
      continue
    }
    const members = checker.getPropertiesOfType(type)
      .map((p) => p.getName())
      .filter((n) => !n.startsWith('_') && !n.startsWith('#'))
    if (!members.length) continue
    if (isDomElementType(members)) {
      skippedDomTypes.push(name)
      continue
    }
    out[name] = [...new Set(members)].sort()
  }
  return out
}

/**
 * Extract the full surface for one product.
 *
 * @param {string} dtsPath        entry .d.ts
 * @param {object} cfg
 * @param {string} [cfg.optionsRootType]  root options type, e.g. 'ApexOptions'
 * @param {string} [cfg.chartTypeHost]    type declaring the chart-type union
 * @param {string} [cfg.chartTypeProp]    property holding it (default 'type')
 * @param {string[]} [cfg.skipTypes]      names to leave out of apiTypes
 * @param {string[]} [cfg.extraDtsPaths]  further entry points, for a product
 *                                        that spans more than one npm package
 * @param {ts.Program} [cfg.program]      reuse a program the caller already built
 */
function extractSurface(dtsPath, cfg = {}) {
  if (!fs.existsSync(dtsPath)) return null
  // Only extras that exist: a missing one is reported by the caller as a hard
  // failure, rather than quietly shrinking the surface.
  const extras = (cfg.extraDtsPaths || []).filter((p) => fs.existsSync(p))
  const entries = [dtsPath, ...extras]
  const program = cfg.program || createProgram(entries)
  const checker = program.getTypeChecker()
  const decls = namedDeclarations(ownSourceFiles(program, entries))

  let options = []
  let reached = new Set()
  // typeName -> the canonical option path that type sits at, e.g.
  // ApexChart -> 'chart', ApexPlotOptions -> 'plotOptions', ApexOptions -> ''.
  // Docs pages declare an `optionType` and write PropertyDescription paths
  // RELATIVE to it, so resolving coverage needs this mapping.
  let typeRoots = {}
  let expandedOptions = null
  if (cfg.optionsRootType) {
    const rootDecl = decls.get(cfg.optionsRootType)
    if (rootDecl && rootDecl.name) {
      const sym = checker.getSymbolAtLocation(rootDecl.name)
      if (sym) {
        const rootType = checker.getDeclaredTypeOfSymbol(sym)
        const walked = extractOptionPaths(checker, rootType, rootDecl)
        options = walked.paths
        // Coverage needs a DIFFERENT view of the same walk. The canonical set
        // above records each named type once, which is right for a drift
        // tripwire and wrong for docs: `annotations.yaxis.label.*` and
        // `annotations.points.label.*` are the same type, the docs describe
        // both, and canonicalisation keeps only whichever sits at the shorter
        // (then earlier) path. Comparing docs against it reports the other as
        // undocumented forever.
        if (cfg.withExpandedOptions) {
          expandedOptions = extractOptionPaths(checker, rootType, rootDecl, 12, false).paths
        }
        reached = new Set(walked.expandedNamed.keys())
        reached.add(cfg.optionsRootType)
        // name -> every option path it appears at, canonical location first.
        typeRoots = {}
        for (const [name, paths] of walked.typeLocations) typeRoots[name] = [...paths]
        for (const [name, at] of walked.expandedNamed) {
          typeRoots[name] = [at, ...(typeRoots[name] || []).filter((x) => x !== at)]
        }
      }
    }
  }

  const chartTypes = cfg.chartTypeHost
    ? extractChartTypes(checker, decls, cfg.chartTypeHost, cfg.chartTypeProp || 'type')
    : []

  const skippedDomTypes = []
  const apiTypes = extractApiTypes(
    checker,
    decls,
    reached,
    new Set(cfg.skipTypes || []),
    skippedDomTypes
  )

  return {
    chartTypes,
    options,
    apiTypes,
    typeRoots,
    expandedOptions,
    skippedDomTypes: skippedDomTypes.sort(),
    optionsRootFound: !cfg.optionsRootType || decls.has(cfg.optionsRootType),
    chartTypeHostFound: !cfg.chartTypeHost || decls.has(cfg.chartTypeHost),
  }
}

module.exports = { extractSurface, createProgram, packageRootOf }

if (require.main === module) {
  const [dts, rootType, chartHost] = process.argv.slice(2)
  if (!dts) {
    console.error('Usage: node scripts/extract-api-surface.js <dts> [rootOptionsType] [chartTypeHost]')
    process.exit(2)
  }
  const surface = extractSurface(dts, {
    optionsRootType: rootType,
    chartTypeHost: chartHost || (rootType === 'ApexOptions' ? 'ApexChart' : undefined),
  })
  if (!surface) {
    console.error(`Not found: ${dts}`)
    process.exit(2)
  }
  console.log(JSON.stringify(surface))
}
