#!/usr/bin/env node
/**
 * REPORT: what the library gained since the skill's pin that the skill never
 * mentions. Turns "7 releases behind" into a concrete list of what to write.
 *
 * check:versions says a skill is behind and prints the release notes.
 * verify:skills says a doc claims something the types do not have. Neither can
 * say what the types have that the docs never mention, because an omission is
 * not a claim. This extracts the surface at the PINNED version and at LATEST,
 * diffs four dimensions, and asks the docs about everything that appeared:
 *
 *   chart types   the string-literal union (apexcharts, apexmaps)
 *   methods       public methods of the product's own classes
 *   option paths  every dotted path reachable from the options root
 *   API types     named types the option walk never reaches, plus members
 *                 added to types that already existed, where a plugin or
 *                 event contract grows without any option changing
 *
 * Four, because a release moves any one of them alone. Between 7.4.0 and 7.6.1
 * apexcharts added a chart type, an option, a 23-key option subtree and nine
 * members on a type no option mentions, while its class held at exactly 80
 * methods throughout.
 *
 * Scoped to the DELTA, not to total coverage. A skill is a curated brief, not
 * reference documentation: forcing 1600 apexcharts option paths into a 44KB
 * SKILL.md would make it worse. This reports what changed and a human decides
 * what earns a mention, so it never fails on a delta. It exits non-zero only
 * when it could not measure (a stale root type, a missing .d.ts), because a
 * check that quietly measures nothing is worse than no check.
 *
 * Evidence is graded and weak evidence is not counted as documented. A new
 * `plotOptions.icicle.borderRadius` whose leaf matches a `borderRadius:`
 * written years ago for bars is reported as weak, not as covered. Resolving a
 * claim by falling back to something broader is how a report starts lying.
 *
 * KNOWN LIMIT: this reads the TYPES, so it sees a feature when the .d.ts
 * declares it, not when the release ships it. apexcharts 7.3.0 announced
 * `api.pointer()`; the shipped .d.ts did not declare it until 7.6.0, and this
 * check attributes it to 7.6.0 accordingly. The release notes check:versions
 * prints are what cover that gap, which is the other reason these layers sit
 * side by side rather than one replacing the other.
 *
 * Usage:
 *   node scripts/check-surface-delta.mjs                      # every skill, pin -> latest
 *   node scripts/check-surface-delta.mjs charts               # one product
 *   node scripts/check-surface-delta.mjs charts --from 7.5.1 --to 7.6.0   # retro-test
 *   node scripts/check-surface-delta.mjs --json
 */
import { SKILL_PACKAGES } from './_skill-meta.mjs';
import { latestVersion } from './_lib-cache.mjs';
import {
  SURFACE_CONFIG,
  surfaceAt,
  loadDocs,
  selectSkills,
  unionMemberEvidence,
  methodEvidence,
  optionPathEvidence,
  typeNameEvidence,
  memberEvidence,
} from './_surface.mjs';

const argv = process.argv.slice(2);
const jsonOnly = argv.includes('--json');
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const fromFlag = flagValue('--from');
const toFlag = flagValue('--to');
const filter = argv.filter((a, i) => !a.startsWith('-') && !['--from', '--to'].includes(argv[i - 1]))[0];

if ((fromFlag || toFlag) && !filter) {
  console.error('--from/--to pin one library\'s versions, so they need a product: e.g. `charts --from 7.5.1 --to 7.6.0`');
  process.exit(2);
}

const targets = selectSkills(SKILL_PACKAGES, filter);
if (!targets.length) {
  console.error(`No skill matches "${filter}". Known: ${SKILL_PACKAGES.join(', ')}`);
  process.exit(2);
}

/**
 * The top evidence tier of each dimension. Anything below it is real evidence
 * of something, but not evidence that THIS name is documented, so it is
 * reported separately rather than folded into the documented count.
 */
const STRONG = new Set(['declared', 'called', 'read', 'path', 'scoped', 'named']);

function bucket(names, evidenceFn) {
  const out = { undocumented: [], weak: [], documented: [], added: names.length };
  for (const name of names) {
    const ev = evidenceFn(name);
    if (!ev) out.undocumented.push({ name });
    else if (STRONG.has(ev.tier)) out.documented.push({ name, ...ev });
    else out.weak.push({ name, ...ev });
  }
  return out;
}

const diff = (before, after) => {
  const prev = new Set(before);
  const next = new Set(after);
  return {
    added: [...next].filter((x) => !prev.has(x)).sort(),
    removed: [...prev].filter((x) => !next.has(x)).sort(),
  };
};

const results = [];
for (const pkg of targets) {
  const cfg = SURFACE_CONFIG[pkg] ?? {};
  const r = { skill: pkg };
  try {
    const docs = await loadDocs(pkg);
    r.npm = docs.npm;
    r.origin = docs.origin;
    r.pinNote = docs.pinNote;
    r.from = fromFlag ?? docs.pinned;
    r.to = toFlag ?? (await latestVersion(docs.npm));
    if (!r.from) throw new Error('SKILL.md has no metadata.library_version');
    if (r.from === r.to) {
      r.upToDate = true;
      results.push(r);
      continue;
    }

    const [from, to] = [await surfaceAt(docs.npm, r.from, cfg), await surfaceAt(docs.npm, r.to, cfg)];
    const ev = (fn) => (name) => fn(docs.sections, name);

    const union = diff(from.unionMembers, to.unionMembers);
    const methods = diff(from.methods, to.methods);
    const options = diff(from.options, to.options);
    const typeNames = diff(Object.keys(from.apiTypes), Object.keys(to.apiTypes));

    r.dimensions = {
      ...(cfg.typeUnion
        ? {
            [`${cfg.typeUnion.label}s`]: {
              ...bucket(union.added, (n) => unionMemberEvidence(docs.sections, n, cfg.typeUnion.prop)),
              removed: union.removed,
            },
          }
        : {}),
      methods: { ...bucket(methods.added, ev(methodEvidence)), removed: methods.removed },
      ...(cfg.optionsRootType
        ? { 'option paths': { ...bucket(options.added, ev(optionPathEvidence)), removed: options.removed } }
        : {}),
      'API types': { ...bucket(typeNames.added, ev(typeNameEvidence)), removed: typeNames.removed },
    };

    // Members added to a type that already existed. The plugin and event
    // contracts only ever change this way: the type name is old, the surface
    // under it is new, and every name-level diff above stays empty.
    r.typeMembers = [];
    for (const name of Object.keys(to.apiTypes).sort()) {
      if (!from.apiTypes[name]) continue;
      const d = diff(from.apiTypes[name], to.apiTypes[name]);
      if (!d.added.length && !d.removed.length) continue;
      r.typeMembers.push({ type: name, ...bucket(d.added, ev(memberEvidence)), removed: d.removed });
    }

    // Removals only matter here when the docs still talk about them. The rest
    // of a removal diff is noise; this half is a broken example waiting to be
    // copied. (verify:skills catches some of these from the other direction;
    // this names the release that did it.)
    r.removedButDocumented = [
      ...union.removed.filter((n) => unionMemberEvidence(docs.sections, n, cfg.typeUnion?.prop ?? 'type')),
      ...methods.removed.filter((n) => methodEvidence(docs.sections, n)?.tier === 'called'),
      ...options.removed.filter((n) => optionPathEvidence(docs.sections, n)?.tier === 'path'),
      ...typeNames.removed.filter((n) => typeNameEvidence(docs.sections, n)),
    ].sort();
  } catch (err) {
    r.error = err.shortMessage || err.message;
  }
  results.push(r);
}

if (jsonOnly) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exit(0);
}

const MAX_LISTED = 25;

/**
 * Collapse dotted paths that share a parent. A new option subtree arrives as
 * 23 sibling paths, and listing them flat buries every other line of the
 * report; `plotOptions.icicle.*` is also how a reader thinks about it.
 */
function renderPaths(items, indent) {
  const groups = new Map();
  for (const { name } of items) {
    const i = name.lastIndexOf('.');
    const parent = i === -1 ? '' : name.slice(0, i);
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(i === -1 ? name : name.slice(i + 1));
  }
  const lines = [];
  for (const [parent, leaves] of [...groups].sort()) {
    if (!parent) lines.push(...leaves.sort().map((l) => `${indent}${l}`));
    else if (leaves.length === 1) lines.push(`${indent}${parent}.${leaves[0]}`);
    else lines.push(`${indent}${parent}.* (${leaves.length}) ${leaves.sort().join(', ')}`);
  }
  return lines;
}

function renderNames(items, indent) {
  const names = items.map((i) => i.name).sort();
  const shown = names.slice(0, MAX_LISTED).map((n) => `${indent}${n}`);
  if (names.length > MAX_LISTED) shown.push(`${indent}... and ${names.length - MAX_LISTED} more`);
  return shown;
}

let failures = 0;
for (const r of results) {
  console.log(`\n▸ ${r.skill}`);
  if (r.error) {
    failures++;
    console.error(`    ⚠ could not measure: ${r.error}`);
    continue;
  }
  if (r.upToDate) {
    console.log(`    ${r.npm} ${r.from}, pin is current, no delta to report`);
    if (r.pinNote) console.log(`    note: ${r.pinNote}`);
    continue;
  }
  console.log(`    ${r.npm} ${r.from} (pinned) -> ${r.to}`);
  console.log(`    docs: ${r.origin}`);
  if (r.pinNote) console.log(`    note: ${r.pinNote}`);

  let anything = false;
  for (const [label, d] of Object.entries(r.dimensions)) {
    if (!d.added && !d.removed.length) continue;
    const parts = [];
    if (d.undocumented.length) parts.push(`${d.undocumented.length} undocumented`);
    if (d.weak.length) parts.push(`${d.weak.length} weak`);
    if (d.documented.length) parts.push(`${d.documented.length} already documented`);
    if (d.removed.length) parts.push(`${d.removed.length} removed`);
    if (!parts.length) continue;
    anything = true;
    console.log(`  ${label}: +${d.added}${parts.length ? `  (${parts.join(', ')})` : ''}`);
    const isPath = label === 'option paths';
    if (d.undocumented.length) {
      console.log(`      never mentioned:`);
      const lines = isPath ? renderPaths(d.undocumented, '        ') : renderNames(d.undocumented, '        ');
      for (const l of lines.slice(0, MAX_LISTED)) console.log(l);
      if (lines.length > MAX_LISTED) console.log(`        ... and ${lines.length - MAX_LISTED} more groups`);
    }
    if (d.weak.length) {
      console.log(`      weak evidence only (a same-named key elsewhere, not this option):`);
      const lines = isPath ? renderPaths(d.weak, '        ') : renderNames(d.weak, '        ');
      for (const l of lines.slice(0, 10)) console.log(l);
      if (lines.length > 10) console.log(`        ... and ${lines.length - 10} more groups`);
    }
  }

  for (const t of r.typeMembers) {
    if (!t.undocumented.length && !t.weak.length && !t.removed.length) continue;
    anything = true;
    const parts = [];
    if (t.undocumented.length) parts.push(`${t.undocumented.length} undocumented`);
    if (t.weak.length) parts.push(`${t.weak.length} weak`);
    if (t.documented.length) parts.push(`${t.documented.length} already documented`);
    if (t.removed.length) parts.push(`${t.removed.length} removed`);
    console.log(`  ${t.type}: +${t.added} member(s)  (${parts.join(', ')})`);
    if (t.undocumented.length) console.log(`      never mentioned: ${t.undocumented.map((x) => x.name).join(', ')}`);
    if (t.removed.length) console.log(`      removed: ${t.removed.join(', ')}`);
  }

  if (r.removedButDocumented.length) {
    anything = true;
    console.log(`  ⚑ gone from ${r.to} but still in the docs: ${r.removedButDocumented.join(', ')}`);
  }
  if (!anything) {
    console.log(`  no surface change across the tracked dimensions`);
    console.log(`  (a behavioural release moves no types, so read the notes from check:versions)`);
  }
}

console.log(
  `\nA delta is a list of candidates, not a work order: a skill is a curated brief, so a\n` +
    `human decides what earns a mention. And a clean delta does not mean a skill is accurate.\n` +
    `A release that changes what a value MEANS moves no type and appears here as nothing.\n` +
    `That is what check:versions' release notes and the agent review (scripts/skill-review.md)\n` +
    `are for. Known blind spot: a tuple changing arity is reported by no dimension.`,
);

process.exit(failures ? 1 : 0);
