#!/usr/bin/env node
/**
 * Version-drift checker + release-review aid for the bundled *-skill packages.
 *
 * For each product skill this server depends on, it reports three numbers:
 *   - skill pkg     the installed `<product>-skill` npm version
 *   - verified      `metadata.library_version` from the skill's SKILL.md — the
 *                   upstream library version the docs were last verified against
 *   - latest        the newest upstream library version on the npm registry
 *
 * It prints a table and exits non-zero when any upstream library is *ahead* of
 * what its skill claims to have been verified against — i.e. the docs (and the
 * generate/validate logic that mirrors them) may be stale.
 *
 * For every skill that IS behind, it then prints a review block: the upstream
 * GitHub releases published since the verified version (so you can see what
 * changed), and a checklist of that skill's reference files to re-read for
 * relevance. This turns each upstream release into a concrete review task —
 * detect → what-changed → what-to-review — in one command.
 *
 * Everything except the list of skill packages is derived from each SKILL.md
 * (`metadata.npm` → npm package, `metadata.github` → release source,
 * `metadata.library_version` → verified version) and each skill's exported
 * `referenceFiles`, so adding fields means editing the skill, not this script.
 * Skill files are located via each package's `skillFile` export rather than
 * hardcoded node_modules paths (works under pnpm strict / yarn PnP).
 *
 * Release notes are fetched via the `gh` CLI (public repos, uses your existing
 * gh auth). If `gh` is missing or the call fails, the review block still prints
 * the checklist and points you at the releases page.
 *
 * Usage:
 *   node scripts/check-versions.mjs          # table + review blocks, exit 1 on drift
 *   node scripts/check-versions.mjs --json   # machine-readable JSON, never exits 1
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  SKILL_PACKAGES,
  loadSkill,
  bareVersion,
  compareSemver,
  parseGithub,
} from './_skill-meta.mjs';

const run = promisify(execFile);
const jsonOnly = process.argv.includes('--json');

/** Cap on releases listed per skill, so a far-behind pin doesn't dump hundreds. */
const MAX_RELEASES = 20;

/**
 * Fetch GitHub releases for `owner/repo` newer than `fromBare` and at most
 * `toBare`, most-recent first. Returns { releases, error, truncated }.
 * Best-effort: any failure surfaces as `error` rather than throwing.
 */
async function fetchReleases(github, fromBare, toBare) {
  const repo = parseGithub(github);
  if (!repo) return { releases: [], error: 'no github url in SKILL.md', truncated: false };
  let raw;
  try {
    const { stdout } = await run('gh', ['api', `repos/${repo}/releases?per_page=100`], {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    raw = JSON.parse(stdout);
  } catch (err) {
    return { releases: [], error: err.shortMessage || err.message, truncated: false };
  }
  const inWindow = raw
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({ ...r, ver: bareVersion(r.tag_name) }))
    .filter((r) => r.ver && compareSemver(r.ver, fromBare) > 0 && compareSemver(r.ver, toBare) <= 0)
    .sort((a, b) => compareSemver(b.ver, a.ver));
  const truncated = inWindow.length > MAX_RELEASES;
  const releases = inWindow.slice(0, MAX_RELEASES).map((r) => ({
    version: r.ver,
    tag: r.tag_name,
    date: (r.published_at || '').slice(0, 10),
    // First meaningful line of the body — a hint at what changed.
    summary: (r.body || '')
      .split('\n')
      .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
      .find((l) => l.length > 0) ?? '',
  }));
  return { releases, error: null, truncated };
}

async function inspectProduct(skillPkg) {
  // Resolve SKILL.md fields, package version, and reference list from the
  // installed package — this checker reports drift of what SHIPS, so it reads
  // node_modules (unlike verify-skills, which targets the source repos).
  const skill = await loadSkill(skillPkg);
  const { referenceFiles, npm: upstream, github, libraryVersion: verifiedSpec } = skill;

  let latest = null;
  let latestError = null;
  if (upstream) {
    try {
      const { stdout } = await run('npm', ['view', upstream, 'version'], { timeout: 30_000 });
      latest = stdout.trim();
    } catch (err) {
      latestError = err.shortMessage || err.message;
    }
  }

  const verifiedBare = bareVersion(verifiedSpec);
  const isRange = verifiedSpec != null && verifiedBare != null && verifiedSpec !== verifiedBare;
  const drift = latest != null && verifiedBare != null && compareSemver(latest, verifiedBare) > 0;

  // Only spend a network call on the changelog when there's actually drift.
  const review = drift
    ? await fetchReleases(github, verifiedBare, bareVersion(latest))
    : { releases: [], error: null, truncated: false };

  return {
    skill: skillPkg,
    skillVersion: skill.skillVersion,
    upstream,
    github,
    verified: verifiedSpec,
    verifiedBare,
    isRange,
    latest,
    latestError,
    drift,
    referenceFiles,
    review,
  };
}

const results = await Promise.all(SKILL_PACKAGES.map(inspectProduct));

if (jsonOnly) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exit(0);
}

const pad = (s, n) => String(s ?? '—').padEnd(n);
const header = `${pad('product', 18)}${pad('skill pkg', 12)}${pad('verified', 14)}${pad('latest', 12)}status`;
console.log(header);
console.log('-'.repeat(header.length + 6));

let drifted = 0;
let rangey = 0;
for (const r of results) {
  let status;
  if (r.latestError) status = `⚠ npm lookup failed (${r.latestError})`;
  else if (r.drift) { status = `⬆ behind — review ${r.upstream} ${r.verifiedBare} → ${r.latest}`; drifted++; }
  else if (r.verifiedBare == null) status = '⚠ no library_version in SKILL.md';
  else status = '✓ up to date';
  if (r.isRange) { status += ' (range — pin to exact)'; rangey++; }
  console.log(
    `${pad(r.upstream, 18)}${pad(r.skillVersion, 12)}${pad(r.verified, 14)}${pad(r.latest, 12)}${status}`,
  );
}

// Per-skill review blocks: what changed upstream + which references to re-read.
for (const r of results.filter((r) => r.drift)) {
  console.log();
  console.log(`▸ ${r.upstream}  (verified ${r.verifiedBare} → latest ${r.latest})`);
  const { releases, error, truncated } = r.review;
  if (error) {
    console.log(`    releases: couldn't fetch (${error})`);
    if (r.github) console.log(`    see ${r.github}/releases`);
  } else if (releases.length === 0) {
    console.log(`    releases: none found between ${r.verifiedBare} and ${r.latest}`);
    if (r.github) console.log(`    see ${r.github}/releases`);
  } else {
    console.log(`  Releases since ${r.verifiedBare}${truncated ? ` (newest ${MAX_RELEASES} of more)` : ''}:`);
    for (const rel of releases) {
      const tail = rel.summary ? ` — ${rel.summary.slice(0, 90)}` : '';
      console.log(`    • ${rel.version}  ${rel.date}${tail}`);
    }
    if (truncated && r.github) console.log(`    full list: ${r.github}/releases`);
  }
  console.log('  References to review (check each for relevance):');
  for (const f of ['SKILL.md', ...r.referenceFiles]) console.log(`    [ ] ${f}`);
}

console.log();
if (drifted > 0) {
  console.log(
    `${drifted} skill(s) behind upstream. Review the references above, update the SKILL.md ` +
      `in the skill repo, bump the skill version, then bump it here and reinstall.`,
  );
}
if (rangey > 0) {
  console.log(
    `${rangey} skill(s) declare library_version as a range. Pin to the exact verified ` +
      `version for reliable drift detection.`,
  );
}
if (drifted === 0 && rangey === 0) console.log('All skills verified against the latest upstream releases.');

process.exit(drifted > 0 ? 1 : 0);
