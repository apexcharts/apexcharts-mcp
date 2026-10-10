#!/usr/bin/env node
/**
 * HARD GATE: every chart type the library ships is mentioned in its skill.
 *
 * The reverse direction of check:versions and verify:skills. Those start from
 * what the docs claim and test it against the types, so they cannot see an
 * omission: an absent chart type makes no false claim. apexcharts 7.6.0 added
 * `icicle` and every existing layer stayed correctly silent while the skill
 * could not produce one.
 *
 * A chart type is the most doc-visible thing a release can add, and the union
 * behind `chart.type` enumerates them exactly, so this half is cheap and
 * absolute: extract the union from the pinned library's .d.ts, require each
 * member to appear in SKILL.md or a reference, exit 1 on a miss. There is no
 * accept-and-move-on flag, on purpose.
 *
 * TWO targets, because a type can be missing from either and the failure looks
 * identical to whoever asked for the chart:
 *   1. the skill docs, so an agent knows the type exists and how to write it
 *   2. THIS repo's own hardcoded lists (SURFACE_CONFIG.catalogs), so the tools
 *      accept it. apexmaps 0.4.0 shipped a `hexbin` series, the skill
 *      documented it in three files, and three lists in here still enumerated
 *      five types, so validate_config returned a hard error for a config the
 *      library renders. Docs coverage would have passed that. This does not.
 *
 * Applies to the three products that enumerate their kinds this way:
 * apexcharts (`ApexChart.type`), apexmaps (`Series.type`, its series union)
 * and apex-grid (`ColumnConfiguration.type`). Products with no such union are
 * listed as not applicable rather than skipped quietly.
 *
 * Evidence is graded, never collapsed to a boolean. `declared` means the docs
 * write `type: 'icicle'` and an agent can copy it (for apexcharts, as a key of
 * the `chart` object: a mixed chart's series take `type:` too); `bare` means
 * the word appears, which for names like `line` or `unit` may be ordinary
 * prose. Both pass the gate, but a bare-only mention is reported as thin,
 * because treating it as full coverage is the silent-widening mistake this
 * check exists to stop.
 *
 * Usage:
 *   node scripts/check-chart-types.mjs                    # gate at each skill's pinned version
 *   node scripts/check-chart-types.mjs charts             # one product
 *   node scripts/check-chart-types.mjs charts --at 7.6.0  # gate at another version (retro-test)
 *   node scripts/check-chart-types.mjs --json
 */
import { SKILL_PACKAGES } from './_skill-meta.mjs';
import {
  SURFACE_CONFIG,
  surfaceAt,
  loadDocs,
  unionMemberEvidence,
  catalogTypes,
  selectSkills,
} from './_surface.mjs';

const argv = process.argv.slice(2);
const jsonOnly = argv.includes('--json');
const atIdx = argv.indexOf('--at');
const atVersion = atIdx !== -1 ? argv[atIdx + 1] : null;
const filter = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '--at')[0];

if (atIdx !== -1 && (!atVersion || atVersion.startsWith('-'))) {
  console.error('--at needs a version: e.g. `charts --at 7.6.0`');
  process.exit(2);
}
// A version number belongs to one library. Applied to every product, `--at
// 8.0.0` tried to install apexmaps@8.0.0 and apex-grid@8.0.0, which do not exist.
if (atVersion && !filter) {
  console.error("--at pins one library's version, so it needs a product: e.g. `charts --at 7.6.0`");
  process.exit(2);
}

const targets = selectSkills(SKILL_PACKAGES, filter);
// A mistyped product must not pass the gate by checking nothing.
if (!targets.length) {
  console.error(`No skill matches "${filter}". Known: ${SKILL_PACKAGES.join(', ')}`);
  process.exit(2);
}
if (atVersion && targets.length > 1) {
  console.error(`--at pins one library's version, but "${filter}" matches ${targets.join(', ')}`);
  process.exit(2);
}
const results = [];

for (const pkg of targets) {
  const cfg = SURFACE_CONFIG[pkg] ?? {};
  const r = { skill: pkg, applicable: Boolean(cfg.typeUnion), label: cfg.typeUnion?.label ?? null };
  if (r.applicable) {
    try {
      const docs = await loadDocs(pkg);
      // --at overrides the pin for the one product named, which is how the gate
      // is retro-tested: point it at a version released after the pin and
      // confirm it names what that release added.
      const version = atVersion ?? docs.pinned;
      if (!version) throw new Error('SKILL.md has no metadata.library_version to gate against');
      const surface = await surfaceAt(docs.npm, version, cfg);
      r.npm = docs.npm;
      r.version = version;
      r.pinned = docs.pinned;
      r.origin = docs.origin;
      r.pinNote = docs.pinNote;
      r.members = surface.unionMembers.map((name) => ({
        name,
        ...(unionMemberEvidence(docs.sections, name, cfg.typeUnion) ?? { tier: null, files: [] }),
      }));
      r.missing = r.members.filter((m) => m.tier === null);
      r.thin = r.members.filter((m) => m.tier === 'bare');

      // Same union, checked against this repo's own hardcoded lists. The skill
      // can be perfect and the tools still reject the type.
      const shipped = new Set(surface.unionMembers);
      r.catalogs = [];
      for (const source of cfg.catalogs ?? []) {
        const have = await catalogTypes(source);
        r.catalogs.push({
          file: source.file,
          missing: surface.unionMembers.filter((t) => !have.has(t)),
          // A name here that the library does not have is the same bug pointing
          // the other way: the tools would accept a type that cannot render.
          extra: [...have].filter((t) => !shipped.has(t)).sort(),
        });
      }
    } catch (err) {
      r.error = err.shortMessage || err.message;
    }
  }
  results.push(r);
}

if (jsonOnly) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exit(0);
}

// Products with at least one failure, not a count of failures: one product can
// fail both halves (undocumented AND absent from the tools), and reporting that
// as "2 products" misstates the blast radius.
const failed = new Set();
// Kept apart from `failed`: a product that could not be measured (an install
// that failed, a stale root type) has no known coverage gap, but a gate that
// cannot measure must not pass either.
const unmeasured = new Set();
for (const r of results) {
  if (!r.applicable) {
    console.log(`\n▸ ${r.skill}: no enumerated type union (nothing for this gate to check)`);
    continue;
  }
  if (r.error) {
    unmeasured.add(r.skill);
    console.error(`\n▸ ${r.skill}: ⚠ could not measure: ${r.error}`);
    continue;
  }
  const at = r.version === r.pinned ? `pinned ${r.version}` : `${r.version} (pin is ${r.pinned})`;
  console.log(`\n▸ ${r.skill}  ${r.npm}@${at}`);
  console.log(`    docs: ${r.origin}`);
  if (r.pinNote) console.log(`    note: ${r.pinNote}`);
  if (r.missing.length) {
    failed.add(r.skill);
    console.error(`  ✗ ${r.missing.length} of ${r.members.length} ${r.label}s are in the library and NOWHERE in the docs:`);
    for (const m of r.missing) console.error(`      ${m.name}`);
    console.error(`    An agent holding this skill cannot produce these. Document each one in`);
    console.error(`    SKILL.md or a reference, then re-run.`);
  } else {
    console.log(`  ✓ ${r.members.length} ${r.label}s, all with a mention`);
  }
  if (r.thin.length) {
    console.log(`  ⚑ mentioned only as a bare word (no \`${r.label}\` usage a reader can copy):`);
    for (const m of r.thin) console.log(`      ${m.name} (in ${m.files.join(', ')})`);
  }

  const broken = (r.catalogs ?? []).filter((c) => c.missing.length || c.extra.length);
  if (broken.length) {
    failed.add(r.skill);
    console.error(`  ✗ this repo's own ${r.label} lists disagree with ${r.npm}@${r.version}:`);
    for (const c of broken) {
      if (c.missing.length) {
        console.error(`      ${c.file}`);
        console.error(`        missing: ${c.missing.join(', ')}  (the tools reject what the library renders)`);
      }
      if (c.extra.length) {
        console.error(`      ${c.file}`);
        console.error(`        not in the library: ${c.extra.join(', ')}  (the tools would emit something that cannot render)`);
        console.error(`        If the catalog was just updated for a new release: the bundled skill is still`);
        console.error(`        behind, so publish the skill, bump it in package.json, reinstall, then re-run.`);
      }
    }
  } else if (r.catalogs?.length) {
    const files = r.catalogs.length === 1 ? r.catalogs[0].file : `${r.catalogs.length} files`;
    console.log(`  ✓ ${r.members.length} ${r.label}s, all in this repo's own lists (${files})`);
  }
}

console.log();
if (failed.size) {
  console.error(
    `FAIL: ${failed.size} product(s) ship a type that either the skill docs or this repo's own ` +
      `tools do not cover.`,
  );
}
if (unmeasured.size) {
  console.error(`FAIL: could not measure ${unmeasured.size} product(s): ${[...unmeasured].join(', ')}.`);
}
if (failed.size || unmeasured.size) process.exit(1);
console.log('All enumerated types are documented and supported.');
